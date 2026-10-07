/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash, randomBytes } from 'crypto';
import type { CipherSuite } from '@hpke/core';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import type { IMissionControlCredentialSealingRequest } from '../../common/agentService.js';
import type { AuthenticateParams } from '../../common/agent.js';
import type { IHostEncryptionKey } from '../../common/cloudSandboxAgentHost.js';
import { AhpErrorCodes, JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';

type KeyUse = 'auth-token' | 'mcp-auth-token';
type KeyAlgorithm = 'x25519-sealedbox' | 'hpke-x25519-hkdf-sha256-aes256gcm';

interface ISealingKey {
	readonly use: KeyUse;
	readonly algorithm: KeyAlgorithm;
	readonly publicKey: Uint8Array;
	readonly privateKey: Uint8Array;
	readonly keyId: string;
}

type Sodium = typeof import('libsodium-wrappers').default;

async function createHpkeCipherSuite(): Promise<CipherSuite> {
	const hpke = await import('@hpke/core');
	return new hpke.CipherSuite({
		kem: new hpke.DhkemX25519HkdfSha256(),
		kdf: new hpke.HkdfSha256(),
		aead: new hpke.Aes256Gcm(),
	});
}

/** The caller authenticates the public key through MC HTTPS before crossing trusted local IPC. */
export async function sealMissionControlCredential(request: IMissionControlCredentialSealingRequest): Promise<string> {
	if (!request.token || request.token.length > 32 * 1024 || request.resource.length > 8192
		|| (request.key.algorithm !== 'x25519-sealedbox' && request.key.algorithm !== 'hpke-x25519-hkdf-sha256-aes256gcm')
		|| (request.key.use !== 'auth-token' && request.key.use !== 'mcp-auth-token')
		|| (request.challenge !== undefined && !/^[0-9a-f]{32}$/.test(request.challenge))) {
		throw new Error('Invalid Mission Control credential sealing request');
	}
	new URL(request.resource);
	const publicKey = Buffer.from(request.key.public_key, 'base64');
	const keyId = createHash('sha256').update(publicKey).digest().subarray(0, 8).toString('base64url');
	if (publicKey.length !== 32 || publicKey.toString('base64') !== request.key.public_key || keyId !== request.key.key_id) {
		throw new Error('Invalid Mission Control recipient key');
	}
	const sodium = (await import('libsodium-wrappers')).default;
	await sodium.ready;
	const plaintext = sodium.from_string(JSON.stringify({
		cty: 'text', value: request.token,
		ctx: {
			purpose: request.key.use, resource: request.resource,
			...(request.challenge ? { connection: { challenge: request.challenge, nonce: randomBytes(16).toString('hex'), issuedAt: Math.floor(Date.now() / 1000) } } : {}),
		},
	}));
	try {
		let ciphertext: Uint8Array;
		if (request.key.algorithm === 'hpke-x25519-hkdf-sha256-aes256gcm') {
			const hpke = await createHpkeCipherSuite();
			const recipientPublicKey = await globalThis.crypto.subtle.importKey('raw', publicKey, 'X25519', true, []);
			const sender = await hpke.createSenderContext({ recipientPublicKey });
			ciphertext = Buffer.concat([new Uint8Array(sender.enc), new Uint8Array(await sender.seal(plaintext))]);
		} else {
			ciphertext = sodium.crypto_box_seal(plaintext, publicKey);
		}
		return `copilot-sealed.v1.${keyId}.${Buffer.from(ciphertext).toString('base64url')}`;
	} finally {
		sodium.memzero(plaintext);
	}
}

/** Process-local sealing keys; private material never crosses IPC or the relay. */
export class MissionControlSealing extends Disposable {
	private static _implementation: Sodium | undefined;
	private static _hpkeImplementation: CipherSuite | undefined;
	private readonly _sodium: Sodium;
	private readonly _hpke: CipherSuite;
	private _keys: readonly ISealingKey[];

	constructor(keys?: readonly { use: KeyUse; privateKey: Uint8Array; algorithm?: KeyAlgorithm }[]) {
		super();
		const sodium = MissionControlSealing._implementation;
		const hpke = MissionControlSealing._hpkeImplementation;
		if (!sodium || !hpke) {
			throw new Error('Mission Control sealing is not initialized');
		}
		this._sodium = sodium;
		this._hpke = hpke;
		const uses: readonly KeyUse[] = ['auth-token', 'mcp-auth-token'];
		const algorithms: readonly KeyAlgorithm[] = ['x25519-sealedbox', 'hpke-x25519-hkdf-sha256-aes256gcm'];
		this._keys = (keys ?? uses.flatMap(use => algorithms.map(algorithm => ({
			use, algorithm, privateKey: sodium.crypto_box_keypair().privateKey,
		})))).map(key => {
			const publicKey = sodium.crypto_scalarmult_base(key.privateKey);
			return { ...key, algorithm: key.algorithm ?? 'x25519-sealedbox', publicKey, keyId: createHash('sha256').update(publicKey).digest().subarray(0, 8).toString('base64url') };
		});
		this._register(toDisposable(() => {
			for (const key of this._keys) {
				sodium.memzero(key.privateKey);
			}
			this._keys = [];
		}));
	}

	static async ready(): Promise<void> {
		const sodium = (await import('libsodium-wrappers')).default;
		await sodium.ready;
		this._implementation = sodium;
		this._hpkeImplementation ??= await createHpkeCipherSuite();
	}

	get advertisedKeys(): readonly IHostEncryptionKey[] {
		return this._keys.map(key => ({
			key_id: key.keyId, use: key.use, algorithm: key.algorithm, public_key: Buffer.from(key.publicKey).toString('base64'),
		}));
	}

	get rootMeta(): Record<string, unknown> {
		return { 'copilot.encryptionKeys': this.advertisedKeys.map(key => ({ keyId: key.key_id, use: key.use, algorithm: key.algorithm, publicKey: key.public_key })) };
	}

	async open(token: string, use: KeyUse, resource: string): Promise<{ token: string; connection?: Record<string, unknown> }> {
		if (this._store.isDisposed) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidRequest, 'Mission Control sealing is closed');
		}
		const parts = token.split('.');
		if (parts.length !== 4 || parts[0] !== 'copilot-sealed' || parts[1] !== 'v1' || token.length > 64 * 1024) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Relay authentication requires a sealed v1 token');
		}
		const box = Buffer.from(parts[3], 'base64url');
		if (!/^[A-Za-z0-9_-]{11}$/.test(parts[2]) || box.toString('base64url') !== parts[3] || box.length < 48) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Invalid sealed token');
		}
		const key = this._keys.find(key => key.keyId === parts[2] && key.use === use);
		if (!key) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'Unknown sealing key or mismatched purpose; refresh the trusted keys and seal again');
		}
		let plaintext: Uint8Array;
		try {
			if (key.algorithm === 'hpke-x25519-hkdf-sha256-aes256gcm') {
				const privateKeyData = Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), key.privateKey]);
				let privateKey: CryptoKey;
				try {
					privateKey = await globalThis.crypto.subtle.importKey('pkcs8', privateKeyData, 'X25519', false, ['deriveBits']);
				} finally {
					privateKeyData.fill(0);
				}
				const publicKey = await globalThis.crypto.subtle.importKey('raw', Uint8Array.from(key.publicKey), 'X25519', true, []);
				const recipient = await this._hpke.createRecipientContext({
					recipientKey: { privateKey, publicKey },
					enc: box.subarray(0, 32),
				});
				plaintext = new Uint8Array(await recipient.open(box.subarray(32)));
			} else {
				plaintext = this._sodium.crypto_box_seal_open(box, key.publicKey, key.privateKey);
			}
		} catch {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Unable to open sealed token');
		}
		try {
			if (this._store.isDisposed) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidRequest, 'Mission Control sealing is closed');
			}
			const inner: unknown = JSON.parse(Buffer.from(plaintext.buffer, plaintext.byteOffset, plaintext.byteLength).toString('utf8'));
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
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Invalid GitHub credential encoding');
	}
	const response = await fetcher(new URL('user', `${apiOrigin.replace(/\/$/, '')}/`), {
		headers: { Authorization: `Bearer ${credential}`, Accept: 'application/vnd.github+json' },
		redirect: 'error',
		signal: AbortSignal.timeout(15_000),
	});
	if (!response.ok) {
		const denied = response.status === 401 || (response.status === 403
			&& !response.headers.has('Retry-After') && response.headers.get('X-RateLimit-Remaining') !== '0');
		throw new ProtocolError(denied ? JsonRpcErrorCodes.InvalidParams : JsonRpcErrorCodes.InternalError, `GitHub identity validation failed (${response.status})`);
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
		throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Mission Control requires a canonical GitHub user identity');
	}
	return String(user.id);
}

