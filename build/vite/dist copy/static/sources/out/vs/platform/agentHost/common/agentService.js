/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
// IPC contract between the renderer and the agent host utility process.
// Defines all serializable event types, the IAgent provider interface,
// and the IAgentService / IAgentHostService service decorators.
export var AgentHostIpcChannels;
(function (AgentHostIpcChannels) {
    /** Channel for the agent host service on the main-process side */
    AgentHostIpcChannels["AgentHost"] = "agentHost";
    /** Channel for log forwarding from the agent host process */
    AgentHostIpcChannels["Logger"] = "agentHostLogger";
    /** Channel for WebSocket client connection count (server process management only) */
    AgentHostIpcChannels["ConnectionTracker"] = "agentHostConnectionTracker";
})(AgentHostIpcChannels || (AgentHostIpcChannels = {}));
/** Configuration key that controls whether the agent host process is spawned. */
export const AgentHostEnabledSettingId = 'chat.agentHost.enabled';
/** Configuration key that controls whether per-host IPC traffic output channels are created. */
export const AgentHostIpcLoggingSettingId = 'chat.agentHost.ipcLoggingEnabled';
// ---- Session URI helpers ----------------------------------------------------
export var AgentSession;
(function (AgentSession) {
    /**
     * Creates a session URI from a provider name and raw session ID.
     * The URI scheme is the provider name (e.g., `copilot:/<rawId>`).
     */
    function uri(provider, rawSessionId) {
        return URI.from({ scheme: provider, path: `/${rawSessionId}` });
    }
    AgentSession.uri = uri;
    /**
     * Extracts the raw session ID from a session URI (the path without leading slash).
     * Accepts both a URI object and a URI string.
     */
    function id(session) {
        const parsed = typeof session === 'string' ? URI.parse(session) : session;
        return parsed.path.substring(1);
    }
    AgentSession.id = id;
    /**
     * Extracts the provider name from a session URI scheme.
     * Accepts both a URI object and a URI string.
     */
    function provider(session) {
        const parsed = typeof session === 'string' ? URI.parse(session) : session;
        return parsed.scheme || undefined;
    }
    AgentSession.provider = provider;
})(AgentSession || (AgentSession = {}));
// ---- Service interfaces -----------------------------------------------------
export const IAgentService = createDecorator('agentService');
export const IAgentHostService = createDecorator('agentHostService');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQU05RSx3RUFBd0U7QUFDeEUsdUVBQXVFO0FBQ3ZFLGdFQUFnRTtBQUVoRSxNQUFNLENBQU4sSUFBa0Isb0JBT2pCO0FBUEQsV0FBa0Isb0JBQW9CO0lBQ3JDLGtFQUFrRTtJQUNsRSwrQ0FBdUIsQ0FBQTtJQUN2Qiw2REFBNkQ7SUFDN0Qsa0RBQTBCLENBQUE7SUFDMUIscUZBQXFGO0lBQ3JGLHdFQUFnRCxDQUFBO0FBQ2pELENBQUMsRUFQaUIsb0JBQW9CLEtBQXBCLG9CQUFvQixRQU9yQztBQUVELGlGQUFpRjtBQUNqRixNQUFNLENBQUMsTUFBTSx5QkFBeUIsR0FBRyx3QkFBd0IsQ0FBQztBQUVsRSxnR0FBZ0c7QUFDaEcsTUFBTSxDQUFDLE1BQU0sNEJBQTRCLEdBQUcsa0NBQWtDLENBQUM7QUFvUC9FLGdGQUFnRjtBQUVoRixNQUFNLEtBQVcsWUFBWSxDQTJCNUI7QUEzQkQsV0FBaUIsWUFBWTtJQUU1Qjs7O09BR0c7SUFDSCxTQUFnQixHQUFHLENBQUMsUUFBdUIsRUFBRSxZQUFvQjtRQUNoRSxPQUFPLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxJQUFJLFlBQVksRUFBRSxFQUFFLENBQUMsQ0FBQztJQUNqRSxDQUFDO0lBRmUsZ0JBQUcsTUFFbEIsQ0FBQTtJQUVEOzs7T0FHRztJQUNILFNBQWdCLEVBQUUsQ0FBQyxPQUFxQjtRQUN2QyxNQUFNLE1BQU0sR0FBRyxPQUFPLE9BQU8sS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztRQUMxRSxPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2pDLENBQUM7SUFIZSxlQUFFLEtBR2pCLENBQUE7SUFFRDs7O09BR0c7SUFDSCxTQUFnQixRQUFRLENBQUMsT0FBcUI7UUFDN0MsTUFBTSxNQUFNLEdBQUcsT0FBTyxPQUFPLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7UUFDMUUsT0FBTyxNQUFNLENBQUMsTUFBTSxJQUFJLFNBQVMsQ0FBQztJQUNuQyxDQUFDO0lBSGUscUJBQVEsV0FHdkIsQ0FBQTtBQUNGLENBQUMsRUEzQmdCLFlBQVksS0FBWixZQUFZLFFBMkI1QjtBQXdHRCxnRkFBZ0Y7QUFFaEYsTUFBTSxDQUFDLE1BQU0sYUFBYSxHQUFHLGVBQWUsQ0FBZ0IsY0FBYyxDQUFDLENBQUM7QUFnSTVFLE1BQU0sQ0FBQyxNQUFNLGlCQUFpQixHQUFHLGVBQWUsQ0FBb0Isa0JBQWtCLENBQUMsQ0FBQyJ9