/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { restore, stub } from 'sinon';
import { decodeBase64 } from '../../../../base/common/buffer.js';
import { FileAccess } from '../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { sealMissionControlCredential } from '../../browser/missionControlCredentialSealing.js';
import { IMissionControlCredentialSealingRequest } from '../../common/agentService.js';
import { IMissionControlCredentialSealingCrypto, sealMissionControlCredential as sealCredential } from '../../common/missionControlCredentialSealing.js';

interface ISealedCredential {
	readonly cty: string;
	readonly value: string;
	readonly ctx: {
		readonly purpose: string;
		readonly resource: string;
		readonly connection?: { readonly challenge: string; readonly nonce: string; readonly issuedAt: number };
	};
}

suite('Mission Control browser credential sealing', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	let libraries: IMissionControlCredentialSealingCrypto;
	const resource = 'https://mcp.example.test/resource';
	const challenge = '0123456789abcdef0123456789abcdef';
	const algorithms = ['x25519-sealedbox', 'hpke-x25519-hkdf-sha256-aes256gcm'] as const;

	suiteSetup(async () => {
		const url = FileAccess.asBrowserUri('vs/platform/agentHost/browser/missionControlCryptoModule.js').toString(true);
		libraries = await import(/* webpackIgnore: true */ /* @vite-ignore */ `${url}`);
		await libraries.sodium.ready;
	});
	teardown(() => restore());

	async function createRecipient(algorithm: string, use: 'auth-token' | 'mcp-auth-token' = 'auth-token') {
		const keyPair = libraries.sodium.crypto_box_keypair();
		const fingerprint = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', Uint8Array.from(keyPair.publicKey)));
		const key: IMissionControlCredentialSealingRequest['key'] = {
			key_id: libraries.sodium.to_base64(fingerprint.subarray(0, 8), libraries.sodium.base64_variants.URLSAFE_NO_PADDING),
			public_key: libraries.sodium.to_base64(keyPair.publicKey, libraries.sodium.base64_variants.ORIGINAL),
			algorithm, use,
		};
		return { key, keyPair };
	}

	async function open(envelope: string, recipient: Awaited<ReturnType<typeof createRecipient>>): Promise<ISealedCredential> {
		const ciphertext = decodeBase64(envelope.split('.')[3]).buffer;
		let plaintext: Uint8Array;
		if (recipient.key.algorithm === 'x25519-sealedbox') {
			plaintext = libraries.sodium.crypto_box_seal_open(ciphertext, recipient.keyPair.publicKey, recipient.keyPair.privateKey);
		} else {
			const { hpke } = libraries;
			const suite = new hpke.CipherSuite({ kem: new hpke.DhkemX25519HkdfSha256(), kdf: new hpke.HkdfSha256(), aead: new hpke.Aes256Gcm() });
			const privateKey = await suite.kem.deserializePrivateKey(recipient.keyPair.privateKey);
			const publicKey = await suite.kem.deserializePublicKey(recipient.keyPair.publicKey);
			const context = await suite.createRecipientContext({
				recipientKey: { privateKey, publicKey },
				enc: ciphertext.subarray(0, 32),
			});
			plaintext = new Uint8Array(await context.open(ciphertext.subarray(32)));
		}
		try {
			return JSON.parse(libraries.sodium.to_string(plaintext));
		} finally {
			libraries.sodium.memzero(plaintext);
		}
	}

	for (const algorithm of algorithms) {
		for (const use of ['auth-token', 'mcp-auth-token'] as const) {
			test(`${algorithm} seals a fresh connection-bound ${use} credential`, async () => {
				const recipient = await createRecipient(algorithm, use);
				const requestedAt = Math.floor(Date.now() / 1000);
				const request = { token: 'test-identity-\u00e9', resource, key: recipient.key, challenge };
				const [first, second] = await Promise.all([sealMissionControlCredential(request), sealMissionControlCredential(request)]);
				const [opened, other] = await Promise.all([open(first, recipient), open(second, recipient)]);
				assert.deepStrictEqual({
					prefix: first.startsWith(`copilot-sealed.v1.${recipient.key.key_id}.`),
					base64url: /^[A-Za-z0-9_-]+$/.test(first.split('.')[3]),
					distinctEnvelopes: first !== second,
					contentType: opened.cty, value: opened.value,
					purpose: opened.ctx.purpose, resource: opened.ctx.resource,
					challenge: opened.ctx.connection?.challenge,
					freshNonce: /^[0-9a-f]{32}$/.test(opened.ctx.connection?.nonce ?? '') && opened.ctx.connection?.nonce !== other.ctx.connection?.nonce,
					currentIssueTime: opened.ctx.connection !== undefined && opened.ctx.connection.issuedAt >= requestedAt && opened.ctx.connection.issuedAt <= Math.floor(Date.now() / 1000),
				}, {
					prefix: true, base64url: true, distinctEnvelopes: true,
					contentType: 'text', value: request.token, purpose: use, resource, challenge, freshNonce: true, currentIssueTime: true,
				});
			});
		}

		test(`${algorithm} preserves an explicitly unbound request`, async () => {
			const recipient = await createRecipient(algorithm);
			const envelope = await sealMissionControlCredential({ token: 'test-token', resource, key: recipient.key });
			assert.deepStrictEqual(await open(envelope, recipient), {
				cty: 'text', value: 'test-token', ctx: { purpose: 'auth-token', resource },
			});
		});

		test(`${algorithm} cannot be decrypted with a different private key`, async () => {
			const recipient = await createRecipient(algorithm);
			const envelope = await sealMissionControlCredential({ token: 'test-token', resource, key: recipient.key, challenge });
			await assert.rejects(open(envelope, await createRecipient(algorithm)));
		});
	}

	for (const [name, change] of [
		['empty token', (request: IMissionControlCredentialSealingRequest) => ({ ...request, token: '' })],
		['oversized token', (request: IMissionControlCredentialSealingRequest) => ({ ...request, token: 'x'.repeat(32 * 1024 + 1) })],
		['oversized resource', (request: IMissionControlCredentialSealingRequest) => ({ ...request, resource: 'https://example.test/'.padEnd(8193, 'x') })],
		['invalid resource', (request: IMissionControlCredentialSealingRequest) => ({ ...request, resource: 'not a URL' })],
		['unsupported algorithm', (request: IMissionControlCredentialSealingRequest) => ({ ...request, key: { ...request.key, algorithm: 'unsupported' } })],
		['mismatched key id', (request: IMissionControlCredentialSealingRequest) => ({ ...request, key: { ...request.key, key_id: 'mismatched' } })],
		['short public key', (request: IMissionControlCredentialSealingRequest) => ({ ...request, key: { ...request.key, public_key: 'AA==' } })],
		['noncanonical public key', (request: IMissionControlCredentialSealingRequest) => ({ ...request, key: { ...request.key, public_key: request.key.public_key.replace(/=$/, '') } })],
		['malformed public key', (request: IMissionControlCredentialSealingRequest) => ({ ...request, key: { ...request.key, public_key: '*' } })],
		['empty challenge', (request: IMissionControlCredentialSealingRequest) => ({ ...request, challenge: '' })],
		['short challenge', (request: IMissionControlCredentialSealingRequest) => ({ ...request, challenge: 'a'.repeat(31) })],
		['invalid challenge', (request: IMissionControlCredentialSealingRequest) => ({ ...request, challenge: 'g'.repeat(32) })],
	] as const) {
		test(`rejects ${name} before loading crypto libraries`, async () => {
			const recipient = await createRecipient('x25519-sealedbox');
			let loads = 0;
			await assert.rejects(sealCredential(change({ token: 'test-token', resource, key: recipient.key, challenge }), async () => {
				loads++;
				return libraries;
			}));
			assert.strictEqual(loads, 0);
		});
	}

	test('accepts the existing token and resource length limits', async () => {
		const recipient = await createRecipient('x25519-sealedbox');
		const token = 'x'.repeat(32 * 1024);
		const target = 'https://example.test/'.padEnd(8192, 'x');
		const envelope = await sealMissionControlCredential({ token, resource: target, key: recipient.key });
		const opened = await open(envelope, recipient);
		assert.deepStrictEqual({ token: opened.value, resource: opened.ctx.resource }, { token, resource: target });
	});

	for (const fail of [false, true]) {
		test(`scrubs plaintext after ${fail ? 'failed' : 'successful'} encryption`, async () => {
			const recipient = await createRecipient('x25519-sealedbox');
			const implementation = { ...libraries, sodium: { ...libraries.sodium } };
			let plaintext: Uint8Array | undefined;
			const sealer: { crypto_box_seal(message: Uint8Array, publicKey: Uint8Array): Uint8Array } = implementation.sodium;
			stub(sealer, 'crypto_box_seal').callsFake((message, publicKey) => {
				plaintext = message;
				if (fail) {
					throw new Error('Encryption failed');
				}
				return libraries.sodium.crypto_box_seal(message, publicKey);
			});
			const pending = sealCredential({ token: 'test-token', resource, key: recipient.key }, async () => implementation);
			if (fail) {
				await assert.rejects(pending, /Encryption failed/);
			} else {
				await pending;
			}
			assert.deepStrictEqual({ captured: plaintext !== undefined, cleared: plaintext?.every(byte => byte === 0) }, { captured: true, cleared: true });
		});
	}

	test('propagates dependency loading failure without returning plaintext', async () => {
		const recipient = await createRecipient('x25519-sealedbox');
		await assert.rejects(sealCredential({ token: 'test-token', resource, key: recipient.key }, async () => {
			throw new Error('Crypto libraries unavailable');
		}), /Crypto libraries unavailable/);
	});
});
