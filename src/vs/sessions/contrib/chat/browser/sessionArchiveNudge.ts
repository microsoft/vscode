/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { structuralEquals } from '../../../../base/common/equals.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IObservable, IReader, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { getComparisonKey, isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { getChatSessionArchiveActionWording } from '../../../../platform/chat/common/sessionArchiveActions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { parseGitHubPullRequestUrl } from '../../../../platform/github/common/githubUrls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { logSettingExperimentTrigger } from '../../../../platform/telemetry/common/experimentTrigger.js';
import { IChatSessionArchiveNudgeOptions } from '../../../../workbench/contrib/chat/browser/widget/input/chatSessionArchiveNudge.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel } from '../../../../workbench/contrib/chat/common/model/chatModel.js';
import { onboardingScenarioRegistry } from '../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { OnboardingOutcome } from '../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService, ONBOARDING_ENABLED_CONFIG } from '../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { hashSessionIdForTelemetry } from '../../../common/sessionsTelemetry.js';
import { getSessionOwnedGitHubPullRequestRefs, IChat, isActiveSessionStatus, ISession, SessionArtifactKind, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { GitHubPullRequestState } from '../../github/common/types.js';
import { getPullRequestKey } from '../../github/common/utils.js';
import { AUTOMATIC_MERGED_SESSION_CLEANUP_SETTINGS_QUERY } from '../../github/common/sessionLifecycleSettings.js';
import { createSessionArchiveTour, SESSION_ARCHIVE_TOUR_ID } from '../../onboardingTours/browser/tours/sessionArchiveTour.js';
import { getSessionArchiveOnboardingTargetId } from '../../sessions/browser/views/sessionsList.js';
import { SessionsView, SessionsViewId } from '../../sessions/browser/views/sessionsView.js';

export const SESSION_ARCHIVE_NUDGE_SETTING = 'chat.agentSessions.archiveNudge.enabled';

const DISMISSED_STORAGE_KEY_PREFIX = 'sessions.archiveNudge.dismissed.';
const IMPRESSION_STORAGE_KEY_PREFIX = 'sessions.archiveNudge.impression.';
const ARCHIVE_COUNT_STORAGE_KEY = 'sessions.archiveNudge.archiveCount';
const COMPACT_AFTER_ARCHIVE_COUNT = 3;

/** The chat whose input shows the suggestion, and the session the suggestion archives. */
export interface ISessionArchiveNudgeTarget {
	readonly session: ISession;
	readonly chat: IChat;
}

interface ISessionArchiveNudgeState {
	readonly session: ISession;
	readonly hasWorktree: boolean;
	readonly pullRequestCount: number;
}

interface ISessionArchiveNudgeCandidate extends ISessionArchiveNudgeState {
	readonly pullRequestKeys: readonly string[];
}

interface ISessionArchiveNudgeImpression {
	readonly pullRequestKeys: readonly string[];
	readonly lastRequestIds: Record<string, string | undefined>;
	readonly shownAt: number;
	readonly continued: boolean;
	/**
	 * Pull requests already suppressed by an earlier continuation. Another chat's suggestion records a new
	 * impression without showing these again. Absent from impressions stored before this field existed.
	 */
	readonly continuedPullRequestKeys?: readonly string[];
}

export interface ISessionArchiveNudgeService {
	readonly _serviceBrand: undefined;
	/**
	 * Whether this window has yet to report where a suggestion would show. Until then,
	 * disabled and dismissed suggestions still resolve whether they would show, because
	 * only arms that render the suggestion can dismiss it.
	 */
	readonly experimentTriggerPending: IObservable<boolean>;
	isDismissed(session: ISession, reader: IReader | undefined): boolean;
	hasContinued(session: ISession, pullRequestKeys: readonly string[], reader: IReader | undefined): boolean;
	shouldShowCompact(reader: IReader | undefined): boolean;
	/** Reports the enablement experiment trigger of a suggestion that would show if it were enabled and not dismissed. */
	reportWouldShow(): void;
	markShown(state: ISessionArchiveNudgeCandidate): void;
	dismiss(state: ISessionArchiveNudgeState): void;
	showArchiveOnboarding(session: ISession): Promise<void>;
	archive(state: ISessionArchiveNudgeState): Promise<void>;
}

export const ISessionArchiveNudgeService = createDecorator<ISessionArchiveNudgeService>('sessionArchiveNudgeService');

type SessionArchiveNudgeEvent = {
	agentSessionId: string;
	action: 'shown' | 'dismissed' | 'archived';
	pullRequestCount: number;
	hasWorktree: boolean;
};

type SessionArchiveNudgeClassification = {
	owner: 'benibenj';
	comment: 'Tracks exposure to and interaction with the session archive suggestion after GitHub pull requests associated with the session have merged.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'SHA-1 hash of the globally unique session identifier, matching session lifecycle events without exposing provider or resource details.' };
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the suggestion was shown, dismissed, or used to archive the session.' };
	pullRequestCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of distinct merged GitHub pull requests from the artifacts and session-owned associations of the chat showing the suggestion.' };
	hasWorktree: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the suggestion explained worktree cleanup.' };
};

export class SessionArchiveNudgeService extends Disposable implements ISessionArchiveNudgeService {
	declare readonly _serviceBrand: undefined;

	private readonly _shown = new Set<string>();
	private readonly _dismissalChanged: IObservable<void>;
	private readonly _impressionChanged: IObservable<void>;
	private readonly _archiveCountChanged: IObservable<void>;
	private readonly _onboardingStore = this._register(new MutableDisposable<DisposableStore>());
	private _onboardingInFlight: Promise<void> | undefined;
	private readonly _experimentTriggerPending = observableValue(this, true);
	readonly experimentTriggerPending: IObservable<boolean> = this._experimentTriggerPending;

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IOnboardingScenarioService private readonly _onboardingService: IOnboardingScenarioService,
		@IChatService private readonly _chatService: IChatService,
	) {
		super();

		this._dismissalChanged = observableSignalFromEvent(this, Event.filter(
			this._storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this._store),
			event => event.key.startsWith(DISMISSED_STORAGE_KEY_PREFIX),
		));
		this._archiveCountChanged = observableSignalFromEvent(this, this._storageService.onDidChangeValue(StorageScope.PROFILE, ARCHIVE_COUNT_STORAGE_KEY, this._store));
		this._impressionChanged = observableSignalFromEvent(this, Event.filter(
			this._storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this._store),
			event => event.key.startsWith(IMPRESSION_STORAGE_KEY_PREFIX),
		));
		this._register(this._sessionsManagementService.onDidArchiveSession(session => this._clear(session)));
		this._register(this._sessionsManagementService.onDidUnarchiveSession(session => this._clear(session)));
		this._register(this._sessionsManagementService.onDidDeleteSession(session => this._clear(session)));

		const sessionsChanged = observableSignalFromEvent(this, this._sessionsManagementService.onDidChangeSessions);
		this._register(autorun(reader => {
			sessionsChanged.read(reader);
			this._dismissalChanged.read(reader);
			this._impressionChanged.read(reader);
			for (const session of this._sessionsManagementService.getSessions()) {
				const impression = this._getImpression(session, reader);
				if ((impression || this.isDismissed(session, reader)) && session.isArchived.read(reader)) {
					this._clear(session);
				} else if (impression && !impression.continued) {
					const continued = this._getChatModels(session, reader).some(model => {
						const request = model.lastRequestObs.read(reader);
						const chatResource = getComparisonKey(model.sessionResource);
						// Ignore older history revealed by request removal or lazy chat loading.
						return !!request && request.timestamp >= impression.shownAt
							&& (!Object.hasOwn(impression.lastRequestIds, chatResource) || request.id !== impression.lastRequestIds[chatResource]);
					});
					if (continued) {
						this._storageService.store(`${IMPRESSION_STORAGE_KEY_PREFIX}${session.sessionId}`, { ...impression, continued: true }, StorageScope.PROFILE, StorageTarget.MACHINE);
					}
				}
			}
		}));
	}

	isDismissed(session: ISession, reader: IReader | undefined): boolean {
		this._dismissalChanged.read(reader);
		return this._storageService.getBoolean(`${DISMISSED_STORAGE_KEY_PREFIX}${session.sessionId}`, StorageScope.PROFILE, false);
	}

	hasContinued(session: ISession, pullRequestKeys: readonly string[], reader: IReader | undefined): boolean {
		const continuedKeys = getContinuedPullRequestKeys(this._getImpression(session, reader));
		return pullRequestKeys.length > 0 && pullRequestKeys.every(key => continuedKeys.has(key));
	}

	shouldShowCompact(reader: IReader | undefined): boolean {
		this._archiveCountChanged.read(reader);
		return this._storageService.getNumber(ARCHIVE_COUNT_STORAGE_KEY, StorageScope.PROFILE, 0) >= COMPACT_AFTER_ARCHIVE_COUNT;
	}

	reportWouldShow(): void {
		logSettingExperimentTrigger(this._telemetryService, SESSION_ARCHIVE_NUDGE_SETTING);
		this._experimentTriggerPending.set(false, undefined);
	}

	markShown(state: ISessionArchiveNudgeCandidate): void {
		const impression = this._getImpression(state.session, undefined);
		if (!impression || state.pullRequestKeys.some(key => !impression.pullRequestKeys.includes(key))) {
			const lastRequestIds = Object.fromEntries<string | undefined>(this._getChatModels(state.session, undefined).map(model => [
				getComparisonKey(model.sessionResource), model.lastRequestObs.get()?.id,
			]));
			this._storageService.store(`${IMPRESSION_STORAGE_KEY_PREFIX}${state.session.sessionId}`, {
				pullRequestKeys: [...new Set([...(impression?.pullRequestKeys ?? []), ...state.pullRequestKeys])],
				lastRequestIds,
				shownAt: Date.now(),
				continued: false,
				continuedPullRequestKeys: [...getContinuedPullRequestKeys(impression)],
			} satisfies ISessionArchiveNudgeImpression, StorageScope.PROFILE, StorageTarget.MACHINE);
		}
		if (!this._shown.has(state.session.sessionId)) {
			this._shown.add(state.session.sessionId);
			this._log(state, 'shown');
		}
	}

	dismiss(state: ISessionArchiveNudgeState): void {
		this._storageService.store(`${DISMISSED_STORAGE_KEY_PREFIX}${state.session.sessionId}`, true, StorageScope.PROFILE, StorageTarget.MACHINE);
		this._log(state, 'dismissed');
	}

	async archive(state: ISessionArchiveNudgeState): Promise<void> {
		await this._sessionsManagementService.archiveSession(state.session);
		if (!state.session.isArchived.get()) {
			throw new Error(localize('sessionArchiveNudge.updateFailed', "The session could not be updated. Check its connection and try again."));
		}
		const archiveCount = this._storageService.getNumber(ARCHIVE_COUNT_STORAGE_KEY, StorageScope.PROFILE, 0);
		this._storageService.store(ARCHIVE_COUNT_STORAGE_KEY, Math.min(archiveCount + 1, COMPACT_AFTER_ARCHIVE_COUNT), StorageScope.PROFILE, StorageTarget.MACHINE);
		this._log(state, 'archived');
	}

	async showArchiveOnboarding(session: ISession): Promise<void> {
		if (this._onboardingInFlight) {
			return this._onboardingInFlight;
		}
		if (this._configurationService.getValue<boolean>(ONBOARDING_ENABLED_CONFIG) === false
			|| this._onboardingService.hasBeenShown(SESSION_ARCHIVE_TOUR_ID)) {
			return;
		}
		this._onboardingInFlight = this._showArchiveOnboarding(session);
		try {
			await this._onboardingInFlight;
		} finally {
			this._onboardingInFlight = undefined;
		}
	}

	private async _showArchiveOnboarding(session: ISession): Promise<void> {
		const store = new DisposableStore();
		this._onboardingStore.value = store;
		const target = store.add(new MutableDisposable<IDisposable>());
		const scenario = createSessionArchiveTour(getSessionArchiveOnboardingTargetId(session), getChatSessionArchiveActionWording(this._configurationService), async () => {
			const view = await this._viewsService.openView<SessionsView>(SessionsViewId, true);
			view?.setExpanded(true);
			if (!view?.sessionsControl || store.isDisposed) {
				throw new Error(localize('archiveOnboarding.listUnavailable', "The sessions list could not be opened. Try again."));
			}
			target.value = view.sessionsControl.revealArchiveAction(session);
		});
		try {
			store.add(onboardingScenarioRegistry.register(scenario));
			const outcome = await this._onboardingService.runScenario(scenario.id);
			if (outcome !== OnboardingOutcome.Completed && outcome !== OnboardingOutcome.Skipped) {
				// Allow the optional introduction to retry later without blocking the requested archive.
				this._onboardingService.reset(scenario.id);
			}
		} finally {
			this._onboardingStore.clear();
		}
	}

	private _clear(session: ISession): void {
		this._shown.delete(session.sessionId);
		this._storageService.remove(`${IMPRESSION_STORAGE_KEY_PREFIX}${session.sessionId}`, StorageScope.PROFILE);
		this._storageService.remove(`${DISMISSED_STORAGE_KEY_PREFIX}${session.sessionId}`, StorageScope.PROFILE);
	}

	private _getImpression(session: ISession, reader: IReader | undefined): ISessionArchiveNudgeImpression | undefined {
		this._impressionChanged.read(reader);
		return this._storageService.getObject<ISessionArchiveNudgeImpression>(`${IMPRESSION_STORAGE_KEY_PREFIX}${session.sessionId}`, StorageScope.PROFILE);
	}

	private _getChatModels(session: ISession, reader: IReader | undefined): IChatModel[] {
		const resources = new Set([session.mainChat.read(reader).resource, ...session.chats.read(reader).map(chat => chat.resource)].map(resource => getComparisonKey(resource)));
		return [...this._chatService.chatModels.read(reader)].filter(model => resources.has(getComparisonKey(model.sessionResource)));
	}

	private _log(state: ISessionArchiveNudgeState, action: SessionArchiveNudgeEvent['action']): void {
		this._telemetryService.publicLog2<SessionArchiveNudgeEvent, SessionArchiveNudgeClassification>('agents/sessionArchiveNudge', {
			agentSessionId: hashSessionIdForTelemetry(state.session.sessionId),
			action,
			pullRequestCount: state.pullRequestCount,
			hasWorktree: state.hasWorktree,
		});
	}
}

