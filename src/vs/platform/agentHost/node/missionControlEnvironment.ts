/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import { mkdir, open, readFile } from 'fs/promises';
import { realpathSync } from 'fs';
import { join } from '../../../base/common/path.js';
import { disposableLongTimeout, raceTimeout, Sequencer } from '../../../base/common/async.js';
import { combinedDisposable, Disposable, MutableDisposable, toDisposable, type IDisposable } from '../../../base/common/lifecycle.js';
import type { Event } from '../../../base/common/event.js';
import type { IExperimentalMissionControlOptions } from '../common/agentService.js';
import { parseGroupName } from '../common/webPubSub/groups.js';
import { RELIABLE_JSON_SUBPROTOCOL } from '../common/webPubSub/framing.js';
import { PROTOCOL_VERSION } from '../common/state/protocol/version/registry.js';
import { MissionControlControlVerifier, type IMissionControlSigningKey } from './missionControlControl.js';
import { MissionControlProtocolServer, type IMissionControlSocket } from './missionControlProtocolServer.js';
import { MissionControlAuthentication, MissionControlSealing, resolveMissionControlOwner } from './missionControlAuthentication.js';
import { MissionControlSessionMirror } from './missionControlSessionMirror.js';

interface IEnvironmentResponse {
	readonly id: string;
	readonly user_id: string;
	readonly owner_id: string;
	readonly owner_type: 'user';
	readonly kind: 'user-local';
	readonly webpubsub: {
		readonly url: string;
		readonly subprotocol: string;
		readonly access_token: string;
		readonly expires_at?: string;
		readonly hub?: string;
		readonly groups: { readonly control: string; readonly ingest_ack?: string };
	};
}

const heartbeatInterval = 60_000;

function heartbeatRetryAfter(value: string, now: number): number | undefined {
	const trimmed = value.trim();
	const delay = /^\d+$/.test(trimmed)
		? Number(trimmed) * 1000
		: /^[a-z]/i.test(trimmed) ? Date.parse(trimmed) - now : NaN;
	if (!Number.isFinite(delay) || !Number.isSafeInteger(delay) || !Number.isSafeInteger(now + delay)) {
		return undefined;
	}
	return Math.max(0, delay);
}

function parseEnvironment(value: unknown): IEnvironmentResponse {
	if (!value || typeof value !== 'object') {
		throw new Error('Mission Control returned an invalid environment');
	}
	const environment = value as Partial<IEnvironmentResponse>;
	const wps = environment.webpubsub;
	const owner = environment.owner_id ?? environment.user_id;
	if (typeof environment.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(environment.id)
		|| typeof owner !== 'string' || !/^[A-Za-z0-9_-]+$/.test(owner) || owner.startsWith('org_')
		|| (environment.owner_id !== undefined && (typeof environment.owner_id !== 'string' || !environment.owner_id))
		|| (environment.owner_type !== undefined && environment.owner_type !== 'user')
		|| ((environment.owner_id === undefined) !== (environment.owner_type === undefined))
		|| (environment.user_id !== undefined && environment.user_id !== owner) || environment.kind !== 'user-local'
		|| typeof wps?.url !== 'string' || typeof wps.access_token !== 'string' || !wps.access_token
		|| wps.subprotocol !== RELIABLE_JSON_SUBPROTOCOL || typeof wps.groups?.control !== 'string') {
		throw new Error('Mission Control returned an invalid user-local environment');
	}
	return { ...environment, id: environment.id, kind: 'user-local', user_id: owner, owner_id: owner, owner_type: 'user', webpubsub: wps };
}

/**
 * Process-owned, development-only Mission Control registration and WPS lifetime.
 * The first account owns the process; a different window cannot rebind it.
 */
export class ExperimentalMissionControlEnvironment extends Disposable {
	private readonly _server = this._register(new MutableDisposable<MissionControlProtocolServer>());
	private readonly _handler = this._register(new MutableDisposable<IDisposable>());
	private readonly _sealing = this._register(new MutableDisposable<MissionControlSealing>());
	private readonly _mirror = this._register(new MutableDisposable<MissionControlSessionMirror>());
	private readonly _mirrorAttachment = this._register(new MutableDisposable<IDisposable>());
	private readonly _mirrorSource = this._register(new MutableDisposable<IDisposable>());
	private _mirrorEnvironment: string | undefined;
	private readonly _configuration = new Sequencer();
	private readonly _heartbeat = this._register(new MutableDisposable<IDisposable>());
	private _heartbeatNotBefore = 0;
	private _nextHeartbeatAt = 0;
	private _ownerAccount: string | undefined;
	private _canonicalOwner: string | undefined;
	private _identityApiBase: string | undefined;
	private _policy: string | undefined;
	private _options: IExperimentalMissionControlOptions | undefined;
	private _environment: IEnvironmentResponse | undefined;
	private _currentCheckIn: Promise<void> | undefined;
	private _generation = 0;
	private _retryDelay = 500;
	private _credentialRejected = false;
	private _signingKeys: readonly IMissionControlSigningKey[] | undefined;
	private _signingKeysFetchedAt = 0;
	private _verifier: MissionControlControlVerifier | undefined;
	private _tokenExpiresAt: number | undefined;
	private _requiresBootstrap = false;

