/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'crypto';
import { mkdir, open, readFile, realpath, rename, unlink } from 'fs/promises';
import { join } from '../../../../base/common/path.js';
import { disposableLongTimeout, raceTimeout, Sequencer } from '../../../../base/common/async.js';
import { combinedDisposable, Disposable, MutableDisposable, toDisposable, type IDisposable } from '../../../../base/common/lifecycle.js';
import type { Event } from '../../../../base/common/event.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { CloudSandboxRequestError } from '../../common/cloudSandboxAgentHost.js';
import { emitConnectionDiagnostic, getGitHubRequestId, sanitizeConnectionDiagnosticText, traceConnectionOperation, type ConnectionDiagnosticObserver } from '../../common/connectionDiagnostics.js';
import type { IMissionControlOptions } from '../../common/agentService.js';
import { parseGroupName } from '../../common/webPubSub/groups.js';
import { RELIABLE_JSON_SUBPROTOCOL } from '../../common/webPubSub/framing.js';
import { PROTOCOL_VERSION } from '../../common/state/protocol/version/registry.js';
import { MissionControlControlVerifier, type IMissionControlSigningKey } from './missionControlControl.js';
import { MissionControlProtocolServer, type IMissionControlSocket } from './missionControlProtocolServer.js';
import { MissionControlAuthentication, MissionControlSealing, resolveMissionControlOwner } from './missionControlAuthentication.js';
import { MissionControlSessionMirror } from './missionControlSessionMirror.js';
import type { AhpJsonlLogger } from '../../common/ahpJsonlLogger.js';

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

export interface IMissionControlEnvironmentHost {
	readonly userDataPath: string;
	readonly name: string;
	readonly fetch: typeof fetch;
	readonly attach: (server: MissionControlProtocolServer, initialRoots: readonly string[], getRoots: () => readonly string[]) => IDisposable;
	readonly onError: (error: unknown) => void;
	readonly onDiagnostic?: ConnectionDiagnosticObserver;
	readonly socketFactory?: (url: string, protocol: string) => IMissionControlSocket;
	readonly getSessionCount?: () => Promise<number>;
	readonly getRemoteControlPolicy?: () => Promise<Record<string, unknown> | undefined>;
	readonly onReady?: (environmentId: string) => void;
	readonly getIdentityApiBase?: () => string;
	readonly onDidChangeIdentityAuthority?: Event<void>;
	readonly createMirror?: (environmentId: string) => { readonly mirror: MissionControlSessionMirror; readonly source: IDisposable };
	/** Creates a lane-owned wire logger, independent of the desktop client's logging setting. */
	readonly createAhpLogger?: (clientId: string, generation: number) => AhpJsonlLogger;
	readonly onDidChangeRemoteControlPolicy?: Event<void>;
}

interface IEnvironmentCapabilities {
	readonly ahp_version: string;
	readonly features: readonly string[];
	readonly current_sessions: number;
}

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
 * Process-owned Mission Control registration and WPS lifetime.
 * The first account owns the process; a different window cannot rebind it.
 */
export class MissionControlEnvironment extends Disposable {
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
	private _options: IMissionControlOptions | undefined;
	private _roots: readonly string[] = [];
	private _initialRoots: readonly string[] | undefined;
	private _environment: IEnvironmentResponse | undefined;
	private _currentCheckIn: { readonly generation: number; readonly operation: Promise<void> } | undefined;
	private _generation = 0;
	private _configurationEpoch = 0;
	private _policyRefresh = 0;
	private _appliedPolicyRefresh = 0;
	private _retryDelay = 500;
	private _credentialRejected = false;
	private _signingKeys: readonly IMissionControlSigningKey[] | undefined;
	private _signingKeysFetchedAt = 0;
	private _verifier: MissionControlControlVerifier | undefined;
	private _tokenExpiresAt: number | undefined;
	private _requiresBootstrap = false;

	constructor(private readonly _host: IMissionControlEnvironmentHost) {
		super();
		this._register(toDisposable(() => {
			this._withdraw();
		}));
		if (_host.onDidChangeIdentityAuthority) {
			this._register(_host.onDidChangeIdentityAuthority(() => {
				if (this._options?.live && this._identityApiBase !== this._getIdentityApiBase()) {
					void this.configure(undefined).catch(this._host.onError);
				}
			}));
		}
		if (_host.onDidChangeRemoteControlPolicy) {
			this._register(_host.onDidChangeRemoteControlPolicy(() => {
				this._policyRefresh++;
				if (this._options?.live) {
					void this._checkIn().catch(this._host.onError);
				}
			}));
		}
	}