/** One challenge and replay ledger per AHP handshake generation. */
export class MissionControlAuthentication {
	private _challenge = randomBytes(16).toString('hex');
	private readonly _seen = new Map<string, number>();
	private _time = 0;
	private _generation = 0;
	private _authenticated = false;
	private _closed = false;
	private _identityValidation: Promise<AuthenticateParams> | undefined;

	constructor(
		private readonly _sealing: MissionControlSealing,
		private readonly _owner: string,
		private readonly _apiOrigin: string,
		private readonly _fetch: typeof fetch,
		private readonly _requireBinding: boolean,
		private readonly _isCurrentIdentityAuthority: () => boolean = () => true,
	) { }

	beginHandshake(): void {
		this._generation++;
		this._authenticated = false;
		this._challenge = randomBytes(16).toString('hex');
		this._seen.clear();
		this._identityValidation = undefined;
	}

	get authenticated(): boolean {
		return this._authenticated && !this._closed && this._isCurrentIdentityAuthority();
	}

	dispose(): void {
		this._closed = true;
		this._generation++;
		this._authenticated = false;
		this._seen.clear();
		this._identityValidation = undefined;
	}

	get handshakeMeta(): Record<string, unknown> {
		return {
			'copilot.encryptionRequired': ['auth-token', 'mcp-auth-token'],
			'copilot.authChallenge': { challenge: this._challenge, responseMaxAgeSeconds: 300, required: this._requireBinding },
		};
	}

