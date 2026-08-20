/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecipheriv } from 'crypto';
import type { BrowserCookieImportEncryptionKeyResult } from './browserCookieImportKeys.js';

/**
 * Chromium cookie value encryption metadata and decryption.
 *
 * Every encrypted cookie value starts with a 3-byte ASCII version prefix:
 *   - `v10` / `v11` → AES-128-CBC (macOS/Linux), single key per version
 *   - `v20`        → app-bound encryption (Chrome 140+ Windows), not decryptable
 *
 * Chromium 127+ prepends a 32-byte HMAC to the plaintext before encrypting,
 * so every successful decrypt must strip it before the value is usable.
 *
 * This module is pure — no I/O, no logging, no side effects. Attribution of
 * failure (app-bound vs keyring vs generic corruption) happens in the caller
 * that has the key result in hand.
 */

/**
 * Fixed IV for AES-128-CBC across every Chromium fork — 16 spaces. Matches
 * Chrome's `kEncryptionIV` constant; changing it breaks every decrypt.
 */
const AES_CBC_IV = Buffer.alloc(16, ' ');

/**
 * Length of the HMAC prefix Chromium 127+ prepends to the plaintext before
 * encrypting. ~half the bytes are non-printable, so detection is statistical.
 */
const CHROMIUM_HMAC_PREFIX_LEN = 32;

/**
 * Minimum number of non-printable bytes in the first 32 that flags the
 * presence of an HMAC prefix. Tuned to avoid false positives on short
 * printable plaintext while still catching the real prefix whose first
 * bytes are a SHA-256 digest.
 */
const HMAC_NON_PRINTABLE_THRESHOLD = 8;

/**
 * Classification of a decrypt attempt. The caller records the cause for
 * failure attribution (`appBoundFailed`, `keyringUnavailableFailed`, or
 * generic `decryptFailed`) in the import summary.
 */
export type CookieDecryptOutcome =
	| { readonly status: 'ok'; readonly value: Buffer }
	| { readonly status: 'empty' }
	| { readonly status: 'no-key' }
	| { readonly status: 'app-bound' }
	| { readonly status: 'keyring-unavailable' }
	| { readonly status: 'unknown-version'; readonly prefix: string }
	| { readonly status: 'decrypt-error' };

/**
 * Reads the 3-byte version prefix. Returns `null` when the buffer is too
 * short or the prefix doesn't match `v\d\d`.
 */
export function cookieEncryptionVersion(encryptedBuffer: Buffer): string | null {
	if (encryptedBuffer.length < 3) {
		return null;
	}
	const version = encryptedBuffer.subarray(0, 3).toString('utf-8');
	return /^v\d\d$/.test(version) ? version : null;
}

/**
 * True when the buffer carries Chrome 140+ app-bound encryption — only the
 * writing browser can unwrap it. Detection is a prefix check; decryption is
 * not attempted.
 */
export function isAppBoundEncryptedCookie(encryptedBuffer: Buffer): boolean {
	return cookieEncryptionVersion(encryptedBuffer) === 'v20';
}

/**
 * True when the decrypted value carries the Chromium 127+ HMAC prefix.
 *
 * The detection is statistical: a SHA-256 digest has ~half non-printable
 * bytes, so >=8 non-printable bytes in the first 32 flags the prefix. A
 * pure-printable plaintext never reaches the threshold.
 */
export function hasHmacPrefix(buf: Buffer): boolean {
	if (buf.length <= CHROMIUM_HMAC_PREFIX_LEN) {
		return false;
	}
	let nonPrintable = 0;
	for (let i = 0; i < CHROMIUM_HMAC_PREFIX_LEN; i++) {
		if (buf[i] < 0x20 || buf[i] > 0x7e) {
			nonPrintable++;
		}
	}
	return nonPrintable >= HMAC_NON_PRINTABLE_THRESHOLD;
}

/**
 * Strips the HMAC prefix when present; returns the buffer unchanged otherwise.
 */