	/** Renderer withdrawals identify their requested account; unbound withdrawal is reserved for process-owned cleanup. */
	configure(options: IMissionControlOptions | undefined, withdrawingAccountId?: string): Promise<void> {
		if (!options) {
			if (withdrawingAccountId !== undefined && this._ownerAccount !== undefined && withdrawingAccountId !== this._ownerAccount) {
				return Promise.reject(new Error('Only the Agent Host owner can withdraw Mission Control registration'));
			}
			const registered = this._environment;
			const previous = this._options;
			this._withdraw();
			return this._configuration.queue(async () => {
				if (registered && previous && Date.now() >= this._heartbeatNotBefore) {
					await this._request(
						`cmc_internal/api/agents/environments/${encodeURIComponent(registered.id)}/heartbeat`,
						this._createHeartbeat('offline', undefined, previous),
						previous,
					);
				}
			});
		}
		const epoch = this._configurationEpoch;
		return this._configuration.queue(() => traceConnectionOperation(this._host.onDiagnostic, 'configure', () => this._configure(options, epoch)));
	}

	get environmentId(): string | undefined { return this._environment?.id; }
	get isEnabled(): boolean { return this._options?.live === true; }

	private _getIdentityApiBase(): string {
		return this._host.getIdentityApiBase?.() ?? 'https://api.github.com';
	}

	private _createHeartbeat(status: 'online' | 'offline', capabilities?: IEnvironmentCapabilities, options = this._options): object {
		return {
			name: options?.name ?? this._host.name,
			status,
			...(capabilities ? { capabilities } : {}),
			...(this._sealing.value ? { encryption_keys: this._sealing.value.advertisedKeys } : {}),
		};
	}

	private async _createRegistration(capabilities: IEnvironmentCapabilities, remoteControl: Record<string, unknown> | undefined): Promise<object> {
		return {
			name: this._options?.name ?? this._host.name,
			kind: 'user-local',
			compute_id: await this._computeId(),
			capabilities,
			labels: { embedder: 'vscode' },
			...(this._sealing.value ? { encryption_keys: this._sealing.value.advertisedKeys } : {}),
			...(remoteControl ? { managed_settings: { remoteControl } } : {}),
		};
	}

	private _withdraw(): void {
		this._configurationEpoch++;
		this._generation++;
		this._options = undefined;
		this._environment = undefined;
		this._roots = [];
		this._initialRoots = undefined;
		this._heartbeat.clear();
		this._handler.clear();
		this._mirrorAttachment.clear();
		this._server.clear();
		this._sealing.clear();
		this._mirror.value?.detach();
		this._verifier = undefined;
		this._signingKeys = undefined;
		this._tokenExpiresAt = undefined;
		this._requiresBootstrap = false;
		this._nextHeartbeatAt = 0;
	}

