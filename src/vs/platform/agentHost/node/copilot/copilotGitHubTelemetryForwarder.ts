/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubTelemetryNotification } from '@github/copilot-sdk';
import { ITelemetryData, ITelemetryService } from '../../../telemetry/common/telemetry.js';

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
