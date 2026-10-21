/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { CloudSandboxAuthenticationRequiredError, CloudSandboxEarlyPreparationSettingId, CloudSandboxEnabledSettingId, ICloudSandboxApiService, ICloudSandboxCreatedSession, ICloudSandboxDraftPreparationService, ICloudSandboxPreparedReservation, ICloudSandboxSubmittedDraft, isCloudSandboxEnabled } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ChatAIDisabledSettingId } from '../../../../../platform/chat/common/chatSettings.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { logSettingExperimentTrigger } from '../../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';

const UNUSED_RESERVATION_LIFETIME_MS = 5 * 60_000;
const RESERVATION_WAIT_TIMEOUT_MS = 5 * 60_000;
const LOG_PREFIX = '[CloudSandboxPreparation]';

type PreparationSkipReason = 'featureDisabled' | 'aiDisabled' | 'aiHidden' | 'workspaceUntrusted' | 'settingDisabled' | 'unavailable';
type PreparationReleaseReason = 'expired' | 'repositoryChanged' | 'accountChanged' | 'disabled' | 'discarded' | 'reservationFailed' | 'sendAborted' | 'returnedBeforeSubmit';

interface IPreparation {
	readonly id: number;
	readonly startedAt: number;
	readonly store: DisposableStore;
	readonly source: CancellationTokenSource;
	readonly repoNwo: string | undefined;
	readonly reservation: Promise<ICloudSandboxPreparedReservation>;
	state: 'draft' | 'taking' | 'transferred' | 'discarded';
	accountKey?: string;
	receivedAt?: number;
	expiresAt?: number;
	expiry?: IDisposable;
	cleanup?: Promise<void>;
	submitted?: ICloudSandboxSubmittedDraft;
}

export class CloudSandboxDraftPreparationService extends Disposable implements ICloudSandboxDraftPreparationService {
	declare readonly _serviceBrand: undefined;

