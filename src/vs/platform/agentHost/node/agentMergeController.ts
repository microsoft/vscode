/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, SequencerByKey } from '../../../base/common/async.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { structuralEquals } from '../../../base/common/equals.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { autorun } from '../../../base/common/observable.js';
import { isEqual } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IGitHubService } from '../../github/common/githubService.js';
import { GitHubWorkflowRerunOptions } from '../../github/common/githubPullRequestMutationService.js';
import { PullRequestRef, PullRequestSnapshot, PullRequestSubscription } from '../../github/common/githubPullRequestService.js';
import { GitHubRequestError } from '../../github/common/githubTransport.js';
import { ILogService } from '../../log/common/log.js';
import { AgentMergeConfigKey, AgentMergeConfiguration, AgentMergeConfigurationChangeScope, AgentMergeDisableReason, AgentMergeSessionOverrides, AgentMergeSessionState, AgentMergeTarget, AGENT_MERGE_UNKNOWN_COMMIT, agentMergeConfigurationChangedNotice, agentMergeDisableReasons, agentMergeDisabledNotice, agentMergeEnabledNotice, agentMergeGateFragments, agentMergeMergePullRequestDemotedNotice, agentMergeRootConfigSchema, classifyAgentMergeRequiredChecks, evaluateAgentMerge, readAgentMergeSessionState, resolveMergeMethod, shouldStopMergingAfterAgentChanges } from '../common/agentMerge.js';
import { buildAgentMergePrompt } from '../common/agentMergePrompt.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';
import { AgentSystemNotificationKind } from '../common/meta/agentSystemNotificationMeta.js';
import { deriveGitHubEndpoints } from '../common/githubEndpoints.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import { ActionType } from '../common/state/protocol/common/actions.js';
import { AuthRequiredReason } from '../common/state/sessionActions.js';
import { getSessionRelatedPullRequestUrls, ISessionWithDefaultChat, isAhpChatChannel, isSessionStatusArchived, needsSessionGitStateRefresh, parseRequiredSessionUriFromChatUri, readSessionFolderGitHubState, readSessionGitState, SessionLifecycle, TurnState } from '../common/state/sessionState.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentHostGitHubEndpointService } from './agentHostGitHubEndpointService.js';
import { IAgentHostProviderService } from './agentHostProviderService.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { IAgentMergeTurnContext, isFailedConclusion } from './agentMergeTools.js';
import { getAgentMergeConfiguration } from './agentMergeConfiguration.js';

const snapshotDebounce = 30_000;
const backstopInterval = 10 * 60_000;
const maximumRepeatedPromptCount = 3;
const maximumTotalPromptCount = 6;
/** How long one unchanged indeterminate cause may persist before Agent Merge gives up. */
const maximumIndeterminateDuration = 30 * 60_000;
/** How long a gap between indeterminate observations may be before the budget window restarts. */
const indeterminateObservationGap = 2 * backstopInterval;

export interface IAgentMergeControllerOptions {
	readonly startTurn: (session: string, turnId: string, prompt: string) => boolean;
	readonly cancelTurn: (session: string, turnId: string) => void;
	/**
	 * Posts an Agent Merge state change into the session transcript. The notice
	 * is client-visible only; it must never become part of the agent's context.
	 */
	readonly postNotice: (session: string, kind: AgentSystemNotificationKind, content: string) => void;
}

/** The configuration a session was last told about, and the overrides it was resolved from. */
interface IAnnouncedAgentMergeConfiguration {
	readonly configuration: AgentMergeConfiguration;
	readonly overrides: AgentMergeSessionOverrides | undefined;
}

interface IDeferredWorkflowRerun {
	readonly headSha: string;
	readonly options: GitHubWorkflowRerunOptions;
	readonly checkIds: ReadonlySet<string>;
	/** Retain handled check IDs until the check snapshot catches up with the rerun. */
	settled: boolean;
}

class AgentMergeRuntime extends Disposable {

	readonly subscription = this._register(new MutableDisposable<PullRequestSubscription>());
	readonly snapshotObserver = this._register(new MutableDisposable<DisposableStore>());
	readonly cancellation = new CancellationTokenSource();
	readonly abortController = new AbortController();
	readonly evaluationScheduler: RunOnceScheduler;
	readonly backstopScheduler: RunOnceScheduler;
	readonly deferredWorkflowReruns = new Map<string, IDeferredWorkflowRerun>();
	ref: PullRequestRef | undefined;
	/** Whether a successful lookup already confirmed that the checkout has no usable branch. */
	didRefreshForMissingBranch = false;
	/** The unchanged indeterminate cause being timed out, if any. */
	indeterminate: { readonly cause: string; readonly since: number; observedAt: number } | undefined;
	/** The refused fragment a credential was last requested for, if any. */
	reportedCredentialFailure: string | undefined;

	constructor(
		readonly session: string,
		evaluate: () => void,
	) {
		super();
		this.evaluationScheduler = this._register(new RunOnceScheduler(evaluate, snapshotDebounce));
		this.backstopScheduler = this._register(new RunOnceScheduler(evaluate, backstopInterval));
		this._register(toDisposable(() => this.cancellation.dispose(true)));
		this._register(toDisposable(() => this.abortController.abort(new Error('Agent Merge stopped'))));
		this._register(toDisposable(() => this.deferredWorkflowReruns.clear()));
	}
}

export class AgentMergeController extends Disposable {

	private readonly _runtimes = this._register(new DisposableMap<string, AgentMergeRuntime>());
	private readonly _evaluations = new SequencerByKey<string>();
	private readonly _evaluatingSessions = new Set<string>();
	private readonly _activeTurns = new Map<string, IAgentMergeTurnContext>();

	private readonly _onDidReleaseHold = this._register(new Emitter<string>());
	/** Fires when Agent Merge stops holding a session, so the host can re-arm its idle release. */
	readonly onDidReleaseHold: Event<string> = this._onDidReleaseHold.event;

	/** Sessions kept resident so their monitoring survives with no client subscriber. */
	private readonly _heldSessions = new Set<string>();

	/**
	 * Sessions this controller is monitoring in the current host lifetime. Only a
	 * session in this set can produce the "turned off" notice, so the re-entrant
	 * sync that {@link _disable} triggers cannot post a second, reasonless one.
	 */
	private readonly _monitoredSessions = new Set<string>();
	private readonly _announcedConfigurations = new Map<string, IAnnouncedAgentMergeConfiguration>();

