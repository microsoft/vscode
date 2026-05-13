/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { arrayEqualsC, structuralEquals } from '../../../../base/common/equals.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, derivedOpts, IObservable, IObservableWithChange, ISettableObservable, observableValue, observableSignalFromEvent, constObservable, ObservablePromise, derivedObservableWithCache, autorun } from '../../../../base/common/observable.js';
import { isWeb } from '../../../../base/common/platform.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { GitDiffChange, IGitService } from '../../../../workbench/contrib/git/common/gitService.js';
import { gitHubInfoEqual, IGitHubInfo, ISessionFileChange } from '../../../services/sessions/common/session.js';
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

function sortDateDesc(dateA: Date | undefined, dateB: Date | undefined): number {
	const chatALastTurnEnd = dateA?.getTime();
	const chatBLastTurnEnd = dateB?.getTime();

	if (!chatALastTurnEnd && !chatBLastTurnEnd) {
		return 0;
	}

	if (!chatALastTurnEnd) {
		return 1;
	}

	if (!chatBLastTurnEnd) {
		return -1;
	}

	return chatBLastTurnEnd - chatALastTurnEnd;
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
	readonly hasBranchChanges: boolean | undefined;
	readonly hasGitHubRemote: boolean | undefined;
	readonly hasPullRequest: boolean | undefined;
	readonly hasOpenPullRequest: boolean | undefined;
	readonly hasGitOperationInProgress: boolean | undefined;
}

export class ChangesViewModel extends Disposable {
	readonly activeSessionResourceObs: IObservable<URI | undefined>;
	readonly activeSessionTypeObs: IObservable<string | undefined>;
	readonly activeSessionIsVirtualWorkspaceObs: IObservable<boolean>;
	readonly activeSessionIsArchivedObs: IObservable<boolean>;
	readonly activeSessionChangesObs: IObservable<readonly ISessionFileChange[]>;
	readonly activeSessionHasGitRepositoryObs: IObservable<boolean>;
	readonly activeSessionFirstCheckpointRefObs: IObservable<string | undefined>;
	readonly activeSessionLastCheckpointRefObs: IObservable<string | undefined>;
	readonly activeSessionReviewCommentCountByFileObs: IObservable<Map<string, number>>;
	readonly activeSessionAgentFeedbackCountByFileObs: IObservable<Map<string, number>>;
	readonly activeSessionStateObs: IObservable<ActiveSessionState | undefined>;
	readonly activeSessionIsLoadingObs: IObservable<boolean>;

	private _activeSessionAllChangesPromiseObs!: IObservableWithChange<IObservable<IChatSessionFileChange2[] | undefined>>;
	private _activeSessionLastTurnChangesPromiseObs!: IObservableWithChange<IObservable<IChatSessionFileChange2[] | undefined>>;
	private _activeSessionUncommittedChangesPromiseObs!: IObservableWithChange<IObservable<IChatSessionFileChange2[] | undefined>>;

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

