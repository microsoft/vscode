/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubTelemetryNotification } from '@github/copilot-sdk';
import { ITelemetryData, ITelemetryService } from '../../../telemetry/common/telemetry.js';

/* __GDPR__FRAGMENT__
	"CopilotSdkForwardedTelemetry": {
		"created_at": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Timestamp when the SDK created the event." },
		"model_call_id": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "SDK identifier for the model call." },
		"exp_assignment_context": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Experiment assignment context from the Copilot CLI runtime." },
		"secondary_assignment_context": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Secondary experiment assignment context assigned by CAPI during model calls." },
		"session_id": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Identifier for the Copilot CLI session." },
		"sdk_session_id": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Identifier for the SDK session that forwarded the event." },
		"copilot_tracking_id": { "classification": "EndUserPseudonymizedInformation", "purpose": "BusinessInsight", "comment": "Pseudonymous Copilot user identifier supplied by the runtime." },
		"kind": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Kind of SDK telemetry event." },
		"cli_version": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Version of the Copilot CLI runtime." },
		"os_platform": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Operating system platform of the Copilot CLI runtime." },
		"os_version": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Operating system version of the Copilot CLI runtime." },
		"os_arch": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Operating system architecture of the Copilot CLI runtime." },
		"node_version": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Node.js version of the Copilot CLI runtime." },
		"copilot_plan": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Copilot subscription plan reported by the runtime." },
		"client_type": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Type of client that produced the event." },
		"client_name": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Name of the client that produced the event." },
		"dev_device_id": { "classification": "EndUserPseudonymizedInformation", "purpose": "BusinessInsight", "comment": "Pseudonymous device identifier supplied by the runtime." },
		"is_staff": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the user is a GitHub or Microsoft staff member.", "isMeasurement": true },
		"restricted": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the SDK marked the event as restricted telemetry.", "isMeasurement": true },
		"${wildcard}": [{
			"${prefix}": "feature.",
			"${classification}": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Feature flag value supplied by the Copilot CLI runtime." }
		}]
	}
*/

/* __GDPR__
	"copilotSdk/response.success": {
		"owner": "amunger",
		"comment": "Reports performance and usage details for successful Copilot CLI model responses forwarded by the Copilot SDK.",
		"${include}": [ "${CopilotSdkForwardedTelemetry}" ],
		"reason": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Reason the response completed." },
		"model": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Model selected for the response." },
		"apiType": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "API type used for the response." },
		"requestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Identifier for the request." },
		"turnId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Agent Host turn identifier active when the model response was forwarded." },
		"gitHubRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "GitHub identifier for the request." },
		"modelCallId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Identifier for the model call." },
		"reasoningEffort": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Reasoning effort used for the response." },
		"requestKind": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Agent Host interaction or call classification." },
		"transport": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Model-call transport, either HTTP or WebSocket." },
		"reasoningSummary": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Effective reasoning-summary setting." },
		"toolCounts": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Tool-call counts keyed by telemetry-safe tool name." },
		"initiatorType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the response was initiated by a user or an agent." },
		"copilot_pid": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Process identifier for the Copilot CLI runtime." },
		"interaction_id": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Identifier that correlates events in an interaction." },
		"engagement_id": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Identifier that correlates events in an engagement." },
		"promptTokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of input prompt tokens.", "isMeasurement": true },
		"promptCacheTokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of input prompt tokens read from cache.", "isMeasurement": true },
		"cacheWriteTokens": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of input prompt tokens written to cache.", "isMeasurement": true },
		"completionTokens": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of generated completion tokens.", "isMeasurement": true },
		"reasoningTokens": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of generated reasoning tokens.", "isMeasurement": true },
		"tokenCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Total number of tokens used by the response.", "isMeasurement": true },
		"toolTokenCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of tokens used by tool definitions.", "isMeasurement": true },
		"availableToolCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of tools available to the model.", "isMeasurement": true },
		"numToolCalls": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of tool calls returned by the model.", "isMeasurement": true },
		"isBYOK": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether bring-your-own-key authentication was used, encoded as 1 for true and -1 for false.", "isMeasurement": true },
		"isAuto": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether automatic model selection was used, encoded as 1 for true and -1 for false.", "isMeasurement": true },
		"totalTokenMax": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Effective maximum number of prompt tokens.", "isMeasurement": true },
		"tokenCountMax": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Requested maximum number of output tokens.", "isMeasurement": true },
		"acceptedPredictionTokens": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of accepted speculative prediction tokens.", "isMeasurement": true },
		"rejectedPredictionTokens": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of rejected speculative prediction tokens.", "isMeasurement": true },
		"turn": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Turn number within the session.", "isMeasurement": true },
		"timeToFirstToken": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Time until the first response token.", "isMeasurement": true },
		"timeToComplete": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Time until the response completed.", "isMeasurement": true }
	}
*/

