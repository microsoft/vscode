/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { arrayEqualsC, structuralEquals } from '../../../../base/common/equals.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, derivedOpts, IObservable, IObservableWithChange, ISettableObservable, runOnChange, observableValue, observableSignalFromEvent, constObservable, ObservablePromise, derivedObservableWithCache } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IChatSessionFileChange, IChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { GitDiffChange, GitRepositoryState, IGitRepository, IGitService } from '../../../../workbench/contrib/git/common/gitService.js';
import { IAgentFeedbackService } from '../../agentFeedback/browser/agentFeedbackService.js';
import { CodeReviewStateKind, getCodeReviewFilesFromSessionChanges, getCodeReviewVersion, ICodeReviewService, PRReviewStateKind } from '../../codeReview/browser/codeReviewService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { COPILOT_CLOUD_SESSION_TYPE } from '../../sessions/browser/sessionTypes.js';
import { ChangesVersionMode, ChangesViewMode, IsolationMode } from '../common/changes.js';

function toIChatSessionFileChange2(changes: GitDiffChange[], modifiedRef: string | undefined, originalRef: string | undefined): IChatSessionFileChange2[] {
	return changes.map(change => ({
		uri: change.uri,
		originalUri: change.originalUri
			? originalRef
				? change.originalUri.with({ scheme: 'git', query: JSON.stringify({ path: change.originalUri.fsPath, ref: originalRef }) })
				: change.originalUri
			: undefined,
		modifiedUri: change.modifiedUri
			? modifiedRef
				? change.modifiedUri.with({ scheme: 'git', query: JSON.stringify({ path: change.modifiedUri.fsPath, ref: modifiedRef }) })
				: change.modifiedUri
			: undefined,
		insertions: change.insertions,
		deletions: change.deletions,
	} satisfies IChatSessionFileChange2));
}

export interface ActiveSessionState {
	readonly isolationMode: IsolationMode;
	readonly hasGitRepository: boolean;
	readonly branchName: string | undefined;
	readonly baseBranchName: string | undefined;
	readonly isMergeBaseBranchProtected: boolean | undefined;
	readonly incomingChanges: number | undefined;
	readonly outgoingChanges: number | undefined;
	readonly uncommittedChanges: number | undefined;
	readonly hasPullRequest: boolean | undefined;
	readonly hasOpenPullRequest: boolean | undefined;
}

export class ChangesViewModel extends Disposable {
	readonly activeSessionResourceObs: IObservable<URI | undefined>;
	readonly activeSessionTypeObs: IObservable<string | undefined>;
	readonly activeSessionRepositoryObs: IObservableWithChange<IGitRepository | undefined>;
	readonly activeSessionRepositoryStateObs: IObservableWithChange<GitRepositoryState | undefined>;
	readonly activeSessionChangesObs: IObservable<readonly (IChatSessionFileChange | IChatSessionFileChange2)[]>;
	readonly activeSessionHasGitRepositoryObs: IObservable<boolean>;
	readonly activeSessionFirstCheckpointRefObs: IObservable<string | undefined>;
	readonly activeSessionLastCheckpointRefObs: IObservable<string | undefined>;
	readonly activeSessionReviewCommentCountByFileObs: IObservable<Map<string, number>>;
	readonly activeSessionAgentFeedbackCountByFileObs: IObservable<Map<string, number>>;
	readonly activeSessionStateObs: IObservable<ActiveSessionState | undefined>;
	readonly activeSessionIsLoadingObs: IObservable<boolean>;

	private _activeSessionMetadataObs!: IObservable<{ readonly [key: string]: unknown } | undefined>;
	private _activeSessionAllChangesPromiseObs!: IObservableWithChange<IObservable<GitDiffChange[] | undefined>>;
	private _activeSessionLastTurnChangesPromiseObs!: IObservableWithChange<IObservable<GitDiffChange[] | undefined>>;

	readonly versionModeObs: ISettableObservable<ChangesVersionMode>;
	setVersionMode(mode: ChangesVersionMode): void {
		if (this.versionModeObs.get() === mode) {
			return;
		}
		this.versionModeObs.set(mode, undefined);
	}

	readonly viewModeObs: ISettableObservable<ChangesViewMode>;
	setViewMode(mode: ChangesViewMode): void {
		if (this.viewModeObs.get() === mode) {
			return;
		}
		this.viewModeObs.set(mode, undefined);
		this.storageService.store('changesView.viewMode', mode, StorageScope.WORKSPACE, StorageTarget.USER);
	}