	private async _configure(options: IMissionControlOptions, epoch: number): Promise<void> {
		if (this._store.isDisposed) {
			throw new Error('Mission Control environment service is disposed');
		}
		if (epoch !== this._configurationEpoch) {
			return;
		}
		const endpoint = new URL(options.baseUrl);
		if ((options.live ? endpoint.protocol !== 'https:' : endpoint.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname))
			|| (options.live && endpoint.pathname !== '/')
			|| endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !options.credential || !options.accountId || (!options.live && options.roots.length === 0)
			|| (options.name !== undefined && !options.name.trim())) {
			throw new Error('Mission Control requires a safe origin, credential, account, and project roots');
		}
		if (this._ownerAccount && this._ownerAccount !== options.accountId) {
			throw new Error('Agent Host already belongs to another local account; restart the process to change owners');
		}
		const identityApiBase = this._getIdentityApiBase();
		if (options.live && (new URL(identityApiBase).protocol !== 'https:' || (this._identityApiBase && this._identityApiBase !== identityApiBase))) {
			throw new Error('Mission Control requires a stable HTTPS GitHub identity authority');
		}
		const owner = options.live ? await resolveMissionControlOwner(this._host.fetch, identityApiBase, options.credential) : options.accountId;
		if (epoch !== this._configurationEpoch || this._store.isDisposed) {
			return;
		}
		if (options.live && identityApiBase !== this._getIdentityApiBase()) {
			throw new Error('GitHub identity authority changed during Mission Control configuration');
		}
		if (this._canonicalOwner && this._canonicalOwner !== owner) {
			throw new Error('Credential does not match the Agent Host owner');
		}
		const roots = await Promise.all(options.roots.map(root => realpath(root)));
		if (epoch !== this._configurationEpoch || this._store.isDisposed) {
			return;
		}
		if (options.live && identityApiBase !== this._getIdentityApiBase()) {
			throw new Error('GitHub identity authority changed during Mission Control configuration');
		}
		if (!roots.every(root => root.startsWith('/') || /^[A-Za-z]:\\/.test(root))) {
			throw new Error('Mission Control projects must be absolute local directories');
		}
		if (this._options) {
			if (this._options.baseUrl !== options.baseUrl || this._options.name !== options.name || this._options.live !== options.live || this._options.requireConnectionBinding !== options.requireConnectionBinding
				|| (!options.live && JSON.stringify(this._roots) !== JSON.stringify(roots))) {
				throw new Error('Mission Control is already configured; disable it before changing its scope');
			}
			this._roots = [...new Set([...this._roots, ...roots])];
			if (this._options.credential !== options.credential || this._credentialRejected
				|| (this._options.useLocalCredentials === true) !== (options.useLocalCredentials === true)) {
				this._generation++;
				this._handler.clear();
				this._mirrorAttachment.clear();
				this._server.clear();
				this._heartbeat.clear();
				this._options = { ...options, roots: this._roots };
				this._credentialRejected = false;
				await this._checkIn();
			}
			return;
		}
		this._ownerAccount = options.accountId;
		this._canonicalOwner = owner;
		this._identityApiBase = identityApiBase;
		this._generation++;
		this._initialRoots ??= roots;
		this._roots = [...new Set([...this._roots, ...roots])];
		this._options = { ...options, roots: this._roots };
		this._credentialRejected = false;
		try {
			if (options.live) {
				await MissionControlSealing.ready();
				if (epoch !== this._configurationEpoch || this._store.isDisposed) {
					return;
				}
				this._sealing.value = new MissionControlSealing();
			}
			await this._checkIn();
		} catch (error) {
			if (epoch !== this._configurationEpoch || this._store.isDisposed) {
				throw error;
			}
			try {
				const registered = this._environment;
				const previous = this._options;
				this._withdraw();
				if (registered && previous && Date.now() >= this._heartbeatNotBefore) {
					await this._request(`cmc_internal/api/agents/environments/${encodeURIComponent(registered.id)}/heartbeat`, this._createHeartbeat('offline', undefined, previous), previous);
				}
			} catch (offlineError) {
				this._host.onError(offlineError);
			}
			throw error;
		}
	}

	/** The native Agent Host owns profile writes; atomic replacement keeps the location-bound identity record complete. */
	private async _computeId(): Promise<string> {
		await mkdir(this._host.userDataPath, { recursive: true });
		const directory = await realpath(this._host.userDataPath);
		const path = join(directory, 'agent-host-mission-control-id');
		let contents: string | undefined;
		try {
			contents = (await readFile(path, 'utf8')).trim();
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
				throw error;
			}
		}
		const legacyId = contents !== undefined && /^[0-9a-f-]{36}$/.test(contents) ? contents : undefined;
		if (contents !== undefined && legacyId === undefined) {
			let record: { version?: number; id?: string; userDataDirectory?: string } | null;
			try {
				record = JSON.parse(contents);
			} catch (error) {
				if (error instanceof SyntaxError) {
					throw new Error('Invalid persisted Mission Control compute identity');
				}
				throw error;
			}
			if (!record || typeof record !== 'object'
				|| record.version !== 1 || typeof record.id !== 'string' || !/^[0-9a-f-]{36}$/.test(record.id)
				|| typeof record.userDataDirectory !== 'string' || !record.userDataDirectory) {
				throw new Error('Invalid persisted Mission Control compute identity');
			}
			if (record.userDataDirectory === directory) {
				return record.id;
			}
		}
		const id = legacyId ?? randomUUID();
		const temporaryPath = join(directory, `agent-host-mission-control-id.${randomUUID()}.tmp`);
		const file = await open(temporaryPath, 'wx', 0o600);
		try {
			try {
				await file.writeFile(JSON.stringify({ version: 1, id, userDataDirectory: directory }));
				await file.sync();
			} finally {
				await file.close();
			}
			await rename(temporaryPath, path);
		} finally {
			await unlink(temporaryPath).catch((error: NodeJS.ErrnoException) => {
				if (error.code !== 'ENOENT') {
					throw error;
				}
			});
		}
		return id;
	}

	private async _request(path: string, body?: object, options = this._options): Promise<unknown> {
		const operation = path.endsWith('/register') ? 'register' : path.endsWith('/heartbeat') ? 'heartbeat' : path.endsWith('/token') ? 'token' : 'signingKeys';
		return traceConnectionOperation(this._host.onDiagnostic, operation, () => this._doRequest(path, body, options));
	}

	private async _doRequest(path: string, body: object | undefined, options: IMissionControlOptions | undefined): Promise<unknown> {
		if (!options) {
			throw new Error('Mission Control is disabled');
		}
		const generation = this._generation;
		const response = await this._host.fetch(new URL(path, `${options.baseUrl.replace(/\/$/, '')}/`), {
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
					this._host.onError(new Error('Mission Control heartbeat returned an invalid Retry-After header'));
				} else {
					this._heartbeatNotBefore = Math.max(this._heartbeatNotBefore, now + delay);
				}
			}
		}
		if (!response.ok) {
			if ((response.status === 401 || response.status === 403) && generation === this._generation && this._options === options) {
				this._credentialRejected = true;
				this._handler.clear();
				this._mirrorAttachment.clear();
				this._server.clear();
			}
			const requestId = getGitHubRequestId(response.headers.get('x-github-request-id'));
			const text = await response.text();
			let message: string | undefined;
			try {
				const data: { message?: string } | null = JSON.parse(text);
				if (typeof data === 'object' && data !== null && typeof data.message === 'string') {
					message = data.message;
				}
			} catch (error) {
				if (!(error instanceof SyntaxError)) {
					throw error;
				}
				message = text;
			}
			message = message ? sanitizeConnectionDiagnosticText(message) : undefined;
			throw new CloudSandboxRequestError(response.status, `Mission Control request failed (${response.status})${requestId ? ` (requestId=${requestId})` : ''}${message ? `: ${message}` : ''}`);
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
		const generation = this._generation;
		if (this._currentCheckIn?.generation === generation) {
			await this._currentCheckIn.operation;
			if (generation === this._generation && this._options && this._appliedPolicyRefresh !== this._policyRefresh) {
				return this._checkIn();
			}
			return;
		}
		const operation = traceConnectionOperation(this._host.onDiagnostic, 'checkIn', () => this._doCheckIn());
		const current = { generation, operation };
		this._currentCheckIn = current;
		try {
			await operation;
			if (generation === this._generation) {
				this._retryDelay = 500;
			}
		} catch (error) {
			if (generation === this._generation) {
				this._retryDelay = Math.min(30_000, this._retryDelay * 2);
			}
			throw error;
		} finally {
			if (this._currentCheckIn === current) {
				this._currentCheckIn = undefined;
			}
			if (generation === this._generation && this._options && !this._store.isDisposed && !this._credentialRejected) {
				const recovering = this._environment !== undefined && (!this._server.value || this._server.value.isClosed);
				const heartbeatDelay = Math.max(1000, this._nextHeartbeatAt - Date.now(), this._heartbeatNotBefore - Date.now());
				const tokenDelay = this._tokenExpiresAt === undefined ? heartbeatDelay : Math.max(1000, this._tokenExpiresAt - Date.now() - 30_000);
				const refreshingPolicy = this._options.live && this._appliedPolicyRefresh !== this._policyRefresh;
				this._heartbeat.value = disposableLongTimeout(() => {
					this._heartbeat.clear();
					this._checkIn().catch(this._host.onError);
				}, refreshingPolicy ? this._retryDelay : this._requiresBootstrap ? Math.max(this._retryDelay, heartbeatDelay) : recovering ? this._retryDelay : Math.min(heartbeatDelay, tokenDelay));
			}
		}
	}

	private async _doCheckIn(): Promise<void> {
		const options = this._options;
		const generation = this._generation;
		const policyRefresh = this._policyRefresh;
		if (!options || this._credentialRejected) {
			return;
		}
		const waiting = this._environment && Date.now() < Math.max(this._heartbeatNotBefore, this._nextHeartbeatAt);
		const recovering = this._environment && (!this._server.value || this._server.value.isClosed);
		const refreshToken = !this._requiresBootstrap && this._environment && (recovering || (this._tokenExpiresAt !== undefined && Date.now() >= this._tokenExpiresAt - 30_000));
		if (waiting && !refreshToken && this._appliedPolicyRefresh === policyRefresh) {
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
			if ((waiting || recovering) && this._appliedPolicyRefresh === policyRefresh) {
				if (recovering) {
					await this._connectRelay(options, generation);
				}
				return;
			}
		}
		const capabilities = { ahp_version: PROTOCOL_VERSION, features: [], current_sessions: await this._boundedRegistrationWork(this._host.getSessionCount?.() ?? Promise.resolve(0)) };
		let remoteControl: Record<string, unknown> | undefined;
		if (options.live) {
			if (!this._host.getRemoteControlPolicy) {
				throw new Error('Cannot register before reading device remote-control policy');
			}
			remoteControl = await this._boundedRegistrationWork(this._host.getRemoteControlPolicy());
		}
		if (generation !== this._generation || this._options !== options || this._store.isDisposed) {
			return;
		}
		const policy = JSON.stringify(remoteControl ?? null);
		const register = !this._environment || (options.live && policy !== this._policy);
		if (waiting && !register) {
			this._appliedPolicyRefresh = policyRefresh;
			if (recovering) {
				await this._connectRelay(options, generation);
			}
			return;
		}
		const path = !register && this._environment
			? `cmc_internal/api/agents/environments/${encodeURIComponent(this._environment.id)}/heartbeat`
			: 'cmc_internal/api/agents/environments/register';
		const body = !register
			? this._createHeartbeat(options.live && (!this._server.value || this._server.value.isClosed) ? 'offline' : 'online', capabilities)
			: await this._createRegistration(capabilities, remoteControl);
		if (generation !== this._generation || this._options !== options || this._store.isDisposed) {
			return;
		}
		const reply = await this._request(path, body, options);
		if (generation !== this._generation || this._options !== options || this._store.isDisposed) {
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
		if (options.live && this._host.createMirror && (!this._mirror.value || this._mirrorEnvironment !== response.id)) {
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
			const created = this._host.createMirror(response.id);
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
		this._appliedPolicyRefresh = policyRefresh;
		await this._connectRelay(options, generation);
	}

	private async _connectRelay(options: IMissionControlOptions, generation: number): Promise<void> {
		const response = this._environment;
		if (!response || generation !== this._generation || this._store.isDisposed) {
			return;
		}
		if (!this._signingKeys || Date.now() - this._signingKeysFetchedAt >= 5 * 60_000) {
			const jwks = await this._request('cmc_internal/api/agents/environments/.well-known/jwks.json', undefined, options);
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
			this._host.socketFactory,
			error => this._host.onError(error),
			sealing && identityApiBase ? () => new MissionControlAuthentication(
				sealing, response.user_id, identityApiBase, this._host.fetch, options.requireConnectionBinding === true,
				() => identityApiBase === this._getIdentityApiBase() && generation === this._generation,
				options.useLocalCredentials === true ? () => this._options?.credential : undefined,
			) : undefined,
			sealing?.rootMeta,
			this._mirror.value,
			this._host.createAhpLogger,
		);
		this._server.value = server;
		const connectionWatch = StopWatch.create(false);
		let relayReady = false;
		this._handler.value = combinedDisposable(this._host.attach(server, this._initialRoots ?? [], () => this._roots), server.onClose(() => {
			if (generation === this._generation && !this._store.isDisposed && this._server.value === server && this._options && !this._credentialRejected) {
				if (relayReady) {
					emitConnectionDiagnostic(this._host.onDiagnostic, { operationId: '', phase: 'relayDisconnected', timestamp: Date.now(), outcome: 'info', durationMs: connectionWatch.elapsed() });
				}
				this._heartbeat.value = disposableLongTimeout(() => {
					this._checkIn().catch(this._host.onError);
				}, this._retryDelay);
			}
		}));
		await traceConnectionOperation(this._host.onDiagnostic, 'relay', () => server.connect());
		connectionWatch.reset();
		relayReady = true;
		if (generation !== this._generation) {
			if (this._server.value === server) {
				this._handler.clear();
				this._server.clear();
			}
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
			await this._request(`cmc_internal/api/agents/environments/${encodeURIComponent(response.id)}/heartbeat`, this._createHeartbeat('online'), options);
		}
		if (generation === this._generation && this._options === options && !this._store.isDisposed) {
			this._host.onReady?.(response.id);
		}
	}

	private async _boundedRegistrationWork<T>(operation: Promise<T>): Promise<T> {
		const result = await raceTimeout(operation.then(value => ({ value })), 15_000);
		if (!result) {
			throw new Error('Mission Control registration metadata timed out');
		}
		return result.value;
	}
}
