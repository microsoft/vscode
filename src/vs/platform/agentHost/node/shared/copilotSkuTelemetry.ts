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
		get 'common.copilotTrackingId'() {
			// __GDPR__COMMON__ "common.copilotTrackingId" : { "endPoint": "GoogleAnalyticsID", "classification": "EndUserPseudonymizedInformation", "purpose": "BusinessInsight", "comment": "The anonymized Copilot analytics tracking ID from the operation's account discovery response." }
			return token && isCurrent() ? capturedContext?.()?.['common.copilotTrackingId'] : undefined;
		},
	};
}
