/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash, randomBytes } from 'crypto';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import type { AuthenticateParams } from '../common/agent.js';
import type { IHostEncryptionKey } from '../common/cloudSandboxAgentHost.js';
import { JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';

type KeyUse = 'auth-token' | 'mcp-auth-token';

interface ISealingKey {
	readonly use: KeyUse;
	readonly publicKey: Uint8Array;
	readonly privateKey: Uint8Array;
	readonly keyId: string;
}

type Sodium = typeof import('libsodium-wrappers').default;

/** Process-local sealing keys; private material never crosses IPC or the relay. */
export class MissionControlSealing extends Disposable {
	private static _implementation: Sodium | undefined;
	private readonly _sodium: Sodium;
	private readonly _keys: readonly ISealingKey[];

	constructor(keys?: readonly { use: KeyUse; privateKey: Uint8Array }[]) {
		super();
		const sodium = MissionControlSealing._implementation;
		if (!sodium) {
			throw new Error('Mission Control sealing is not initialized');
		}
		this._sodium = sodium;
		this._keys = (keys ?? [
			{ use: 'auth-token', privateKey: sodium.crypto_box_keypair().privateKey },
			{ use: 'mcp-auth-token', privateKey: sodium.crypto_box_keypair().privateKey },
		]).map(key => {
			const publicKey = sodium.crypto_scalarmult_base(key.privateKey);
			return { ...key, publicKey, keyId: createHash('sha256').update(publicKey).digest().subarray(0, 8).toString('base64url') };
		});
		this._register(toDisposable(() => {
			for (const key of this._keys) {
				sodium.memzero(key.privateKey);
			}
		}));
	}

	static async ready(): Promise<void> {
		const sodium = (await import('libsodium-wrappers')).default;
		await sodium.ready;
		this._implementation = sodium;
	}

	get advertisedKeys(): readonly IHostEncryptionKey[] {
		return this._keys.map(key => ({
			key_id: key.keyId, use: key.use, algorithm: 'x25519-sealedbox', public_key: Buffer.from(key.publicKey).toString('base64'),
		}));
	}

	get rootMeta(): Record<string, unknown> {
		return { 'copilot.encryptionKeys': this.advertisedKeys.map(key => ({ keyId: key.key_id, use: key.use, algorithm: key.algorithm, publicKey: key.public_key })) };
	}

	open(token: string, use: KeyUse, resource: string): { token: string; connection?: Record<string, unknown> } {
		const parts = token.split('.');
		if (parts.length !== 4 || parts[0] !== 'copilot-sealed' || parts[1] !== 'v1' || token.length > 64 * 1024) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Relay authentication requires a sealed v1 token');
		}
		const key = this._keys.find(key => key.keyId === parts[2] && key.use === use);
		const box = Buffer.from(parts[3], 'base64url');
		if (!key || box.toString('base64url') !== parts[3] || box.length < 48) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Unknown sealing key or invalid sealed token');
		}
		let plaintext: Uint8Array;
		try {
			plaintext = this._sodium.crypto_box_seal_open(box, key.publicKey, key.privateKey);
		} catch {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Unable to open sealed token');
		}
		try {
			const inner: unknown = JSON.parse(Buffer.from(plaintext).toString('utf8'));
			if (!isObject(inner) || inner.cty !== 'text' || typeof inner.value !== 'string' || !inner.value
				|| !isObject(inner.ctx) || inner.ctx.purpose !== use
				|| (inner.ctx.resource !== undefined && inner.ctx.resource !== resource)
				|| (inner.ctx.connection !== undefined && !isObject(inner.ctx.connection))) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Invalid sealed authentication context');
			}
			return { token: inner.value, connection: inner.ctx.connection };
		} catch (error) {
			if (error instanceof ProtocolError) {
				throw error;
			}
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Invalid sealed authentication plaintext');
		} finally {
			this._sodium.memzero(plaintext);
		}
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates a GitHub credential without retaining it or exposing response content. */
export async function resolveMissionControlOwner(fetcher: typeof fetch, apiOrigin: string, credential: string): Promise<string> {
	if (!/^[\x21-\x7e]+$/.test(credential)) {
		throw new Error('Invalid GitHub credential encoding');
	}
	const response = await fetcher(new URL('/user', apiOrigin), {
		headers: { Authorization: `Bearer ${credential}`, Accept: 'application/vnd.github+json' },
		redirect: 'error',
		signal: AbortSignal.timeout(15_000),
	});
	if (!response.ok) {
		throw new Error(`GitHub identity validation failed (${response.status})`);
	}
	let user: unknown;
	try {
		user = await response.json();
	} catch (error) {
		if (error instanceof SyntaxError) {
			throw new Error('GitHub identity validation returned invalid JSON');
		}
		throw error;
	}
	if (!isObject(user) || !Number.isSafeInteger(user.id) || (user.id as number) <= 0 || user.type !== 'User') {
		throw new Error('Mission Control requires a canonical GitHub user identity');
	}
	return String(user.id);
}

/** One challenge and replay ledger per AHP handshake generation. */
export class MissionControlAuthentication {
	private _challenge = randomBytes(16).toString('hex');
	private readonly _seen = new Map<string, number>();
	private _time = 0;

	constructor(
		private readonly _sealing: MissionControlSealing,
		private readonly _owner: string,
		private readonly _apiOrigin: string,
		private readonly _fetch: typeof fetch,
		private readonly _requireBinding: boolean,
	) { }

	beginHandshake(): void {
		this._challenge = randomBytes(16).toString('hex');
		this._seen.clear();
	}

	get handshakeMeta(): Record<string, unknown> {
		return {
			'copilot.encryptionRequired': ['auth-token', 'mcp-auth-token'],
			'copilot.authChallenge': { challenge: this._challenge, responseMaxAgeSeconds: 300, required: this._requireBinding },
		};
	}

	async authenticate(params: AuthenticateParams): Promise<AuthenticateParams> {
		const resource = new URL(params.resource);
		const identity = resource.origin === this._apiOrigin;
		const opened = this._sealing.open(params.token ?? '', identity ? 'auth-token' : 'mcp-auth-token', params.resource);
		const binding = opened.connection;
		if (!binding && this._requireBinding) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'A connection-bound sealed token is required');
		}
		if (binding) {
			this._time = Math.max(this._time, Math.floor(Date.now() / 1000));
			for (const [nonce, expiry] of this._seen) {
				if (expiry < this._time) {
					this._seen.delete(nonce);
				}
			}
			if (binding.challenge !== this._challenge || typeof binding.nonce !== 'string' || !/^[0-9a-f]{32}$/.test(binding.nonce)
				|| !Number.isSafeInteger(binding.issuedAt) || Math.abs(this._time - (binding.issuedAt as number)) > 300
				|| this._seen.has(binding.nonce) || this._seen.size >= 1024) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Invalid or replayed sealed connection binding');
			}
			this._seen.set(binding.nonce, (binding.issuedAt as number) + 300);
		}
		if (identity && await resolveMissionControlOwner(this._fetch, this._apiOrigin, opened.token) !== this._owner) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Credential does not belong to the registered owner');
		}
		return { ...params, token: opened.token };
	}
}
