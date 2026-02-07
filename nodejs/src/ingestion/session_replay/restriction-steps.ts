import { Message } from 'node-rdkafka'

import { EventHeaders } from '../../types'
import { EventIngestionRestrictionManager } from '../../utils/event-ingestion-restrictions'
import { createApplyEventRestrictionsStep, createParseHeadersStep } from '../event-preprocessing'
import { BatchPipelineBuilder } from '../pipelines/builders'

export interface RestrictionStepInput {
    message: Message
}

export interface RestrictionStepOutput {
    message: Message
    headers: EventHeaders
}

export interface RestrictionStepConfig {
    eventIngestionRestrictionManager: EventIngestionRestrictionManager
    overflowEnabled: boolean
    overflowTopic: string
}

/**
 * Adds restriction steps to an existing pipeline builder.
 * Parses headers and applies event ingestion restrictions (drop, redirect to overflow, etc.).
 *
 * Returns the builder with restriction steps added, allowing the caller to continue
 * chaining additional steps. The caller is responsible for calling handleResults(),
 * handleSideEffects(), and build().
 */
export function addRestrictionSteps<
    TInput extends RestrictionStepInput,
    CInput extends { message: Message },
    COutput extends { message: Message },
>(
    builder: BatchPipelineBuilder<TInput, TInput, CInput, COutput>,
    config: RestrictionStepConfig
): BatchPipelineBuilder<TInput, TInput & { headers: EventHeaders }, CInput, COutput> {
    const { eventIngestionRestrictionManager, overflowEnabled, overflowTopic } = config

    return builder.sequentially((b) =>
        b.pipe(createParseHeadersStep()).pipe(
            createApplyEventRestrictionsStep(eventIngestionRestrictionManager, {
                overflowEnabled,
                overflowTopic,
                preservePartitionLocality: true, // Sessions must stay on the same partition
            })
        )
    )
}
