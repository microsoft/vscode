/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PROTOCOL_VERSION } from './state/protocol/version/registry.js';

export const MissionControlProtocolVersionOverrideSettingId = 'chat.agentHost.experimentalMissionControl.protocolVersionOverride';
export const missionControlProtocolVersionOverridePattern = '^(?:|(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*))$';

/** Resolves the Mission Control relay version without changing other host transports. */
export function getMissionControlProtocolVersion(override: string | undefined): string {
	if (override === undefined || override === '') {
		return PROTOCOL_VERSION;
	}
	if (!new RegExp(missionControlProtocolVersionOverridePattern).test(override) || !override.split('.').every(part => Number.isSafeInteger(Number(part)))) {
		throw new Error(`Invalid Mission Control protocol version override: ${override}. Expected MAJOR.MINOR.PATCH or an empty string.`);
	}
	return override;
}
