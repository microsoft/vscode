/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { structuralEquals } from '../../../../base/common/equals.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedOpts, IObservable, IReader, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { getChatSessionArchiveActionWording } from '../../../../platform/chat/common/sessionArchiveActions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IChatSessionArchiveNudgeOptions } from '../../../../workbench/contrib/chat/browser/widget/input/chatSessionArchiveNudge.js';
import { onboardingScenarioRegistry } from '../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { OnboardingOutcome } from '../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService, ONBOARDING_ENABLED_CONFIG } from '../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { hashSessionIdForTelemetry } from '../../../common/sessionsTelemetry.js';
import { isActiveSessionStatus, ISession, ISessionArtifact, SessionArtifactKind, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { GitHubPullRequestState } from '../../github/common/types.js';
import { getPullRequestKey, parseGitHubPullRequestUrl } from '../../github/common/utils.js';
import { AUTOMATIC_MERGED_SESSION_CLEANUP_SETTINGS_QUERY } from '../../github/common/sessionLifecycleSettings.js';
import { createSessionArchiveTour, SESSION_ARCHIVE_TOUR_ID } from '../../onboardingTours/browser/tours/sessionArchiveTour.js';
import { getSessionArchiveOnboardingTargetId } from '../../sessions/browser/views/sessionsList.js';
import { SessionsView, SessionsViewId } from '../../sessions/browser/views/sessionsView.js';

export const SESSION_ARCHIVE_NUDGE_SETTING = 'chat.agentSessions.archiveNudge.enabled';

const DISMISSED_STORAGE_KEY_PREFIX = 'sessions.archiveNudge.dismissed.';

interface ISessionArchiveNudgeState {
	readonly session: ISession;
	readonly hasWorktree: boolean;
	readonly pullRequestCount: number;
}

export interface ISessionArchiveNudgeService {
	readonly _serviceBrand: undefined;
	isDismissed(session: ISession, reader: IReader | undefined): boolean;
	markShown(state: ISessionArchiveNudgeState): void;
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
	comment: 'Tracks exposure to and interaction with the session archive suggestion after pull request artifacts have merged.';
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'SHA-1 hash of the globally unique session identifier, matching session lifecycle events without exposing provider or resource details.' };
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the suggestion was shown, dismissed, or used to archive the session.' };
	pullRequestCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of distinct merged GitHub pull request artifacts.' };
	hasWorktree: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the suggestion explained worktree cleanup.' };
};

export class SessionArchiveNudgeService extends Disposable implements ISessionArchiveNudgeService {
	declare readonly _serviceBrand: undefined;

