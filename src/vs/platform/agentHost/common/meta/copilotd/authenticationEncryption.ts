/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vBoolean, vEnum, vObj, vOptionalProp, vString } from '../../../../../base/common/validation.js';
import type { IMissionControlCredentialSealingRequest } from '../../agentService.js';
import type { InitializeResult } from '../../state/protocol/common/commands.js';
import type { RootState } from '../../state/sessionState.js';

export interface IAgentHostAuthenticationEncryption {
	readonly key: IMissionControlCredentialSealingRequest['key'];
	readonly challenge?: string;
}

const keyValidator = vObj({
	use: vEnum('auth-token', 'mcp-auth-token'),
	keyId: vString(),
	publicKey: vString(),
	algorithm: vEnum('hpke-x25519-hkdf-sha256-aes256gcm', 'x25519-sealedbox'),
});
const challengeValidator = vObj({ challenge: vString(), required: vOptionalProp(vBoolean()) });

function readKey(value: unknown, purpose: IMissionControlCredentialSealingRequest['key']['use']): IMissionControlCredentialSealingRequest['key'] | undefined {
	const key = keyValidator.validate(value).content;
	if (!key || key.use !== purpose || !key.keyId || !key.publicKey) {
		return undefined;
	}
	return { key_id: key.keyId, public_key: key.publicKey, algorithm: key.algorithm, use: purpose };
}

/** Reads the recipient key and connection binding for a protected credential, failing closed on required encryption. */
export function readAuthenticationEncryption(
	root: Pick<RootState, '_meta'> | undefined,
	initialized: Pick<InitializeResult, '_meta'> | undefined,
	purpose: IMissionControlCredentialSealingRequest['key']['use'],
): IAgentHostAuthenticationEncryption | undefined {
	const required = initialized?._meta?.['copilot.encryptionRequired'];
	if (required !== undefined && (!Array.isArray(required) || !required.every(value => typeof value === 'string'))) {
		throw new Error('Agent host advertised invalid authentication encryption requirements.');
	}
	const advertised = root?._meta?.['copilot.encryptionKeys'];
	const keys = Array.isArray(advertised) ? advertised.map(value => readKey(value, purpose)).filter(key => key !== undefined) : [];
	const key = keys.find(key => key.algorithm === 'hpke-x25519-hkdf-sha256-aes256gcm') ?? keys[0];
	if (!key) {
		if (required?.includes(purpose)) {
			throw new Error(`Agent host requires authentication encryption but has no supported ${purpose} recipient key.`);
		}
		return undefined;
	}
	const binding = initialized?._meta?.['copilot.authChallenge'];
	let challenge: string | undefined;
	if (binding !== undefined) {
		const parsed = challengeValidator.validate(binding).content;
		if (!parsed || !/^[0-9a-f]{32}$/.test(parsed.challenge)) {
			throw new Error('Agent host advertised an invalid authentication connection challenge.');
		}
		challenge = parsed.challenge;
	}
	return { key, challenge };
}