	constructor(
		private readonly _options: IAgentMergeControllerOptions,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostGitStateService private readonly _gitStateService: IAgentHostGitStateService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IGitHubService private readonly _gitHubService: IGitHubService,
		@IAgentHostGitHubEndpointService private readonly _gitHubEndpointService: IAgentHostGitHubEndpointService,
		@IAgentHostProviderService private readonly _providerService: IAgentHostProviderService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._logService.debug('[AgentMergeController] Initialized');
		this._register(this._stateManager.onDidChangeSessionConfig(event => {
			const previous = readAgentMergeSessionState(event.previous?.values);
			const current = readAgentMergeSessionState(event.current?.values);
			if (structuralEquals(previous, current)) {
				return;
			}
			const session = event.session.toString();
			if (current?.enabled && current.target && (!previous?.enabled || !previous.target)) {
				this._postEnabledNotice(session, current);
			} else {
				this._postConfigurationChangedNotice(session, current);
			}
			if (this._resetRepairBaselineOnReselection(session, previous, current)) {
				// The reset re-enters this listener, which then syncs.
				return;
			}
			this._syncSession(session);
		}));
		this._register(this._stateManager.onDidChangeSessionActiveTurn(event => {
			if (event.active) {
				return;
			}
			void this._completeTurn(event.session);
		}));
		this._register(this._stateManager.onDidRemoveSession(session => {
			this._monitoredSessions.delete(session);
			this._announcedConfigurations.delete(session);
			this._stopRuntime(session);
		}));
		this._register(this._gitStateService.onDidRefreshSessionGitState(session => {
			if (!this._evaluatingSessions.has(session)) {
				this._schedule(session, 0);
			}
		}));
		this._register(this._gitStateService.onDidChangeSessionGitHubState(session => this._schedule(session, 0)));
		this._register(this._configurationService.onDidRootConfigChange(() => {
			for (const session of this._stateManager.getSessionUris()) {
				const agentMerge = readAgentMergeSessionState(this._stateManager.getSessionState(session)?.config?.values);
				this._postConfigurationChangedNotice(session, agentMerge);
				this._syncSession(session);
			}
		}));
		this._register(this._stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.SessionReady || envelope.action.type === ActionType.SessionIsArchivedChanged) {
				this._syncSession(envelope.channel);
			}
		}));
	}

	refresh(): void {
		this._logService.debug(`[AgentMergeController] Refreshing ${this._runtimes.size} active session(s) after authentication changed`);
		for (const session of this._runtimes.keys()) {
			this._schedule(session, 0);
		}
	}

	isEnabled(): boolean {
		return this._isFeatureEnabled();
	}

	async setEnabled(session: string, enabled: boolean, overrides?: AgentMergeSessionOverrides): Promise<void> {
		const initial = this._getSessionEnablementState(session, enabled);
		let agentMerge = initial.agentMerge;
		let target: AgentMergeTarget | undefined;
		if (enabled && (!agentMerge?.enabled || !agentMerge.target)) {
			const workingDirectory = initial.state.workingDirectories?.[0];
			if (!workingDirectory) {
				throw new Error('Cannot enable Agent Merge without a working directory.');
			}
			const directory = URI.parse(workingDirectory);
			const branchName = await this._gitService.getCurrentBranchName?.(directory, { throwOnError: true });
			const updated = this._getSessionEnablementState(session, enabled);
			const updatedDirectory = updated.state.workingDirectories?.[0];
			if (!isEqual(directory, updatedDirectory ? URI.parse(updatedDirectory) : undefined)
				|| agentMerge?.enabled !== updated.agentMerge?.enabled
				|| !structuralEquals(agentMerge?.target, updated.agentMerge?.target)) {
				throw new Error('Cannot enable Agent Merge because the session changed while reading the current Git branch. Try again.');
			}
			if (!branchName) {
				throw new Error('Cannot enable Agent Merge because the current Git branch could not be determined. Check out a branch and try again.');
			}
			agentMerge = updated.agentMerge;
			target = this._createTarget(session, branchName);
		}
		const nextOverrides = { ...agentMerge?.overrides, ...overrides };
		if (target || agentMerge?.enabled !== enabled || !structuralEquals(agentMerge?.overrides ?? {}, nextOverrides)) {
			this._configurationService.updateSessionConfig(session, {
				[SessionConfigKey.AgentMerge]: {
					enabled,
					...(Object.keys(nextOverrides).length > 0 ? { overrides: nextOverrides } : {}),
				},
				...(target ? { [SessionConfigKey.AgentMergeController]: toControllerState(agentMerge ?? { enabled }, { target }) } : {}),
			});
		}
	}

	private _getSessionEnablementState(session: string, enabled: boolean): { state: ISessionWithDefaultChat; agentMerge: AgentMergeSessionState | undefined } {
		if (this._store.isDisposed) {
			throw new Error('Agent Merge controller is disposed.');
		}
		if (!this.isEnabled()) {
			throw new Error('Agent Merge is disabled in the host configuration.');
		}
		const state = this._stateManager.getSessionState(session);
		if (!state) {
			throw new Error(`Cannot update Agent Merge for unknown session: ${session}`);
		}
		if (enabled && isSessionStatusArchived(state.status)) {
			throw new Error('Cannot enable Agent Merge for an archived session.');
		}
		const values = this._configurationService.getSessionConfigValues(session);
		if (!values) {
			throw new Error('Cannot update Agent Merge before session configuration is available.');
		}
		return { state, agentMerge: readAgentMergeSessionState(values) };
	}

	/**
	 * Whether Agent Merge is keeping `session` resident. The host consults this
	 * before releasing an idle session, and re-arms that release when
	 * {@link onDidReleaseHold} reports the hold has ended.
	 */
	holdsSession(session: string): boolean {
		return this._heldSessions.has(session);
	}

	onSessionAvailable(session: string): void {
		this._logService.trace(`[AgentMergeController] Session available: session=${session}`);
		this._syncSession(session);
	}

	getTurnContext(session: string): IAgentMergeTurnContext | undefined {
		const sessionKey = isAhpChatChannel(session) ? parseRequiredSessionUriFromChatUri(session) : session;
		const context = this._activeTurns.get(sessionKey);
		if (!context || this._stateManager.getSessionState(sessionKey)?.activeTurn?.id !== context.turnId) {
			return undefined;
		}
		return context;
	}

	/**
	 * Whether monitoring needs `session` in memory. Persisted enablement counts
	 * even before a runtime starts, so a restore is not evicted out from under
	 * the runtime that is about to claim it.
	 */
	private _shouldHoldSession(session: string): boolean {
		if (this._runtimes.has(session)) {
			return true;
		}
		if (!this._isFeatureEnabled()) {
			return false;
		}
		const state = this._stateManager.getSessionState(session);
		if (!state || isSessionStatusArchived(state.status)) {
			return false;
		}
		return readAgentMergeSessionState(state.config?.values)?.enabled === true;
	}

	/**
	 * Recomputes the hold after a state transition. Tracking it here — rather
	 * than lazily when the host happens to ask — keeps the answer correct for a
	 * session the host has never had reason to evict.
	 */
	private _updateHold(session: string): void {
		const shouldHold = this._shouldHoldSession(session);
		if (shouldHold === this._heldSessions.has(session)) {
			return;
		}
		if (shouldHold) {
			this._heldSessions.add(session);
			return;
		}
		this._heldSessions.delete(session);
		this._logService.debug(`[AgentMergeController] Released session hold: session=${session}`);
		this._onDidReleaseHold.fire(session);
	}

	private _syncSession(session: string): void {
		try {
			this._doSyncSession(session);
		} finally {
			this._updateHold(session);
		}
	}

	private _doSyncSession(session: string): void {
		const state = this._stateManager.getSessionState(session);
		const agentMerge = readAgentMergeSessionState(state?.config?.values);
		if (!state || !agentMerge?.enabled) {
			if (this._runtimes.has(session) || agentMerge?.injectedConfiguration) {
				this._logService.info(`[AgentMergeController] Stopping disabled session: session=${session}`);
			}
			// A session still marked monitored reached this branch because
			// something outside the controller — the user, or another client —
			// turned Agent Merge off. Self-disables clear the mark first and
			// report their own reason.
			if (this._monitoredSessions.delete(session) && state) {
				this._postNotice(session, AgentSystemNotificationKind.AgentMergeDisabled, agentMergeDisabledNotice());
			}
			this._announcedConfigurations.delete(session);
			if (agentMerge?.injectedConfiguration) {
				this._restoreInjectedConfiguration(session, agentMerge);
			}
			this._stopRuntime(session);
			return;
		}
		if (isSessionStatusArchived(state.status)) {
			this._disable(session, agentMerge, agentMergeDisableReasons.sessionArchived());
			return;
		}
		if (!this._isFeatureEnabled()) {
			if (this._runtimes.has(session) || agentMerge.injectedConfiguration) {
				this._logService.info(`[AgentMergeController] Pausing session because the feature is globally disabled: session=${session}`);
			}
			if (agentMerge.injectedConfiguration) {
				this._restoreInjectedConfiguration(session, agentMerge, true);
			}
			this._stopRuntime(session);
			return;
		}
		if (state.lifecycle !== SessionLifecycle.Ready) {
			if (this._runtimes.has(session)) {
				this._logService.debug(`[AgentMergeController] Stopping runtime because the session is not ready: session=${session}, lifecycle=${state.lifecycle}`);
			}
			this._stopRuntime(session);
			return;
		}
		// Widening approvals mid-turn would hand extra capability to a turn this
		// controller does not own, so injection waits for an idle session.
		if (!this._stateManager.hasActiveTurn(session)) {
			this._reconcileInjectedConfiguration(session, agentMerge);
		}
		let runtime = this._runtimes.get(session);
		if (runtime?.deferredWorkflowReruns.size && !this._getConfiguration(agentMerge).fixCI) {
			this._logService.info(`[AgentMergeController] Discarding deferred workflow reruns because CI repair was disabled: session=${session}`);
			runtime.deferredWorkflowReruns.clear();
		}
		if (!runtime) {
			runtime = new AgentMergeRuntime(session, () => this._queueEvaluation(session));
			this._runtimes.set(session, runtime);
			this._monitoredSessions.add(session);
			this._logService.info(`[AgentMergeController] Started session runtime: session=${session}, hasTarget=${agentMerge.target !== undefined}, overrides=${formatOverrideKeys(agentMerge)}`);
			if (agentMerge.target) {
				const announced = this._announcedConfigurations.get(session);
				if (announced) {
					this._postConfigurationChangedNotice(session, agentMerge);
				} else {
					this._setAnnouncedConfiguration(session, agentMerge);
				}
			}
		}
		this._schedule(session, 0);
	}

	private _isFeatureEnabled(): boolean {
		return this._configurationService.getRootValue(agentMergeRootConfigSchema, AgentMergeConfigKey.Enabled) ?? false;
	}

	/**
	 * Applies the provider's current autonomous configuration, recomputing it every
	 * cycle so a tightened managed policy revokes elevated approvals it previously
	 * granted. The originally observed user values are preserved for restore.
	 */
	private _reconcileInjectedConfiguration(session: string, agentMerge: AgentMergeSessionState): void {
		const values = this._configurationService.getSessionConfigValues(session) ?? {};
		const injected = agentMerge.injectedConfiguration;
		const applied = this._providerService.getProviderForSession(session)?.getAutonomousSessionConfig?.(values) ?? {};
		if (!injected && Object.keys(applied).length === 0) {
			this._logService.debug(`[AgentMergeController] Provider did not select autonomous session configuration: session=${session}`);
			return;
		}

		const previous: Record<string, unknown> = {};
		const patch: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(applied)) {
			previous[key] = injected && Object.hasOwn(injected.previous, key) ? injected.previous[key] : values[key];
			if (!structuralEquals(values[key], value)) {
				patch[key] = value;
			}
		}
		// A key the provider no longer selects (e.g. policy revoked it) is rolled
		// back, but only while it still holds the value this controller applied.
		for (const [key, appliedValue] of Object.entries(injected?.applied ?? {})) {
			if (!Object.hasOwn(applied, key) && structuralEquals(values[key], appliedValue)) {
				patch[key] = injected!.previous[key];
			}
		}

		const nextInjected = Object.keys(applied).length > 0 ? { previous, applied } : undefined;
		if (Object.keys(patch).length === 0 && structuralEquals(injected, nextInjected)) {
			return;
		}
		this._logService.info(`[AgentMergeController] Reconciled autonomous session configuration: session=${session}, applied=${Object.keys(applied).sort().join(',') || 'none'}, changed=${Object.keys(patch).sort().join(',') || 'none'}`);
		this._configurationService.updateSessionConfig(session, {
			[SessionConfigKey.AgentMergeController]: toControllerState(agentMerge, { injectedConfiguration: nextInjected }),
			...patch,
		});
	}

	private _restoreInjectedConfiguration(session: string, agentMerge: AgentMergeSessionState, preserveControllerState = false): void {
		const injected = agentMerge.injectedConfiguration;
		if (!injected) {
			return;
		}
		const patch: Record<string, unknown> = {
			[SessionConfigKey.AgentMergeController]: preserveControllerState
				? toControllerState(agentMerge, { injectedConfiguration: undefined })
				: {},
		};
		this._addInjectedConfigurationRestore(patch, session, agentMerge);
		this._logService.info(`[AgentMergeController] Restoring session configuration: session=${session}, restoreMode=${Object.hasOwn(patch, SessionConfigKey.Mode)}, restoreApprovals=${Object.hasOwn(patch, SessionConfigKey.AutoApprove)}, preserveControllerState=${preserveControllerState}`);
		this._configurationService.updateSessionConfig(session, patch);
	}

	private _schedule(session: string, delay: number): void {
		const runtime = this._runtimes.get(session);
		if (!runtime) {
			return;
		}
		runtime.evaluationScheduler.schedule(delay);
	}

	private _queueEvaluation(session: string): void {
		void this._evaluations.queue(session, async () => {
			this._evaluatingSessions.add(session);
			try {
				this._logService.trace(`[AgentMergeController] Evaluation started: session=${session}`);
				await this._evaluate(session);
			} catch (error) {
				if (!this._runtimes.has(session)) {
					this._logService.trace(`[AgentMergeController] Evaluation stopped with disposed runtime: session=${session}`);
					return;
				}
				if (error instanceof GitHubRequestError && (error.kind === 'authentication' || error.kind === 'authorization')) {
					this._requestGitHubAuthorization(session, error.kind, error.message);
				}
				this._logService.error(error, `[AgentMergeController] Evaluation failed: session=${session}, kind=${githubErrorKind(error)}`);
				this._runtimes.get(session)?.backstopScheduler.schedule();
			} finally {
				this._evaluatingSessions.delete(session);
			}
		});
	}

	private async _evaluate(session: string): Promise<void> {
		const runtime = this._runtimes.get(session);
		const state = this._stateManager.getSessionState(session);
		const agentMerge = readAgentMergeSessionState(state?.config?.values);
		if (!runtime || !state || !agentMerge?.enabled || this._stateManager.hasActiveTurn(session)) {
			return;
		}
		const configuration = this._getConfiguration(agentMerge);
		const branch = await this._resolveCurrentBranch(session, runtime, state, agentMerge.target?.branchName);
		if (!this._isCurrentEvaluation(session, runtime, state, configuration)) {
			return;
		}
		if (!branch) {
			runtime.backstopScheduler.schedule();
			return;
		}
		const { branchName } = branch;
		if (!branchName) {
			if (agentMerge.target) {
				this._disable(session, agentMerge, agentMergeDisableReasons.branchUnavailable(agentMerge.target.branchName));
			} else {
				this._logService.trace(`[AgentMergeController] Waiting for a current branch: session=${session}`);
				runtime.backstopScheduler.schedule();
			}
			return;
		}
		let target = agentMerge.target;
		if (!target) {
			target = this._createTarget(session, branchName);
			this._updateAgentMergeState(session, agentMerge, { target });
			return;
		}
		if (target.branchName !== branchName) {
			this._disable(session, agentMerge, agentMergeDisableReasons.branchChanged(target.branchName, branchName));
			return;
		}

		await this._gitStateService.attachSessionGitHubPullRequest(session, state.workingDirectories?.[0] ? URI.parse(state.workingDirectories[0]) : undefined);
		if (!this._isCurrentEvaluation(session, runtime, state, configuration)) {
			return;
		}
		const refreshed = await this._readCurrentBranch(session, state);
		if (!this._isCurrentEvaluation(session, runtime, state, configuration)) {
			return;
		}
		if (!refreshed) {
			runtime.backstopScheduler.schedule();
			return;
		}
		const refreshedBranch = refreshed.branchName;
		if (refreshedBranch !== target.branchName) {
			this._disable(session, agentMerge, refreshedBranch
				? agentMergeDisableReasons.branchChanged(target.branchName, refreshedBranch)
				: agentMergeDisableReasons.branchUnavailable(target.branchName));
			return;
		}
		const refreshedState = this._stateManager.getSessionState(session);
		const gitHubState = readSessionFolderGitHubState(refreshedState);
		const pullRequestUrl = gitHubState?.pullRequestBranchName === target.branchName ? getSessionRelatedPullRequestUrls(gitHubState)[0] : undefined;
		if (!target.pullRequestUrl) {
			if (!pullRequestUrl) {
				this._logService.trace(`[AgentMergeController] Waiting for a pull request on the captured branch: session=${session}`);
				runtime.backstopScheduler.schedule();
				return;
			}
			target = { ...target, pullRequestUrl };
			this._logService.info(`[AgentMergeController] Bound session to its pull request: session=${session}`);
			this._updateAgentMergeState(session, agentMerge, { target });
			return;
		}
		if (pullRequestUrl && pullRequestUrl.toLowerCase() !== target.pullRequestUrl.toLowerCase()) {
			this._disable(session, agentMerge, agentMergeDisableReasons.differentPullRequest());
			return;
		}

		const parsed = parsePullRequestUrl(target.pullRequestUrl);
		if (!parsed) {
			this._disable(session, agentMerge, agentMergeDisableReasons.invalidPullRequestUrl());
			return;
		}
		const ref = await this._resolveRef(parsed, runtime.abortController.signal);
		if (!this._isCurrentEvaluation(session, runtime, state, configuration)) {
			return;
		}
		if (!ref) {
			this._disable(session, agentMerge, agentMergeDisableReasons.differentGitHubHost());
			return;
		}
		const subscription = await this._ensureSubscription(session, runtime, ref);
		if (!subscription || !this._isCurrentEvaluation(session, runtime, state, configuration)) {
			return;
		}
		// Backstop only: `_completeTurn` normally decides this the moment a
		// repair turn ends. This catches a host restart that lost the in-flight
		// turn, since the baseline commit is persisted with the session.
		if (await this._demoteMergePullRequestIfChanged(session, agentMerge, configuration)) {
			// The config write re-enters evaluation with the demoted value, so
			// this pass must not go on to merge under the old one.
			return;
		}
		if (!this._isCurrentEvaluation(session, runtime, state, configuration)) {
			return;
		}
		const snapshot = subscription.resource.snapshot.get();
		const deferredCheckIds = this._pruneDeferredWorkflowReruns(session, runtime, snapshot);
		const gate = evaluateAgentMerge(snapshot, configuration, target.commentWatermark, deferredCheckIds);
		this._logGateResult(session, gate);
		if (gate.kind !== 'indeterminate') {
			runtime.indeterminate = undefined;
			runtime.reportedCredentialFailure = undefined;
		}
		switch (gate.kind) {
			case 'indeterminate':
				this._reportBlockedCredential(session, runtime, snapshot);
				if (this._isIndeterminateBudgetExhausted(session, runtime, gate.cause)) {
					this._disable(session, agentMerge, agentMergeDisableReasons.indeterminate(Math.round(maximumIndeterminateDuration / 60_000), gate.reason));
					return;
				}
				runtime.backstopScheduler.schedule();
				return;
			case 'terminal': {
				const pullRequest = snapshot.core.value!;
				if (pullRequest.state === 'merged') {
					this._disable(
						session,
						agentMerge,
						agentMergeDisableReasons.pullRequestAlreadyMerged(pullRequest.number, pullRequest.url),
						AgentSystemNotificationKind.AgentMergePullRequestMerged,
					);
				} else {
					this._disable(session, agentMerge, agentMergeDisableReasons.pullRequestClosed());
				}
				return;
			}
			case 'noWork':
				await this._processDeferredWorkflowReruns(session, runtime, ref, target, snapshot.core.value!.headSha);
				if (this._isCurrentRuntime(session, runtime)) {
					runtime.backstopScheduler.schedule();
				}
				return;
			case 'prompt': {
				if (!this._canRepairFork(snapshot)) {
					this._logService.info(`[AgentMergeController] Waiting because the pull request head fork does not allow maintainer edits for ${session}`);
					runtime.backstopScheduler.schedule();
					return;
				}
				if (!shouldRunFingerprint(agentMerge, gate.fingerprint)) {
					this._logService.debug(`[AgentMergeController] Suppressing unchanged repair turn until the backstop: session=${session}`);
					runtime.backstopScheduler.schedule();
					return;
				}
				const repeatedPromptCount = agentMerge.lastPromptFingerprint === gate.fingerprint ? (agentMerge.repeatedPromptCount ?? 0) + 1 : 0;
				const totalPromptCount = (agentMerge.totalPromptCount ?? 0) + 1;
				if (repeatedPromptCount >= maximumRepeatedPromptCount || totalPromptCount > maximumTotalPromptCount) {
					this._logService.warn(`[AgentMergeController] Repair attempt budget exhausted: session=${session}, repeatedAttempts=${repeatedPromptCount}, totalAttempts=${totalPromptCount}`);
					this._disable(session, agentMerge, agentMergeDisableReasons.repairBudgetExhausted());
					return;
				}
				const turnId = generateUuid();
				// Captured before the turn is claimed so the baseline reflects
				// the worktree the agent is about to act on. An unreadable
				// worktree records a sentinel that no commit can match, so the
				// session fails closed rather than authorizing a later merge.
				const repairBaseCommit = await this._resolveLocalCommit(session) ?? AGENT_MERGE_UNKNOWN_COMMIT;
				const context: IAgentMergeTurnContext = {
					session,
					turnId,
					ref,
					headSha: gate.context.headSha,
					actions: gate.actions,
					configuration,
					snapshot,
					signal: runtime.abortController.signal,
					commentWatermark: gate.context.commentWatermark,
					deferredCheckIds,
					initialDeferredCheckIds: new Set(deferredCheckIds),
					deferWorkflowRerun: (options, checkIds, running) => {
						const deferred = this._deferWorkflowRerun(context, runtime, options, checkIds, running);
						if (deferred) {
							for (const id of checkIds) {
								deferredCheckIds.add(id);
							}
						}
						return deferred;
					},
				};
				if (!this._isCurrentEvaluation(session, runtime, state, configuration)
					|| !this._isTargetStillCurrent(session, target)
					|| !this._options.startTurn(session, turnId, buildAgentMergePrompt(gate.actions, gate.context))) {
					this._logService.debug(`[AgentMergeController] Repair turn was not claimed because the session became busy, changed, or stopped: session=${session}`);
					runtime.backstopScheduler.schedule();
					return;
				}
				this._activeTurns.set(session, context);
				this._logService.info(`[AgentMergeController] Started repair turn: session=${session}, turn=${turnId}, actions=${gate.actions.join(',')}, repeatedAttempts=${repeatedPromptCount}, totalAttempts=${totalPromptCount}`);
				this._updateAgentMergeState(session, agentMerge, {
					lastPromptFingerprint: gate.fingerprint,
					lastPromptAt: new Date().toISOString(),
					repeatedPromptCount,
					totalPromptCount,
					repairBaseCommit,
				});
				return;
			}
			case 'merge':
				if (!shouldRunFingerprint(agentMerge, gate.fingerprint)) {
					this._logService.debug(`[AgentMergeController] Suppressing unchanged native merge attempt until the backstop: session=${session}`);
					runtime.backstopScheduler.schedule();
					return;
				}
				this._updateAgentMergeState(session, agentMerge, {
					lastPromptFingerprint: gate.fingerprint,
					lastPromptAt: new Date().toISOString(),
				});
				this._logService.info(`[AgentMergeController] Starting native merge readiness verification: session=${session}, configuredMethod=${configuration.mergeMethod}`);
				await this._merge(session, runtime, ref, snapshot, configuration, agentMerge);
				return;
		}
	}

	private _deferWorkflowRerun(context: IAgentMergeTurnContext, runtime: AgentMergeRuntime, options: GitHubWorkflowRerunOptions, checkIds: readonly string[], running: boolean): boolean {
		const current = readAgentMergeSessionState(this._stateManager.getSessionState(context.session)?.config?.values);
		if (!this._isCurrentRuntime(context.session, runtime) || this.getTurnContext(context.session) !== context
			|| !current?.enabled || !this._getConfiguration(current).fixCI || !current.target
			|| !this._isTargetStillCurrent(context.session, current.target)
			|| runtime.subscription.value?.resource.snapshot.get().core.value?.headSha !== context.headSha) {
			this._logService.warn(`[AgentMergeController] Rejected deferred workflow rerun after authorization or target changed: session=${context.session}`);
			throw new Error('CI repair is no longer authorized for this Agent Merge turn or pull request head.');
		}
		const previous = runtime.deferredWorkflowReruns.get(options.runId);
		if (!running && !previous) {
			return false;
		}
		const sameAttempt = previous?.headSha === context.headSha && previous.options.expectedRunAttempt === options.expectedRunAttempt;
		runtime.deferredWorkflowReruns.set(options.runId, {
			headSha: context.headSha,
			options: {
				...options,
				failedJobsOnly: options.failedJobsOnly !== false && (!sameAttempt || previous.options.failedJobsOnly !== false),
			},
			checkIds: new Set([...(previous?.checkIds ?? []), ...checkIds]),
			settled: sameAttempt && previous.settled,
		});
		return true;
	}

	private _pruneDeferredWorkflowReruns(session: string, runtime: AgentMergeRuntime, snapshot: PullRequestSnapshot): Set<string> {
		const headSha = snapshot.core.value?.headSha;
		const checks = snapshot.checks.status === 'ready' && snapshot.checks.complete && snapshot.checks.value?.headSha && snapshot.checks.value.headSha === headSha
			? classifyAgentMergeRequiredChecks(snapshot.checks.value) : undefined;
		const deferredCheckIds = new Set<string>();
		for (const [runId, request] of runtime.deferredWorkflowReruns) {
			if ((headSha && request.headSha !== headSha)
				|| (checks?.kind === 'ready' && !checks.failed.some(check => request.checkIds.has(check.id)))) {
				this._logService.info(`[AgentMergeController] Discarding stale workflow rerun: session=${session}, run=${runId}, headChanged=${request.headSha !== headSha}`);
				runtime.deferredWorkflowReruns.delete(runId);
			} else {
				for (const id of request.checkIds) {
					deferredCheckIds.add(id);
				}
			}
		}
		return deferredCheckIds;
	}

	private async _processDeferredWorkflowReruns(session: string, runtime: AgentMergeRuntime, ref: PullRequestRef, target: AgentMergeTarget, headSha: string): Promise<void> {
		const pending = [...runtime.deferredWorkflowReruns.values()].filter(request => !request.settled);
		if (pending.length === 0) {
			return;
		}
		const runs = await this._gitHubService.mutations.listWorkflowRuns(ref, headSha, runtime.abortController.signal);
		for (const request of pending) {
			const current = readAgentMergeSessionState(this._stateManager.getSessionState(session)?.config?.values);
			const snapshot = runtime.subscription.value?.resource.snapshot.get();
			if (!this._isCurrentRuntime(session, runtime) || !current?.enabled || !this._getConfiguration(current).fixCI
				|| !this._isTargetStillCurrent(session, target) || current.target?.pullRequestUrl !== target.pullRequestUrl
				|| this._stateManager.hasActiveTurn(session) || snapshot?.core.status !== 'ready'
				|| !snapshot.core.complete || snapshot.core.value?.state !== 'open' || snapshot.core.value.headSha !== request.headSha
				|| !sameRef(snapshot.ref, ref)
				|| runtime.deferredWorkflowReruns.get(request.options.runId) !== request) {
				this._logService.debug(`[AgentMergeController] Deferred rerun interrupted by changed session state: session=${session}`);
				return;
			}
			const deferredCheckIds = this._pruneDeferredWorkflowReruns(session, runtime, snapshot);
			if (evaluateAgentMerge(snapshot, this._getConfiguration(current), target.commentWatermark, deferredCheckIds).kind !== 'noWork'
				|| runtime.deferredWorkflowReruns.get(request.options.runId) !== request) {
				this._logService.debug(`[AgentMergeController] Reevaluating changed checks before deferred rerun: session=${session}`);
				this._schedule(session, 0);
				return;
			}
			const run = runs.find(run => run.id === request.options.runId && run.headSha === request.headSha);
			if (!run) {
				this._logService.warn(`[AgentMergeController] Deferred workflow run is no longer available: session=${session}, run=${request.options.runId}`);
				runtime.deferredWorkflowReruns.delete(request.options.runId);
				this._schedule(session, 0);
				continue;
			}
			if (run.runAttempt > request.options.expectedRunAttempt) {
				request.settled = true;
				this._logService.info(`[AgentMergeController] Deferred workflow was already rerun: session=${session}, run=${run.id}, currentAttempt=${run.runAttempt}`);
				continue;
			}
			if (run.runAttempt < request.options.expectedRunAttempt || run.status?.toUpperCase() !== 'COMPLETED' || !run.conclusion) {
				this._logService.debug(`[AgentMergeController] Waiting to rerun workflow: session=${session}, run=${run.id}, status=${run.status}, currentAttempt=${run.runAttempt}`);
				continue;
			}
			if (!isFailedConclusion(run.conclusion)) {
				request.settled = true;
				this._logService.info(`[AgentMergeController] Deferred workflow no longer needs a rerun: session=${session}, run=${run.id}, conclusion=${run.conclusion}`);
				continue;
			}
			try {
				const result = await this._gitHubService.mutations.rerunWorkflow(ref, request.options, runtime.abortController.signal);
				request.settled = result.outcome !== 'indeterminate';
				this._logService.info(`[AgentMergeController] Deferred workflow rerun requested: session=${session}, run=${run.id}, outcome=${result.outcome}`);
			} finally {
				// Failed or unconfirmed mutations return to the ordinary, budgeted repair flow.
				if (!request.settled && runtime.deferredWorkflowReruns.get(run.id) === request) {
					runtime.deferredWorkflowReruns.delete(run.id);
					this._schedule(session, 0);
				}
			}
		}
	}

	private _createTarget(session: string, branchName: string): AgentMergeTarget {
		const now = new Date().toISOString();
		const gitHubState = readSessionFolderGitHubState(this._stateManager.getSessionState(session));
		const pullRequestUrl = gitHubState?.pullRequestBranchName === branchName
			? getSessionRelatedPullRequestUrls(gitHubState)[0]
			: undefined;
		this._logService.info(`[AgentMergeController] Captured session branch and feedback watermark: session=${session}, branch=${branchName}`);
		return { branchName, enabledAt: now, commentWatermark: now, ...(pullRequestUrl ? { pullRequestUrl } : {}) };
	}

	/** Refreshes before capturing or rejecting a target, or once to recover a missing branch. */
	private async _resolveCurrentBranch(session: string, runtime: AgentMergeRuntime, state: ISessionWithDefaultChat, targetBranchName: string | undefined): Promise<{ readonly branchName: string | undefined } | undefined> {
		const gitState = readSessionGitState(state._meta);
		if (gitState?.branchName && gitState.branchName === targetBranchName) {
			return { branchName: gitState.branchName };
		}
		if (!targetBranchName && !gitState?.branchName && (runtime.didRefreshForMissingBranch || !needsSessionGitStateRefresh(gitState))) {
			return { branchName: undefined };
		}
		this._logService.debug(`[AgentMergeController] Refreshing git state before resolving the branch: session=${session}, hasTarget=${targetBranchName !== undefined}`);
		await this._gitStateService.refreshSessionGitState(session, state.workingDirectories?.[0] ? URI.parse(state.workingDirectories[0]) : undefined);
		if (!this._isCurrentRuntime(session, runtime)) {
			return undefined;
		}
		const branch = await this._readCurrentBranch(session, state);
		if (branch && !branch.branchName) {
			runtime.didRefreshForMissingBranch = true;
		}
		return branch;
	}

	/** A refresh can retain stale metadata on failure; only a successful Git read confirms a branch or detached HEAD. */
	private async _readCurrentBranch(session: string, state: ISessionWithDefaultChat): Promise<{ readonly branchName: string | undefined } | undefined> {
		const workingDirectory = state.workingDirectories?.[0];
		if (!workingDirectory) {
			this._logService.warn(`[AgentMergeController] Cannot validate the branch without a working directory: session=${session}`);
			return undefined;
		}
		if (!this._gitService.getCurrentBranchName) {
			throw new Error('Cannot validate the Agent Merge branch because branch name lookup is unavailable.');
		}
		const directory = URI.parse(workingDirectory);
		const branchName = await this._gitService.getCurrentBranchName(directory, { throwOnError: true });
		const currentDirectory = this._stateManager.getSessionState(session)?.workingDirectories?.[0];
		if (!isEqual(directory, currentDirectory ? URI.parse(currentDirectory) : undefined)) {
			this._logService.debug(`[AgentMergeController] Discarding branch validation because the working directory changed: session=${session}`);
			return undefined;
		}
		return { branchName };
	}

	private async _resolveRef(parsed: IParsedPullRequestUrl, signal: AbortSignal): Promise<PullRequestRef | undefined> {
		const credential = await this._gitHubService.credentials.getCredential(signal);
		// The bound pull request URL carries its own host: after a restore or an
		// endpoint switch the same owner/repo/number can name a different GitHub
		// instance, which must never be acted on with this account's credential.
		if (credential.account.host.toLowerCase() !== parsed.apiHost.toLowerCase()) {
			return undefined;
		}
		return { ...credential.account, owner: parsed.owner, repo: parsed.repo, number: parsed.number };
	}

	private async _ensureSubscription(session: string, runtime: AgentMergeRuntime, ref: PullRequestRef): Promise<PullRequestSubscription | undefined> {
		if (runtime.ref && sameRef(runtime.ref, ref) && runtime.subscription.value) {
			this._logService.trace(`[AgentMergeController] Reusing pull request subscription: session=${session}`);
			return runtime.subscription.value;
		}
		if (runtime.deferredWorkflowReruns.size) {
			this._logService.info(`[AgentMergeController] Discarding deferred workflow reruns because the GitHub account or target changed: session=${session}`);
			runtime.deferredWorkflowReruns.clear();
		}
		runtime.ref = ref;
		const subscription = this._gitHubService.pullRequests.subscribePullRequest(ref, {
			priority: 'background',
			conversation: {
				topLevelComments: true,
				submittedReviews: true,
				reviewThreads: true,
				includeBodies: true,
			},
			checks: { required: true },
			mergeability: true,
		});
		this._logService.debug(`[AgentMergeController] Created pull request subscription: session=${session}, priority=background`);
		if (!this._isCurrentRuntime(session, runtime)) {
			subscription.dispose();
			return undefined;
		}
		runtime.subscription.value = subscription;
		const snapshotStore = new DisposableStore();
		snapshotStore.add(autorun(reader => {
			subscription.resource.snapshot.read(reader);
			runtime.evaluationScheduler.schedule();
		}));
		runtime.snapshotObserver.value = snapshotStore;
		try {
			this._logService.trace(`[AgentMergeController] Refreshing authoritative pull request state: session=${session}`);
			await subscription.refresh(undefined, runtime.cancellation.token, { authoritative: true });
		} catch (error) {
			if (!this._isCurrentRuntime(session, runtime)) {
				return undefined;
			}
			throw error;
		}
		this._logService.debug(`[AgentMergeController] Pull request state ready: session=${session}`);
		return this._isCurrentRuntime(session, runtime) ? subscription : undefined;
	}

	private _isCurrentRuntime(session: string, runtime: AgentMergeRuntime): boolean {
		return this._runtimes.get(session) === runtime && !runtime.abortController.signal.aborted;
	}

	private _isCurrentEvaluation(session: string, runtime: AgentMergeRuntime, state: ISessionWithDefaultChat, configuration: AgentMergeConfiguration): boolean {
		if (!this._isCurrentRuntime(session, runtime) || this._stateManager.hasActiveTurn(session)) {
			return false;
		}
		const current = this._stateManager.getSessionState(session);
		const agentMerge = readAgentMergeSessionState(current?.config?.values);
		const directory = state.workingDirectories?.[0];
		const currentDirectory = current?.workingDirectories?.[0];
		if (!agentMerge
			|| !structuralEquals(agentMerge, readAgentMergeSessionState(state.config?.values))
			|| !structuralEquals(this._getConfiguration(agentMerge), configuration)
			|| !isEqual(directory ? URI.parse(directory) : undefined, currentDirectory ? URI.parse(currentDirectory) : undefined)) {
			this._logService.debug(`[AgentMergeController] Reevaluating because the session or configuration changed: session=${session}`);
			this._schedule(session, 0);
			return false;
		}
		return true;
	}

	private _getConfiguration(agentMerge: AgentMergeSessionState): AgentMergeConfiguration {
		return getAgentMergeConfiguration(this._configurationService, agentMerge.overrides);
	}

	private _postEnabledNotice(session: string, agentMerge: AgentMergeSessionState): void {
		if (!agentMerge.enabled
			|| !agentMerge.target
			|| !this._isFeatureEnabled()
			|| this._stateManager.getSessionState(session)?.lifecycle !== SessionLifecycle.Ready) {
			return;
		}
		const configuration = this._getConfiguration(agentMerge);
		this._setAnnouncedConfiguration(session, agentMerge, configuration);
		this._postNotice(session, AgentSystemNotificationKind.AgentMergeEnabled, agentMergeEnabledNotice(agentMerge.target, configuration));
	}

	/**
	 * Records what was last announced for a session, together with the session
	 * overrides it was resolved from, so the next notice can name the scope of
	 * the change that produced it.
	 */
	private _setAnnouncedConfiguration(session: string, agentMerge: AgentMergeSessionState, configuration = this._getConfiguration(agentMerge)): void {
		this._announcedConfigurations.set(session, { configuration, overrides: agentMerge.overrides });
	}

	private _postConfigurationChangedNotice(session: string, current: AgentMergeSessionState | undefined): void {
		if (!current?.enabled
			|| !current.target
			|| !this._isFeatureEnabled()
			|| !this._runtimes.has(session)) {
			return;
		}
		const announced = this._announcedConfigurations.get(session);
		const currentConfiguration = this._getConfiguration(current);
		if (!announced) {
			this._setAnnouncedConfiguration(session, current, currentConfiguration);
			return;
		}
		// Unchanged session overrides mean the effective change came from defaults, including while the runtime was stopped.
		const scope: AgentMergeConfigurationChangeScope = structuralEquals(announced.overrides, current.overrides) ? 'global' : 'session';
		const notice = agentMergeConfigurationChangedNotice(announced.configuration, currentConfiguration, scope);
		this._setAnnouncedConfiguration(session, current, currentConfiguration);
		if (notice) {
			this._postNotice(session, AgentSystemNotificationKind.AgentMergeConfigurationChanged, notice);
		}
	}

	private _canRepairFork(snapshot: PullRequestSnapshot): boolean {
		const core = snapshot.core.value;
		if (!core) {
			return false;
		}
		if (!core.headRepositoryNameWithOwner) {
			// Without head provenance the host cannot establish whether pushes to the
			// pull request branch are permitted, so it waits for complete state.
			return false;
		}
		if (core.headRepositoryNameWithOwner.toLowerCase() === core.repositoryNameWithOwner.toLowerCase()) {
			return true;
		}
		return core.maintainerCanModify === true;
	}

	/** Whether the session still sits on the branch and pull request this run was authorized for. */
	private _isTargetStillCurrent(session: string, target: AgentMergeTarget): boolean {
		const state = this._stateManager.getSessionState(session);
		if (!this._hasTargetBranch(state, target.branchName)) {
			return false;
		}
		if (!target.pullRequestUrl) {
			return true;
		}
		const pullRequestUrl = getSessionRelatedPullRequestUrls(readSessionFolderGitHubState(state))[0];
		return !pullRequestUrl || pullRequestUrl.toLowerCase() === target.pullRequestUrl.toLowerCase();
	}

	private async _merge(session: string, runtime: AgentMergeRuntime, ref: PullRequestRef, snapshot: PullRequestSnapshot, configuration: AgentMergeConfiguration, agentMerge: AgentMergeSessionState): Promise<void> {
		const headSha = snapshot.core.value?.headSha;
		if (!headSha) {
			this._logService.debug(`[AgentMergeController] Merge preparation deferred because the head SHA is unavailable: session=${session}`);
			runtime.backstopScheduler.schedule();
			return;
		}
		const preparation = await this._gitHubService.mutations.prepareMerge(ref, headSha, runtime.abortController.signal);
		this._logService.debug(`[AgentMergeController] Native merge preparation completed: session=${session}`);
		if (!this._isCurrentRuntime(session, runtime) || this._stateManager.hasActiveTurn(session)) {
			runtime.backstopScheduler.schedule();
			return;
		}
		// Authorization can be withdrawn while preparation is in flight, so the
		// merge is re-authorized against live state rather than the captured copy.
		const currentState = readAgentMergeSessionState(this._stateManager.getSessionState(session)?.config?.values);
		const currentTarget = currentState?.target;
		if (!currentState?.enabled
			|| !currentTarget
			|| !this._isTargetStillCurrent(session, currentTarget)
			|| currentTarget.pullRequestUrl !== agentMerge.target?.pullRequestUrl) {
			this._logService.info(`[AgentMergeController] Native merge abandoned because authorization or target changed: session=${session}`);
			runtime.backstopScheduler.schedule();
			return;
		}
		const currentConfiguration = this._getConfiguration(currentState);
		if (!currentConfiguration.mergePullRequest) {
			this._logService.info(`[AgentMergeController] Native merge abandoned because automatic merge was switched off: session=${session}`);
			runtime.backstopScheduler.schedule();
			return;
		}
		// `prepareMerge` captures an authoritative snapshot of every fragment the gate
		// reads, with top-level comments refreshed last, so it is re-evaluated as-is.
		const freshGate = evaluateAgentMerge(preparation.snapshot, currentConfiguration, currentTarget.commentWatermark);
		if (freshGate.kind !== 'merge') {
			this._logService.info(`[AgentMergeController] Native merge aborted after fresh readiness check: session=${session}, outcome=${freshGate.kind}`);
			this._schedule(session, 0);
			return;
		}
		const authorization = {
			confirmed: true as const,
			authorizationId: `${currentTarget.enabledAt}:${currentTarget.pullRequestUrl}`,
		};
		if (preparation.snapshot.mergeability.value!.mergeQueueRequired) {
			const result = await this._gitHubService.mutations.enqueue(preparation, authorization, runtime.abortController.signal);
			this._logService.info(`[AgentMergeController] Pull request submitted to merge queue: session=${session}, outcome=${result.outcome}`);
			runtime.backstopScheduler.schedule();
			return;
		}
		const method = resolveMergeMethod(currentConfiguration.mergeMethod, preparation.snapshot.mergeability.value!.allowedMergeMethods);
		if (!method) {
			this._logService.warn(`[AgentMergeController] No allowed merge method is available for ${session}`);
			runtime.backstopScheduler.schedule();
			return;
		}
		const result = await this._gitHubService.mutations.merge(preparation, { method, authorization }, runtime.abortController.signal);
		this._logService.info(`[AgentMergeController] Pull request merged natively: session=${session}, method=${method}, outcome=${result.outcome}`);
		const mergedPullRequest = preparation.snapshot.core.value!;
		this._disable(
			session,
			currentState,
			agentMergeDisableReasons.pullRequestMerged(mergedPullRequest.number, mergedPullRequest.url),
			AgentSystemNotificationKind.AgentMergePullRequestMerged,
		);
	}

	private async _completeTurn(session: string): Promise<void> {
		const context = this._activeTurns.get(session);
		if (!context) {
			this._schedule(session, 0);
			return;
		}
		this._activeTurns.delete(session);
		const state = this._stateManager.getSessionState(session);
		const completedTurn = state?.turns.find(turn => turn.id === context.turnId);
		const agentMerge = readAgentMergeSessionState(state?.config?.values);
		const runtime = this._runtimes.get(session);
		if (!agentMerge?.enabled || !runtime?.subscription.value) {
			this._logService.debug(`[AgentMergeController] Repair turn ended after Agent Merge stopped: session=${session}, turn=${context.turnId}, outcome=${completedTurn?.state ?? 'unknown'}`);
			return;
		}
		const shouldAdvanceWatermark = context.actions.includes('addressReviews') && completedTurn?.state === TurnState.Complete;
		this._logService.info(`[AgentMergeController] Repair turn ended: session=${session}, turn=${context.turnId}, outcome=${completedTurn?.state ?? 'unknown'}, advanceFeedbackWatermark=${shouldAdvanceWatermark}`);
		if (shouldAdvanceWatermark && agentMerge.target && context.commentWatermark !== agentMerge.target.commentWatermark) {
			this._updateAgentMergeState(session, agentMerge, {
				target: { ...agentMerge.target, commentWatermark: context.commentWatermark },
			});
		}

		// Decided here rather than on the next evaluation because the local
		// commit is authoritative the instant the agent makes it, while the
		// pull request's published head lags behind the push. Re-read the state
		// so an advanced watermark is not written back stale.
		const current = readAgentMergeSessionState(this._stateManager.getSessionState(session)?.config?.values) ?? agentMerge;
		if (await this._demoteMergePullRequestIfChanged(session, current, this._getConfiguration(current))) {
			// The config write re-enters evaluation with the demoted value.
			return;
		}

		try {
			await runtime.subscription.value.refresh(undefined, runtime.cancellation.token, { authoritative: true });
		} catch (error) {
			this._logService.warn(`[AgentMergeController] Failed to refresh pull request after turn for ${session}`, error);
		}
		this._schedule(session, 0);
	}

	/**
	 * Resolves the session worktree's current commit, or `undefined` when the
	 * worktree cannot be read. Callers treat `undefined` as "changed" so an
	 * unreadable worktree can never authorize an automatic merge.
	 */
	private async _resolveLocalCommit(session: string): Promise<string | undefined> {
		try {
			const workingDirectory = this._stateManager.getSessionState(session)?.workingDirectories?.[0];
			if (!workingDirectory) {
				return undefined;
			}
			const repositoryRoot = await this._gitService.getRepositoryRoot(URI.parse(workingDirectory));
			return repositoryRoot ? await this._gitService.revParse(repositoryRoot, 'HEAD') : undefined;
		} catch (error) {
			this._logService.warn(`[AgentMergeController] Failed to resolve the local commit: session=${session}`, error);
			return undefined;
		}
	}

	/**
	 * Turns automatic merging off once a repair turn has produced work, for
	 * sessions that only authorized merging while the pull request is unchanged.
	 *
	 * The chosen value is rewritten rather than merely gated so the dropdown
	 * always shows what will actually happen, and so re-selecting the option
	 * establishes a fresh baseline. Returns whether the value was demoted.
	 */
	private async _demoteMergePullRequestIfChanged(
		session: string,
		agentMerge: AgentMergeSessionState,
		configuration: AgentMergeConfiguration,
	): Promise<boolean> {
		if (configuration.mergePullRequest !== 'ifUnchanged' || agentMerge.repairBaseCommit === undefined) {
			return false;
		}
		const currentCommit = await this._resolveLocalCommit(session);
		const current = readAgentMergeSessionState(this._stateManager.getSessionState(session)?.config?.values);
		if (!current
			|| !structuralEquals(current, agentMerge)
			|| !structuralEquals(this._getConfiguration(current), configuration)) {
			return false;
		}
		if (!shouldStopMergingAfterAgentChanges(configuration, agentMerge, currentCommit)) {
			return false;
		}
		this._logService.info(`[AgentMergeController] Turning automatic merge off because a repair turn changed the worktree: session=${session}, repairBaseCommit=${agentMerge.repairBaseCommit}, currentCommit=${currentCommit ?? 'unresolved'}`);
		this._postNotice(session, AgentSystemNotificationKind.AgentMergeDisabled, agentMergeMergePullRequestDemotedNotice());
		const overrides = { ...agentMerge.overrides, mergePullRequest: 'never' } as const;
		this._setAnnouncedConfiguration(session, { ...agentMerge, overrides });
		this._configurationService.updateSessionConfig(session, {
			[SessionConfigKey.AgentMerge]: {
				enabled: agentMerge.enabled,
				overrides,
			},
			// Dropping the baseline is what makes re-selecting the option start
			// fresh: without it the next evaluation would demote again against
			// this very same commit.
			[SessionConfigKey.AgentMergeController]: toControllerState(agentMerge, { repairBaseCommit: undefined }),
		});
		return true;
	}

	/**
	 * Drops the repair baseline when the user selects "merge only while
	 * unchanged" afresh.
	 *
	 * The client writes only its own Agent Merge state, so a baseline recorded
	 * by an earlier repair turn survives the selection. Without this reset the
	 * next evaluation would immediately demote the choice back to `never`
	 * against work the user has already seen, and the option could never be
	 * turned back on. Returns whether a reset was written.
	 */
	private _resetRepairBaselineOnReselection(
		session: string,
		previous: AgentMergeSessionState | undefined,
		current: AgentMergeSessionState | undefined,
	): boolean {
		if (!current || current.repairBaseCommit === undefined) {
			return false;
		}
		if (this._getConfiguration(current).mergePullRequest !== 'ifUnchanged') {
			return false;
		}
		if (previous && this._getConfiguration(previous).mergePullRequest === 'ifUnchanged') {
			return false;
		}
		this._logService.info(`[AgentMergeController] Starting a fresh unchanged-merge baseline after the choice was reselected: session=${session}`);
		this._updateAgentMergeState(session, current, { repairBaseCommit: undefined });
		return true;
	}

	private _updateAgentMergeState(session: string, current: AgentMergeSessionState, patch: Partial<AgentMergeSessionState>): void {
		this._configurationService.updateSessionConfig(session, {
			[SessionConfigKey.AgentMergeController]: toControllerState(current, patch),
		});
	}

	private _disable(session: string, current: AgentMergeSessionState, reason: AgentMergeDisableReason, notificationKind = AgentSystemNotificationKind.AgentMergeDisabled): void {
		this._logService.info(`[AgentMergeController] Disabling Agent Merge for ${session}: ${reason.log}`);
		this._activeTurns.delete(session);
		// Claim the transition before the config write re-enters `_doSyncSession`,
		// so the reasoned notice below is the only one the user sees.
		this._monitoredSessions.delete(session);
		this._announcedConfigurations.delete(session);
		this._postNotice(session, notificationKind, reason.notice);
		const patch: Record<string, unknown> = {
			[SessionConfigKey.AgentMerge]: {
				enabled: false,
				...(current.overrides ? { overrides: current.overrides } : {}),
			},
			[SessionConfigKey.AgentMergeController]: {},
		};
		this._addInjectedConfigurationRestore(patch, session, current);
		this._configurationService.updateSessionConfig(session, patch);
		this._stopRuntime(session);
	}

	/**
	 * Reports an Agent Merge state change in the session transcript. A failure to
	 * announce must never interrupt monitoring, so the notice is best-effort.
	 */
	private _postNotice(session: string, kind: AgentSystemNotificationKind, content: string): void {
		try {
			this._options.postNotice(session, kind, content);
		} catch (error) {
			this._logService.warn(`[AgentMergeController] Failed to post an Agent Merge notice: session=${session}`, error);
		}
	}

	private _addInjectedConfigurationRestore(patch: Record<string, unknown>, session: string, agentMerge: AgentMergeSessionState): void {
		const injected = agentMerge.injectedConfiguration;
		if (!injected) {
			return;
		}
		const values = this._configurationService.getSessionConfigValues(session) ?? {};
		for (const [key, appliedValue] of Object.entries(injected.applied)) {
			if (structuralEquals(values[key], appliedValue)) {
				patch[key] = injected.previous[key];
			}
		}
	}

	private _stopRuntime(session: string): void {
		// A repair turn started by this controller must not keep running with the
		// elevated capabilities that Agent Merge granted it.
		const context = this._activeTurns.get(session);
		if (context) {
			this._activeTurns.delete(session);
			if (this._stateManager.getSessionState(session)?.activeTurn?.id === context.turnId) {
				this._logService.info(`[AgentMergeController] Cancelling repair turn because Agent Merge stopped: session=${session}, turn=${context.turnId}`);
				this._options.cancelTurn(session, context.turnId);
			}
		}
		if (this._runtimes.has(session)) {
			this._runtimes.deleteAndDispose(session);
			this._logService.debug(`[AgentMergeController] Disposed session runtime: session=${session}`);
		}
		// Also reached directly when the session is removed from state, which
		// does not go through `_syncSession`.
		this._updateHold(session);
	}

	private _hasTargetBranch(state: ReturnType<AgentHostStateManager['getSessionState']>, branchName: string): boolean {
		return readSessionGitState(state?._meta)?.branchName === branchName;
	}

	/** Resolves the organization owning the bound pull request, for diagnostics. */
	private _organizationForSession(session: string): string | undefined {
		const state = this._stateManager.getSessionState(session);
		const pullRequestUrl = readAgentMergeSessionState(state?.config?.values)?.target?.pullRequestUrl;
		return pullRequestUrl ? parsePullRequestUrl(pullRequestUrl)?.owner : undefined;
	}

	/**
	 * Asks the client for a credential that can read the bound pull request,
	 * naming the organization to authorize when GitHub reports SAML enforcement.
	 */
	private _requestGitHubAuthorization(session: string, kind: 'authentication' | 'authorization', message: string): void {
		this._stateManager.emitAuthRequired({
			resource: this._gitHubEndpointService.getRepoResource(),
			reason: AuthRequiredReason.Required,
		});
		const organization = this._organizationForSession(session);
		const remedy = isSamlEnforcementError(message) && organization
			? `; the credential must be SSO-authorized for ${organization}`
			: '';
		this._logService.warn(`[AgentMergeController] GitHub refused the credential (${kind})${remedy}: session=${session}`);
	}

	/**
	 * Requests a credential when a fragment the gate needs was refused by
	 * GitHub, which only the first refresh of a subscription reports by throwing.
	 */
	private _reportBlockedCredential(session: string, runtime: AgentMergeRuntime, snapshot: PullRequestSnapshot): void {
		const blocked = firstCredentialFailure(snapshot);
		if (!blocked) {
			runtime.reportedCredentialFailure = undefined;
			return;
		}
		if (runtime.reportedCredentialFailure === blocked.id) {
			return;
		}
		runtime.reportedCredentialFailure = blocked.id;
		this._requestGitHubAuthorization(session, blocked.kind, blocked.message);
	}

	/**
	 * Reports whether one unchanged indeterminate cause has persisted past its
	 * budget, measured over continuously observed time so a turn or a sleeping
	 * host cannot exhaust it.
	 */
	private _isIndeterminateBudgetExhausted(session: string, runtime: AgentMergeRuntime, cause: string): boolean {
		const now = Date.now();
		const current = runtime.indeterminate;
		if (current?.cause !== cause || now - current.observedAt > indeterminateObservationGap) {
			runtime.indeterminate = { cause, since: now, observedAt: now };
			return false;
		}
		current.observedAt = now;
		if (now - current.since < maximumIndeterminateDuration) {
			return false;
		}
		this._logService.warn(`[AgentMergeController] Indeterminate budget exhausted: session=${session}, cause=${cause}`);
		return true;
	}

	private _logGateResult(session: string, gate: ReturnType<typeof evaluateAgentMerge>): void {
		switch (gate.kind) {
			case 'prompt':
				this._logService.debug(`[AgentMergeController] Gate selected repair: session=${session}, actions=${gate.actions.join(',')}, reviewThreads=${gate.context.reviewThreads.length}, reviewSummaries=${gate.context.reviewSummaries.length}, newComments=${gate.context.newComments.length}, failedChecks=${gate.context.failedChecks.length}, behind=${gate.context.behind}, conflicting=${gate.context.conflicting}`);
				break;
			case 'merge':
				this._logService.debug(`[AgentMergeController] Gate selected native merge: session=${session}`);
				break;
			case 'noWork':
				this._logService.trace(`[AgentMergeController] Gate found no work: session=${session}, waitingOnChecks=${gate.waitingOnChecks}`);
				break;
			case 'indeterminate':
				this._logService.debug(`[AgentMergeController] Gate is indeterminate: session=${session}, reason=${gate.reason}`);
				break;
			case 'terminal':
				this._logService.debug(`[AgentMergeController] Gate found terminal pull request state: session=${session}`);
				break;
		}
	}
}

