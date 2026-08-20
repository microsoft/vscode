/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from 'crypto';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	cookieEncryptionVersion,
	isAppBoundEncryptedCookie,
	hasHmacPrefix,
	stripHmac,
	decryptCookieValue
} from '../../electron-main/browserCookieImportDecrypt.js';
import type { BrowserCookieImportEncryptionKeyResult } from '../../electron-main/browserCookieImportKeys.js';

/**
 * Synthetic fixtures — never real user cookies. The AES-128-CBC key is
 * derived exactly like Chromium does (PBKDF2 with 'saltysalt', 1003 iters)
 * so the round-trip proves the module decrypts real Chromium-shaped data.
 */
const AES_CBC_IV = Buffer.alloc(16, ' ');
const PBKDF2_SALT = 'saltysalt';
const PBKDF2_ITERATIONS = 1003;
const PBKDF2_KEY_LENGTH = 16;

function deriveCbcKey(password: string): Buffer {
	return pbkdf2Sync(password, PBKDF2_SALT, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, 'sha1');
}

/** Encrypts plaintext the way Chromium does: v10 prefix + AES-128-CBC. */
function encryptV10(plaintext: Buffer, key: Buffer): Buffer {
	const cipher = createCipheriv('aes-128-cbc', key, AES_CBC_IV);
	return Buffer.concat([Buffer.from('v10'), cipher.update(plaintext), cipher.final()]);
}

/** Encrypts plaintext the way Chromium 127+ does: v10 prefix + HMAC + AES-128-CBC. */
function encryptV10WithHmac(plaintext: Buffer, key: Buffer): Buffer {
	const hmac = createHash('sha256').update(plaintext).digest();
	return encryptV10(Buffer.concat([hmac, plaintext]), key);
}

/** Encrypts plaintext the way Windows Chromium does: v20-style GCM payload. */
function encryptGcm(plaintext: Buffer, key: Buffer): Buffer {
	const nonce = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, nonce);
	const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([Buffer.from('v10'), nonce, ciphertext, tag]);
}