	constructor(
		@IAgentFeedbackService private readonly agentFeedbackService: IAgentFeedbackService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@ICodeReviewService private readonly codeReviewService: ICodeReviewService,
		@IGitService private readonly gitService: IGitService,
		@ISessionsManagementService private readonly sessionManagementService: ISessionsManagementService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		// Active session resource
		this.activeSessionResourceObs = derivedOpts({ equalsFn: isEqual }, reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			return activeSession?.resource;
		});

		// Active session type
		this.activeSessionTypeObs = derived(reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			return activeSession?.sessionType;
		});

		// Active session metadata
		this._activeSessionMetadataObs = this._getActiveSessionMetadata();

		// Active session has git repository
		this.activeSessionHasGitRepositoryObs = derived(reader => {
			const sessionType = this.activeSessionTypeObs.read(reader);
			const metadata = this._activeSessionMetadataObs.read(reader);
			return sessionType === COPILOT_CLOUD_SESSION_TYPE || metadata?.repositoryPath !== undefined;
		});

		// Active session first checkpoint ref
		this.activeSessionFirstCheckpointRefObs = derived(reader => {
			const metadata = this._activeSessionMetadataObs.read(reader);
			return metadata?.firstCheckpointRef as string | undefined;
		});

		// Active session last checkpoint ref
		this.activeSessionLastCheckpointRefObs = derived(reader => {
			const metadata = this._activeSessionMetadataObs.read(reader);
			return metadata?.lastCheckpointRef as string | undefined;
		});

		// Active session repository
		const { repository, repositoryState } = this._getActiveSessionGitRepository();
		this.activeSessionRepositoryObs = repository;
		this.activeSessionRepositoryStateObs = repositoryState;

		// Active session state
		const { isLoading, state } = this._getActiveSessionState();
		this.activeSessionIsLoadingObs = isLoading;
		this.activeSessionStateObs = state;

		// Active session changes
		this.activeSessionChangesObs = this._getActiveSessionChanges();

		// Active session review comment count by file
		this.activeSessionReviewCommentCountByFileObs = this._getActiveSessionReviewComments();

		// Active session agent feedback count by file
		this.activeSessionAgentFeedbackCountByFileObs = this._getActiveSessionAgentFeedback();

		// Version mode
		this.versionModeObs = observableValue<ChangesVersionMode>(this, ChangesVersionMode.BranchChanges);

		this._register(runOnChange(this.activeSessionResourceObs, () => {
			this.setVersionMode(ChangesVersionMode.BranchChanges);
		}));

		// View mode
		const storedMode = this.storageService.get('changesView.viewMode', StorageScope.WORKSPACE);
		const initialMode = storedMode === ChangesViewMode.Tree ? ChangesViewMode.Tree : ChangesViewMode.List;
		this.viewModeObs = observableValue<ChangesViewMode>(this, initialMode);
	}

	private _getActiveSessionMetadata(): IObservable<{ readonly [key: string]: unknown } | undefined> {
		const sessionsChangedSignal = observableSignalFromEvent(this,
			this.sessionManagementService.onDidChangeSessions);

		return derivedOpts<{ readonly [key: string]: unknown } | undefined>({
			equalsFn: structuralEquals
		}, reader => {
			const sessionResource = this.activeSessionResourceObs.read(reader);
			if (!sessionResource) {
				return undefined;
			}

			sessionsChangedSignal.read(reader);
			const model = this.agentSessionsService.getSession(sessionResource);
			return model?.metadata;
		});
	}

	private _getActiveSessionGitRepository(): { repository: IObservable<IGitRepository | undefined>; repositoryState: IObservable<GitRepositoryState | undefined> } {
		const activeSessionRepositoryObs = derived(reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			return activeSession?.workspace.read(reader)?.repositories[0];
		});

		const activeSessionRepositoryPromiseObs = derived(reader => {
			const activeSessionResource = this.activeSessionResourceObs.read(reader);
			if (!activeSessionResource) {
				return constObservable(undefined);
			}

			const activeSessionRepository = activeSessionRepositoryObs.read(reader);
			const workingDirectory = activeSessionRepository?.workingDirectory ?? activeSessionRepository?.uri;
			if (!workingDirectory) {
				return constObservable(undefined);
			}

			return new ObservablePromise(this.gitService.openRepository(workingDirectory)).resolvedValue;
		});

		const activeSessionGitRepositoryObs = derived<IGitRepository | undefined>(reader => {
			const activeSessionRepositoryPromise = activeSessionRepositoryPromiseObs.read(reader);
			if (activeSessionRepositoryPromise === undefined) {
				return undefined;
			}

			return activeSessionRepositoryPromise.read(reader);
		});

		const activeSessionGitRepositoryStateObs = derived(reader => {
			const repository = activeSessionGitRepositoryObs.read(reader);
			const repositoryState = repository?.state.read(reader);

			// If the repository has no HEAD, it is likely not fully loaded yet.
			// Treat it as undefined to avoid showing incorrect information to
			// the user.
			if (!repositoryState?.HEAD) {
				return undefined;
			}

			return repositoryState;
		});

		return {
			repository: activeSessionGitRepositoryObs,
			repositoryState: activeSessionGitRepositoryStateObs
		};
	}

	private _getActiveSessionChanges(): IObservable<readonly (IChatSessionFileChange | IChatSessionFileChange2)[]> {
		// Changes
		const activeSessionChangesObs = derived(reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			if (!activeSession) {
				return Iterable.empty();
			}
			return activeSession.changes.read(reader);
		});

		// All changes
		this._activeSessionAllChangesPromiseObs = derived(reader => {
			const repository = this.activeSessionRepositoryObs.read(reader);
			const firstCheckpointRef = this.activeSessionFirstCheckpointRefObs.read(reader);
			const lastCheckpointRef = this.activeSessionLastCheckpointRefObs.read(reader);

			if (!repository || !firstCheckpointRef || !lastCheckpointRef) {
				return constObservable([]);
			}

			const diffPromise = repository.diffBetweenWithStats(firstCheckpointRef, lastCheckpointRef);
			return new ObservablePromise(diffPromise).resolvedValue;
		});

		const activeSessionAllChangesObs = derived(reader => {
			const diffChanges = this._activeSessionAllChangesPromiseObs.read(reader).read(reader) ?? [];
			const firstCheckpointRef = this.activeSessionFirstCheckpointRefObs.read(undefined);
			const lastCheckpointRef = this.activeSessionLastCheckpointRefObs.read(undefined);

			return toIChatSessionFileChange2(diffChanges, lastCheckpointRef, firstCheckpointRef);
		});

		// Last turn changes
		this._activeSessionLastTurnChangesPromiseObs = derived(reader => {
			const repository = this.activeSessionRepositoryObs.read(reader);
			const lastCheckpointRef = this.activeSessionLastCheckpointRefObs.read(reader);

			if (!repository || !lastCheckpointRef) {
				return constObservable([]);
			}

			const diffPromise = repository.diffBetweenWithStats(`${lastCheckpointRef}^`, lastCheckpointRef);
			return new ObservablePromise(diffPromise).resolvedValue;
		});

		const activeSessionLastTurnChangesObs = derived(reader => {
			const diffChanges = this._activeSessionLastTurnChangesPromiseObs.read(reader).read(reader) ?? [];
			const lastCheckpointRef = this.activeSessionLastCheckpointRefObs.read(undefined);

			return toIChatSessionFileChange2(diffChanges, lastCheckpointRef, lastCheckpointRef ? `${lastCheckpointRef}^` : undefined);
		});

		return derivedOpts({
			equalsFn: arrayEqualsC<IChatSessionFileChange | IChatSessionFileChange2>()
		}, reader => {
			const hasGitRepository = this.activeSessionHasGitRepositoryObs.read(reader);
			if (!hasGitRepository) {
				return [];
			}

			const versionMode = this.versionModeObs.read(reader);
			if (versionMode === ChangesVersionMode.BranchChanges) {
				return activeSessionChangesObs.read(reader);
			} else if (versionMode === ChangesVersionMode.AllChanges) {
				return activeSessionAllChangesObs.read(reader);
			} else if (versionMode === ChangesVersionMode.LastTurn) {
				return activeSessionLastTurnChangesObs.read(reader);
			}

			return [];
		});
	}

	private _getActiveSessionState(): { isLoading: IObservable<boolean>; state: IObservable<ActiveSessionState | undefined> } {
		const isLoadingObs = derived(reader => {
			// If there is a git repository, wait for the repository to be opened first,
			// as there are many context keys that depend on the repository information.
			const sessionType = this.activeSessionTypeObs.read(reader);
			const hasGitRepository = this.activeSessionHasGitRepositoryObs.read(reader);
			if (hasGitRepository && sessionType !== COPILOT_CLOUD_SESSION_TYPE && this.activeSessionRepositoryStateObs.read(reader) === undefined) {
				return true;
			}

			// Branch changes
			const versionMode = this.versionModeObs.read(reader);
			if (versionMode === ChangesVersionMode.BranchChanges) {
				return false;
			}

			// All changes
			if (versionMode === ChangesVersionMode.AllChanges) {
				const allChangesResult = this._activeSessionAllChangesPromiseObs.read(reader).read(reader);
				return allChangesResult === undefined;
			}

			// Last turn changes
			if (versionMode === ChangesVersionMode.LastTurn) {
				const lastTurnChangesResult = this._activeSessionLastTurnChangesPromiseObs.read(reader).read(reader);
				return lastTurnChangesResult === undefined;
			}

			return false;
		});

		const activeSessionStateObs = derivedObservableWithCache<ActiveSessionState | undefined>(this, (reader, lastValue) => {
			const isLoading = isLoadingObs.read(reader);
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			const repositoryState = this.activeSessionRepositoryStateObs.read(reader);
			if (isLoading && repositoryState === undefined) {
				return lastValue;
			}

			// Session state
			const sessionMetadata = this._activeSessionMetadataObs.read(reader);
			const workspace = activeSession?.workspace.read(reader);
			const workspaceRepository = workspace?.repositories[0];
			const hasGitRepository = this.activeSessionHasGitRepositoryObs.read(reader);
			const branchName = (sessionMetadata?.branchName ?? sessionMetadata?.branch) as string | undefined;
			const baseBranchName = sessionMetadata?.baseBranchName as string | undefined;
			const isMergeBaseBranchProtected = workspaceRepository?.baseBranchProtected;
			const isolationMode = workspaceRepository?.workingDirectory === undefined
				? IsolationMode.Workspace
				: IsolationMode.Worktree;

			// Pull request state
			const gitHubInfo = activeSession?.gitHubInfo.read(reader);
			const hasPullRequest = gitHubInfo?.pullRequest?.uri !== undefined;
			const hasOpenPullRequest = hasPullRequest &&
				(gitHubInfo.pullRequest.icon?.id === Codicon.gitPullRequestDraft.id ||
					gitHubInfo.pullRequest.icon?.id === Codicon.gitPullRequest.id);

			// Repository state
			const incomingChanges = hasGitRepository
				? repositoryState?.HEAD?.behind ?? 0
				: undefined;
			const outgoingChanges = hasGitRepository
				? repositoryState?.HEAD?.ahead ?? 0
				: undefined;
			const uncommittedChanges = hasGitRepository
				? (repositoryState?.mergeChanges.length ?? 0) +
				(repositoryState?.indexChanges.length ?? 0) +
				(repositoryState?.workingTreeChanges.length ?? 0) +
				(repositoryState?.untrackedChanges.length ?? 0)
				: undefined;

			return {
				isolationMode,
				hasGitRepository,
				branchName,
				baseBranchName,
				isMergeBaseBranchProtected,
				incomingChanges,
				outgoingChanges,
				uncommittedChanges,
				hasPullRequest,
				hasOpenPullRequest
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
			const changes = [...this.activeSessionChangesObs.read(reader)];

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

			if (changes.length === 0) {
				return result;
			}

			const reviewFiles = getCodeReviewFilesFromSessionChanges(changes);
			const reviewVersion = getCodeReviewVersion(reviewFiles);
			const reviewState = this.codeReviewService.getReviewState(sessionResource).read(reader);

			if (reviewState.kind !== CodeReviewStateKind.Result || reviewState.version !== reviewVersion) {
				return result;
			}

			for (const comment of reviewState.comments) {
				const uriKey = comment.uri.fsPath;
				result.set(uriKey, (result.get(uriKey) ?? 0) + 1);
			}

			return result;
		});
	}

	private _getActiveSessionAgentFeedback(): IObservable<Map<string, number>> {
		return derived(reader => {
			const sessionResource = this.activeSessionResourceObs.read(reader);
			if (!sessionResource) {
				return new Map<string, number>();
			}

			observableSignalFromEvent(this, this.agentFeedbackService.onDidChangeFeedback).read(reader);

			const feedbackItems = this.agentFeedbackService.getFeedback(sessionResource);
			const result = new Map<string, number>();
			for (const item of feedbackItems) {
				if (!item.sourcePRReviewCommentId) {
					const uriKey = item.resourceUri.fsPath;
					result.set(uriKey, (result.get(uriKey) ?? 0) + 1);
				}
			}
			return result;
		});
	}
}
