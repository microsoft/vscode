/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, Sequencer } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { IAgentSessionMetadata } from '../../../../platform/agentHost/common/agent.js';
import { IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { CODEX_ACCOUNT_REFRESH_REQUEST_KEY } from '../../../../platform/agentHost/common/codexAccount.js';
import { ROOT_STATE_URI } from '../../../../platform/agentHost/common/state/sessionState.js';
import { ActionType } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { logSettingExperimentTrigger } from '../../../../platform/telemetry/common/experimentTrigger.js';
import { hasUsableCopilotPremiumQuota, IChatEntitlementService } from '../../chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IHostService } from '../../host/browser/host.js';
import { ICodexAccountService, shouldShowCodexAccount } from './codexAccountService.js';
import { CODEX_CONTINUATION_DEFAULT_THRESHOLD, CODEX_CONTINUATION_MAX_AGE, CodexContinuationSurface, getCodexContinuationCandidates, getCodexTriggeringLimits, ICodexContinuationCandidate, ICodexContinuationEpisode, updateCodexEpisode } from './codexContinuation.js';

export const CODEX_CONTINUATION_SETTING = 'chat.experimental.codexContinuation.enabled';
export const CODEX_CONTINUATION_THRESHOLD_SETTING = 'chat.experimental.codexContinuation.thresholdPercent';
export const CODEX_CONTINUATION_STORAGE_KEY = 'agentHost.codexContinuation';
export type CodexContinuationAction = 'shown' | 'continueClicked' | 'dismissed' | 'dontShowAgain' | 'guideShown' | 'guideCompleted' | 'guideCancelled' | 'guideUnavailable';
interface IStoredContinuation {
	readonly permanent?: 'disabled' | 'completed';
	readonly reservation?: { readonly owner: string; readonly until: number };
	readonly episode?: ICodexContinuationEpisode;
}
export const ICodexContinuationService = createDecorator<ICodexContinuationService>('codexContinuationService');
export interface ICodexContinuationService {
	readonly _serviceBrand: undefined;
	readonly candidate: IObservable<ICodexContinuationCandidate | undefined>;
	readonly revision: IObservable<number>;
	/** Whether this window is showing a claimed notice or its guide. */
	readonly isVisible: IObservable<boolean>;
	/** Scopes contextual accessibility help to an actually visible surface. */
	trackVisibility(): IDisposable;
	setActiveSession(resource: URI | undefined): void;
	setSelectableModels(models: readonly { readonly id: string; readonly vendor: string }[]): void;
	refresh(): void;
	/** Previews the real flow without quota/treatment gating, shared suppression writes, or telemetry. */
	showPreview(): Promise<boolean>;
	/** Ends a developer preview when its notice or guided action is closed. */
	endPreview(): void;
	resolve(candidate?: ICodexContinuationCandidate, activeSession?: string, allowCommittedTarget?: boolean): Promise<ICodexContinuationCandidate | undefined>;
	wouldShow(surface: CodexContinuationSurface): Promise<boolean>;
	reservePresentation(): Promise<boolean>;
	releasePresentation(): Promise<void>;
	markVisible(surface: CodexContinuationSurface, candidate: ICodexContinuationCandidate, isVisible?: () => boolean): Promise<boolean>;
	ownsEpisode(): boolean;
	dismiss(surface: CodexContinuationSurface): void;
	disable(surface: CodexContinuationSurface): Promise<void>;
	complete(surface: CodexContinuationSurface): Promise<void>;
	log(action: CodexContinuationAction, surface: CodexContinuationSurface): void;
}

type InteractionEvent = { action: CodexContinuationAction; surface: CodexContinuationSurface; limitKind: 'fiveHour' | 'weekly' | 'both' };
type InteractionClassification = {
	owner: 'Giuspepe';
	comment: 'Treatment-only ChatGPT to Copilot continuation funnel. Eligibility uses the shared experiment trigger.';
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded nudge or guide interaction.' };
	surface: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The window surface presenting the nudge.' };
	limitKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Supported ChatGPT window that triggered the suggestion: fiveHour, weekly, or both.' };
};

export class CodexContinuationService extends Disposable implements ICodexContinuationService {
	declare readonly _serviceBrand: undefined;
	private readonly _candidate = observableValue<ICodexContinuationCandidate | undefined>(this, undefined);
	readonly candidate = this._candidate;
	private readonly _revision = observableValue(this, 0);
	readonly revision = this._revision;
	private readonly _visibleSurfaces = observableValue(this, 0);
	readonly isVisible = derived(this, reader => this._visibleSurfaces.read(reader) > 0);
	private readonly _owner = generateUuid();
	private readonly _evaluate = this._register(new RunOnceScheduler(() => { void this._update().catch(onUnexpectedError); }, 100));
	private readonly _expiry = this._register(new RunOnceScheduler(() => this._evaluate.schedule(), 0));
	private _generation = 0;
	private _lastRefresh = 0;
	private _triggered = false;
	private _activeSession: string | undefined;
	private _state: IStoredContinuation = {};
	private _preview: { state: IStoredContinuation } | undefined;
	private readonly _writes = new Sequencer();
	private _selectableModels: readonly { readonly id: string; readonly vendor: string }[] = [];

	constructor(
		@IAgentHostService private readonly _agentHost: IAgentHostService,
		@IAgentHostConnectionsService private readonly _connections: IAgentHostConnectionsService,
		@ICodexAccountService private readonly _account: ICodexAccountService,
		@IChatEntitlementService private readonly _entitlement: IChatEntitlementService,
		@IHostService private readonly _host: IHostService,
		@IStorageService private readonly _storage: IStorageService,
		@ITelemetryService private readonly _telemetry: ITelemetryService,
		@IConfigurationService private readonly _configuration: IConfigurationService,
		@IWorkbenchEnvironmentService private readonly _environment: IWorkbenchEnvironmentService,
	) {
		super();
		const schedule = () => { this._generation++; this._evaluate.schedule(); };
		this._register(_account.onDidChangeAccount(schedule));
		this._register(_entitlement.onDidChangeEntitlement(schedule));
		this._register(_entitlement.onDidChangeQuotaRemaining(schedule));
		this._register(_entitlement.onDidChangeQuotaExceeded(schedule));
		this._register(_entitlement.onDidChangeSentiment(schedule));
		this._register(_configuration.onDidChangeConfiguration(() => { bind(); this.refresh(); }));
		this._register(_host.onDidChangeFocus(focused => { if (focused) { this.refresh(); } schedule(); }));
		this._register(_storage.onDidChangeValue(StorageScope.APPLICATION_SHARED, CODEX_CONTINUATION_STORAGE_KEY, this._store)(() => {
			if (this._triggered) {
				this._state = this._parse(this._storage.get(CODEX_CONTINUATION_STORAGE_KEY, StorageScope.APPLICATION_SHARED));
			}
			this._changed();
			this._evaluate.schedule();
		}));
		const root = this._register(new DisposableStore());
		const bind = () => {
			root.clear();
			if (this._enabled()) {
				root.add(_agentHost.rootState.onDidChange(schedule));
				root.add(_agentHost.onDidNotification(schedule));
			}
			schedule();
		};
		this._register(_agentHost.onAgentHostStart(bind));
		bind();
		this.refresh();
	}

	trackVisibility(): IDisposable {
		this._visibleSurfaces.set(this._visibleSurfaces.get() + 1, undefined);
		return toDisposable(() => this._visibleSurfaces.set(this._visibleSurfaces.get() - 1, undefined));
	}

	setActiveSession(resource: URI | undefined): void {
		const resolution = resource && this._connections.resolveSessionResource(resource);
		const active = resolution?.connection === this._connections.ambientConnection ? resolution.backendSession.toString() : undefined;
		if (active !== this._activeSession) { this._activeSession = active; this._generation++; this._evaluate.schedule(); }
	}

	setSelectableModels(models: readonly { readonly id: string; readonly vendor: string }[]): void {
		this._selectableModels = models;
		this._generation++;
		this._evaluate.schedule();
	}

	refresh(): void {
		if (!this._host.hasFocus || !this._enabled() || Date.now() - this._lastRefresh < CODEX_CONTINUATION_MAX_AGE) {
			return;
		}
		this._lastRefresh = Date.now();
		this._agentHost.dispatch(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { [CODEX_ACCOUNT_REFRESH_REQUEST_KEY]: generateUuid() } });
	}

	async showPreview(): Promise<boolean> {
		if (!this._host.hasFocus || this._store.isDisposed) { return false; }
		// Let a real presentation finish its pending storage claim before deciding
		// whether there is already a notice or guide to show.
		await this._writes.queue(async () => { });
		if (this._preview || this.isVisible.get() || (this._state.reservation?.owner === this._owner && this._state.reservation.until > Date.now())) { return true; }
		this._preview = { state: {} };
		this._generation++;
		await this._update();
		if (!this._candidate.get()) {
			this.endPreview();
			return false;
		}
		return true;
	}

	endPreview(): void {
		if (this._preview) {
			this._preview = undefined;
			this._generation++;
			this._changed();
			this._evaluate.schedule();
		}
	}

	private _presentationEnabled(): boolean {
		return !!this._preview || this._configuration.getValue<boolean>(CODEX_CONTINUATION_SETTING) === true;
	}

	private _thresholdPercent(): number {
		const value = this._configuration.getValue<number>(CODEX_CONTINUATION_THRESHOLD_SETTING);
		return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : CODEX_CONTINUATION_DEFAULT_THRESHOLD;
	}

	private _enabled(): boolean {
		return shouldShowCodexAccount(this._configuration, this._environment.isSessionsWindow)
			&& !this._entitlement.sentiment.hidden && !this._entitlement.sentiment.disabledInWorkspace;
	}

	private _baseEligible(): boolean {
		return this._enabled() && (!!this._preview || getCodexTriggeringLimits(this._account.account, Date.now(), this._thresholdPercent()).length > 0)
			&& hasUsableCopilotPremiumQuota(this._entitlement.entitlement, this._entitlement.quotas)
			&& [this._entitlement.quotas.sessionRateLimit, this._entitlement.quotas.weeklyRateLimit].every(limit =>
				!limit || limit.unlimited || (Number.isFinite(limit.percentRemaining) && limit.percentRemaining > 10 && limit.percentRemaining <= 100));
	}

	async resolve(expected?: ICodexContinuationCandidate, activeSession?: string, allowCommittedTarget?: boolean): Promise<ICodexContinuationCandidate | undefined> {
		if (!this._baseEligible() || this._store.isDisposed) {
			return undefined;
		}
		let sessions: IAgentSessionMetadata[];
		try { sessions = await this._agentHost.listSessions(); } catch { return undefined; }
		if (!this._baseEligible() || this._store.isDisposed) {
			return undefined;
		}
		const root = this._agentHost.rootState.value;
		const models = root && !(root instanceof Error) ? root.agents.find(agent => agent.provider === 'codex')?.models ?? [] : [];
		// A guided draft may already be committed to the exact target. Preserve the
		// original source only for that exact session/pair during confirmation.
		if (allowCommittedTarget && expected) {
			sessions = sessions.map(session => session.session.toString() === expected.session.session.toString() && session.model?.id === expected.target.id
				? { ...session, model: { id: expected.source.id } } : session);
		}
		const candidates = getCodexContinuationCandidates(sessions, models, activeSession ?? this._activeSession).filter(candidate => {
			if (candidate.session.provider) {
				this._connections.registerSessionResource(candidate.session.session, undefined, candidate.session.provider);
			}
			const resource = this._connections.getSessionResource(candidate.session.session);
			return this._selectableModels.some(model => model.id === candidate.target.id && model.vendor === resource?.scheme);
		});
		return expected ? candidates.find(candidate => candidate.session.session.toString() === expected.session.session.toString()
			&& candidate.source.id === expected.source.id && candidate.target.id === expected.target.id) : candidates[0];
	}

	private async _update(): Promise<void> {
		const generation = this._generation;
		const candidate = await this.resolve();
		if (this._store.isDisposed || generation !== this._generation) { return; }
		this._candidate.set(candidate, undefined);
		const now = Date.now();
		const deadlines = [...getCodexTriggeringLimits(this._account.account, now, this._thresholdPercent()), ...(this._triggered ? this._state.episode?.limits ?? [] : [])].map(limit => limit.until);
		if (this._state.reservation) { deadlines.push(this._state.reservation.until); }
		if (this._account.account.observedAt !== undefined) { deadlines.push(this._account.account.observedAt + CODEX_CONTINUATION_MAX_AGE + 1); }
		const next = deadlines.filter(deadline => deadline > now).sort((a, b) => a - b)[0];
		this._expiry.cancel();
		if (next !== undefined) { this._expiry.schedule(Math.min(next - now, 2147483647)); }
		if (this._triggered) { await this._mutate(state => state); }
		this._changed();
	}

	/** Caller establishes focus and surface presentability identically in both arms. */
	async wouldShow(_surface: CodexContinuationSurface): Promise<boolean> {
		if (!this._host.hasFocus || !this._candidate.get() || !this._baseEligible() || !await this._host.hadLastFocus()) { return false; }
		if (!this._host.hasFocus || !this._baseEligible() || this._store.isDisposed) { return false; }
		if (!this._preview) {
			logSettingExperimentTrigger(this._telemetry, CODEX_CONTINUATION_SETTING);
			this._triggered = true;
		}
		if (!this._presentationEnabled()) { return false; }
		if (!this._host.hasFocus || !this._baseEligible() || this._store.isDisposed) { return false; }
		const state = await this._mutate(state => state);
		return this._presentationEnabled() && !state.permanent && !state.episode && !state.reservation;
	}

	async reservePresentation(): Promise<boolean> {
		if (!this._presentationEnabled() || !this._host.hasFocus || !this._baseEligible() || this._store.isDisposed || !await this._host.hadLastFocus()) { return false; }
		const state = await this._mutate(state => !this._presentationEnabled() || !this._host.hasFocus || !this._baseEligible() || this._store.isDisposed || state.permanent || state.episode || state.reservation ? state : {
			...state, reservation: { owner: this._owner, until: Date.now() + 30_000 },
		});
		return state.reservation?.owner === this._owner;
	}

	async releasePresentation(): Promise<void> {
		await this._mutate(state => state.reservation?.owner === this._owner ? { ...state, reservation: undefined } : state).catch(onUnexpectedError);
	}

	async markVisible(surface: CodexContinuationSurface, candidate: ICodexContinuationCandidate, isVisible: () => boolean = () => true): Promise<boolean> {
		const canClaim = () => (!!this._preview || this._triggered) && this._presentationEnabled() && !this._store.isDisposed && this._host.hasFocus && isVisible() && this._baseEligible()
			&& this._candidate.get()?.session.session.toString() === candidate.session.session.toString();
		if (!canClaim() || !await this._host.hadLastFocus()) { return false; }
		let claimed = false;
		const state = await this._mutate(state => {
			claimed = canClaim() && state.reservation?.owner === this._owner && !state.permanent && !state.episode;
			return !claimed ? state : {
				episode: { owner: this._owner, surface, limits: getCodexTriggeringLimits(this._account.account, Date.now(), this._thresholdPercent()) },
			};
		});
		const shown = claimed && state.episode?.owner === this._owner;
		if (shown) { this.log('shown', surface); }
		return shown;
	}

	ownsEpisode(): boolean {
		const state = this._preview?.state ?? this._state;
		return (!!this._preview || this._triggered) && this._presentationEnabled() && !state.permanent && state.episode?.owner === this._owner;
	}

	dismiss(surface: CodexContinuationSurface): void { this.log('dismissed', surface); this._changed(); }
	async disable(surface: CodexContinuationSurface): Promise<void> {
		await this._mutate(state => ({ ...state, permanent: 'disabled', reservation: undefined }));
		this.log('dontShowAgain', surface);
	}
	async complete(surface: CodexContinuationSurface): Promise<void> {
		await this._mutate(state => ({ ...state, permanent: 'completed', reservation: undefined }));
		this.log('guideCompleted', surface);
	}

	private _parse(raw: string | undefined): IStoredContinuation {
		try {
			const value: IStoredContinuation = raw ? JSON.parse(raw) : {};
			if (!value || typeof value !== 'object'
				|| (value.permanent !== undefined && value.permanent !== 'disabled' && value.permanent !== 'completed')
				|| (value.reservation !== undefined && (!value.reservation || typeof value.reservation.owner !== 'string' || !Number.isFinite(value.reservation.until)))
				|| (value.episode !== undefined && (!value.episode || typeof value.episode.owner !== 'string'
					|| (value.episode.surface !== 'agentsWindow' && value.episode.surface !== 'editorWindow')
					|| !Array.isArray(value.episode.limits) || value.episode.limits.length > 2
					|| !value.episode.limits.every(limit => limit && (limit.duration === 300 || limit.duration === 10080)
						&& Number.isFinite(limit.until) && Number.isFinite(limit.observedAt) && typeof limit.reliable === 'boolean'
						&& (limit.thresholdPercent === undefined || (Number.isFinite(limit.thresholdPercent) && limit.thresholdPercent >= 0 && limit.thresholdPercent <= 100)))))) {
				return {};
			}
			return { permanent: value.permanent, reservation: value.reservation, episode: value.episode };
		} catch { return {}; }
	}

	/** Compare-and-swap uses the authoritative shared database, never a stale renderer cache. */
	private _mutate(change: (state: IStoredContinuation) => IStoredContinuation): Promise<IStoredContinuation> {
		const preview = this._preview;
		return this._writes.queue(async () => {
			// Capture the preview before queueing: a late release must never write
			// real suppression after the preview has ended.
			if (preview) { return preview.state = change(preview.state); }
			let raw = await this._storage.readApplicationSharedValue(CODEX_CONTINUATION_STORAGE_KEY);
			for (let attempt = 0; attempt < 10; attempt++) {
				const state = this._parse(raw);
				const next = change({
					...state,
					episode: updateCodexEpisode(state.episode, this._account.account, Date.now(), this._thresholdPercent()),
					reservation: state.reservation && state.reservation.until > Date.now() ? state.reservation : undefined,
				});
				const value = JSON.stringify(next);
				if (value === (raw ?? '{}')) { this._state = next; return next; }
				const result = await this._storage.compareAndSwapApplicationSharedValue(CODEX_CONTINUATION_STORAGE_KEY, raw, value);
				if (result.swapped) { this._state = next; return next; }
				raw = result.currentValue;
			}
			// Fail closed under contention; the next observed storage change retries.
			return { permanent: 'disabled' };
		});
	}
	private _changed(): void { this._revision.set(this._revision.get() + 1, undefined); }

	log(action: CodexContinuationAction, surface: CodexContinuationSurface): void {
		if (this._preview) { return; }
		const limits = getCodexTriggeringLimits(this._account.account, Date.now(), this._thresholdPercent());
		this._telemetry.publicLog2<InteractionEvent, InteractionClassification>('agentHost.codexContinuation', {
			action, surface, limitKind: limits.length > 1 ? 'both' : limits[0]?.duration === 300 ? 'fiveHour' : 'weekly',
		});
	}
}
registerSingleton(ICodexContinuationService, CodexContinuationService, InstantiationType.Delayed);
