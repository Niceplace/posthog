import { Message } from 'node-rdkafka'

import { instrumentFn } from '~/common/tracing/tracing-utils'

import { KafkaProducerWrapper } from '../../kafka/producer'
import { EventIngestionRestrictionManager } from '../../utils/event-ingestion-restrictions'
import { PromiseScheduler } from '../../utils/promise-scheduler'
import { BatchPipeline } from '../pipelines/batch-pipeline.interface'
import { newBatchPipelineBuilder } from '../pipelines/builders'
import { createBatch } from '../pipelines/helpers'
import { PipelineConfig } from '../pipelines/result-handling-pipeline'
import { isOkResult } from '../pipelines/results'
import { RestrictionStepOutput, addRestrictionSteps } from './restriction-steps'

export interface SessionReplayPipelineConfig {
    // Restrictions
    eventIngestionRestrictionManager: EventIngestionRestrictionManager
    overflowEnabled: boolean
    overflowTopic: string

    // Pipeline infrastructure
    kafkaProducer: KafkaProducerWrapper
    promiseScheduler: PromiseScheduler
}

export interface SessionReplayPipelineInput {
    message: Message
}

/**
 * Creates the session replay preprocessing pipeline.
 *
 * Currently the pipeline only handles restrictions (parsing headers and applying
 * event ingestion restrictions like drop/overflow). The pipeline will be extended
 * in subsequent commits to include parsing, team filtering, version monitoring,
 * and session recording.
 *
 * Each batch should use a new pipeline instance.
 */
export function createSessionReplayPipeline(
    config: SessionReplayPipelineConfig
): BatchPipeline<SessionReplayPipelineInput, RestrictionStepOutput, { message: Message }, { message: Message }> {
    const { eventIngestionRestrictionManager, overflowEnabled, overflowTopic, kafkaProducer, promiseScheduler } = config

    const pipelineConfig: PipelineConfig = {
        kafkaProducer,
        dlqTopic: '', // Session recordings don't use DLQ
        promiseScheduler,
    }

    // Start with a fresh builder
    const initialBuilder = newBatchPipelineBuilder<SessionReplayPipelineInput, { message: Message }>()

    // Phase 1: Restrictions (parses headers, applies restrictions)
    const afterRestrictions = addRestrictionSteps(initialBuilder, {
        eventIngestionRestrictionManager,
        overflowEnabled,
        overflowTopic,
    })

    // Build the pipeline with result and side effect handling
    return afterRestrictions
        .messageAware((b) => b)
        .handleResults(pipelineConfig)
        .handleSideEffects(promiseScheduler, { await: false })
        .gather()
        .build()
}

/**
 * Runs a batch of messages through the session replay pipeline.
 *
 * Currently returns the messages that passed restriction checks, for the
 * existing parsing/processing flow to continue. In future commits, the pipeline
 * will handle all processing internally and this function will return void.
 */
export async function runSessionReplayPipeline(
    pipeline: BatchPipeline<
        SessionReplayPipelineInput,
        RestrictionStepOutput,
        { message: Message },
        { message: Message }
    >,
    messages: Message[]
): Promise<Message[]> {
    if (messages.length === 0) {
        return []
    }

    return instrumentFn('recordingingesterv2.handleEachBatch.runPipeline', async () => {
        const batch = createBatch(messages.map((message) => ({ message })))
        pipeline.feed(batch)

        // Drain the pipeline and collect surviving messages
        const allResults: RestrictionStepOutput[] = []
        let results = await pipeline.next()
        while (results !== null) {
            for (const resultWithContext of results) {
                if (isOkResult(resultWithContext.result)) {
                    allResults.push(resultWithContext.result.value)
                }
            }
            results = await pipeline.next()
        }

        return allResults.map((result) => result.message)
    })
}
