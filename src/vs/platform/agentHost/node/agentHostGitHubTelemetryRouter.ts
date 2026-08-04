/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubTelemetryNotification } from '@github/copilot-sdk';
import { multiplexProperties, type IAgentHostRestrictedTelemetry, type IAgentHostRestrictedTelemetryContext, type TelemetryProps } from './agentHostRestrictedTelemetry.js';

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

	constructor(private readonly _telemetryService: IAgentHostRestrictedTelemetry) { }

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

		const properties: TelemetryProps = {
			...event.properties,
			...(event.model_call_id && event.properties.modelCallId === undefined ? { modelCallId: event.model_call_id } : {}),
			...additionalProperties,
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
