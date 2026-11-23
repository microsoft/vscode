/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgentHostPullRequestAutopilotService } from '../../node/agentHostPullRequestAutopilot.js';

/** A host whose artifact integrations are disabled, so Autopilot is never offered or turned on. */
export const nullPullRequestAutopilotService: IAgentHostPullRequestAutopilotService = {
	_serviceBrand: undefined,
	isAvailable: () => false,
	enable: () => Promise.reject(new Error('Autopilot is unavailable.')),
};