suite('BrowserCookieImportDecrypt', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	// ---------------------------------------------------------------------------
	// cookieEncryptionVersion
	// ---------------------------------------------------------------------------

	suite('cookieEncryptionVersion', () => {
		test('reads version prefixes', () => {
			assert.deepStrictEqual({
				v10: cookieEncryptionVersion(Buffer.from('v10abc')),
				v11: cookieEncryptionVersion(Buffer.from('v11abc')),
				v20: cookieEncryptionVersion(Buffer.from('v20abc')),
				tooShort: cookieEncryptionVersion(Buffer.from('v1')),
				notVersion: cookieEncryptionVersion(Buffer.from('xyzabc')),
				empty: cookieEncryptionVersion(Buffer.alloc(0)),
			}, {
				v10: 'v10',
				v11: 'v11',
				v20: 'v20',
				tooShort: null,
				notVersion: null,
				empty: null,
			});
		});
	});

	// ---------------------------------------------------------------------------
	// isAppBoundEncryptedCookie
	// ---------------------------------------------------------------------------

	suite('isAppBoundEncryptedCookie', () => {
		test('detects v20 app-bound encryption', () => {
			assert.deepStrictEqual({
				v20: isAppBoundEncryptedCookie(Buffer.from('v20abc')),
				v10: isAppBoundEncryptedCookie(Buffer.from('v10abc')),
				noPrefix: isAppBoundEncryptedCookie(Buffer.from('abc')),
			}, {
				v20: true,
				v10: false,
				noPrefix: false,
			});
		});
	});

	// ---------------------------------------------------------------------------
	// hasHmacPrefix / stripHmac
	// ---------------------------------------------------------------------------

	suite('hasHmacPrefix / stripHmac', () => {
		test('detects HMAC prefix statistically', () => {
			// A real SHA-256 digest has ~half non-printable bytes.
			const hmac = createHash('sha256').update('cookie-value').digest();
			const withHmac = Buffer.concat([hmac, Buffer.from('plaintext')]);
			const printable = Buffer.from('this is a printable cookie value');

			assert.deepStrictEqual({
				withHmac: hasHmacPrefix(withHmac),
				printable: hasHmacPrefix(printable),
				shortBuffer: hasHmacPrefix(Buffer.from('short')),
			}, {
				withHmac: true,
				printable: false,
				shortBuffer: false,
			});
		});

		test('strips HMAC prefix when present, leaves plaintext alone', () => {
			const hmac = createHash('sha256').update('cookie-value').digest();
			const withHmac = Buffer.concat([hmac, Buffer.from('plaintext')]);
			const printable = Buffer.from('printable');

			assert.deepStrictEqual({
				stripped: stripHmac(withHmac).toString('utf8'),
				untouched: stripHmac(printable).toString('utf8'),
			}, {
				stripped: 'plaintext',
				untouched: 'printable',
			});
		});
	});

	// ---------------------------------------------------------------------------
	// decryptCookieValue — plaintext paths
	// ---------------------------------------------------------------------------

	suite('decryptCookieValue plaintext paths', () => {
		test('returns plain value when no encrypted buffer', () => {
			const outcome = decryptCookieValue(null, Buffer.from('plain-value'), null, false);
			assert.deepStrictEqual({ status: outcome.status, value: outcome.status === 'ok' ? outcome.value.toString('latin1') : null }, {
				status: 'ok',
				value: 'plain-value',
			});
		});

		test('returns empty when both buffers are missing', () => {
			const outcome = decryptCookieValue(null, null, null, false);
			assert.strictEqual(outcome.status, 'empty');
		});

		test('prefers encrypted buffer over plaintext echo', () => {
			// Both populated — encrypted wins (plaintext is a stale echo).
			const key = deriveCbcKey('test-password');
			const encrypted = encryptV10(Buffer.from('real-value'), key);
			const outcome = decryptCookieValue(encrypted, Buffer.from('stale-echo'), { mode: 'aes-128-cbc', keysByVersion: { v10: key } }, false);
			assert.deepStrictEqual({ status: outcome.status, value: outcome.status === 'ok' ? outcome.value.toString('latin1') : null }, {
				status: 'ok',
				value: 'real-value',
			});
		});
	});

	// ---------------------------------------------------------------------------
	// decryptCookieValue — encrypted paths
	// ---------------------------------------------------------------------------

	suite('decryptCookieValue encrypted paths', () => {
		test('round-trips v10 AES-128-CBC (macOS/Linux)', () => {
			const key = deriveCbcKey('test-password');
			const encrypted = encryptV10(Buffer.from('session-token-123'), key);
			const outcome = decryptCookieValue(encrypted, null, { mode: 'aes-128-cbc', keysByVersion: { v10: key } }, false);
			assert.deepStrictEqual({ status: outcome.status, value: outcome.status === 'ok' ? outcome.value.toString('latin1') : null }, {
				status: 'ok',
				value: 'session-token-123',
			});
		});

		test('round-trips v10 with HMAC prefix (Chromium 127+)', () => {
			const key = deriveCbcKey('test-password');
			const encrypted = encryptV10WithHmac(Buffer.from('hmac-protected-value'), key);
			const outcome = decryptCookieValue(encrypted, null, { mode: 'aes-128-cbc', keysByVersion: { v10: key } }, false);
			assert.deepStrictEqual({ status: outcome.status, value: outcome.status === 'ok' ? outcome.value.toString('latin1') : null }, {
				status: 'ok',
				value: 'hmac-protected-value',
			});
		});

		test('round-trips AES-256-GCM (Windows)', () => {
			const key = randomBytes(32);
			const encrypted = encryptGcm(Buffer.from('windows-token'), key);
			const outcome = decryptCookieValue(encrypted, null, { mode: 'aes-256-gcm', key }, false);
			assert.deepStrictEqual({ status: outcome.status, value: outcome.status === 'ok' ? outcome.value.toString('latin1') : null }, {
				status: 'ok',
				value: 'windows-token',
			});
		});

		test('v11 with keyring unavailable is attributed correctly', () => {
			const key = deriveCbcKey('test-password');
			const encrypted = encryptV10(Buffer.from('v11-value'), key);
			// Rewrite prefix to v11 to simulate a Linux v11 cookie.
			encrypted[0] = 0x76; // 'v'
			encrypted[1] = 0x31; // '1'
			encrypted[2] = 0x31; // '1'
			const outcome = decryptCookieValue(encrypted, null, { mode: 'aes-128-cbc', keysByVersion: { v10: key } }, true);
			assert.strictEqual(outcome.status, 'keyring-unavailable');
		});

		test('v20 app-bound cookies are never decrypted', () => {
			const outcome = decryptCookieValue(Buffer.from('v20some-app-bound-data'), null, null, false);
			assert.strictEqual(outcome.status, 'app-bound');
		});

		test('unknown version prefix is reported', () => {
			const outcome = decryptCookieValue(Buffer.from('v99garbage'), null, null, false);
			assert.deepStrictEqual({ status: outcome.status, prefix: outcome.status === 'unknown-version' ? outcome.prefix : null }, {
				status: 'unknown-version',
				prefix: 'v99',
			});
		});

		test('no key result yields no-key', () => {
			const encrypted = encryptV10(Buffer.from('value'), deriveCbcKey('test-password'));
			const outcome = decryptCookieValue(encrypted, null, null, false);
			assert.strictEqual(outcome.status, 'no-key');
		});

		test('wrong key yields decrypt-error', () => {
			const encrypted = encryptV10(Buffer.from('value'), deriveCbcKey('correct-password'));
			const wrongKey = deriveCbcKey('wrong-password');
			const outcome = decryptCookieValue(encrypted, null, { mode: 'aes-128-cbc', keysByVersion: { v10: wrongKey } }, false);
			assert.strictEqual(outcome.status, 'decrypt-error');
		});

		test('v11 cookie with v10-only key yields decrypt-error', () => {
			const key = deriveCbcKey('test-password');
			const encrypted = encryptV10(Buffer.from('v11-value'), key);
			encrypted[0] = 0x76;
			encrypted[1] = 0x31;
			encrypted[2] = 0x31;
			const outcome = decryptCookieValue(encrypted, null, { mode: 'aes-128-cbc', keysByVersion: { v10: key } }, false);
			assert.strictEqual(outcome.status, 'decrypt-error');
		});

		test('empty ciphertext yields empty', () => {
			const outcome = decryptCookieValue(Buffer.from('v10'), null, { mode: 'aes-128-cbc', keysByVersion: { v10: deriveCbcKey('x') } }, false);
			assert.strictEqual(outcome.status, 'empty');
		});
	});
});