/** Keeps suggestion history and lifecycle cleanup running even when no chat view is open. */
export class SessionArchiveNudgeContribution {
	static readonly ID = 'workbench.contrib.sessionArchiveNudge';

	constructor(@ISessionArchiveNudgeService _service: ISessionArchiveNudgeService) { }
}

function getContinuedPullRequestKeys(impression: ISessionArchiveNudgeImpression | undefined): ReadonlySet<string> {
	return new Set([...(impression?.continuedPullRequestKeys ?? []), ...(impression?.continued ? impression.pullRequestKeys : [])]);
}

function isSessionAvailableForArchiveNudge(session: ISession, reader: IReader | undefined): boolean {
	if (session.isArchived.read(reader) || session.loading.read(reader)) {
		return false;
	}
	const status = session.status.read(reader);
	if (status === SessionStatus.Untitled || isActiveSessionStatus(status) || session.isNewSessionRequestInProgress?.read(reader)) {
		return false;
	}
	if (session.chats.read(reader).some(chat => isActiveSessionStatus(chat.status.read(reader)))) {
		return false;
	}
	const connectionStatus = session.remoteConnectionStatus?.read(reader);
	return !connectionStatus || connectionStatus.kind === 'connected';
}

/**
 * The GitHub pull requests of `chat`: the artifacts it recorded, where unowned legacy records belong to the main
 * chat, and the session-owned associations of its workspace, except those another chat recorded. `undefined` when
 * any of them cannot be resolved.
 */
