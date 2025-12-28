/**
 * Types Module Barrel Export
 * Re-exports all type definitions
 */

// CLI types
export type {
    Phase,
    CLIType,
    ProcessState,
    CLIOutput,
    CLIStatus,
    CLIConfig,
    CrewConfig,
    HandoverStrategy,
    ShipConfig,
    ICLIAdapter,
    ProcessOptions,
    SpawnResult
} from './cli';

// Message types
export type {
    MessageSender,
    ChatMessage,
    ExtensionToWebviewMessage,
    WebviewToExtensionMessage,
    WebviewMessage,
    MessageHandler,
    PostMessage
} from './messages';

export {
    isExtensionMessage,
    isWebviewMessage,
    createMessageId,
    createChatMessage
} from './messages';

// State types
export type {
    AgentMemory,
    SessionState,
    HandoverArtifact,
    TimelineEntry,
    Logbook,
    StateOptions
} from './state';

export {
    STATE_VERSION,
    DEFAULT_STATE,
    createSessionId,
    createSessionState,
    createTimelineEntry
} from './state';
