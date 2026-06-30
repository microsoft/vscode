/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, derivedObservableWithCache, derivedOpts, IObservable, ISettableObservable, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionChangeset, ISessionChangesetOperation, ISessionFileChange } from '../../../services/sessions/common/session.js';
import { AgentFeedbackState, IAgentFeedbackService } from '../../agentFeedback/browser/agentFeedbackService.js';
import { ICodeReviewService, PRReviewStateKind } from '../../codeReview/browser/codeReviewService.js';
import { ChangesViewMode, IsolationMode } from '../common/changes.js';
import { ActiveSessionState, IChangesViewService } from '../common/changesViewService.js';

export class ChangesViewService extends Disposable implements IChangesViewService {

	declare readonly _serviceBrand: undefined;

	readonly activeSessionResourceObs: IObservable<URI | undefined>;
	readonly activeSessionTypeObs: IObservable<string | undefined>;
	readonly activeSessionIsVirtualWorkspaceObs: IObservable<boolean>;
	readonly activeSessionChangesObs: IObservable<readonly ISessionFileChange[]>;
	readonly activeSessionChangesetsObs: IObservable<readonly ISessionChangeset[] | undefined>;
	readonly activeSessionChangesetObs: IObservable<ISessionChangeset | undefined>;
	readonly activeSessionChangesetOperationsObs: IObservable<readonly ISessionChangesetOperation[]>;
	readonly activeSessionHasGitRepositoryObs: IObservable<boolean>;
	readonly activeSessionReviewCommentCountByFileObs: IObservable<Map<string, number>>;
	readonly activeSessionAgentFeedbackCountByFileObs: IObservable<Map<string, number>>;
	readonly activeSessionStateObs: IObservable<ActiveSessionState | undefined>;
	readonly activeSessionIsLoadingObs: IObservable<boolean>;

	private readonly _selectedChangesetId = observableValue<string | undefined>(this, undefined);
	setChangesetId(changesetId: string | undefined): void {
		this._selectedChangesetId.set(changesetId, undefined);
	}

	private readonly _viewModeObs: ISettableObservable<ChangesViewMode>;
	get viewModeObs() { return this._viewModeObs; }
	setViewMode(mode: ChangesViewMode): void {
		if (this._viewModeObs.get() === mode) {
			return;
		}
		this._viewModeObs.set(mode, undefined);
		this.storageService.store('changesView.viewMode', mode, StorageScope.WORKSPACE, StorageTarget.USER);
	}

	constructor(
		@IAgentFeedbackService private readonly agentFeedbackService: IAgentFeedbackService,
		@ICodeReviewService private readonly codeReviewService: ICodeReviewService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		// Active session resource
		this.activeSessionResourceObs = derivedOpts({ equalsFn: isEqual }, reader => {
			const activeSession = this.sessionsService.activeSession.read(reader);
			return activeSession?.resource;
		});

		// Active session type
		this.activeSessionTypeObs = derived(reader => {
			const activeSession = this.sessionsService.activeSession.read(reader);
			return activeSession?.sessionType;
		});

		this.activeSessionIsVirtualWorkspaceObs = derived(reader => {
			const activeSession = this.sessionsService.activeSession.read(reader);
			return activeSession?.workspace.read(reader)?.isVirtualWorkspace ?? false;
		});

		// Active session has git repository
		this.activeSessionHasGitRepositoryObs = derived(reader => {
			const isVirtualWorkspace = this.activeSessionIsVirtualWorkspaceObs.read(reader);
			if (isVirtualWorkspace) {
				return true;
			}

			const activeSession = this.sessionsService.activeSession.read(reader);
			const workspace = activeSession?.workspace.read(reader);
			return workspace?.folders[0].gitRepository !== undefined;
		});

		// Active session state
		const { isLoading, state } = this._getActiveSessionState();
		this.activeSessionIsLoadingObs = isLoading;
		this.activeSessionStateObs = state;

		// Active session review comment count by file
		this.activeSessionReviewCommentCountByFileObs = this._getActiveSessionReviewComments();

		// Active session agent feedback count by file
		this.activeSessionAgentFeedbackCountByFileObs = this._getActiveSessionAgentFeedback();

		// Changeset
		this.activeSessionChangesetsObs = derived(reader => {
			const activeSession = this.sessionsService.activeSession.read(reader);
			return activeSession?.changesets.read(reader);
		});

		this.activeSessionChangesetObs = derived<ISessionChangeset | undefined>(reader => {
			const selectedChangesetId = this._selectedChangesetId.read(reader);
			const activeSessionChangesets = this.activeSessionChangesetsObs.read(reader) ?? [];

			// Honor an explicit selection only while it is still enabled; otherwise fall
			// back to the default, first enabled changeset so the picker never shows a
			// disabled selection.
			const selectedChangeset = selectedChangesetId
				? activeSessionChangesets
					.find(c => c.id === selectedChangesetId && c.isEnabled.read(reader))
				: undefined;

			if (selectedChangeset) {
				return selectedChangeset;
			}

			const defaultChangeset = activeSessionChangesets
				.find(c => c.isDefault.read(reader));

			const firstEnabledChangeset = activeSessionChangesets
				.find(c => c.isEnabled.read(reader));

			return defaultChangeset ?? firstEnabledChangeset;
		});

		this.activeSessionChangesetOperationsObs = derived(reader => {
			const changeset = this.activeSessionChangesetObs.read(reader);
			return changeset?.operations.read(reader) ?? [];
		});

		// Changes
		this.activeSessionChangesObs = derived(reader => {
			const changeset = this.activeSessionChangesetObs.read(reader);
			return changeset?.changes.read(reader) ?? [];
		});

		// View mode
		const storedMode = this.storageService.get('changesView.viewMode', StorageScope.WORKSPACE);
		const initialMode = storedMode === ChangesViewMode.Tree ? ChangesViewMode.Tree : ChangesViewMode.List;
		this._viewModeObs = observableValue<ChangesViewMode>(this, initialMode);

		// Reset changeset selection
		this._register(autorun(reader => {
			this.activeSessionResourceObs.read(reader);
			this.setChangesetId(undefined);
		}));
	}

