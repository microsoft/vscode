/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, raceCancellationError, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { CloudSandboxAuthenticationRequiredError, CloudSandboxEarlyPreparationSettingId, CloudSandboxEnabledSettingId, CloudSandboxRequestError, ICloudSandboxApiService, ICloudSandboxDraftPreparationService, ICloudSandboxEnvironment, ICloudSandboxPreparedEnvironment, isCloudSandboxEnabled, isRetryableCloudSandboxError } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ChatAIDisabledSettingId } from '../../../../../platform/chat/common/chatSettings.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { missionControlMaxRetries, missionControlRetryDelay } from '../../../../../platform/github/common/missionControl/missionControlError.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { logSettingExperimentTrigger } from '../../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';

const UNUSED_ENVIRONMENT_LIFETIME_MS = 5 * 60_000;
const READINESS_TIMEOUT_MS = 5 * 60_000;
const READINESS_POLL_INTERVAL_MS = 1_000;
const LOG_PREFIX = '[CloudSandboxPreparation]';

interface IPreparation {
	readonly store: DisposableStore;
	readonly source: CancellationTokenSource;
	readonly allocation: Promise<ICloudSandboxPreparedEnvironment>;
	state: 'draft' | 'claiming' | 'transferred' | 'discarded';
	accountKey?: string;
	expiresAt?: number;
	expiry?: IDisposable;
	cleanup?: Promise<void>;
}

export class CloudSandboxDraftPreparationService extends Disposable implements ICloudSandboxDraftPreparationService {
	declare readonly _serviceBrand: undefined;

	private readonly _entries = new ResourceMap<IPreparation | 'unavailable'>();
	private readonly _claims = new WeakMap<ICloudSandboxPreparedEnvironment, IPreparation>();
	private readonly _lifetimes = this._register(new DisposableStore());
	private readonly _source = this._register(new CancellationTokenSource());

