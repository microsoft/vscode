/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getErrorMessage } from '../../../base/common/errors.js';
import { compareProtocolVersions, negotiateProtocolVersion, SUPPORTED_PROTOCOL_VERSIONS } from './state/protocol/version/registry.js';
import { JsonRpcErrorCodes, ProtocolError } from './state/sessionProtocol.js';

const legacyCompatibleProtocolVersion = '0.10.0';

export function negotiateAgentHostProtocolVersion(offered: readonly string[]): string | undefined {
	try {
		const negotiated = negotiateProtocolVersion(offered);
		// VS Code's 0.10.0 release shares the wire contract of the upstream baselines.
		return offered.includes(legacyCompatibleProtocolVersion)
			&& (negotiated === undefined || compareProtocolVersions(legacyCompatibleProtocolVersion, negotiated) > 0)
			? legacyCompatibleProtocolVersion
			: negotiated;
	} catch (error) {
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, getErrorMessage(error));
	}
}

export function getAgentHostSupportedProtocolVersions(): string[] {
	return [...SUPPORTED_PROTOCOL_VERSIONS, legacyCompatibleProtocolVersion].sort((a, b) => compareProtocolVersions(b, a));
}