	async authenticate(params: AuthenticateParams): Promise<AuthenticateParams> {
		if (this._closed || !this._isCurrentIdentityAuthority()) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidRequest, 'Relay authentication is closed');
		}
		const generation = this._generation;
		const resource = new URL(params.resource);
		const identity = resource.origin === new URL(this._apiOrigin).origin;
		if (!identity && !this.authenticated) {
			const validation = this._identityValidation;
			if (!validation) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidRequest, 'Authenticate the relay identity before MCP resources');
			}
			await validation;
			if (!this.authenticated || generation !== this._generation) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidRequest, 'Relay identity authentication is unavailable');
			}
		}
		const authentication = this._authenticate(params, identity, generation);
		if (!identity) {
			return authentication;
		}
		// Publish the whole identity operation before asynchronous decryption so MCP requests can wait for it.
		this._identityValidation = authentication;
		try {
			return await authentication;
		} finally {
			if (this._identityValidation === authentication) {
				this._identityValidation = undefined;
			}
		}
	}

	private async _authenticate(params: AuthenticateParams, identity: boolean, generation: number): Promise<AuthenticateParams> {
		const opened = await this._sealing.open(params.token ?? '', identity ? 'auth-token' : 'mcp-auth-token', params.resource);
		if (this._closed || generation !== this._generation || !this._isCurrentIdentityAuthority()) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidRequest, 'Relay authentication belongs to an expired handshake');
		}
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
		if (identity) {
			if (await resolveMissionControlOwner(this._fetch, this._apiOrigin, opened.token) !== this._owner) {
				throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Credential does not belong to the registered owner');
			}
		}
		if (this._closed || generation !== this._generation || !this._isCurrentIdentityAuthority()) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidRequest, 'Relay authentication belongs to an expired handshake');
		}
		if (identity) {
			this._authenticated = true;
		}
		return { ...params, token: opened.token };
	}
}