		this.activeSessionIsVirtualWorkspaceObs = derived(reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			return activeSession?.workspace.read(reader)?.isVirtualWorkspace ?? false;
		});

		this.activeSessionIsArchivedObs = derived(reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			return activeSession?.isArchived.read(reader) === true;
		});

		// Active session has git repository
		this.activeSessionHasGitRepositoryObs = derived(reader => {
			const isVirtualWorkspace = this.activeSessionIsVirtualWorkspaceObs.read(reader);
			if (isVirtualWorkspace) {
				return true;
			}

			const activeSession = this.sessionManagementService.activeSession.read(reader);
			const workspace = activeSession?.workspace.read(reader);
			return workspace?.folders[0].gitRepository !== undefined;
		});

		// Active session first checkpoint ref
		this.activeSessionFirstCheckpointRefObs = derived<string | undefined>(reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			return activeSession?.mainChat.checkpoints.read(reader)?.firstCheckpointRef;
		});

		// Active session last checkpoint ref
		this.activeSessionLastCheckpointRefObs = derived(reader => {
			const activeSessionChats = this.sessionManagementService.activeSession.read(reader)?.chats.read(reader);
			if (!activeSessionChats || activeSessionChats.length === 0) {
				return undefined;
			}

			// Session has only one chat
			if (activeSessionChats.length === 1) {
				return activeSessionChats[0].checkpoints.read(reader)?.lastCheckpointRef;
			}

			// Session has multiple chats - find the last chat that completed
			const chatsSortedByLastTurnEnd = activeSessionChats.toSorted((chatA, chatB) => {
				const chatALastTurnEnd = chatA.lastTurnEnd.read(reader);
				const chatBLastTurnEnd = chatB.lastTurnEnd.read(reader);

				return sortDateDesc(chatALastTurnEnd, chatBLastTurnEnd);
			});

			return chatsSortedByLastTurnEnd[0].checkpoints.read(reader)?.lastCheckpointRef;
		});

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

		this._register(autorun(reader => {
			const activeSessionResource = this.activeSessionResourceObs.read(reader);
			if (!activeSessionResource) {
				this.setVersionMode(ChangesVersionMode.BranchChanges);
				return;
			}

			const isArchived = this.activeSessionIsArchivedObs.read(reader);
			const versionMode = isArchived
				? ChangesVersionMode.AllChanges
				: ChangesVersionMode.BranchChanges;

			this.setVersionMode(versionMode);
		}));

		// View mode
		const storedMode = this.storageService.get('changesView.viewMode', StorageScope.WORKSPACE);
		const initialMode = storedMode === ChangesViewMode.Tree ? ChangesViewMode.Tree : ChangesViewMode.List;
		this.viewModeObs = observableValue<ChangesViewMode>(this, initialMode);
	}

	private _getActiveSessionChanges(): IObservable<readonly ISessionFileChange[]> {
		const gitHubInfoObs = derivedOpts<IGitHubInfo | undefined>(
			{ equalsFn: gitHubInfoEqual },
			reader => {
				const activeSession = this.sessionManagementService.activeSession.read(reader);
				return activeSession?.workspace.read(reader)?.folders[0]?.gitRepository?.gitHubInfo.read(reader);
			});

		// Changes
		const activeSessionChangesObs = derived(reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			if (!activeSession) {
				return Iterable.empty();
			}
			return activeSession.changes.read(reader);
		});

		const activeSessionRepositoryPathObs = derived(reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			const gitRepository = activeSession?.workspace.read(reader)?.folders[0].gitRepository;
			return gitRepository?.workTreeUri ?? gitRepository?.uri;
		});

		// Uncommitted changes
		const activeSessionUncommittedChangesCountObs = derived(reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			const gitRepository = activeSession?.workspace.read(reader)?.folders[0].gitRepository;
			return gitRepository?.uncommittedChanges ?? 0;
		});

		this._activeSessionUncommittedChangesPromiseObs = derived(reader => {
			const repositoryPath = activeSessionRepositoryPathObs.read(reader);
			if (!repositoryPath) {
				return constObservable([]);
			}

			// Re-run when the number of uncommitted changes changes
			activeSessionUncommittedChangesCountObs.read(reader);

			const diffPromise = this._getRepositoryChanges(repositoryPath, 'HEAD', undefined);
			return new ObservablePromise(diffPromise).resolvedValue;
		});

		// All changes
		this._activeSessionAllChangesPromiseObs = derived(reader => {
			const isVirtualWorkspace = this.activeSessionIsVirtualWorkspaceObs.read(reader);

			if (isVirtualWorkspace) {
				// Virtual (cloud) session
				const gitHubInfo = gitHubInfoObs.read(reader);

				const firstCheckpointRef = gitHubInfo?.pullRequest?.baseRefOid;
				const lastCheckpointRef = gitHubInfo?.pullRequest?.headRefOid;

				if (!firstCheckpointRef || !lastCheckpointRef) {
					return constObservable([]);
				}

				const diffPromise = this._getPullRequestChanges(firstCheckpointRef, lastCheckpointRef);
				return new ObservablePromise(diffPromise).resolvedValue;
			}

			// Local session
			const repositoryPath = activeSessionRepositoryPathObs.read(reader);
			const firstCheckpointRef = this.activeSessionFirstCheckpointRefObs.read(reader);
			const lastCheckpointRef = this.activeSessionLastCheckpointRefObs.read(reader);

			if (!repositoryPath || !firstCheckpointRef || !lastCheckpointRef) {
				return constObservable([]);
			}

			const diffPromise = this._getRepositoryChanges(repositoryPath, firstCheckpointRef, lastCheckpointRef);
			return new ObservablePromise(diffPromise).resolvedValue;
		});

		// Last turn changes
		this._activeSessionLastTurnChangesPromiseObs = derived(reader => {
			const isVirtualWorkspace = this.activeSessionIsVirtualWorkspaceObs.read(reader);

			if (isVirtualWorkspace) {
				// Virtual (cloud) session
				const gitHubInfo = gitHubInfoObs.read(reader);
				const lastCheckpointRef = gitHubInfo?.pullRequest?.headRefOid;

				if (!lastCheckpointRef) {
					return constObservable([]);
				}

				const diffPromise = this._getPullRequestChanges(`${lastCheckpointRef}^`, lastCheckpointRef);
				return new ObservablePromise(diffPromise).resolvedValue;
			}

			// Local session
			const repositoryPath = activeSessionRepositoryPathObs.read(reader);
			const lastCheckpointRef = this.activeSessionLastCheckpointRefObs.read(reader);

			if (!repositoryPath || !lastCheckpointRef) {
				return constObservable([]);
			}

			const diffPromise = this._getRepositoryChanges(repositoryPath, `${lastCheckpointRef}^`, lastCheckpointRef);
			return new ObservablePromise(diffPromise).resolvedValue;
		});

		return derivedOpts({
			equalsFn: arrayEqualsC<ISessionFileChange>()
		}, reader => {
			const versionMode = this.versionModeObs.read(reader);

			// BranchChanges reads from the session provider's `changes`
			// observable directly (e.g. agent-host-tracked diffs), so it
			// works even for sessions without a git repository.
			if (versionMode === ChangesVersionMode.BranchChanges) {
				return activeSessionChangesObs.read(reader);
			}

			const hasGitRepository = this.activeSessionHasGitRepositoryObs.read(reader);
			if (!hasGitRepository && !isWeb) {
				return [];
			}

			if (versionMode === ChangesVersionMode.UncommittedChanges) {
				return this._activeSessionUncommittedChangesPromiseObs.read(reader).read(reader) ?? [];
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
			// Branch changes
			const versionMode = this.versionModeObs.read(reader);
			if (versionMode === ChangesVersionMode.BranchChanges) {
				return false;
			}

			// Uncommitted changes
			if (versionMode === ChangesVersionMode.UncommittedChanges) {
				const uncommittedChangesResult = this._activeSessionUncommittedChangesPromiseObs.read(reader).read(reader);
				return uncommittedChangesResult === undefined;
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
			if (isLoading) {
				return lastValue;
			}

			const activeSession = this.sessionManagementService.activeSession.read(reader);
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
					gitHubInfo.pullRequest.icon?.id === Codicon.gitPullRequest.id);

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

	private async _getRepositoryChanges(uri: URI, firstCheckpointRef: string, lastCheckpointRef: string | undefined): Promise<IChatSessionFileChange2[] | undefined> {
		const repository = await this.gitService.openRepository(uri);
		const ref = lastCheckpointRef
			? `${firstCheckpointRef}..${lastCheckpointRef}`
			: firstCheckpointRef;

		const changes = await repository?.diffBetweenWithStats2(ref) ?? [];
		return toIChatSessionFileChange2(changes, firstCheckpointRef, lastCheckpointRef);
	}

	private async _getPullRequestChanges(firstCheckpointRef: string, lastCheckpointRef: string): Promise<IChatSessionFileChange2[] | undefined> {
		const gitHubInfo = this.sessionManagementService.activeSession.get()?.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get();
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
