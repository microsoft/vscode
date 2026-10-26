/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { decodeBase64 } from '../../../../base/common/buffer.js';
import { FileAccess } from '../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { sealAgentHostCredential } from '../../browser/agentHostCredentialSealing.js';

suite('Agent host browser credential sealing', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const resource = 'https://api.example.test';
	const publicKey = 'pOCSkrZRwni5dyxWn1+puxPZBrRqtoyd+dwrRAn4ogk=';
	const keyId = 'GpLyOFLckI0';
	const privateKey = new Uint8Array(32).fill(1);
	const challenge = '0123456789abcdef0123456789abcdef';
	type CryptoModule = Pick<typeof import('@hpke/core'), 'CipherSuite' | 'DhkemX25519HkdfSha256' | 'HkdfSha256' | 'Aes256Gcm'> & { sodium: typeof import('libsodium-wrappers').default };

	for (const algorithm of ['x25519-sealedbox', 'hpke-x25519-hkdf-sha256-aes256gcm']) {
		test(`encrypts and binds credentials without an ambient agent connection: ${algorithm}`, async () => {
			const url = FileAccess.asBrowserUri('vs/platform/agentHost/browser/agentHostCryptoModule.js').toString(true);
			const implementation = await import(/* webpackIgnore: true */ /* @vite-ignore */ `${url}`) as CryptoModule;
			const startedAt = Math.floor(Date.now() / 1000);
			const token = await sealAgentHostCredential({
				token: 'browser-only-credential', resource, challenge,
				key: { key_id: keyId, public_key: publicKey, algorithm, use: 'auth-token' },
			});
			const ciphertext = Uint8Array.from(decodeBase64(token.split('.')[3]).buffer);
			let plaintext: Uint8Array;
			if (algorithm === 'x25519-sealedbox') {
				plaintext = implementation.sodium.crypto_box_seal_open(ciphertext, decodeBase64(publicKey).buffer, privateKey);
			} else {
				const hpke = new implementation.CipherSuite({
					kem: new implementation.DhkemX25519HkdfSha256(),
					kdf: new implementation.HkdfSha256(),
					aead: new implementation.Aes256Gcm(),
				});
				const encodedKey = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e, 0x04, 0x22, 0x04, 0x20, ...privateKey]);
				const recipientKey = await crypto.subtle.importKey('pkcs8', encodedKey, 'X25519', false, ['deriveBits']);
				const recipient = await hpke.createRecipientContext({ recipientKey, enc: ciphertext.subarray(0, 32) });
				plaintext = new Uint8Array(await recipient.open(ciphertext.subarray(32)));
			}
			const payload = JSON.parse(new TextDecoder().decode(plaintext)) as {
				cty: string; value: string; ctx: { purpose: string; resource: string; connection: { challenge: string; nonce: string; issuedAt: number } };
			};
			assert.deepStrictEqual({
				envelope: token.split('.').slice(0, 3),
				value: payload.value, cty: payload.cty, purpose: payload.ctx.purpose, resource: payload.ctx.resource,
				challenge: payload.ctx.connection.challenge,
				validNonce: /^[0-9a-f]{32}$/.test(payload.ctx.connection.nonce),
				validTime: payload.ctx.connection.issuedAt >= startedAt && payload.ctx.connection.issuedAt <= Math.floor(Date.now() / 1000),
			}, {
				envelope: ['copilot-sealed', 'v1', keyId],
				value: 'browser-only-credential', cty: 'text', purpose: 'auth-token', resource,
				challenge, validNonce: true, validTime: true,
			});
		});
	}
});
