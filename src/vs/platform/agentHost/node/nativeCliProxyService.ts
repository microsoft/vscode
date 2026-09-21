/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer, Sequencer } from '../../../base/common/async.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../base/common/path.js';
import { generateUuid, isUUID } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { INativeCliProxyConfiguration, INativeCliProxyModel, INativeCliProxyService, NativeCliProxyKind } from '../common/nativeCliProxy.js';
import { IAgentHostAuthenticationService } from './agentHostAuthenticationService.js';
import { IAgentHostGitHubEndpointService } from './agentHostGitHubEndpointService.js';
import { ClaudeProxyService, IClaudeProxyService } from './claude/claudeProxyService.js';
import { toSdkModelId } from './claude/claudeModelId.js';
import { CodexProxyService, ICodexProxyService } from './codex/codexProxyService.js';
import { ICopilotApiService } from './shared/copilotApiService.js';
import { getNativeCliProxyEnvironment } from '../common/nativeCliProxyConfiguration.js';
import { ILogService } from '../../log/common/log.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { SyncDescriptor } from '../../instantiation/common/descriptors.js';

interface IProxyLease {
	readonly kind: NativeCliProxyKind;
	readonly modelId: string;
	readonly configuration: INativeCliProxyConfiguration;
	readonly handle: IDisposable & { readonly baseUrl: string; readonly nonce: string; setToken(token: string): void };
	readonly store: DisposableStore;
	expiresAt: number;
	/** Credentials withdrawn, but the port stays bound until the CLI is gone. */
	revoked: boolean;
}

const LEASE_LIFETIME = 120_000;
const LEASE_REFRESH_INTERVAL = 30_000;

class NativeCliProxies {
	constructor(
		@IClaudeProxyService private readonly _claude: IClaudeProxyService,
		@ICodexProxyService private readonly _codex: ICodexProxyService,
	) { }

	start(kind: NativeCliProxyKind, token: string) {
		return kind === 'claude' ? this._claude.start(token) : this._codex.start(token);
	}
}

export class NativeCliProxyService extends Disposable implements INativeCliProxyService {
	declare readonly _serviceBrand: undefined;
	private readonly _leases = new Map<string, IProxyLease>();
	private readonly _queue = new Sequencer();
	private readonly _refreshTimer = this._register(new IntervalTimer());
	private _refreshTimerArmed = false;
	private _lastRefresh = Date.now();

	constructor(
		@IAgentHostAuthenticationService private readonly _authentication: IAgentHostAuthenticationService,
		@IAgentHostGitHubEndpointService private readonly _endpoints: IAgentHostGitHubEndpointService,
		@ICopilotApiService private readonly _api: ICopilotApiService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(_authentication.onDidChangeAuthToken(() => this._onAuthTokenChanged()));
		this._register(_endpoints.onDidChange(() => this._revokeAll()));
	}

	/**
	 * An explicit token change is authoritative: losing the token here means the user
	 * signed out, so every gateway is closed immediately.
	 */
	private _onAuthTokenChanged(): void {
		if (!this._currentToken()) {
			this._clear();
			return;
		}
		this._refreshTokens();
	}

	/** Only runs while leases exist; most users never open a native CLI terminal. */
	private _updateRefreshTimer(): void {
		const wanted = this._leases.size > 0 && !this._store.isDisposed;
		if (wanted === this._refreshTimerArmed) {
			return;
		}
		this._refreshTimerArmed = wanted;
		if (wanted) {
			this._lastRefresh = Date.now();
			this._refreshTimer.cancelAndSet(() => this._refreshTokens(), LEASE_REFRESH_INTERVAL);
		} else {
			this._refreshTimer.cancel();
		}
	}

	private _token(): string {
		const resource = this._endpoints.getCopilotResource();
		const token = this._authentication.getAuthToken({ resource: resource.resource, scopes: resource.scopes_supported });
		if (!token) {
			throw new Error(localize('nativeCliProxy.signIn', "Sign in to GitHub Copilot in the Agents Window before using Copilot-backed CLI sessions."));
		}
		return token;
	}

	/** The current token, or an empty string while it is momentarily unavailable. */
	private _currentToken(): string {
		const resource = this._endpoints.getCopilotResource();
		return this._authentication.getAuthToken({ resource: resource.resource, scopes: resource.scopes_supported }) ?? '';
	}

	async getNativeCliModels(kind: NativeCliProxyKind): Promise<readonly INativeCliProxyModel[]> {
		this._validateKind(kind);
		if (this._store.isDisposed) {
			throw new Error('Native CLI proxy service was disposed');
		}
		const models = await this._api.models(this._token(), { suppressIntegrationId: true });
		return models.filter(model => model.model_picker_enabled && model.policy?.state !== 'disabled'
			&& model.vendor.toLowerCase() === (kind === 'claude' ? 'anthropic' : 'openai')
			&& model.supported_endpoints?.includes(kind === 'claude' ? '/v1/messages' : '/responses'))
			.map(model => ({ id: model.id, name: model.name || model.id }));
	}

