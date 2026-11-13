/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, encodeBase64, encodeHex, VSBuffer } from '../../../base/common/buffer.js';
import type { IMissionControlCredentialSealingRequest } from './agentService.js';

interface ICredentialCipherSuite {
	createSenderContext(options: { recipientPublicKey: CryptoKey }): Promise<{
		readonly enc: ArrayBuffer;
		seal(plaintext: Uint8Array): Promise<ArrayBuffer>;
	}>;
}

/** Seals a credential for an authenticated recipient using the portable Mission Control envelope. */
export async function sealAgentHostCredential(
	request: IMissionControlCredentialSealingRequest,
	sodium: typeof import('libsodium-wrappers').default,
	createHpkeCipherSuite: () => Promise<ICredentialCipherSuite>,
): Promise<string> {
	if (!request.token || request.token.length > 32 * 1024 || request.resource.length > 8192
		|| (request.key.algorithm !== 'x25519-sealedbox' && request.key.algorithm !== 'hpke-x25519-hkdf-sha256-aes256gcm')
		|| (request.key.use !== 'auth-token' && request.key.use !== 'mcp-auth-token')
		|| (request.challenge !== undefined && !/^[0-9a-f]{32}$/.test(request.challenge))) {
		throw new Error('Invalid Mission Control credential sealing request');
	}
	new URL(request.resource);
	if (!/^[A-Za-z0-9+/]{43}=$/.test(request.key.public_key)) {
		throw new Error('Invalid Mission Control recipient key');
	}
	const publicKey = Uint8Array.from(decodeBase64(request.key.public_key).buffer);
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', publicKey));
	const keyId = encodeBase64(VSBuffer.wrap(digest.subarray(0, 8)), false, true);
	if (publicKey.length !== 32 || encodeBase64(VSBuffer.wrap(publicKey)) !== request.key.public_key || keyId !== request.key.key_id) {
		throw new Error('Invalid Mission Control recipient key');
	}
	const plaintext = sodium.from_string(JSON.stringify({
		cty: 'text', value: request.token,
		ctx: {
			purpose: request.key.use, resource: request.resource,
			...(request.challenge ? {
				connection: {
					challenge: request.challenge,
					nonce: encodeHex(VSBuffer.wrap(crypto.getRandomValues(new Uint8Array(16)))),
					issuedAt: Math.floor(Date.now() / 1000),
				},
			} : {}),
		},
	}));
	try {
		let ciphertext: Uint8Array;
		if (request.key.algorithm === 'hpke-x25519-hkdf-sha256-aes256gcm') {
			const hpke = await createHpkeCipherSuite();
			const recipientPublicKey = await crypto.subtle.importKey('raw', publicKey, 'X25519', true, []);
			const sender = await hpke.createSenderContext({ recipientPublicKey });
			ciphertext = VSBuffer.concat([VSBuffer.wrap(new Uint8Array(sender.enc)), VSBuffer.wrap(new Uint8Array(await sender.seal(plaintext)))]).buffer;
		} else {
			ciphertext = sodium.crypto_box_seal(plaintext, publicKey);
		}
		return `copilot-sealed.v1.${keyId}.${encodeBase64(VSBuffer.wrap(ciphertext), false, true)}`;
	} finally {
		sodium.memzero(plaintext);
	}
}