	constructor(
		@ICloudSandboxApiService private readonly _api: ICloudSandboxApiService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustService: IWorkspaceTrustManagementService,
	) {
		super();
		const updateEnablement = () => {
			if (!this._isEnabled()) {
				void this.clear();
			}
		};
		this._register(this._configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(CloudSandboxEarlyPreparationSettingId)
				|| event.affectsConfiguration(CloudSandboxEnabledSettingId)
				|| event.affectsConfiguration(RemoteAgentHostsEnabledSettingId)
				|| event.affectsConfiguration(ChatAIDisabledSettingId)) {
				updateEnablement();
			}
		}));
		this._register(this._chatEntitlementService.onDidChangeSentiment(updateEnablement));
		this._register(this._workspaceTrustService.onDidChangeTrust(updateEnablement));
		this._register(this._api.onDidChangeAccount(accountKey => {
			for (const entry of this._entries.values()) {
				if (typeof entry === 'string' || entry.accountKey === undefined || entry.accountKey === accountKey) {
					continue;
				}
				if (entry.state === 'draft') {
					void this._release(entry);
				} else if (entry.state === 'claiming') {
					entry.source.cancel();
				}
			}
		}));
	}

	private _isAvailable(): boolean {
		return isCloudSandboxEnabled(this._configurationService)
			&& this._configurationService.getValue<boolean>(ChatAIDisabledSettingId) !== true
			&& !this._chatEntitlementService.sentiment.hidden
			&& this._workspaceTrustService.isWorkspaceTrusted();
	}

	private _isEnabled(): boolean {
		return this._isAvailable() && this._configurationService.getValue<boolean>(CloudSandboxEarlyPreparationSettingId) === true;
	}

	prepare(draftResource: URI): void {
		this._checkCancellation(this._source.token);
		if (!this._isAvailable()) {
			return;
		}
		logSettingExperimentTrigger(this._telemetryService, CloudSandboxEarlyPreparationSettingId);
		if (!this._isEnabled() || this._entries.has(draftResource)) {
			return;
		}
		const store = this._lifetimes.add(new DisposableStore());
		const source = store.add(new CancellationTokenSource(this._source.token));
		const entry: IPreparation = {
			store,
			source,
			state: 'draft',
			allocation: Promise.resolve().then(() => this._allocate(entry)),
		};
		this._entries.set(draftResource, entry);
		void entry.allocation.then(() => {
			if (entry.state === 'draft') {
				entry.expiresAt = Date.now() + UNUSED_ENVIRONMENT_LIFETIME_MS;
				entry.expiry = disposableTimeout(() => {
					void this._release(entry);
				}, UNUSED_ENVIRONMENT_LIFETIME_MS, store);
			}
		}, error => {
			this._lifetimes.delete(store);
			if (!isCancellationError(error)) {
				this._logService.warn(`${LOG_PREFIX} Environment preparation failed; it will not be retried automatically.`, error);
			}
		});
	}

	private async _allocate(entry: IPreparation): Promise<ICloudSandboxPreparedEnvironment> {
		this._checkCancellation(entry.source.token);
		const accountKey = await raceCancellationError(this._api.getAccountKey(), entry.source.token);
		this._checkCancellation(entry.source.token);
		if (!accountKey) {
			throw new CloudSandboxAuthenticationRequiredError();
		}
		entry.accountKey = accountKey;
		// Keep listening for the allocation receipt so abandoned drafts can clean up late results.
		const environmentId = await this._api.provisionEnvironment(CancellationToken.None, accountKey);
		return { environmentId, expectedAccountKey: accountKey };
	}

	async take(draftResource: URI, token: CancellationToken): Promise<ICloudSandboxPreparedEnvironment | undefined> {
		this._checkCancellation(token);
		const entry = this._entries.get(draftResource);
		if (!entry || entry === 'unavailable') {
			this._entries.set(draftResource, 'unavailable');
			return undefined;
		}
		if (entry.state === 'claiming' || entry.state === 'transferred') {
			throw new Error(localize('cloudSandbox.preparationAlreadyClaimed', "This draft's prepared environment has already been claimed by Send."));
		}
		if (entry.state === 'discarded' || !this._isEnabled() || (entry.expiresAt !== undefined && entry.expiresAt <= Date.now())) {
			void this._release(entry);
			this._entries.set(draftResource, 'unavailable');
			return undefined;
		}

		entry.state = 'claiming';
		entry.expiry?.dispose();
		let timedOut = false;
		const claim = new DisposableStore();
		claim.add(token.onCancellationRequested(() => entry.source.cancel()));
		claim.add(disposableTimeout(() => {
			timedOut = true;
			entry.source.cancel();
		}, READINESS_TIMEOUT_MS));
		try {
			this._checkCancellation(entry.source.token);
			const prepared = await raceCancellationError(entry.allocation, entry.source.token);
			await this._verifyAccount(prepared, entry.source.token);
			await this._waitForReady(prepared.environmentId, entry.source.token);
			await this._verifyAccount(prepared, entry.source.token);
			this._checkCancellation(entry.source.token);
			entry.state = 'transferred';
			this._claims.set(prepared, entry);
			return prepared;
		} catch (error) {
			void this._release(entry);
			if (timedOut) {
				throw new Error(localize('cloudSandbox.preparationTimedOut', "The prepared cloud environment was not ready after {0} seconds.", READINESS_TIMEOUT_MS / 1000));
			}
			throw error;
		} finally {
			claim.dispose();
			this._lifetimes.delete(entry.store);
			if (this._entries.get(draftResource) === entry && entry.state !== 'transferred') {
				this._entries.set(draftResource, 'unavailable');
			}
		}
	}

	private async _verifyAccount(prepared: ICloudSandboxPreparedEnvironment, token: CancellationToken): Promise<void> {
		this._checkCancellation(token);
		const accountKey = await raceCancellationError(this._api.getAccountKey(), token);
		this._checkCancellation(token);
		if (accountKey !== prepared.expectedAccountKey) {
			throw new CancellationError();
		}
	}

	private async _waitForReady(environmentId: string, token: CancellationToken): Promise<void> {
		let failures = 0;
		while (true) {
			this._checkCancellation(token);
			let environment: ICloudSandboxEnvironment;
			try {
				environment = await raceCancellationError(this._api.getEnvironment(environmentId, token), token);
			} catch (error) {
				if (isCancellationError(error) || token.isCancellationRequested || error instanceof CloudSandboxAuthenticationRequiredError || !isRetryableCloudSandboxError(error)) {
					throw error;
				}
				const requestError = error instanceof CloudSandboxRequestError ? error : undefined;
				if (++failures > missionControlMaxRetries(requestError?.code)) {
					throw error;
				}
				const delay = missionControlRetryDelay(requestError?.code, requestError?.retryAfterSeconds, failures);
				this._logService.warn(`${LOG_PREFIX} Environment readiness check failed; retrying in ${delay}ms.`);
				await timeout(delay, token);
				continue;
			}
			failures = 0;
			this._checkCancellation(token);
			if (environment.id !== environmentId) {
				throw new Error(localize('cloudSandbox.preparationEnvironmentMismatch', "The readiness response belongs to a different cloud environment."));
			}
			switch (environment.status) {
				case 'online':
					return;
				case 'offline':
				case 'waking':
				case 'degraded':
					await timeout(READINESS_POLL_INTERVAL_MS, token);
					break;
				default:
					throw new Error(localize('cloudSandbox.preparationUnavailable', "The prepared cloud environment is not available for a new session."));
			}
		}
	}

	async release(prepared: ICloudSandboxPreparedEnvironment): Promise<void> {
		const entry = this._claims.get(prepared);
		if (!entry) {
			throw new Error(localize('cloudSandbox.unknownPreparedEnvironment', "This environment was not handed off by draft preparation."));
		}
		await this._release(entry);
	}

	async discard(draftResource: URI): Promise<void> {
		const entry = this._entries.get(draftResource);
		if (entry && typeof entry !== 'string' && (entry.state === 'draft' || entry.state === 'discarded')) {
			await this._release(entry);
		}
	}

	async clear(): Promise<void> {
		await Promise.all([...this._entries.keys()].map(resource => this.discard(resource)));
	}

	async forget(draftResource: URI): Promise<void> {
		const discarded = this.discard(draftResource);
		this._entries.delete(draftResource);
		await discarded;
	}

	private _release(entry: IPreparation): Promise<void> {
		if (entry.cleanup) {
			return entry.cleanup;
		}
		entry.state = 'discarded';
		entry.source.cancel();
		this._lifetimes.delete(entry.store);
		entry.cleanup = entry.allocation.then(prepared => this._deleteUnusedEnvironment(prepared), () => {
			this._logService.debug(`${LOG_PREFIX} No allocation receipt is available for draft cleanup.`);
		});
		return entry.cleanup;
	}

	private async _deleteUnusedEnvironment(prepared: ICloudSandboxPreparedEnvironment): Promise<void> {
		try {
			await this._api.deleteEnvironment(prepared.environmentId, prepared.expectedAccountKey, CancellationToken.None);
		} catch (error) {
			this._logService.warn(`${LOG_PREFIX} Could not delete unused environment ${prepared.environmentId}; cleanup is incomplete.`, error);
		}
	}

	private _checkCancellation(token: CancellationToken): void {
		if (token.isCancellationRequested || this._source.token.isCancellationRequested) {
			throw new CancellationError();
		}
	}

	override dispose(): void {
		void this.clear();
		this._source.cancel();
		this._entries.clear();
		super.dispose();
	}
}