	constructor(
		private readonly _userDataPath: string,
		private readonly _fetch: typeof fetch,
		private readonly _attach: (server: MissionControlProtocolServer, roots: readonly string[]) => IDisposable,
		private readonly _onError: (error: unknown) => void,
		private readonly _socketFactory?: (url: string, protocol: string) => IMissionControlSocket,
		private readonly _getSessionCount: () => Promise<number> = async () => 0,
		private readonly _getRemoteControlPolicy?: () => Promise<Record<string, unknown> | undefined>,
		private readonly _onReady?: (environmentId: string) => void,
		private readonly _getIdentityApiBase: () => string = () => 'https://api.github.com',
		onDidChangeIdentityAuthority?: Event<void>,
		private readonly _createMirror?: (environmentId: string) => { readonly mirror: MissionControlSessionMirror; readonly source: IDisposable },
	) {
		super();
		this._register(toDisposable(() => {
			this._generation++;
			this._options = undefined;
		}));
		if (onDidChangeIdentityAuthority) {
			this._register(onDidChangeIdentityAuthority(() => {
				if (this._options?.live && this._identityApiBase !== this._getIdentityApiBase()) {
					this._generation++;
					this._handler.clear();
					this._mirrorAttachment.clear();
					this._server.clear();
					void this.configure(undefined).catch(this._onError);
				}
			}));
		}
	}

	configure(options: IExperimentalMissionControlOptions | undefined): Promise<void> {
		return this._configuration.queue(() => this._configure(options));
	}

	get environmentId(): string | undefined { return this._environment?.id; }
	get isEnabled(): boolean { return this._options?.live === true; }

