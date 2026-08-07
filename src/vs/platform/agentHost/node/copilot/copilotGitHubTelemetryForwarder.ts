/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubTelemetryNotification } from '@github/copilot-sdk';
import { ITelemetryData, ITelemetryService } from '../../../telemetry/common/telemetry.js';

/* __GDPR__FRAGMENT__
	"CopilotCliForwardedTelemetry": {
		"created_at": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Timestamp when the SDK created the event." },
		"model_call_id": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "SDK identifier for the model call." },
		"exp_assignment_context": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Experiment assignment context from the Copilot CLI runtime." },
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
	"copilotCli/response.success": {
		"owner": "amunger",
		"comment": "Reports performance and usage details for successful Copilot CLI model responses forwarded by the Copilot SDK.",
		"${include}": [ "${CopilotCliForwardedTelemetry}" ],
		"reason": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Reason the response completed." },
		"model": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Model selected for the response." },
		"apiType": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "API type used for the response." },
		"requestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Identifier for the request." },
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
	"copilotCli/response.error": {
		"owner": "amunger",
		"comment": "Reports performance and usage details for failed Copilot CLI model responses forwarded by the Copilot SDK.",
		"${include}": [ "${CopilotCliForwardedTelemetry}" ],
		"type": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Type of response failure." },
		"model": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Model selected for the response." },
		"apiType": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "API type used for the response." },
		"requestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Identifier for the request." },
		"gitHubRequestId": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "GitHub identifier for the request." },
		"reasoningEffort": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Reasoning effort used for the response." },
		"copilot_pid": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Process identifier for the Copilot CLI runtime." },
		"interaction_id": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Identifier that correlates events in an interaction." },
		"engagement_id": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Identifier that correlates events in an engagement." },
		"transport": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Transport used for the request." }
	}
*/

/* __GDPR__
	"copilotCli/task_complete_todo_state": {
		"owner": "amunger",
		"comment": "Reports the aggregate state of the Copilot CLI todo list when task completion is recorded. Contains only todo-status counts and derived boolean indicators; it does not contain todo text or other user content.",
		"${include}": [ "${CopilotCliForwardedTelemetry}" ],
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
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) { }

	forward(notification: GitHubTelemetryNotification): void {
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

		if (event.features) {
			for (const [key, value] of Object.entries(event.features)) {
				if (value !== undefined) {
					data[`feature.${key}`] = value;
				}
			}
		}

		this._telemetryService.publicLog(`copilotCli/${event.kind}`, data);
	}
}