	private _getActiveSessionState(): { isLoading: IObservable<boolean>; state: IObservable<ActiveSessionState | undefined> } {
		const isLoadingObs = derived(reader => {
			const changeset = this.activeSessionChangesetObs.read(reader);
			if (!changeset) {
				return true;
			}

			return changeset.isLoadingChanges.read(reader);
		});

		const activeSessionStateObs = derivedObservableWithCache<ActiveSessionState | undefined>(this, (reader, lastValue) => {
			const isLoading = isLoadingObs.read(reader);
			if (isLoading) {
				return lastValue;
			}

			const activeSession = this.sessionsService.activeSession.read(reader);
			const activeSessionChanges = activeSession?.changes.read(reader) ?? [];
			const workspace = activeSession?.workspace.read(reader);

			// Session state
			const workspaceFolder = workspace?.folders[0];
			const gitRepository = workspaceFolder?.gitRepository;
			const hasGitRepository = this.activeSessionHasGitRepositoryObs.read(reader);

			const branchName = gitRepository?.branchName;
			const baseBranchName = gitRepository?.baseBranchName;

			const isMergeBaseBranchProtected = gitRepository?.baseBranchProtected;
			const isolationMode = gitRepository?.workTreeUri === undefined
				? IsolationMode.Workspace
				: IsolationMode.Worktree;

			// Pull request state
			const gitHubInfo = gitRepository?.gitHubInfo.read(reader);
			const hasPullRequest = gitHubInfo?.pullRequest?.uri !== undefined;
			const hasOpenPullRequest = hasPullRequest &&
				(gitHubInfo.pullRequest.icon?.id === Codicon.gitPullRequestDraft.id ||
					gitHubInfo.pullRequest.icon?.id === Codicon.gitPullRequest.id ||
					gitHubInfo.pullRequest.icon?.id === Codicon.gitPullRequestError.id ||
					gitHubInfo.pullRequest.icon?.id === Codicon.gitPullRequestComment.id);

			// Repository state
			const hasGitHubRemote = gitRepository?.hasGitHubRemote ?? false;
			const upstreamBranchName = gitRepository?.upstreamBranchName;
			const incomingChanges = gitRepository?.incomingChanges ?? 0;
			const outgoingChanges = gitRepository?.outgoingChanges ?? 0;
			const uncommittedChanges = gitRepository?.uncommittedChanges ?? 0;
			const hasBranchChanges = activeSessionChanges.length > 0;
			const hasGitOperationInProgress = gitRepository?.hasGitOperationInProgress ?? false;

			return {
				isolationMode,
				hasGitRepository,
				branchName,
				baseBranchName,
				isMergeBaseBranchProtected,
				upstreamBranchName,
				incomingChanges,
				outgoingChanges,
				uncommittedChanges,
				hasBranchChanges,
				hasGitHubRemote,
				hasPullRequest,
				hasOpenPullRequest,
				hasGitOperationInProgress
			} satisfies ActiveSessionState;
		});

		return {
			isLoading: isLoadingObs,
			state: derivedOpts({ equalsFn: structuralEquals },
				reader => activeSessionStateObs.read(reader))
		};
	}

	private _getActiveSessionReviewComments(): IObservable<Map<string, number>> {
		return derived(reader => {
			const sessionResource = this.activeSessionResourceObs.read(reader);
			if (!sessionResource) {
				return new Map<string, number>();
			}

			const result = new Map<string, number>();
			const prReviewState = this.codeReviewService.getPRReviewState(sessionResource).read(reader);
			if (prReviewState.kind === PRReviewStateKind.Loaded) {
				for (const comment of prReviewState.comments) {
					const uriKey = comment.uri.fsPath;
					result.set(uriKey, (result.get(uriKey) ?? 0) + 1);
				}
			}

			return result;
		});
	}

	private _getActiveSessionAgentFeedback(): IObservable<Map<string, number>> {
		const didChangeFeedbackSignal = observableSignalFromEvent(this, this.agentFeedbackService.onDidChangeFeedback);

		return derived(reader => {
			const sessionResource = this.activeSessionResourceObs.read(reader);
			if (!sessionResource) {
				return new Map<string, number>();
			}

			didChangeFeedbackSignal.read(reader);

			const feedbackItems = this.agentFeedbackService.getFeedback(sessionResource);
			const result = new Map<string, number>();
			for (const item of feedbackItems) {
				if (!item.sourcePRReviewCommentId && item.state !== AgentFeedbackState.Resolved) {
					const uriKey = item.resourceUri.fsPath;
					result.set(uriKey, (result.get(uriKey) ?? 0) + 1);
				}
			}
			return result;
		});
	}
}
