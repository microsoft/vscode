/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgentTelemetryContext } from '../../common/agent.js';
import type { ICopilotApiService } from './copilotApiService.js';

/** Read late-arriving account metadata only while the captured authentication is still current. */
export function captureCopilotTelemetryContext(apiService: ICopilotApiService, token: string | undefined, isCurrent: () => boolean): IAgentTelemetryContext {
	const capturedSku = token ? apiService.captureCopilotSku?.(token) : undefined;
	return {
		get copilotSku() {
			if (!token || !isCurrent()) {
				return undefined;
			}
			return capturedSku ? capturedSku() : apiService.getCachedCopilotSku?.(token);
		},
	};
}