interface IParsedPullRequestUrl {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
	/** REST API host the credential account must match (`api.github.com` for github.com). */
	readonly apiHost: string;
}

export function parsePullRequestUrl(value: string): IParsedPullRequestUrl | undefined {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return undefined;
	}
	const match = /^\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/pull\/(?<number>\d+)\/?$/.exec(url.pathname);
	const number = Number(match?.groups?.number);
	if (!match?.groups || !Number.isSafeInteger(number) || number <= 0) {
		return undefined;
	}
	const host = url.host.toLowerCase();
	return {
		owner: match.groups.owner,
		repo: match.groups.repo,
		number,
		// Derived rather than hard-coded so GitHub Enterprise Cloud web hosts
		// (`tenant.ghe.com`) canonicalize to the `api.` host the credential reports.
		apiHost: new URL(deriveGitHubEndpoints(`${url.protocol}//${host}`).apiBaseUri).host.toLowerCase(),
	};
}

function sameRef(left: PullRequestRef, right: PullRequestRef): boolean {
	return left.host.toLowerCase() === right.host.toLowerCase()
		&& left.accountId === right.accountId
		&& left.owner.toLowerCase() === right.owner.toLowerCase()
		&& left.repo.toLowerCase() === right.repo.toLowerCase()
		&& left.number === right.number;
}

