/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubTelemetryNotification } from '@github/copilot-sdk';
import { multiplexProperties, type IAgentHostRestrictedTelemetry, type IAgentHostRestrictedTelemetryContext, type TelemetryProps } from './agentHostRestrictedTelemetry.js';

/* __GDPR__FRAGMENT__
	"AgentHostRestrictedSdkSession": {
		"sdkSessionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Existing Copilot SDK conversation identifier, independent of host session grouping and telemetry process lifetime." }
	}
*/

/* __GDPR__FRAGMENT__
	"AgentHostRestrictedEngineCall": {
		"requestModel": { "classification": "CustomerContent", "purpose": "FeatureInsight", "comment": "Model identifier named in this model call's request; may be a bring-your-own-key deployment name. Restricted telemetry only." },
		"responseModel": { "classification": "CustomerContent", "purpose": "FeatureInsight", "comment": "Model identifier the provider reported in this model call's response; absent when the response does not identify one. Restricted telemetry only." },
		"interactionType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Bounded origin of this model call, captured when the call was dispatched: agent, subagent, compaction, sampling, background or user." },
		"parentToolCallId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Model tool call that spawned the subagent making this model call; absent for root calls and for subagents no model tool call spawned." },
		"initiatorType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether a user or an agent initiated this model call: user or agent." },
		"runtimeVersion": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Version of the Copilot runtime that made this model call." },
		"copilotSdkVersion": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Version of the Copilot SDK package bundled with the Agent Host that forwarded this model call." }
	}
*/

/* __GDPR__
	"copilot-chat/engine.messages": {
		"owner": "amunger",
		"comment": "SDK conversation, branch and per-call attribution on existing restricted engine snapshots.",
		"${include}": [ "${AgentHostRestrictedSdkSession}", "${AgentHostRestrictedEngineCall}" ],
		"sdkAgentId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Native SDK subagent identifier within the root SDK conversation; absent for root calls." },
		"interaction_id": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Runtime interaction this model call serves, the same value as interaction_id on the runtime's other forwarded events for that interaction; a subagent's calls carry the interaction that spawned the subagent." }
	}
*/

/* __GDPR__
	"copilot-chat/engine.messages.length": {
		"owner": "amunger",
		"comment": "SDK conversation, branch and per-call attribution on existing restricted engine length events.",
		"${include}": [ "${AgentHostRestrictedSdkSession}", "${AgentHostRestrictedEngineCall}" ],
		"sdkAgentId": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Native SDK subagent identifier within the root SDK conversation; absent for root calls." },
		"interaction_id": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Runtime interaction this model call serves, the same value as interaction_id on the runtime's other forwarded events for that interaction; a subagent's calls carry the interaction that spawned the subagent." }
	}
*/

const enum TelemetryDestination {
	EnhancedGH = 1,
	InternalMSFT = 2,
}

const targetDestinations = new Map<string, TelemetryDestination>([
	['engine.messages', TelemetryDestination.EnhancedGH],
	['engine.messages.length', TelemetryDestination.EnhancedGH | TelemetryDestination.InternalMSFT],
	['conversation.repetition.detected', TelemetryDestination.EnhancedGH],
	['model.message.added', TelemetryDestination.InternalMSFT],
	['model.modelCall.input', TelemetryDestination.InternalMSFT],
	['model.modelCall.output', TelemetryDestination.InternalMSFT],
	['model.request.added', TelemetryDestination.InternalMSFT],
	['model.request.options.added', TelemetryDestination.InternalMSFT],
]);

export class AgentHostGitHubTelemetryRouter {

	/**
	 * @param _copilotSdkVersion Version of the Copilot SDK package bundled with this Agent Host,
	 * stamped on engine snapshots. The runtime reports its own version separately.
	 */
	constructor(
		private readonly _telemetryService: IAgentHostRestrictedTelemetry,
		private readonly _copilotSdkVersion?: string,
	) { }

	isTarget(notification: GitHubTelemetryNotification): boolean {
		return targetDestinations.has(notification.event.kind);
	}

	async route(notification: GitHubTelemetryNotification, context?: IAgentHostRestrictedTelemetryContext, additionalProperties?: TelemetryProps): Promise<boolean> {
		const { event } = notification;
		const eventName = event.kind;
		const destinations = targetDestinations.get(eventName);
		if (destinations === undefined) {
			return false;
		}
		if (!notification.restricted) {
			return true;
		}
		if (!context) {
			return true;
		}

		const isEngineSnapshot = eventName === 'engine.messages' || eventName === 'engine.messages.length';
		const properties: TelemetryProps = {
			...event.properties,
			// Engine snapshots mint their own pairing UUID, independently of the SDK model-call ID.
			...(!isEngineSnapshot && event.model_call_id && event.properties.modelCallId === undefined ? { modelCallId: event.model_call_id } : {}),
			...additionalProperties,
			...(isEngineSnapshot ? {
				sdkSessionId: notification.sessionId || undefined,
				sdkAgentId: event.properties.agent_id || undefined,
				copilotSdkVersion: this._copilotSdkVersion || undefined,
			} : {}),
		};
		const multiplexedProperties = await multiplexProperties(properties);
		if ((destinations & TelemetryDestination.EnhancedGH) && context.restrictedTelemetryEnabled) {
			this._telemetryService.sendEnhancedGHTelemetryEventForContext(context, eventName, multiplexedProperties, event.metrics);
		}
		if ((destinations & TelemetryDestination.InternalMSFT) && context.isInternal) {
			this._telemetryService.sendInternalMSFTTelemetryEventForContext(context, eventName, multiplexedProperties, event.metrics);
		}
		return true;
	}
}
