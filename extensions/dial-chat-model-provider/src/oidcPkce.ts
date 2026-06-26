import * as crypto from 'crypto';

export interface PkcePair {
	codeVerifier: string;
	codeChallenge: string;
}

export function createPkcePair(): PkcePair {
	const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
	const codeChallenge = base64UrlEncode(
		crypto.createHash('sha256').update(codeVerifier).digest(),
	);
	return { codeVerifier, codeChallenge };
}

export function createOAuthState(): string {
	return base64UrlEncode(crypto.randomBytes(16));
}

function base64UrlEncode(buffer: Buffer): string {
	return buffer.toString('base64url');
}
