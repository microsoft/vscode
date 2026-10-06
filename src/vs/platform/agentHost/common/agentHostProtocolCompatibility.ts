/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { negotiateProtocolVersion } from './state/protocol/version/negotiation.js';
import { PROTOCOL_VERSION } from './state/protocol/version/registry.js';

// These releases share a wire contract despite crossing SemVer compatibility boundaries.
const compatibleProtocolVersions: readonly string[] = ['1.0.0', '0.10.0', '0.9.0'];

export function negotiateAgentHostProtocolVersion(offered: readonly string[], current = PROTOCOL_VERSION): string | undefined {
	if (compatibleProtocolVersions.includes(current)) {
		const compatible = compatibleProtocolVersions.find(version => offered.includes(version));
		if (compatible) {
			return compatible;
		}
	}
	return negotiateProtocolVersion(offered, current);
}

export function getAgentHostSupportedProtocolVersions(current = PROTOCOL_VERSION): string[] {
	if (compatibleProtocolVersions.includes(current)) {
		return [...compatibleProtocolVersions];
	}
	const [major, minor] = current.split('.');
	const minimum = `${major}.${major === '0' ? minor : '0'}.0`;
	return minimum === current ? [current] : [`>=${minimum} <=${current}`];
}