function shouldRunFingerprint(state: AgentMergeSessionState, fingerprint: string): boolean {
	if (state.lastPromptFingerprint !== fingerprint || !state.lastPromptAt) {
		return true;
	}
	const lastPromptAt = Date.parse(state.lastPromptAt);
	return !Number.isFinite(lastPromptAt) || Date.now() - lastPromptAt >= backstopInterval;
}

function toControllerState(current: AgentMergeSessionState, patch: Partial<AgentMergeSessionState>): Omit<AgentMergeSessionState, 'enabled' | 'overrides'> {
	const next = { ...current, ...patch };
	return {
		...(next.target ? { target: next.target } : {}),
		...(next.injectedConfiguration ? { injectedConfiguration: next.injectedConfiguration } : {}),
		...(next.lastPromptFingerprint ? { lastPromptFingerprint: next.lastPromptFingerprint } : {}),
		...(next.lastPromptAt ? { lastPromptAt: next.lastPromptAt } : {}),
		...(next.repeatedPromptCount !== undefined ? { repeatedPromptCount: next.repeatedPromptCount } : {}),
		...(next.totalPromptCount !== undefined ? { totalPromptCount: next.totalPromptCount } : {}),
		...(next.repairBaseCommit ? { repairBaseCommit: next.repairBaseCommit } : {}),
	};
}

function formatOverrideKeys(state: AgentMergeSessionState): string {
	return state.overrides ? Object.keys(state.overrides).sort().join(',') || 'none' : 'none';
}

function githubErrorKind(error: unknown): string {
	return error instanceof GitHubRequestError
		? `${error.kind}${error.statusCode === undefined ? '' : `:${error.statusCode}`}`
		: error instanceof Error ? error.name : typeof error;
}

/** Detects the SAML single sign-on refusal GitHub returns for organizations that enforce it. */
export function isSamlEnforcementError(message: string): boolean {
	return message.toLowerCase().includes('saml enforcement');
}

/** Finds the first fragment the gate needs that GitHub refused to serve. */
export function firstCredentialFailure(snapshot: PullRequestSnapshot): { readonly id: string; readonly kind: 'authentication' | 'authorization'; readonly message: string } | undefined {
	for (const fragment of agentMergeGateFragments) {
		const error = snapshot[fragment].error;
		if (error?.kind === 'authentication' || error?.kind === 'authorization') {
			return { id: `${fragment}:${error.kind}`, kind: error.kind, message: error.message };
		}
	}
	return undefined;
}