	private readonly _entries = new ResourceMap<IPreparation | 'unavailable'>();
	private readonly _claims = new WeakMap<ICloudSandboxPreparedReservation, IPreparation>();
	private readonly _skipReasons = new ResourceMap<PreparationSkipReason>();
	private readonly _lifetimes = this._register(new DisposableStore());
	private readonly _source = this._register(new CancellationTokenSource());
	private _nextPreparationId = 0;

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
					void this._release(entry, 'accountChanged');
				} else if (entry.state === 'taking') {
					entry.source.cancel();
				}
			}
		}));
	}

	private _unavailableReason(): PreparationSkipReason | undefined {
		if (!isCloudSandboxEnabled(this._configurationService)) {
			return 'featureDisabled';
		}
		if (this._configurationService.getValue<boolean>(ChatAIDisabledSettingId) === true) {
			return 'aiDisabled';
		}
		if (this._chatEntitlementService.sentiment.hidden) {
			return 'aiHidden';
		}
		if (!this._workspaceTrustService.isWorkspaceTrusted()) {
			return 'workspaceUntrusted';
		}
		return undefined;
	}

	private _isEnabled(): boolean {
		return this._unavailableReason() === undefined && this._configurationService.getValue<boolean>(CloudSandboxEarlyPreparationSettingId) === true;
	}

	prepare(draftResource: URI, repoNwo?: string): void {
		this._checkCancellation(this._source.token);
		this.updateRepository(draftResource, repoNwo);
		const unavailableReason = this._unavailableReason();
		if (unavailableReason) {
			this._logSkipped(draftResource, unavailableReason);
			return;
		}
		logSettingExperimentTrigger(this._telemetryService, CloudSandboxEarlyPreparationSettingId);
		if (!this._isEnabled()) {
			this._logSkipped(draftResource, this._unavailableReason() ?? 'settingDisabled');
			return;
		}
		const previous = this._entries.get(draftResource);
		if (previous) {
			if (previous === 'unavailable' || previous.state === 'discarded') {
				this._logSkipped(draftResource, 'unavailable');
			}
			return;
		}
		this._skipReasons.delete(draftResource);
		const store = this._lifetimes.add(new DisposableStore());
		const source = store.add(new CancellationTokenSource(this._source.token));
		const entry: IPreparation = {
			id: ++this._nextPreparationId,
			startedAt: Date.now(),
			store,
			source,
			repoNwo,
			state: 'draft',
			reservation: Promise.resolve().then(() => this._reserve(entry)),
		};
		this._entries.set(draftResource, entry);
		this._logEvent(entry, 'started', `hasRepository=${repoNwo !== undefined}`);
		void entry.reservation.then(prepared => {
			entry.receivedAt = Date.now();
			this._logEvent(entry, 'receipt', `taskId=${JSON.stringify(prepared.taskId)} environmentId=${JSON.stringify(prepared.environmentId)}`);
			if (entry.state === 'draft') {
				entry.expiresAt = Math.min(Date.now() + UNUSED_RESERVATION_LIFETIME_MS, prepared.reservationExpiresAt);
				entry.expiry = disposableTimeout(() => {
					void this._release(entry, 'expired');
				}, Math.max(0, entry.expiresAt - Date.now()), store);
			}
		}, error => {
			this._lifetimes.delete(store);
			if (entry.state === 'draft') {
				entry.state = 'discarded';
				if (this._entries.get(draftResource) === entry) {
					this._entries.set(draftResource, 'unavailable');
				}
				this._logEvent(entry, 'reservationFailed', `cancelled=${isCancellationError(error)}`);
			}
			if (!isCancellationError(error)) {
				this._logService.warn(`${LOG_PREFIX} Task reservation failed; it will not be retried automatically.`, error);
			}
		});
	}

	updateRepository(draftResource: URI, repoNwo: string | undefined): void {
		const entry = this._entries.get(draftResource);
		if (entry && entry !== 'unavailable' && entry.state === 'draft' && entry.repoNwo?.toLowerCase() !== repoNwo?.toLowerCase()) {
			void this._release(entry, 'repositoryChanged');
		}
	}

	private async _reserve(entry: IPreparation): Promise<ICloudSandboxPreparedReservation> {
		this._checkCancellation(entry.source.token);
		const accountKey = await raceCancellationError(this._api.getAccountKey(), entry.source.token);
		this._checkCancellation(entry.source.token);
		if (!accountKey) {
			throw new CloudSandboxAuthenticationRequiredError();
		}
		entry.accountKey = accountKey;
		// Keep listening for the receipt so abandoned drafts can clean up late reservations.
		const reservation = await this._api.reserveSession({ repoNwo: entry.repoNwo, expectedAccountKey: accountKey }, CancellationToken.None);
		return { ...reservation, expectedAccountKey: accountKey };
	}

	async take(draftResource: URI, token: CancellationToken): Promise<ICloudSandboxPreparedReservation | undefined> {
		this._checkCancellation(token);
		const entry = this._entries.get(draftResource);
		if (!entry || entry === 'unavailable') {
			this._logService.info(`${LOG_PREFIX} event=sendWithoutReservation reason=${this._skipReasons.get(draftResource) ?? (entry ? 'unavailable' : 'notStarted')}`);
			this._entries.set(draftResource, 'unavailable');
			return undefined;
		}
		if (entry.state === 'taking' || entry.state === 'transferred') {
			this._logEvent(entry, 'sendBlocked', 'reason=alreadyTaken');
			throw new Error(localize('cloudSandbox.preparationAlreadyClaimed', "This draft's reservation has already been claimed by Send."));
		}
		if (entry.state === 'discarded' || !this._isEnabled() || (entry.expiresAt !== undefined && entry.expiresAt <= Date.now())) {
			const reason = !this._isEnabled() ? 'disabled' : entry.state === 'discarded' ? 'discarded' : 'expired';
			void this._release(entry, reason);
			this._logEvent(entry, 'sendWithoutReservation', `reason=${reason}`);
			this._entries.set(draftResource, 'unavailable');
			return undefined;
		}

		entry.state = 'taking';
		entry.expiry?.dispose();
		const waitStartedAt = Date.now();
		this._logEvent(entry, 'sendWait', `receipt=${entry.receivedAt === undefined ? 'pending' : 'received'}`);
		let timedOut = false;
		const claim = new DisposableStore();
		claim.add(token.onCancellationRequested(() => entry.source.cancel()));
		claim.add(disposableTimeout(() => {
			if (!entry.source.token.isCancellationRequested) {
				timedOut = true;
				entry.source.cancel();
			}
		}, RESERVATION_WAIT_TIMEOUT_MS));
		try {
			this._checkCancellation(entry.source.token);
			let prepared: ICloudSandboxPreparedReservation;
			try {
				prepared = await raceCancellationError(entry.reservation, entry.source.token);
			} catch (error) {
				this._checkCancellation(entry.source.token);
				if (isCancellationError(error) || error instanceof CloudSandboxAuthenticationRequiredError) {
					throw error;
				}
				this._logService.warn(`${LOG_PREFIX} Reservation unavailable during Send; continuing with normal task creation.`, error);
				this._logEvent(entry, 'sendFallback', `reason=reservationFailed waitMs=${Math.max(0, Date.now() - waitStartedAt)}`);
				void this._release(entry, 'reservationFailed');
				return undefined;
			}
			await this._verifyAccount(prepared, entry.source.token);
			this._checkCancellation(entry.source.token);
			entry.state = 'transferred';
			this._claims.set(prepared, entry);
			this._logEvent(entry, 'handoff', `taskId=${JSON.stringify(prepared.taskId)} waitMs=${Math.max(0, Date.now() - waitStartedAt)}`);
			return prepared;
		} catch (error) {
			void this._release(entry, 'sendAborted');
			this._checkCancellation(token);
			if (timedOut) {
				this._logService.warn(`${LOG_PREFIX} Reservation wait timed out; continuing with normal task creation.`, error);
				this._logEvent(entry, 'sendFallback', `reason=waitTimedOut waitMs=${Math.max(0, Date.now() - waitStartedAt)}`);
				return undefined;
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

	private async _verifyAccount(prepared: ICloudSandboxPreparedReservation, token: CancellationToken): Promise<void> {
		this._checkCancellation(token);
		const accountKey = await raceCancellationError(this._api.getAccountKey(), token);
		this._checkCancellation(token);
		if (accountKey !== prepared.expectedAccountKey) {
			throw new CancellationError();
		}
	}

	getSubmittedDraft(draftResource: URI): ICloudSandboxSubmittedDraft | undefined {
		const entry = this._entries.get(draftResource);
		return entry && entry !== 'unavailable' ? entry.submitted : undefined;
	}

	markSubmitted(reservation: ICloudSandboxPreparedReservation, created: ICloudSandboxCreatedSession, repoNwo: string | undefined): void {
		const entry = this._claims.get(reservation);
		if (!entry || entry.state !== 'transferred') {
			throw new Error(localize('cloudSandbox.unknownPreparedReservation', "This reservation was not handed off by draft preparation."));
		}
		entry.submitted = { reservation, created, repoNwo };
	}

	async release(prepared: ICloudSandboxPreparedReservation): Promise<void> {
		const entry = this._claims.get(prepared);
		if (!entry) {
			throw new Error(localize('cloudSandbox.unknownPreparedReservation', "This reservation was not handed off by draft preparation."));
		}
		if (entry.submitted) {
			throw new Error(localize('cloudSandbox.submittedReservation', "A submitted cloud task cannot be released as unused preparation."));
		}
		await this._release(entry, 'returnedBeforeSubmit');
	}

	async discard(draftResource: URI): Promise<void> {
		const entry = this._entries.get(draftResource);
		if (entry && typeof entry !== 'string' && (entry.state === 'draft' || entry.state === 'discarded')) {
			await this._release(entry, this._isEnabled() ? 'discarded' : 'disabled');
		}
	}

	async clear(): Promise<void> {
		await Promise.all([...this._entries.keys()].map(resource => this.discard(resource)));
	}

	async forget(draftResource: URI): Promise<void> {
		const discarded = this.discard(draftResource);
		this._entries.delete(draftResource);
		this._skipReasons.delete(draftResource);
		await discarded;
	}

	private _release(entry: IPreparation, reason: PreparationReleaseReason): Promise<void> {
		if (entry.cleanup) {
			return entry.cleanup;
		}
		entry.state = 'discarded';
		this._logEvent(entry, 'releaseRequested', `reason=${reason}`);
		entry.source.cancel();
		this._lifetimes.delete(entry.store);
		entry.cleanup = entry.reservation.then(prepared => this._deleteUnusedReservation(entry, prepared), () => {
			this._logService.debug(`${LOG_PREFIX} preparationId=${entry.id} No reservation receipt is available for draft cleanup.`);
		});
		return entry.cleanup;
	}

	private async _deleteUnusedReservation(entry: IPreparation, prepared: ICloudSandboxPreparedReservation): Promise<void> {
		const startedAt = Date.now();
		try {
			await this._api.deleteTask(prepared.taskId, CancellationToken.None, prepared.expectedAccountKey);
			this._logEvent(entry, 'released', `taskId=${JSON.stringify(prepared.taskId)} durationMs=${Math.max(0, Date.now() - startedAt)}`);
		} catch (error) {
			this._logService.warn(`${LOG_PREFIX} Could not delete unused reservation ${prepared.taskId}; cleanup is incomplete.`, error);
			this._logEvent(entry, 'releaseFailed', `taskId=${JSON.stringify(prepared.taskId)} durationMs=${Math.max(0, Date.now() - startedAt)}`);
		}
	}

	private _logSkipped(draftResource: URI, reason: PreparationSkipReason): void {
		if (this._skipReasons.get(draftResource) !== reason) {
			this._skipReasons.set(draftResource, reason);
			this._logService.info(`${LOG_PREFIX} event=skipped reason=${reason}`);
		}
	}

	private _logEvent(entry: IPreparation, event: 'started' | 'receipt' | 'reservationFailed' | 'sendWait' | 'handoff' | 'sendBlocked' | 'sendWithoutReservation' | 'sendFallback' | 'releaseRequested' | 'released' | 'releaseFailed', details: string): void {
		this._logService.info(`${LOG_PREFIX} preparationId=${entry.id} event=${event} state=${entry.state} elapsedMs=${Math.max(0, Date.now() - entry.startedAt)} ${details}`);
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
		this._skipReasons.clear();
		super.dispose();
	}
}
