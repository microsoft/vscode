/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CipherSuite } from '@hpke/core';
import { decodeBase64, encodeBase64, encodeHex, VSBuffer } from '../../../base/common/buffer.js';
import type { IMissionControlCredentialSealingRequest } from './agentService.js';

/** The same crypto libraries, loaded through Node or a browser bundle. */
export interface IMissionControlCredentialSealingCrypto {
	readonly sodium: typeof import('libsodium-wrappers').default;
	readonly hpke: typeof import('@hpke/core');
}

export function createMissionControlHpkeCipherSuite(hpke: IMissionControlCredentialSealingCrypto['hpke']): CipherSuite {
	return new hpke.CipherSuite({
		kem: new hpke.DhkemX25519HkdfSha256(),
		kdf: new hpke.HkdfSha256(),
		aead: new hpke.Aes256Gcm(),
	});
}

/** The caller must authenticate the recipient key before passing it to this stateless sealer. */
export async function sealMissionControlCredential(
	request: IMissionControlCredentialSealingRequest,
	loadCrypto: () => Promise<IMissionControlCredentialSealingCrypto>,
): Promise<string> {
	if (!request.token || request.token.length > 32 * 1024 || request.resource.length > 8192
		|| (request.key.algorithm !== 'x25519-sealedbox' && request.key.algorithm !== 'hpke-x25519-hkdf-sha256-aes256gcm')
		|| (request.key.use !== 'auth-token' && request.key.use !== 'mcp-auth-token')
		|| (request.challenge !== undefined && !/^[0-9a-f]{32}$/.test(request.challenge))) {
		throw new Error('Invalid Mission Control credential sealing request');
	}
	new URL(request.resource);
	let publicKey: VSBuffer;
	try {
		publicKey = decodeBase64(request.key.public_key);
	} catch {
		throw new Error('Invalid Mission Control recipient key');
	}
	if (publicKey.byteLength !== 32 || encodeBase64(publicKey) !== request.key.public_key) {
		throw new Error('Invalid Mission Control recipient key');
	}
	const digest = await globalThis.crypto.subtle.digest('SHA-256', Uint8Array.from(publicKey.buffer));
	const keyId = encodeBase64(VSBuffer.wrap(new Uint8Array(digest)).slice(0, 8), false, true);
	if (keyId !== request.key.key_id) {
		throw new Error('Invalid Mission Control recipient key');
	}
	const { sodium, hpke } = await loadCrypto();
	await sodium.ready;
	const plaintext = sodium.from_string(JSON.stringify({
		cty: 'text', value: request.token,
		ctx: {
			purpose: request.key.use, resource: request.resource,
			...(request.challenge ? {
				connection: {
					challenge: request.challenge,
					nonce: encodeHex(VSBuffer.wrap(globalThis.crypto.getRandomValues(new Uint8Array(16)))),
					issuedAt: Math.floor(Date.now() / 1000),
				},
			} : {}),
		},
	}));
	try {
		let ciphertext: Uint8Array;
		if (request.key.algorithm === 'hpke-x25519-hkdf-sha256-aes256gcm') {
			const suite = createMissionControlHpkeCipherSuite(hpke);
			const recipientPublicKey = await globalThis.crypto.subtle.importKey('raw', Uint8Array.from(publicKey.buffer), 'X25519', true, []);
			const sender = await suite.createSenderContext({ recipientPublicKey });
			ciphertext = VSBuffer.concat([
				VSBuffer.wrap(new Uint8Array(sender.enc)),
				VSBuffer.wrap(new Uint8Array(await sender.seal(plaintext))),
			]).buffer;
		} else {
			ciphertext = sodium.crypto_box_seal(plaintext, publicKey.buffer);
		}
		return `copilot-sealed.v1.${keyId}.${encodeBase64(VSBuffer.wrap(ciphertext), false, true)}`;
	} finally {
		sodium.memzero(plaintext);
	}
}