/* __GDPR__
	"copilotSdk/response.error": {
		"owner": "amunger",
		"comment": "Reports performance and usage details for failed Copilot CLI model responses forwarded by the Copilot SDK.",
		"${include}": [ "${CopilotSdkForwardedTelemetry}" ],
		"type": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Type of response failure." },
		"reason": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "Sanitized model response failure message on restricted telemetry rows." },
		"model": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Model selected for the response." },
		"apiType": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "API type used for the response." },
		"requestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Identifier for the request." },
		"turnId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Agent Host turn identifier active when the model failure was forwarded." },
		"gitHubRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "GitHub identifier for the request." },
		"reasoningEffort": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Reasoning effort used for the response." },
		"requestKind": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Agent Host interaction or call classification." },
		"copilot_pid": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Process identifier for the Copilot CLI runtime." },
		"interaction_id": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Identifier that correlates events in an interaction." },
		"engagement_id": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Identifier that correlates events in an engagement." },
		"transport": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Transport used for the request." },
		"totalTokenMax": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Effective maximum number of prompt tokens.", "isMeasurement": true },
		"tokenCountMax": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Requested maximum number of output tokens.", "isMeasurement": true },
		"isBYOK": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether bring-your-own-key authentication was used, encoded as 1 for true and -1 for false.", "isMeasurement": true },
		"isAuto": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether automatic model selection was used, encoded as 1 for true and -1 for false.", "isMeasurement": true },
		"issuedTime": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Timestamp when the failed request was issued.", "isMeasurement": true },
		"imageCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of images included in the failed request.", "isMeasurement": true },
		"isVisionRequest": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Whether the failed request included an image, encoded as 1 for true and -1 for false.", "isMeasurement": true },
		"imageUnknownMimeCount": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of images without a known media type in the failed request.", "isMeasurement": true },
		"timeToComplete": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Time until the request failed.", "isMeasurement": true }
	}
*/

/* __GDPR__
	"copilotSdk/model_call_cancelled": {
		"owner": "amunger",
		"comment": "Reports performance and request-shape details for cancelled Copilot CLI model-call attempts forwarded by the Copilot SDK.",
		"${include}": [ "${CopilotSdkForwardedTelemetry}" ],
		"event_id": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Unique identifier for the cancellation telemetry event." },
		"model": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Telemetry-safe product model selected for the cancelled attempt; omitted for custom and BYOK models." },
		"api_endpoint": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Model API endpoint used by the cancelled attempt." },
		"transport": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Transport used by the cancelled attempt." },
		"cancellation_source": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Bounded runtime category identifying where cancellation was detected." },
		"attempt_id": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Runtime identifier for the physical model-call attempt." },
		"interaction_type": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Allowlisted interaction type that initiated the cancelled attempt." },
		"initiator": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Bounded user or agent initiator of the cancelled attempt." },
		"is_byok": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the cancelled attempt used a bring-your-own-key provider." },
		"copilot_pid": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Process identifier for the Copilot CLI runtime." },
		"interaction_id": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Identifier that correlates events in an interaction." },
		"engagement_id": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Identifier that correlates events in an engagement." },
		"duration_ms": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Elapsed time for the cancelled attempt in milliseconds.", "isMeasurement": true },
		"attempt_index": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Zero-based physical model-call attempt index within the runtime model loop.", "isMeasurement": true },
		"retry_index": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Zero-based retry index within the current logical model call.", "isMeasurement": true },
		"prompt_token_count": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Prompt token count calculated before the cancelled attempt.", "isMeasurement": true },
		"max_prompt_tokens": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Effective maximum prompt-token limit for the cancelled attempt.", "isMeasurement": true },
		"max_output_tokens": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Effective maximum output-token limit for the cancelled attempt.", "isMeasurement": true },
		"request_message_count": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of messages in the cancelled request.", "isMeasurement": true },
		"request_tool_result_message_count": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of tool-result messages in the cancelled request.", "isMeasurement": true },
		"request_tool_call_count": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of tool calls represented in the cancelled request.", "isMeasurement": true },
		"request_nameless_tool_call_count": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of tool calls without a name in the cancelled request.", "isMeasurement": true },
		"request_image_part_count": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of image parts in the cancelled request.", "isMeasurement": true },
		"request_image_parts_missing_media_type": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of image parts missing a media type in the cancelled request.", "isMeasurement": true }
	}
*/

/* __GDPR__
	"copilotSdk/task_complete_todo_state": {
		"owner": "amunger",
		"comment": "Reports the aggregate state of the Copilot CLI todo list when task completion is recorded. Contains only todo-status counts and derived boolean indicators; it does not contain todo text or other user content.",
		"${include}": [ "${CopilotSdkForwardedTelemetry}" ],
		"copilot_pid": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Process identifier for the Copilot CLI runtime." },
		"interaction_id": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Identifier that correlates events in an interaction." },
		"engagement_id": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Identifier that correlates events in an engagement." },
		"surface": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Telemetry-safe product surface that recorded task completion." },
		"billable": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the interaction is billable." },
		"had_todos": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the Copilot CLI todo list contained at least one item when task completion was recorded." },
		"has_open_todos": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the Copilot CLI todo list contained at least one pending, in-progress, or blocked item when task completion was recorded." },
		"pending_todos": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of todo items in the pending state when task completion was recorded.", "isMeasurement": true },
		"in_progress_todos": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of todo items in the in-progress state when task completion was recorded.", "isMeasurement": true },
		"blocked_todos": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of todo items in the blocked state when task completion was recorded.", "isMeasurement": true },
		"done_todos": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of todo items in the done state when task completion was recorded.", "isMeasurement": true },
		"open_todos": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of todo items not yet done, comprising pending, in-progress, and blocked items, when task completion was recorded.", "isMeasurement": true },
		"total_todos": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Total number of todo items when task completion was recorded.", "isMeasurement": true }
	}
*/

