/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createPublicKey, verify, type JsonWebKey } from 'crypto';

const MAX_SKEW_SECONDS = 300;
const P256_ORDER_HALF = BigInt('0x7fffffff800000007fffffffffffffffffffffffffffffffde737d56d38bcf427');

export interface IMissionControlSpawn {
	readonly kind: 'spawn_request';
	readonly client_id: string;
	readonly spawn_request_id: string;
	readonly passive?: boolean;
	readonly signature: string;
}

export interface IMissionControlSigningKey extends JsonWebKey {
	readonly kid: string;
	readonly kty: 'EC';
	readonly crv: 'P-256';
	readonly alg: 'ES256';
	readonly use: 'sig';
}

function object(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodePart(part: string): Record<string, unknown> {
	if (!/^[A-Za-z0-9_-]+$/.test(part)) {
		throw new Error('Invalid control signature encoding');
	}
	const decoded = Buffer.from(part, 'base64url');
	if (decoded.toString('base64url') !== part || decoded.length > 8192) {
		throw new Error('Invalid control signature encoding');
	}
	const value: unknown = JSON.parse(decoded.toString('utf8'));
	if (!object(value)) {
		throw new Error('Invalid control signature payload');
	}
	return value;
}

/**
 * Validates a signed control request before it can open a client lane.
 * A verifier is scoped to one registration and retains only bounded replay state.
 */
export class MissionControlControlVerifier {
	private readonly _seen = new Map<string, number>();

	constructor(
		private readonly _environmentId: string,
		private readonly _ownerId: string,
		private readonly _keys: readonly IMissionControlSigningKey[],
		private readonly _now: () => number = Date.now,
	) { }

	verify(value: unknown): IMissionControlSpawn {
		if (!object(value) || value.kind !== 'spawn_request' || typeof value.client_id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value.client_id)
			|| typeof value.spawn_request_id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value.spawn_request_id)
			|| (value.passive !== undefined && typeof value.passive !== 'boolean')
			|| typeof value.signature !== 'string') {
			throw new Error('Invalid Mission Control spawn request');
		}
		const [encodedHeader, encodedClaims, encodedSignature, extra] = value.signature.split('.');
		if (!encodedHeader || !encodedClaims || !encodedSignature || extra !== undefined) {
			throw new Error('Invalid control signature');
		}
		const header = decodePart(encodedHeader);
		const claims = decodePart(encodedClaims);
		const key = this._keys.find(candidate => candidate.kid === header.kid);
		if (header.alg !== 'ES256' || header.typ !== 'JWT' || !key || key.kty !== 'EC' || key.crv !== 'P-256' || key.alg !== 'ES256' || key.use !== 'sig') {
			throw new Error('Untrusted Mission Control signing key');
		}
		const signature = Buffer.from(encodedSignature, 'base64url');
		if (signature.toString('base64url') !== encodedSignature || signature.length !== 64
			|| BigInt(`0x${signature.subarray(32).toString('hex')}`) > P256_ORDER_HALF
			|| !verify('sha256', Buffer.from(`${encodedHeader}.${encodedClaims}`), { key: createPublicKey({ key, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, signature)) {
			throw new Error('Invalid Mission Control signature');
		}
		const now = Math.floor(this._now() / 1000);
		const payload = claims.payload;
		if (!Number.isInteger(claims.iat) || Math.abs(now - (claims.iat as number)) > MAX_SKEW_SECONDS
			|| typeof claims.jti !== 'string' || !claims.jti || claims.environment_id !== this._environmentId
			|| claims.user_id !== this._ownerId || claims.kind !== 'spawn_request'
			|| !object(payload) || payload.kind !== 'spawn_request'
			|| payload.client_id !== value.client_id || payload.spawn_request_id !== value.spawn_request_id
			|| payload.passive !== value.passive) {
			throw new Error('Control request does not match this environment');
		}
		for (const [nonce, time] of this._seen) {
			if (time < now) {
				this._seen.delete(nonce);
			}
		}
		if (this._seen.has(claims.jti) || this._seen.size >= 1024) {
			throw new Error('Replay or exhausted control replay window');
		}
		this._seen.set(claims.jti, (claims.iat as number) + MAX_SKEW_SECONDS);
		return { kind: 'spawn_request', client_id: value.client_id, spawn_request_id: value.spawn_request_id, passive: value.passive === true, signature: value.signature };
	}
}
