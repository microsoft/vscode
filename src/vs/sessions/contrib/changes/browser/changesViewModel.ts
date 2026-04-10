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
import { hasGitHubRemotes } from '../../../../workbench/contrib/git/common/utils.js';
import { COPILOT_CLOUD_SESSION_TYPE } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IAgentFeedbackService } from '../../agentFeedback/browser/agentFeedbackService.js';
import { CodeReviewStateKind, getCodeReviewFilesFromSessionChanges, getCodeReviewVersion, ICodeReviewService, PRReviewStateKind } from '../../codeReview/browser/codeReviewService.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { toPRContentUri } from '../../github/common/utils.js';
import { ChangesVersionMode, ChangesViewMode, IsolationMode } from '../common/changes.js';

function toIChatSessionFileChange2(changes: GitDiffChange[], originalRef: string | undefined, modifiedRef: string | undefined): IChatSessionFileChange2[] {
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
	readonly upstreamBranchName: string | undefined;
	readonly isMergeBaseBranchProtected: boolean | undefined;
	readonly incomingChanges: number | undefined;
	readonly outgoingChanges: number | undefined;
	readonly uncommittedChanges: number | undefined;
	readonly hasGitHubRemote: boolean | undefined;
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
	private _activeSessionAllChangesPromiseObs!: IObservableWithChange<IObservable<IChatSessionFileChange2[] | undefined>>;
	private _activeSessionLastTurnChangesPromiseObs!: IObservableWithChange<IObservable<IChatSessionFileChange2[] | undefined>>;

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
		@IGitHubService private readonly gitHubService: IGitHubService,
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

		const sessionMetadata = derivedObservableWithCache<{ readonly [key: string]: unknown } | undefined>(this, (reader, lastValue) => {
			const sessionResource = this.activeSessionResourceObs.read(reader);
			if (!sessionResource) {
				return undefined;
			}

			sessionsChangedSignal.read(reader);
			const model = this.agentSessionsService.getSession(sessionResource);
			if (model === undefined) {
				// This occurs when the untitled session is committed. In order
				// to avoid flickering of the toolbar, we keep the old metadata
				// until the new metadata is available.
				return lastValue;
			}

			return model.metadata;
		});

		return derivedOpts<{ readonly [key: string]: unknown } | undefined>({ equalsFn: structuralEquals }, reader => {
			return sessionMetadata.read(reader);
		});
	}

	private _getActiveSessionGitRepository(): { repository: IObservable<IGitRepository | undefined>; repositoryState: IObservable<GitRepositoryState | undefined> } {
		const activeSessionRepositoryPathObs = derived(reader => {
			const metadata = this._activeSessionMetadataObs.read(reader);
			const repositoryPath = metadata?.repositoryPath as string | undefined;
			const worktreePath = metadata?.worktreePath as string | undefined;

			return worktreePath ?? repositoryPath;
		});

		const activeSessionRepositoryPromiseObs = derived(reader => {
			const activeSessionResource = this.activeSessionResourceObs.read(reader);
			if (!activeSessionResource) {
				return constObservable(undefined);
			}

			const activeSessionRepositoryPath = activeSessionRepositoryPathObs.read(reader);
			const workingDirectory = activeSessionRepositoryPath
				? URI.file(activeSessionRepositoryPath)
				: undefined;

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
			const sessionType = this.activeSessionTypeObs.read(reader);

			if (sessionType === COPILOT_CLOUD_SESSION_TYPE) {
				// Cloud session
				const metadata = this._activeSessionMetadataObs.read(reader);

				const firstCheckpointRef = metadata?.baseRefOid as string | undefined;
				const lastCheckpointRef = metadata?.headRefOid as string | undefined;

				if (!firstCheckpointRef || !lastCheckpointRef) {
					return constObservable([]);
				}

				const diffPromise = this._getPullRequestChanges(firstCheckpointRef, lastCheckpointRef);
				return new ObservablePromise(diffPromise).resolvedValue;
			}

			// Local session
			const repository = this.activeSessionRepositoryObs.read(reader);
			const firstCheckpointRef = this.activeSessionFirstCheckpointRefObs.read(reader);
			const lastCheckpointRef = this.activeSessionLastCheckpointRefObs.read(reader);

			if (!repository || !firstCheckpointRef || !lastCheckpointRef) {
				return constObservable([]);
			}

			const diffPromise = this._getRepositoryChanges(repository, firstCheckpointRef, lastCheckpointRef);
			return new ObservablePromise(diffPromise).resolvedValue;
		});

		// Last turn changes
		this._activeSessionLastTurnChangesPromiseObs = derived(reader => {
			const sessionType = this.activeSessionTypeObs.read(reader);

			if (sessionType === COPILOT_CLOUD_SESSION_TYPE) {
				// Cloud session
				const metadata = this._activeSessionMetadataObs.read(reader);
				const lastCheckpointRef = metadata?.headRefOid as string | undefined;

				if (!lastCheckpointRef) {
					return constObservable([]);
				}

				const diffPromise = this._getPullRequestChanges(`${lastCheckpointRef}^`, lastCheckpointRef);
				return new ObservablePromise(diffPromise).resolvedValue;
			}

			// Local session
			const repository = this.activeSessionRepositoryObs.read(reader);
			const lastCheckpointRef = this.activeSessionLastCheckpointRefObs.read(reader);

			if (!repository || !lastCheckpointRef) {
				return constObservable([]);
			}

			const diffPromise = this._getRepositoryChanges(repository, `${lastCheckpointRef}^`, lastCheckpointRef);
			return new ObservablePromise(diffPromise).resolvedValue;
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
				return this._activeSessionAllChangesPromiseObs.read(reader).read(reader) ?? [];
			} else if (versionMode === ChangesVersionMode.LastTurn) {
				return this._activeSessionLastTurnChangesPromiseObs.read(reader).read(reader) ?? [];
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
			const baseBranchName = (sessionMetadata?.baseBranchName ?? sessionMetadata?.baseBranch) as string | undefined;
			const isMergeBaseBranchProtected = workspaceRepository?.baseBranchProtected;
			const isolationMode = workspaceRepository?.workingDirectory === undefined
				? IsolationMode.Workspace
				: IsolationMode.Worktree;

			// Pull request state
			const gitHubInfo = activeSession?.gitHubInfo.read(reader);
			const hasGitHubRemote = repositoryState
				? hasGitHubRemotes(repositoryState)
				: false;
			const hasPullRequest = gitHubInfo?.pullRequest?.uri !== undefined;
			const hasOpenPullRequest = hasPullRequest &&
				(gitHubInfo.pullRequest.icon?.id === Codicon.gitPullRequestDraft.id ||
					gitHubInfo.pullRequest.icon?.id === Codicon.gitPullRequest.id);

			// Repository state
			const upstreamBranchName = hasGitRepository && repositoryState?.HEAD?.upstream
				? `${repositoryState.HEAD.upstream.remote}/${repositoryState.HEAD.upstream.name}`
				: undefined;
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
				upstreamBranchName,
				incomingChanges,
				outgoingChanges,
				uncommittedChanges,
				hasGitHubRemote,
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

	private async _getRepositoryChanges(repository: IGitRepository, firstCheckpointRef: string, lastCheckpointRef: string): Promise<IChatSessionFileChange2[] | undefined> {
		const changes = await repository.diffBetweenWithStats(firstCheckpointRef, lastCheckpointRef);
		return toIChatSessionFileChange2(changes, firstCheckpointRef, lastCheckpointRef);
	}

	private async _getPullRequestChanges(firstCheckpointRef: string, lastCheckpointRef: string): Promise<IChatSessionFileChange2[] | undefined> {
		const gitHubInfo = this.sessionManagementService.activeSession.get()?.gitHubInfo.get();
		if (!gitHubInfo?.owner || !gitHubInfo?.repo || !gitHubInfo?.pullRequest?.number) {
			return [];
		}

		const params = {
			owner: gitHubInfo.owner,
			repo: gitHubInfo.repo,
			prNumber: gitHubInfo.pullRequest.number,
		} as const;

		const changes = await this.gitHubService.getChangedFiles(params.owner, params.repo, firstCheckpointRef, lastCheckpointRef);
		return changes.map(change => {
			const uri = toPRContentUri(change.filename, {
				...params,
				commitSha: lastCheckpointRef,
				status: change.status,
				isBase: false
			});

			const originalUri = change.status !== 'added'
				? toPRContentUri(change.previous_filename || change.filename, {
					...params,
					commitSha: firstCheckpointRef,
					previousFileName: change.previous_filename,
					status: change.status,
					isBase: true
				})
				: undefined;

			const modifiedUri = change.status !== 'removed'
				? uri
				: undefined;

			return {
				uri,
				originalUri,
				modifiedUri,
				insertions: change.additions,
				deletions: change.deletions
			} satisfies IChatSessionFileChange2;
		});
	}
}