	private readonly _shown = new Set<string>();
	private readonly _dismissalChanged: IObservable<void>;
	private readonly _onboardingStore = this._register(new MutableDisposable<DisposableStore>());
	private _onboardingInFlight: Promise<void> | undefined;

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IOnboardingScenarioService private readonly _onboardingService: IOnboardingScenarioService,
	) {
		super();

		this._dismissalChanged = observableSignalFromEvent(this, Event.filter(
			this._storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this._store),
			event => event.key.startsWith(DISMISSED_STORAGE_KEY_PREFIX),
		));
		this._register(this._sessionsManagementService.onDidArchiveSession(session => this._clear(session)));
		this._register(this._sessionsManagementService.onDidUnarchiveSession(session => this._clear(session)));
		this._register(this._sessionsManagementService.onDidDeleteSession(session => this._clear(session)));

		const sessionsChanged = observableSignalFromEvent(this, this._sessionsManagementService.onDidChangeSessions);
		this._register(autorun(reader => {
			sessionsChanged.read(reader);
			this._dismissalChanged.read(reader);
			for (const session of this._sessionsManagementService.getSessions()) {
				if (this.isDismissed(session, reader) && session.isArchived.read(reader)) {
					this._clear(session);
				}
			}
		}));
	}

	isDismissed(session: ISession, reader: IReader | undefined): boolean {
		this._dismissalChanged.read(reader);
		return this._storageService.getBoolean(`${DISMISSED_STORAGE_KEY_PREFIX}${session.sessionId}`, StorageScope.PROFILE, false);
	}

	markShown(state: ISessionArchiveNudgeState): void {
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
				this._onboardingService.reset(scenario.id);
				throw new Error(localize('archiveOnboarding.interrupted', "The session list introduction was interrupted. Try again."));
			}
		} finally {
			this._onboardingStore.clear();
		}
	}

	private _clear(session: ISession): void {
		this._shown.delete(session.sessionId);
		this._storageService.remove(`${DISMISSED_STORAGE_KEY_PREFIX}${session.sessionId}`, StorageScope.PROFILE);
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

/** Keeps dismissal cleanup running even when no chat view is open. */
export class SessionArchiveNudgeContribution {
	static readonly ID = 'workbench.contrib.sessionArchiveNudge';

	constructor(@ISessionArchiveNudgeService _service: ISessionArchiveNudgeService) { }
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

function getPullRequestArtifacts(artifacts: readonly ISessionArtifact[]): readonly { owner: string; repo: string; number: number }[] | undefined {
	const pullRequests = new Map<string, { owner: string; repo: string; number: number }>();
	for (const artifact of artifacts) {
		if (!artifact.isArtifact || artifact.kind !== SessionArtifactKind.PullRequest || artifact.isGitHub === false) {
			continue;
		}
		const pullRequest = artifact.link && parseGitHubPullRequestUrl(artifact.link.toString());
		if (!pullRequest) {
			if (artifact.isGitHub || artifact.link?.authority.toLowerCase() === 'github.com') {
				return undefined;
			}
			continue;
		}
		const { number } = pullRequest;
		if (!Number.isSafeInteger(number) || number < 1) {
			return undefined;
		}
		const owner = pullRequest.owner.toLowerCase();
		const repo = pullRequest.repo.toLowerCase();
		pullRequests.set(getPullRequestKey(owner, repo, number), { owner, repo, number });
	}
	return [...pullRequests.values()];
}

export class SessionArchiveNudge extends Disposable {
	readonly options: IObservable<IChatSessionArchiveNudgeOptions | undefined>;
	private readonly _state: IObservable<ISessionArchiveNudgeState | undefined>;

	constructor(
		session: IObservable<ISession | undefined>,
		@IConfigurationService configurationService: IConfigurationService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IGitHubService gitHubService: IGitHubService,
		@ISessionArchiveNudgeService private readonly _nudgeService: ISessionArchiveNudgeService,
		@ICommandService commandService: ICommandService,
	) {
		super();

		const enabled = observableConfigValue<boolean>(SESSION_ARCHIVE_NUDGE_SETTING, false, configurationService);
		const eligibleSession = derived(this, reader => {
			if (chatEntitlementService.sentimentObs.read(reader).hidden) {
				return undefined;
			}
			const current = session.read(reader);
			if (!current || !isSessionAvailableForArchiveNudge(current, reader)) {
				return undefined;
			}
			if (!enabled.read(reader) || this._nudgeService.isDismissed(current, reader)) {
				return undefined;
			}
			return current;
		});
		const pullRequests = derivedOpts<ReturnType<typeof getPullRequestArtifacts>>({ owner: this, equalsFn: structuralEquals }, reader => {
			const current = eligibleSession.read(reader);
			const artifacts = current?.artifacts?.read(reader);
			// The shared model must not resolve a github.com artifact against an enterprise host.
			return artifacts?.length && !gitHubService.enterpriseHost ? getPullRequestArtifacts(artifacts) : undefined;
		});
		const models = derived(this, reader => {
			return pullRequests.read(reader)?.map(pullRequest => {
				const model = reader.store.add(gitHubService.createPullRequestModelReference(pullRequest.owner, pullRequest.repo, pullRequest.number)).object;
				void model.refresh();
				reader.store.add(model.startPolling());
				return model;
			});
		});
		this._state = derivedOpts({
			owner: this,
			equalsFn: (a: ISessionArchiveNudgeState | undefined, b: ISessionArchiveNudgeState | undefined) =>
				a?.session === b?.session && a?.hasWorktree === b?.hasWorktree && a?.pullRequestCount === b?.pullRequestCount,
		}, reader => {
			const current = eligibleSession.read(reader);
			if (!current) {
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
			};
		});
		this.options = this._state.map(state => state && ({
			hasWorktree: state.hasWorktree,
			pullRequestCount: state.pullRequestCount,
			onDismiss: () => this._nudgeService.dismiss(state),
			onOpenCleanupSettings: () => commandService.executeCommand('workbench.action.openSettings', AUTOMATIC_MERGED_SESSION_CLEANUP_SETTINGS_QUERY),
			onArchive: async () => {
				this._getArchiveState(state.session);
				await this._nudgeService.showArchiveOnboarding(state.session);
				await this._nudgeService.archive(this._getArchiveState(state.session));
			},
		}));
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
		if (state) {
			this._nudgeService.markShown(state);
		}
	}
}
