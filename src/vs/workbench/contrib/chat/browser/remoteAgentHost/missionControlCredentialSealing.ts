/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';
import type { IHostEncryptionKey } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import type { IMissionControlCredentialSealingRequest } from '../../../../../platform/agentHost/common/agentService.js';
import type { RootState } from '../../../../../platform/agentHost/common/state/sessionState.js';
import type { IAgentHostAuthenticateRequest } from '../agentSessions/agentHost/agentHostAuth.js';

/** Pins MCP sealing to the authenticated environment descriptor and this handshake's advertised key. */
export async function sealMissionControlMcpCredential(
	request: IAgentHostAuthenticateRequest,
	trustedKeys: readonly IHostEncryptionKey[] | undefined,
	root: RootState,
	handshakeMeta: Record<string, unknown> | undefined,
	seal: (request: IMissionControlCredentialSealingRequest) => Promise<string>,
): Promise<IAgentHostAuthenticateRequest> {
	const advertised = root._meta?.['copilot.encryptionKeys'];
	if (!Array.isArray(trustedKeys) || !Array.isArray(advertised)) {
		throw new Error('Mission Control has no authenticated MCP recipient key.');
	}
	const key = trustedKeys.find(key => key.use === 'mcp-auth-token' && key.algorithm === 'x25519-sealedbox'
		&& advertised.some(value => {
			if (!isObject(value)) {
				return false;
			}
			const candidate = value as { keyId?: string; use?: string; algorithm?: string; publicKey?: string };
			return candidate.keyId === key.key_id && candidate.use === key.use && candidate.algorithm === key.algorithm && candidate.publicKey === key.public_key;
		}));
	if (!key) {
		throw new Error('Mission Control MCP key does not match the connected host.');
	}
	const value = handshakeMeta?.['copilot.authChallenge'];
	const binding = isObject(value) ? value as { challenge?: unknown; required?: unknown } : undefined;
	if (binding?.required === true && typeof binding.challenge !== 'string') {
		throw new Error('Mission Control requires a missing handshake challenge.');
	}
	const token = await seal({
		resource: request.resource, token: request.token,
		key: { ...key, use: 'mcp-auth-token' },
		challenge: typeof binding?.challenge === 'string' ? binding.challenge : undefined,
	});
	return { ...request, token };
}