	private async _configure(options: IExperimentalMissionControlOptions | undefined): Promise<void> {
		if (this._store.isDisposed) {
			throw new Error('Mission Control environment service is disposed');
		}
		if (!options) {
			const registered = this._environment;
			const previous = this._options;
			this._generation++;
			this._heartbeat.clear();
			this._handler.clear();
			this._mirrorAttachment.clear();
			this._server.clear();
			this._sealing.clear();
			this._mirror.value?.detach();
			this._options = undefined;
			this._environment = undefined;
			this._verifier = undefined;
			this._signingKeys = undefined;
			this._tokenExpiresAt = undefined;
			this._requiresBootstrap = false;
			this._nextHeartbeatAt = 0;
			if (registered && previous && Date.now() >= this._heartbeatNotBefore) {
				await this._request(
					`cmc_internal/api/agents/environments/${encodeURIComponent(registered.id)}/heartbeat`,
					{ status: 'offline' },
					previous,
				);
			}
			return;
		}
		const endpoint = new URL(options.baseUrl);
		if ((options.live ? endpoint.protocol !== 'https:' : endpoint.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname))
			|| (options.live && endpoint.pathname !== '/')
			|| endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !options.credential || !options.accountId || (!options.live && options.roots.length === 0)) {
			throw new Error('Mission Control requires a safe origin, credential, account, and project roots');
		}
		if (this._ownerAccount && this._ownerAccount !== options.accountId) {
			throw new Error('Agent Host already belongs to another local account; restart the process to change owners');
		}
		const identityApiBase = this._getIdentityApiBase();
		if (options.live && (new URL(identityApiBase).protocol !== 'https:' || (this._identityApiBase && this._identityApiBase !== identityApiBase))) {
			throw new Error('Mission Control requires a stable HTTPS GitHub identity authority');
		}
		const owner = options.live ? await resolveMissionControlOwner(this._fetch, identityApiBase, options.credential) : options.accountId;
		if (options.live && identityApiBase !== this._getIdentityApiBase()) {
			throw new Error('GitHub identity authority changed during Mission Control configuration');
		}
		if (this._canonicalOwner && this._canonicalOwner !== owner) {
			throw new Error('Credential does not match the Agent Host owner');
		}
		const roots = options.roots.map(root => realpathSync(root));
		if (!roots.every(root => root.startsWith('/') || /^[A-Za-z]:\\/.test(root))) {
			throw new Error('Mission Control projects must be absolute local directories');
		}
		if (this._options) {
			if (this._options.baseUrl !== options.baseUrl || this._options.live !== options.live || this._options.requireConnectionBinding !== options.requireConnectionBinding
				|| (!options.live && JSON.stringify(this._options.roots) !== JSON.stringify(roots))) {
				throw new Error('Mission Control is already configured; disable it before changing project grants');
			}
			this._options = { ...options, roots: options.live ? this._options.roots : roots };
			if (this._credentialRejected) {
				this._credentialRejected = false;
				await this._checkIn();
			}
			return;
		}
		this._ownerAccount = options.accountId;
		this._canonicalOwner = owner;
		this._identityApiBase = identityApiBase;
		this._generation++;
		this._options = { ...options, roots };
		this._credentialRejected = false;
		try {
			if (options.live) {
				await MissionControlSealing.ready();
				this._sealing.value = new MissionControlSealing();
			}
			await this._checkIn();
		} catch (error) {
			try {
				await this._configure(undefined);
			} catch (offlineError) {
				this._onError(offlineError);
			}
			throw error;
		}
	}

	private async _computeId(): Promise<string> {
		const path = join(this._userDataPath, 'agent-host-mission-control-id');
		await mkdir(this._userDataPath, { recursive: true });
		try {
			const file = await open(path, 'wx', 0o600);
			try {
				const id = randomUUID();
				await file.writeFile(id);
				return id;
			} finally {
				await file.close();
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
				throw error;
			}
		}
		const id = (await readFile(path, 'utf8')).trim();
		if (!/^[0-9a-f-]{36}$/.test(id)) {
			throw new Error('Invalid persisted Mission Control compute identity');
		}
		return id;
	}

	private async _request(path: string, body?: object, options = this._options): Promise<unknown> {
		if (!options) {
			throw new Error('Mission Control is disabled');
		}
		const generation = this._generation;
		const response = await this._fetch(new URL(path, `${options.baseUrl.replace(/\/$/, '')}/`), {
			method: body ? 'POST' : 'GET',
			headers: { Authorization: `Bearer ${options.credential}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
			body: body ? JSON.stringify(body) : undefined,
			redirect: 'error',
			signal: AbortSignal.timeout(15_000),
		});
		if (path.endsWith('/heartbeat')) {
			this._nextHeartbeatAt = Date.now() + heartbeatInterval;
			const retryAfter = response.headers.get('Retry-After');
			if (retryAfter !== null) {
				const now = Date.now();
				const delay = heartbeatRetryAfter(retryAfter, now);
				if (delay === undefined) {
					this._onError(new Error('Mission Control heartbeat returned an invalid Retry-After header'));
				} else {
					this._heartbeatNotBefore = Math.max(this._heartbeatNotBefore, now + delay);
				}
			}
		}
		if (!response.ok) {
			if ((response.status === 401 || response.status === 403) && generation === this._generation && this._options === options) {
				this._credentialRejected = true;
				this._handler.clear();
				this._server.clear();
			}
			throw new Error(`Mission Control request failed (${response.status})`);
		}
		try {
			return await response.json();
		} catch (error) {
			if (error instanceof SyntaxError) {
				throw new Error('Mission Control returned invalid JSON');
			}
			throw error;
		}
	}

	private async _checkIn(): Promise<void> {
		if (this._currentCheckIn) {
			const generation = this._generation;
			await this._currentCheckIn;
			if (generation !== this._generation && this._options) {
				return this._checkIn();
			}
			return;
		}
		const operation = this._doCheckIn();
		this._currentCheckIn = operation;
		try {
			await operation;
			this._retryDelay = 500;
		} catch (error) {
			this._retryDelay = Math.min(30_000, this._retryDelay * 2);
			throw error;
		} finally {
			this._currentCheckIn = undefined;
			if (this._options && !this._store.isDisposed && !this._credentialRejected) {
				const recovering = this._environment !== undefined && (!this._server.value || this._server.value.isClosed);
				const heartbeatDelay = Math.max(1000, this._nextHeartbeatAt - Date.now(), this._heartbeatNotBefore - Date.now());
				const tokenDelay = this._tokenExpiresAt === undefined ? heartbeatDelay : Math.max(1000, this._tokenExpiresAt - Date.now() - 30_000);
				this._heartbeat.value = disposableLongTimeout(() => {
					this._heartbeat.clear();
					this._checkIn().catch(this._onError);
				}, this._requiresBootstrap ? Math.max(this._retryDelay, heartbeatDelay) : recovering ? this._retryDelay : Math.min(heartbeatDelay, tokenDelay));
			}
		}
	}

	private async _doCheckIn(): Promise<void> {
		const options = this._options;
		const generation = this._generation;
		if (!options || this._credentialRejected) {
			return;
		}
		const waiting = this._environment && Date.now() < Math.max(this._heartbeatNotBefore, this._nextHeartbeatAt);
		const recovering = this._environment && (!this._server.value || this._server.value.isClosed);
		const refreshToken = !this._requiresBootstrap && this._environment && (recovering || (this._tokenExpiresAt !== undefined && Date.now() >= this._tokenExpiresAt - 30_000));
		if (waiting && !refreshToken) {
			return;
		}
		if (refreshToken && this._environment) {
			const reply = await this._request(`cmc_internal/api/agents/environments/${encodeURIComponent(this._environment.id)}/token`, {}, options);
			if (generation !== this._generation || this._options !== options || this._store.isDisposed) {
				return;
			}
			if (!reply || typeof reply !== 'object' || Array.isArray(reply)) {
				throw new Error('Mission Control returned an invalid token bootstrap');
			}
			const token = reply as { url?: unknown; wps_endpoint?: unknown; expires_at?: unknown };
			const bootstrap = parseEnvironment({ ...this._environment, webpubsub: { ...reply, url: token.wps_endpoint ?? token.url } }).webpubsub;
			const cached = this._environment.webpubsub;
			if (bootstrap.url !== cached.url || bootstrap.subprotocol !== cached.subprotocol || bootstrap.hub !== cached.hub
				|| JSON.stringify(Object.entries(bootstrap.groups).sort()) !== JSON.stringify(Object.entries(cached.groups).sort())) {
				this._requiresBootstrap = true;
				throw new Error('Mission Control token refresh changed the environment bootstrap');
			}
			if (typeof token.expires_at !== 'string' || !Number.isFinite(Date.parse(token.expires_at)) || Date.parse(token.expires_at) <= Date.now()) {
				throw new Error('Mission Control returned an invalid token expiry');
			}
			this._tokenExpiresAt = Date.parse(token.expires_at);
			this._environment = { ...this._environment, webpubsub: bootstrap };
			if (waiting || recovering) {
				if (recovering) {
					await this._connectRelay(options, generation);
				}
				return;
			}
		}
		const capabilities = { ahp_version: PROTOCOL_VERSION, features: [], current_sessions: await this._boundedRegistrationWork(this._getSessionCount()) };
		let remoteControl: Record<string, unknown> | undefined;
		if (options.live) {
			if (!this._getRemoteControlPolicy) {
				throw new Error('Cannot register before reading device remote-control policy');
			}
			remoteControl = await this._boundedRegistrationWork(this._getRemoteControlPolicy());
		}
		if (generation !== this._generation || this._options !== options || this._store.isDisposed) {
			return;
		}
		const policy = JSON.stringify(remoteControl ?? null);
		const register = !this._environment || (options.live && policy !== this._policy);
		const encryptionKeys = this._sealing.value?.advertisedKeys;
		const path = !register && this._environment
			? `cmc_internal/api/agents/environments/${encodeURIComponent(this._environment.id)}/heartbeat`
			: 'cmc_internal/api/agents/environments/register';
		const body = !register
			? { status: options.live && (!this._server.value || this._server.value.isClosed) ? 'offline' : 'online', capabilities, ...(encryptionKeys ? { encryption_keys: encryptionKeys } : {}) }
			: { name: 'VS Code Agent Host (Development)', kind: 'user-local', compute_id: await this._computeId(), capabilities, labels: { embedder: 'vscode' }, ...(encryptionKeys ? { encryption_keys: encryptionKeys } : {}), ...(remoteControl ? { managed_settings: { remoteControl } } : {}) };
		const reply = await this._request(path, body, options);
		if (generation !== this._generation || this._store.isDisposed) {
			return;
		}
		const response = parseEnvironment(reply);
		if (response.user_id !== this._canonicalOwner || (this._environment && (response.id !== this._environment.id || response.owner_id !== this._environment.owner_id))) {
			throw new Error('Mission Control environment owner changed');
		}
		parseGroupName(response.webpubsub.groups.control, { expected: { uid: response.user_id, eid: response.id } });
		if (!response.webpubsub.groups.control.endsWith('.control')) {
			throw new Error('Mission Control returned an invalid control lane');
		}
		this._environment = response;
		if (options.live && this._createMirror && (!this._mirror.value || this._mirrorEnvironment !== response.id)) {
			if (!response.webpubsub.groups.ingest_ack) {
				throw new Error('Mission Control returned no durable ingest acknowledgement lane');
			}
			const group = parseGroupName(response.webpubsub.groups.ingest_ack, { expected: { uid: response.user_id, eid: response.id } });
			if (group.scope !== 'env' || group.lane !== 'ingest-ack') {
				throw new Error('Mission Control returned an invalid ingest acknowledgement lane');
			}
			this._mirrorAttachment.clear();
			this._mirrorSource.clear();
			this._mirror.clear();
			const created = this._createMirror(response.id);
			this._mirror.value = created.mirror;
			this._mirrorSource.value = created.source;
			this._mirrorEnvironment = response.id;
		}
		this._requiresBootstrap = false;
		if (response.webpubsub.expires_at !== undefined) {
			const expiry = Date.parse(response.webpubsub.expires_at);
			if (!Number.isFinite(expiry) || expiry <= Date.now()) {
				throw new Error('Mission Control returned an invalid token expiry');
			}
			this._tokenExpiresAt = expiry;
		}
		this._policy = policy;
		await this._connectRelay(options, generation);
	}

	private async _connectRelay(options: IExperimentalMissionControlOptions, generation: number): Promise<void> {
		const response = this._environment;
		if (!response || generation !== this._generation || this._store.isDisposed) {
			return;
		}
		if (!this._signingKeys || Date.now() - this._signingKeysFetchedAt >= 5 * 60_000) {
			const jwks = await this._request('cmc_internal/api/agents/environments/.well-known/jwks.json');
			if (generation !== this._generation || this._store.isDisposed) {
				return;
			}
			const keys = (jwks as { keys?: IMissionControlSigningKey[] } | null)?.keys;
			if (!Array.isArray(keys) || keys.length === 0 || keys.length > 64) {
				throw new Error('Mission Control returned no usable signing keys');
			}
			if (this._verifier) {
				this._verifier.updateKeys(keys);
			} else {
				this._verifier = new MissionControlControlVerifier(response.id, response.user_id, keys);
			}
			this._signingKeys = keys;
			this._signingKeysFetchedAt = Date.now();
		}
		if (this._server.value?.isClosed) {
			this._handler.clear();
			this._server.clear();
		}
		if (this._server.value) {
			return;
		}
		const sealing = this._sealing.value;
		const verifier = this._verifier;
		if (!verifier) {
			throw new Error('Mission Control signing keys are unavailable');
		}
		const identityApiBase = this._identityApiBase;
		if (sealing && !identityApiBase) {
			throw new Error('Mission Control identity authority is unavailable');
		}
		const server = new MissionControlProtocolServer(
			response.webpubsub, response.user_id, response.id,
			verifier,
			this._socketFactory,
			error => this._onError(error),
			sealing && identityApiBase ? () => new MissionControlAuthentication(sealing, response.user_id, identityApiBase, this._fetch, options.requireConnectionBinding === true, () => identityApiBase === this._getIdentityApiBase() && generation === this._generation) : undefined,
			sealing?.rootMeta,
			this._mirror.value,
		);
		this._server.value = server;
		this._handler.value = combinedDisposable(this._attach(server, options.roots), server.onClose(() => {
			if (generation === this._generation && !this._store.isDisposed && this._server.value === server && this._options && !this._credentialRejected) {
				this._heartbeat.value = disposableLongTimeout(() => {
					this._checkIn().catch(this._onError);
				}, this._retryDelay);
			}
		}));
		await server.connect();
		if (generation !== this._generation) {
			this._handler.clear();
			this._server.clear();
			return;
		}
		if (this._mirror.value) {
			const attachment = this._mirror.value.attach(event => {
				try {
					return server.publishMirrorEvent(event);
				} catch (error) {
					server.dispose();
					throw error;
				}
			});
			const onClose = server.onClose(() => attachment.dispose());
			this._mirrorAttachment.value = combinedDisposable(attachment, onClose);
		}
		if (options.live && Date.now() >= this._heartbeatNotBefore) {
			await this._request(`cmc_internal/api/agents/environments/${encodeURIComponent(response.id)}/heartbeat`, { status: 'online', encryption_keys: sealing?.advertisedKeys }, options);
		}
		this._onReady?.(response.id);
	}

	private async _boundedRegistrationWork<T>(operation: Promise<T>): Promise<T> {
		const result = await raceTimeout(operation.then(value => ({ value })), 15_000);
		if (!result) {
			throw new Error('Mission Control registration metadata timed out');
		}
		return result.value;
	}
}