/* __GDPR__
	"copilotSdk/tool_call_executed": {
		"owner": "amunger",
		"comment": "Reports the outcome and response size of a tool invocation forwarded by the Copilot SDK. Contains only the telemetry-safe tool name and arguments (unsafe values are hashed by the runtime), bounded outcome values, opaque correlation identifiers, and numeric measurements; it does not contain raw tool arguments or tool output.",
		"${include}": [ "${CopilotSdkForwardedTelemetry}" ],
		"event_id": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Identifier for the tool execution session event." },
		"tool_name": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Telemetry-safe tool name; unsafe names are hashed by the runtime." },
		"arguments": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Telemetry-safe tool arguments; unsafe values are hashed by the runtime." },
		"result_type": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Coarse tool result outcome, either SUCCESS or FAILURE." },
		"invoke_outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Fine-grained invocation outcome: success, error, cancelled, or disabledByUser." },
		"model": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Model that requested the tool call." },
		"tool_call_id": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Identifier for this tool call, stable across correlated events." },
		"turn_id": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Identifier for the agent loop turn the tool was invoked in." },
		"api_call_id": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Identifier for the model call that requested the tool." },
		"completion_with_tools_call_id": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Identifier correlating the tool call with its completion-with-tools request." },
		"agent_id": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Sub-agent instance identifier, absent for the root agent." },
		"is_mcp_tool": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the tool is provided by an MCP server." },
		"is_mcp_app_tool": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the tool surfaced MCP Apps UI metadata." },
		"mcp_ui_visibility": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "MCP Apps UI visibility enum values for the tool result." },
		"is_custom_agent": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the tool call was a custom-agent invocation." },
		"has_copilot_annotations": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the tool result carried Copilot annotations." },
		"copilot_pid": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Process identifier for the Copilot CLI runtime." },
		"interaction_id": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Identifier that correlates events in an interaction." },
		"engagement_id": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Identifier that correlates events in an engagement." },
		"duration_ms": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Wall-clock duration of the tool execution in milliseconds.", "isMeasurement": true },
		"result_token_count": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Token count of the model-facing tool result, measured with the model tokenizer. Present only for successful results.", "isMeasurement": true },
		"binary_result_count": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Number of binary result parts returned by the tool.", "isMeasurement": true },
		"binary_result_total_bytes": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Total byte size of binary result parts returned by the tool.", "isMeasurement": true }
	}
*/

/**
 * Re-emits GitHub-shaped telemetry events forwarded by the Copilot CLI runtime
 * (via the SDK's `onGitHubTelemetry` connection-global callback) through VS
 * Code's {@link ITelemetryService} so they land in the same first-party
 * Microsoft cluster/database as the rest of the agent host's telemetry.
 *
 * Restricted events (`cli.restricted_telemetry`) are only forwarded when
 * restricted telemetry is enabled for the current Copilot token; standard
 * events always flow through.
 */
export class CopilotGitHubTelemetryForwarder {

	constructor(
		private readonly _isRestrictedTelemetryEnabled: () => boolean,
		private readonly _getVSCodeAssignmentContext: () => string | undefined,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) { }

	forward(notification: GitHubTelemetryNotification, agentHostTurnId?: string): void {
		if (notification.restricted && !this._isRestrictedTelemetryEnabled()) {
			return;
		}

		const event = notification.event;
		const data: ITelemetryData = {
			...event.client,
			...event.properties,
			...event.metrics,
			created_at: event.created_at,
			model_call_id: event.model_call_id,
			exp_assignment_context: event.exp_assignment_context,
			session_id: event.session_id ?? notification.sessionId,
			sdk_session_id: notification.sessionId,
			copilot_tracking_id: event.copilot_tracking_id,
			kind: event.kind,
			restricted: notification.restricted,
		};
		if (event.kind === 'response.success' || event.kind === 'response.error') {
			if (agentHostTurnId) {
				data.turnId = agentHostTurnId;
			} else {
				delete data.turnId;
			}
		}

		// VS Code's TAS assignment context, scoped to forwarded Copilot CLI
		// events only — deliberately not a telemetry-service-wide experiment
		// property, so Claude/Codex/host events stay unstamped.
		const assignmentContext = this._getVSCodeAssignmentContext();
		if (assignmentContext) {
			data['abexp.assignmentcontext'] = assignmentContext;
		}

		if (event.features) {
			for (const [key, value] of Object.entries(event.features)) {
				if (value !== undefined) {
					data[`feature.${key}`] = value;
				}
			}
		}

		this._telemetryService.publicLog(`copilotSdk/${event.kind}`, data);
	}
}