function getChatPullRequests(session: ISession, chat: IChat, reader: IReader): readonly { owner: string; repo: string; number: number }[] | undefined {
	const pullRequests = new Map<string, { owner: string; repo: string; number: number }>();
	function normalize(pullRequest: { owner: string; repo: string; number: number }): { key: string; pullRequest: { owner: string; repo: string; number: number } } | undefined {
		const { number } = pullRequest;
		if (!Number.isSafeInteger(number) || number < 1) {
			return undefined;
		}
		const owner = pullRequest.owner.toLowerCase();
		const repo = pullRequest.repo.toLowerCase();
		return { key: getPullRequestKey(owner, repo, number), pullRequest: { owner, repo, number } };
	}
	const mainChat = session.mainChat.read(reader).resource;
	const otherRecordIds = new Set<string>();
	const otherPullRequestKeys = new Set<string>();
	for (const artifact of session.artifacts?.read(reader) ?? []) {
		const isOwnRecord = isEqual(artifact.chat ?? mainChat, chat.resource);
		if (!isOwnRecord) {
			otherRecordIds.add(artifact.id);
		}
		if (!artifact.isArtifact || artifact.kind !== SessionArtifactKind.PullRequest || artifact.isGitHub === false) {
			continue;
		}
		const parsed = artifact.link && parseGitHubPullRequestUrl(artifact.link.toString());
		const normalized = parsed ? normalize(parsed) : undefined;
		if (!isOwnRecord) {
			// Another chat's pull request only matters for keeping its associations out of this chat.
			if (normalized) {
				otherPullRequestKeys.add(normalized.key);
			}
			continue;
		}
		if (!parsed) {
			if (artifact.isGitHub || artifact.link?.authority.toLowerCase() === 'github.com') {
				return undefined;
			}
			continue;
		}
		if (!normalized) {
			return undefined;
		}
		pullRequests.set(normalized.key, normalized.pullRequest);
	}
	const workspace = chat.workspace?.read(reader) ?? session.workspace.read(reader);
	for (const folder of workspace?.folders ?? []) {
		for (const ref of getSessionOwnedGitHubPullRequestRefs(folder.gitRepository?.gitHubInfo.read(reader))) {
			// Providers echo every chat's records into the workspace associations; only the recording chat owns them.
			if (ref.recordedReferenceId && otherRecordIds.has(ref.recordedReferenceId)) {
				continue;
			}
			const parsed = parseGitHubPullRequestUrl(ref.uri.toString());
			const normalized = parsed ? normalize(parsed) : undefined;
			if (!normalized) {
				return undefined;
			}
			if (otherPullRequestKeys.has(normalized.key) && !pullRequests.has(normalized.key)) {
				continue;
			}
			pullRequests.set(normalized.key, normalized.pullRequest);
		}
	}
	return [...pullRequests.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, pullRequest]) => pullRequest);
}

