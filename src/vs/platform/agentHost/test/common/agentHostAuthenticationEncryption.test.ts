/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readAgentHostAuthenticationEncryption } from '../../common/meta/agentHostAuthenticationEncryption.js';

suite('Agent host authentication encryption metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const challenge = '0123456789abcdef0123456789abcdef';
	const sodiumKey = { keyId: 'sodium-key', publicKey: 'sodium-public-key', use: 'auth-token', algorithm: 'x25519-sealedbox' };
	const hpkeKey = { keyId: 'hpke-key', publicKey: 'hpke-public-key', use: 'auth-token', algorithm: 'hpke-x25519-hkdf-sha256-aes256gcm' };
	const initialized = { _meta: { 'copilot.encryptionRequired': ['auth-token', 'mcp-auth-token'], 'copilot.authChallenge': { challenge, required: true } } };

	test('keeps hosts without encryption metadata interoperable', () => {
		assert.strictEqual(readAgentHostAuthenticationEncryption(undefined, undefined, 'auth-token'), undefined);
	});

	test('prefers HPKE, binds the current challenge, and ignores unrecognized keys', () => {
		const root = { _meta: { 'copilot.encryptionKeys': [null, {}, { ...sodiumKey, algorithm: 'future' }, sodiumKey, hpkeKey] } };
		assert.deepStrictEqual(readAgentHostAuthenticationEncryption(root, initialized, 'auth-token'), {
			key: { key_id: hpkeKey.keyId, public_key: hpkeKey.publicKey, use: 'auth-token', algorithm: hpkeKey.algorithm },
			challenge,
		});
	});

	test('supports sealed boxes without requiring the optional challenge extension', () => {
		assert.deepStrictEqual(readAgentHostAuthenticationEncryption({ _meta: { 'copilot.encryptionKeys': [sodiumKey] } }, undefined, 'auth-token'), {
			key: { key_id: sodiumKey.keyId, public_key: sodiumKey.publicKey, use: 'auth-token', algorithm: sodiumKey.algorithm },
			challenge: undefined,
		});
	});

	test('does not substitute an identity key for an MCP recipient', () => {
		assert.throws(() => readAgentHostAuthenticationEncryption({ _meta: { 'copilot.encryptionKeys': [hpkeKey] } }, initialized, 'mcp-auth-token'), /no supported mcp-auth-token/);
	});

	for (const keys of [undefined, null, [], [{}], [{ ...hpkeKey, publicKey: 1 }], [{ ...hpkeKey, algorithm: 'future' }]]) {
		test(`fails closed when required keys are missing or unsupported: ${JSON.stringify(keys)}`, () => {
			assert.throws(() => readAgentHostAuthenticationEncryption({ _meta: { 'copilot.encryptionKeys': keys } }, initialized, 'auth-token'), /requires authentication encryption/);
		});
	}

	for (const required of [null, true, 'auth-token', [1]]) {
		test(`rejects malformed encryption requirements: ${JSON.stringify(required)}`, () => {
			assert.throws(() => readAgentHostAuthenticationEncryption(undefined, { _meta: { 'copilot.encryptionRequired': required } }, 'auth-token'), /invalid authentication encryption requirements/);
		});
	}

	for (const binding of [null, {}, { required: true }, { challenge: 'invalid' }, { challenge, required: 'true' }]) {
		test(`rejects malformed connection challenges: ${JSON.stringify(binding)}`, () => {
			assert.throws(() => readAgentHostAuthenticationEncryption(
				{ _meta: { 'copilot.encryptionKeys': [hpkeKey] } },
				{ _meta: { 'copilot.authChallenge': binding } },
				'auth-token',
			), /invalid authentication connection challenge/);
		});
	}
});
