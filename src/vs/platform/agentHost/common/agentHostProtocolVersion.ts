/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { env } from '../../../base/common/process.js';
import { PROTOCOL_VERSION } from './state/protocol/version/registry.js';

export const AgentHostProtocolVersionOverrideSettingId = 'chat.agentHost.protocolVersionOverride';
export const AgentHostProtocolVersionOverrideEnvVar = 'VSCODE_AGENT_HOST_PROTOCOL_VERSION_OVERRIDE';
export const agentHostProtocolVersionOverridePattern = '^(?:|(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*))$';

/** Resolves the development-only host version without changing the client's version offers. */
export function getAgentHostProtocolVersion(override = env[AgentHostProtocolVersionOverrideEnvVar]): string {
	if (override === undefined || override === '') {
		return PROTOCOL_VERSION;
	}
	if (!new RegExp(agentHostProtocolVersionOverridePattern).test(override) || !override.split('.').every(part => Number.isSafeInteger(Number(part)))) {
		throw new Error(`Invalid Agent Host protocol version override: ${override}. Expected MAJOR.MINOR.PATCH or an empty string.`);
	}
	return override;
}
