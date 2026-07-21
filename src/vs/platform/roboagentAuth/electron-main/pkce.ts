/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';

/**
 * Generates a PKCE code_verifier.
 * 32 random bytes, base64url-encoded, no padding (43 chars).
 */
export function generateCodeVerifier(): string {
	return base64UrlEncode(crypto.randomBytes(32));
}

/**
 * Generates a PKCE code_challenge from a code_verifier.
 * base64url(SHA-256(code_verifier)), no padding.
 */
export function generateCodeChallenge(verifier: string): string {
	const hash = crypto.createHash('sha256').update(verifier).digest();
	return base64UrlEncode(hash);
}

/**
 * Generates a random state string to prevent CSRF.
 * 32 random bytes, base64url-encoded, no padding.
 */
export function generateState(): string {
	return base64UrlEncode(crypto.randomBytes(32));
}

/**
 * Validates two strings using a constant-time comparison to prevent timing attacks.
 */
export function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) {
		return false;
	}
	return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function base64UrlEncode(buffer: Buffer): string {
	return buffer.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');
}
