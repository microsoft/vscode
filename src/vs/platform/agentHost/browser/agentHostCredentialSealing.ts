/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileAccess } from '../../../base/common/network.js';
import { sealAgentHostCredential as sealCredential } from '../common/agentHostCredentialSealing.js';
import type { IMissionControlCredentialSealingRequest } from '../common/agentService.js';

type AgentHostCryptoModule = Pick<typeof import('@hpke/core'), 'CipherSuite' | 'DhkemX25519HkdfSha256' | 'HkdfSha256' | 'Aes256Gcm'> & {
	readonly sodium: typeof import('libsodium-wrappers').default;
};

/** Encrypts locally without depending on an ambient Agent Host or a native IPC bridge. */
export async function sealAgentHostCredential(request: IMissionControlCredentialSealingRequest): Promise<string> {
	const url = FileAccess.asBrowserUri('vs/platform/agentHost/browser/agentHostCryptoModule.js').toString(true);
	const implementation = await import(/* webpackIgnore: true */ /* @vite-ignore */ `${url}`) as AgentHostCryptoModule;
	await implementation.sodium.ready;
	return sealCredential(request, implementation.sodium, async () => new implementation.CipherSuite({
		kem: new implementation.DhkemX25519HkdfSha256(),
		kdf: new implementation.HkdfSha256(),
		aead: new implementation.Aes256Gcm(),
	}));
}
