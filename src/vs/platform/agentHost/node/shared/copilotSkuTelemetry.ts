/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgentTelemetryContext } from '../../common/agent.js';
import type { ICopilotApiService } from './copilotApiService.js';

/** Read late-arriving account metadata only while the captured authentication is still current. */
export function captureCopilotTelemetryContext(apiService: ICopilotApiService, token: string | undefined, isCurrent: () => boolean): IAgentTelemetryContext {
	const capturedContext = token ? apiService.captureCopilotTelemetryContext?.(token) : undefined;
	return {
		get copilotSku() {
			if (!token || !isCurrent()) {
				return undefined;
			}
			return capturedContext ? capturedContext()?.copilotSku : apiService.getCachedCopilotSku?.(token);
		},
		get copilotTrackingId() {
			return token && isCurrent() ? capturedContext?.()?.copilotTrackingId : undefined;
		},
	};
}

/** Maps account context to telemetry property names only at emission time. */
export function toCopilotTelemetryData(context: IAgentTelemetryContext | undefined): { copilotSku: string | undefined; 'common.copilotTrackingId'?: string } | undefined {
	if (!context) {
		return undefined;
	}
	const { copilotSku, copilotTrackingId } = context;
	// __GDPR__COMMON__ "common.copilotTrackingId" : { "endPoint": "GoogleAnalyticsID", "classification": "EndUserPseudonymizedInformation", "purpose": "BusinessInsight", "comment": "The anonymized Copilot analytics tracking ID from the operation's account discovery response." }
	return { copilotSku, ...(copilotTrackingId ? { 'common.copilotTrackingId': copilotTrackingId } : {}) };
}