export function stripHmac(buf: Buffer): Buffer {
	return hasHmacPrefix(buf) ? buf.subarray(CHROMIUM_HMAC_PREFIX_LEN) : buf;
}

/**
 * Decrypt one encrypted cookie value. The `encryptedBuffer` is the raw BLOB
 * column from the source SQLite DB (or the decoded bytes from a JSON export).
 *
 * Plain-text cookies (no version prefix) are returned via the `plain` branch
 * so the caller can still build a validated cookie row for them.
 */
export function decryptCookieValue(
	encryptedBuffer: Buffer | null,
	plainBuffer: Buffer | string | null,
	keyResult: BrowserCookieImportEncryptionKeyResult | null,
	keyringUnavailable: boolean
): CookieDecryptOutcome {
	// Chromium writes the plaintext to the `value` column when the cookie was
	// set without encryption (rare in packaged builds, but Firefox and JSON
	// imports both hit this path). Prefer the encrypted column when both are
	// populated — the plaintext column is then a stale echo.
	if (!encryptedBuffer || encryptedBuffer.length === 0) {
		if (plainBuffer === null || plainBuffer === undefined) {
			return { status: 'empty' };
		}
		if (typeof plainBuffer === 'string') {
			return { status: 'ok', value: Buffer.from(plainBuffer, 'latin1') };
		}
		return { status: 'ok', value: Buffer.from(plainBuffer) };
	}

	const version = cookieEncryptionVersion(encryptedBuffer);
	if (!version) {
		return { status: 'unknown-version', prefix: encryptedBuffer.subarray(0, 3).toString('utf-8') };
	}

	// Only v10, v11, and v20 are recognized Chromium cookie encryption
	// versions. Any other syntactically valid prefix (e.g. v99) is treated
	// as unknown-version so callers can attribute the failure correctly.
	const SUPPORTED_VERSIONS = new Set(['v10', 'v11', 'v20']);
	if (!SUPPORTED_VERSIONS.has(version)) {
		return { status: 'unknown-version', prefix: version };
	}

	if (version === 'v20') {
		return { status: 'app-bound' };
	}

	if (keyringUnavailable && version === 'v11') {
		return { status: 'keyring-unavailable' };
	}

	if (!keyResult) {
		return { status: 'no-key' };
	}

	const ciphertext = encryptedBuffer.subarray(3);
	if (ciphertext.length === 0) {
		return { status: 'empty' };
	}

	try {
		const decrypted = keyResult.mode === 'aes-256-gcm'
			? decryptAes256Gcm(ciphertext, keyResult.key)
			: decryptAes128Cbc(ciphertext, keyResult.keysByVersion[version as 'v10' | 'v11']);
		if (!decrypted) {
			return { status: 'decrypt-error' };
		}
		return { status: 'ok', value: stripHmac(decrypted) };
	} catch {
		return { status: 'decrypt-error' };
	}
}

/**
 * AES-128-CBC decrypt for macOS/Linux. Returns `null` when the version's key
 * is unavailable (v11 without keyring).
 */
function decryptAes128Cbc(ciphertext: Buffer, key: Buffer | undefined): Buffer | null {
	if (!key) {
		return null;
	}
	const decipher = createDecipheriv('aes-128-cbc', key, AES_CBC_IV);
	decipher.setAutoPadding(true);
	return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * AES-256-GCM decrypt for Windows.
 *
 * Payload layout after the 3-byte version prefix:
 *   [12-byte nonce][ciphertext][16-byte auth tag]
 */
function decryptAes256Gcm(payload: Buffer, key: Buffer): Buffer | null {
	if (payload.length < 12 + 16) {
		return null;
	}
	const nonce = payload.subarray(0, 12);
	const authTag = payload.subarray(-16);
	const ciphertext = payload.subarray(12, -16);
	const decipher = createDecipheriv('aes-256-gcm', key, nonce);
	decipher.setAuthTag(authTag);
	return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