	startNativeCliProxy(sessionId: string, kind: NativeCliProxyKind, modelId?: string): Promise<INativeCliProxyConfiguration> {
		return this._queue.queue(async () => {
			this._validateKind(kind);
			if (!isUUID(sessionId) || this._store.isDisposed) {
				throw new Error('Invalid or disposed native CLI proxy session');
			}
			const existing = this._leases.get(sessionId);
			if (existing && !existing.revoked) {
				if (existing.kind !== kind || modelId !== undefined && existing.modelId !== modelId && toSdkModelId(existing.modelId) !== modelId) {
					throw new Error(localize('nativeCliProxy.modelLocked', "Stop the existing CLI before changing its Copilot model."));
				}
				existing.handle.setToken(this._token());
				existing.expiresAt = Date.now() + LEASE_LIFETIME;
				return existing.configuration;
			}
			if (existing) {
				this._leases.delete(sessionId);
				existing.store.dispose();
			}
			const token = this._token();
			const models = await this.getNativeCliModels(kind);
			// Callers round-trip the ids this service hands back, which are SDK-normalized
			// for Claude, so match against both spellings.
			const model = modelId === undefined
				? models[0]
				: models.find(model => model.id === modelId || kind === 'claude' && toSdkModelId(model.id) === modelId);
			if (!model) {
				if (modelId === undefined) {
					throw new Error(localize('nativeCliProxy.noModels', "No compatible models are available through your Copilot account for this CLI."));
				}
				throw new Error(localize('nativeCliProxy.modelUnavailable', "The selected model is not available through your Copilot account. Choose another Copilot model."));
			}
			const store = new DisposableStore();
			const instantiation = store.add(this._instantiationService.createChild(new ServiceCollection(
				[IClaudeProxyService, new SyncDescriptor(ClaudeProxyService)],
				[ICodexProxyService, new SyncDescriptor(CodexProxyService, [undefined])],
			)));
			let handle: IProxyLease['handle'];
			try {
				const proxies = instantiation.createInstance(NativeCliProxies);
				handle = store.add(await proxies.start(kind, token));
			} catch (error) {
				store.dispose();
				throw error;
			}
			if (this._store.isDisposed) {
				store.dispose();
				throw new Error('Native CLI proxy service was disposed');
			}
			let configuration: INativeCliProxyConfiguration = {
				leaseId: generateUuid(),
				baseUrl: handle.baseUrl,
				token: kind === 'claude' ? `${handle.nonce}.${sessionId}` : handle.nonce,
				model: kind === 'claude' ? toSdkModelId(model.id) : model.id,
				models: models.map(model => ({ ...model, id: kind === 'claude' ? toSdkModelId(model.id) : model.id })),
			};
			try {
				if (kind === 'claude') {
					const directory = await fs.mkdtemp(join(tmpdir(), 'vscode-cli-gateway-'));
					store.add(toDisposable(() => {
						void fs.rm(directory, { recursive: true, force: true }).catch(error => this._logService.error('Could not remove native CLI gateway settings', error));
					}));
					const settingsFile = join(directory, 'settings.json');
					await fs.writeFile(settingsFile, JSON.stringify({ env: getNativeCliProxyEnvironment(kind, configuration) }), { mode: 0o600 });
					configuration = { ...configuration, settingsFile };
				}
				if (this._store.isDisposed) {
					throw new Error('Native CLI proxy service was disposed');
				}
				if (this._token() !== token) {
					throw new Error(localize('nativeCliProxy.accountChanged', "The Copilot account changed while preparing the CLI. Try again."));
				}
				this._leases.set(sessionId, { kind, modelId: model.id, configuration, handle, store, expiresAt: Date.now() + LEASE_LIFETIME, revoked: false });
				this._updateRefreshTimer();
			} catch (error) {
				store.dispose();
				throw error;
			}
			return configuration;
		});
	}

	async retainNativeCliProxy(sessionId: string, leaseId: string): Promise<boolean> {
		const lease = this._leases.get(sessionId);
		if (!lease || lease.configuration.leaseId !== leaseId || lease.revoked || lease.expiresAt < Date.now()) {
			return false;
		}
		// A momentarily missing token must not fail the retain: that would tear down a
		// healthy CLI. The gateway answers 401 until the token comes back.
		lease.handle.setToken(this._currentToken());
		lease.expiresAt = Date.now() + LEASE_LIFETIME;
		return true;
	}

	async releaseNativeCliProxy(sessionId: string, leaseId: string): Promise<void> {
		const lease = this._leases.get(sessionId);
		if (lease?.configuration.leaseId === leaseId) {
			this._leases.delete(sessionId);
			lease.store.dispose();
			this._updateRefreshTimer();
		}
	}

	private _refreshTokens(): void {
		const now = Date.now();
		// Both this timer and the renderer heartbeat stop while the machine sleeps, so a
		// long gap means "resumed", not "expired" — reaping here would kill live CLIs.
		const resumed = this._refreshTimerArmed && now - this._lastRefresh > LEASE_REFRESH_INTERVAL * 2;
		this._lastRefresh = now;
		const token = this._currentToken();
		for (const [sessionId, lease] of this._leases) {
			if (resumed && !lease.revoked) {
				lease.expiresAt = now + LEASE_LIFETIME;
			}
			if (lease.expiresAt < now) {
				this._leases.delete(sessionId);
				lease.store.dispose();
				continue;
			}
			// A token that is momentarily absent between refreshes is not a sign-out (that
			// arrives as an explicit change event), so the gateway stays up and answers 401.
			lease.handle.setToken(lease.revoked ? '' : token);
		}
		this._updateRefreshTimer();
	}

	/**
	 * Withdraws credentials without freeing the port. Closing the listener while the CLI
	 * is still running would let any local process bind it and receive the next request.
	 * Revoked leases stop being retained, so they are reaped once they expire.
	 */
	private _revokeAll(): void {
		for (const lease of this._leases.values()) {
			lease.revoked = true;
			lease.handle.setToken('');
		}
	}

	private _validateKind(kind: NativeCliProxyKind): void {
		if (kind !== 'claude' && kind !== 'codex') {
			throw new Error('Unsupported native CLI proxy kind');
		}
	}

	private _clear(): void {
		for (const lease of this._leases.values()) {
			lease.store.dispose();
		}
		this._leases.clear();
		this._updateRefreshTimer();
	}

	releaseNativeCliResources(): void {
		this._clear();
	}

	override dispose(): void {
		this._clear();
		super.dispose();
	}
}
