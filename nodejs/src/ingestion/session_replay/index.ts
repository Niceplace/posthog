// Pipeline
export {
    createSessionReplayPipeline,
    runSessionReplayPipeline,
    SessionReplayPipelineConfig,
    SessionReplayPipelineInput,
} from './session-replay-pipeline'

// Restriction steps (used internally by session-replay-pipeline)
export {
    addRestrictionSteps,
    RestrictionStepInput,
    RestrictionStepOutput,
    RestrictionStepConfig,
} from './restriction-steps'