export class SessionArchiveNudge extends Disposable {
	readonly options: IObservable<IChatSessionArchiveNudgeOptions | undefined>;
	private readonly _state: IObservable<ISessionArchiveNudgeCandidate | undefined>;

	constructor(
		target: IObservable<ISessionArchiveNudgeTarget | undefined>,
		@IConfigurationService configurationService: IConfigurationService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IGitHubService gitHubService: IGitHubService,
		@ISessionArchiveNudgeService private readonly _nudgeService: ISessionArchiveNudgeService,
		@ICommandService commandService: ICommandService,
	) {
		super();

		const enabled = observableConfigValue<boolean>(SESSION_ARCHIVE_NUDGE_SETTING, false, configurationService);
		const eligibleTarget = derived(this, reader => {
			if (chatEntitlementService.sentimentObs.read(reader).hidden) {
				return undefined;
			}
			const current = target.read(reader);
			if (!current || !isSessionAvailableForArchiveNudge(current.session, reader)) {
				return undefined;
			}
			if (!this._nudgeService.experimentTriggerPending.read(reader) && (!enabled.read(reader) || this._nudgeService.isDismissed(current.session, reader))) {
				return undefined;
			}
			return current;
		});
		const pullRequests = derivedOpts<ReturnType<typeof getChatPullRequests>>({ owner: this, equalsFn: structuralEquals }, reader => {
			const current = eligibleTarget.read(reader);
			// The shared model must not resolve github.com pull requests against an enterprise host.
			const refs = current && !gitHubService.enterpriseHost ? getChatPullRequests(current.session, current.chat, reader) : undefined;
			return current && refs && !this._nudgeService.hasContinued(current.session, refs.map(ref => getPullRequestKey(ref.owner, ref.repo, ref.number)), reader) ? refs : undefined;
		});
		const models = derived(this, reader => {
			return pullRequests.read(reader)?.map(pullRequest => {
				const model = reader.store.add(gitHubService.createPullRequestModelReference(pullRequest.owner, pullRequest.repo, pullRequest.number)).object;
				void model.refresh({ priority: 'visible' });
				reader.store.add(model.startPolling());
				return model;
			});
		});
		this._state = derivedOpts({
			owner: this,
			equalsFn: (a: ISessionArchiveNudgeCandidate | undefined, b: ISessionArchiveNudgeCandidate | undefined) =>
				a?.session === b?.session && a?.hasWorktree === b?.hasWorktree && structuralEquals(a?.pullRequestKeys, b?.pullRequestKeys),
		}, reader => {
			const current = eligibleTarget.read(reader)?.session;
			if (!current) {
				return undefined;
			}
			const refs = pullRequests.read(reader);
			if (!refs?.length) {
				return undefined;
			}
			const pullRequestModels = models.read(reader);
			const pullRequestCount = pullRequestModels?.length;
			if (!pullRequestCount || !pullRequestModels?.every(model => model.pullRequest.read(reader)?.state === GitHubPullRequestState.Merged)) {
				return undefined;
			}
			const workspace = current.workspace.read(reader);
			return {
				session: current,
				hasWorktree: !!workspace && !workspace.isVirtualWorkspace && (!!current.worktreePending?.read(reader) || workspace.folders.some(folder => !!folder.gitRepository?.workTreeUri)),
				pullRequestCount,
				pullRequestKeys: refs.map(ref => getPullRequestKey(ref.owner, ref.repo, ref.number)),
			};
		});
		this._register(autorun(reader => {
			if (this._state.read(reader)) {
				this._nudgeService.reportWouldShow();
			}
		}));
		this.options = this._state.map((state, reader) => state && enabled.read(reader) && !this._nudgeService.isDismissed(state.session, reader) ? {
			hasWorktree: state.hasWorktree,
			pullRequestCount: state.pullRequestCount,
			compact: this._nudgeService.shouldShowCompact(reader),
			onDismiss: () => this._nudgeService.dismiss(state),
			onOpenCleanupSettings: () => commandService.executeCommand('workbench.action.openSettings', AUTOMATIC_MERGED_SESSION_CLEANUP_SETTINGS_QUERY),
			onArchive: async () => {
				this._getArchiveState(state.session);
				await this._nudgeService.showArchiveOnboarding(state.session);
				await this._nudgeService.archive(this._getArchiveState(state.session));
			},
		} : undefined);
	}

	private _getArchiveState(session: ISession): ISessionArchiveNudgeState {
		const state = this._state.get();
		if (!state || state.session !== session || this._store.isDisposed) {
			throw new Error(localize('sessionArchiveNudge.noLongerAvailable', "This suggestion is no longer available. Review the session before trying again."));
		}
		return state;
	}

	markShown(): void {
		const state = this._state.get();
		if (state && this.options.get()) {
			this._nudgeService.markShown(state);
		}
	}
}
