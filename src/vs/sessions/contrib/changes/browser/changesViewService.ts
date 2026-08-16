/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { LRUCache, ResourceMap } from '../../../../base/common/map.js';
import { autorun, derived, derivedObservableWithCache, derivedOpts, IObservable, ISettableObservable, observableSignal, observableSignalFromEvent, observableValue, transaction } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { AGENT_HOST_MERGE_CHANGESET_OPERATION_ID } from '../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionChangeset, ISessionChangesetOperation, ISessionFileChange, SessionChangesetOperationScope } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { AgentFeedbackState, IAgentFeedbackService } from '../../agentFeedback/browser/agentFeedbackService.js';
import { ICodeReviewService, PRReviewStateKind } from '../../codeReview/browser/codeReviewService.js';
import { ChangesViewMode, IsolationMode } from '../common/changes.js';
import { ActiveSessionState, ChangesViewSection, IChangesDetailsViewState, IChangesDetailsViewStateTransfer, IChangesViewSectionCollapseState, IChangesViewService } from '../common/changesViewService.js';

export const ChangesetReviewSupportContext = new RawContextKey<boolean>('sessions.changesetReviewSupport', false);
export const ChangesetReviewedFilesContext = new RawContextKey<string[]>('sessions.changesetReviewedFiles', []);
export const ChangesetHasOperationsContext = new RawContextKey<boolean>('sessions.changesetHasOperations', false);

const DEFAULT_SECTION_COLLAPSE_STATE: IChangesViewSectionCollapseState = Object.freeze({
	otherFiles: false,
	checks: true,
});

interface IStoredChangesViewState {
	readonly sessionResource: string;
	readonly detailsViewState?: Partial<Record<ChangesViewMode, IChangesDetailsViewState>>;
}

const SESSION_VIEW_STATE_STORAGE_KEY = 'changesView.sessionViewState';
const SESSION_VIEW_STATE_LIMIT = 100;

export class ChangesViewService extends Disposable implements IChangesViewService {

	declare readonly _serviceBrand: undefined;

	readonly activeSessionResourceObs: IObservable<URI | undefined>;
	readonly activeSessionTypeObs: IObservable<string | undefined>;
	readonly activeSessionIsVirtualWorkspaceObs: IObservable<boolean>;
	readonly activeSessionChangesObs: IObservable<readonly ISessionFileChange[]>;
	readonly activeSessionChangesetsObs: IObservable<readonly ISessionChangeset[] | undefined>;
	readonly activeSessionChangesetsLoadingObs: IObservable<boolean>;
	readonly activeSessionChangesetObs: IObservable<ISessionChangeset | undefined>;
	readonly activeSessionChangesetLoadingObs: IObservable<boolean>;
	readonly activeSessionChangesetOperationsObs: IObservable<readonly ISessionChangesetOperation[]>;
	readonly activeSessionHasGitRepositoryObs: IObservable<boolean>;
	readonly activeSessionReviewCommentCountByFileObs: IObservable<Map<string, number>>;
	readonly activeSessionAgentFeedbackCountByFileObs: IObservable<Map<string, number>>;
	readonly activeSessionStateObs: IObservable<ActiveSessionState | undefined>;
	readonly activeSessionLoadingObs: IObservable<boolean>;
	readonly activeSessionSectionCollapseStateObs: IObservable<IChangesViewSectionCollapseState>;

	private readonly _sectionCollapseStateBySession = new ResourceMap<IChangesViewSectionCollapseState>();
	private readonly _sectionCollapseStateChanged = observableSignal('changesView.sectionCollapseStateChanged');
	private readonly _detailsViewStateBySession = new LRUCache<string, Partial<Record<ChangesViewMode, IChangesDetailsViewState>>>(SESSION_VIEW_STATE_LIMIT);
	readonly detailsViewStateTransferObs = observableValue<IChangesDetailsViewStateTransfer | undefined>(this, undefined);

	private readonly _selectedChangesetId = observableValue<string | undefined>(this, undefined);
	private readonly _transientChangeset = observableValue<ISessionChangeset | undefined>(this, undefined);
	setChangesetId(changesetId: string | undefined): void {
		transaction(tx => {
			this._selectedChangesetId.set(changesetId, tx);
			this._transientChangeset.set(undefined, tx);
		});
	}

	showChangeset(changeset: ISessionChangeset): void {
		transaction(tx => {
			this._transientChangeset.set(changeset, tx);
			this._selectedChangesetId.set(changeset.id, tx);
		});
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
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IStorageService private readonly storageService: IStorageService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
	) {
		super();
		this._loadViewState();

		// Active session resource
		this.activeSessionResourceObs = derivedOpts({ equalsFn: isEqual }, reader => {
			const activeSession = this.sessionsService.activeSession.read(reader);
			return activeSession?.resource;
		});
		this.activeSessionSectionCollapseStateObs = derivedOpts({ equalsFn: structuralEquals }, reader => {
			const sessionResource = this.activeSessionResourceObs.read(reader);
			this._sectionCollapseStateChanged.read(reader);
			return sessionResource ? this._sectionCollapseStateBySession.get(sessionResource) ?? DEFAULT_SECTION_COLLAPSE_STATE : DEFAULT_SECTION_COLLAPSE_STATE;
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
			return workspace?.folders[0]?.gitRepository !== undefined;
		});

		// Active session review comment count by file
		this.activeSessionReviewCommentCountByFileObs = this._getActiveSessionReviewComments();

		// Active session agent feedback count by file
		this.activeSessionAgentFeedbackCountByFileObs = this._getActiveSessionAgentFeedback();

		// Changesets
		const activeSessionChangesetsObs = derived(reader => {
			const activeSession = this.sessionsService.activeSession.read(reader);
			return activeSession?.changesets.read(reader);
		});
		this.activeSessionChangesetsObs = derived(reader => {
			const changesets = activeSessionChangesetsObs.read(reader);
			const transientChangeset = this._transientChangeset.read(reader);
			if (!transientChangeset) {
				return changesets;
			}

			return [
				...(changesets?.filter(changeset => changeset.id !== transientChangeset.id) ?? []),
				transientChangeset,
			];
		});

		this.activeSessionChangesetsLoadingObs = derived(reader => {
			return this.activeSessionChangesetsObs.read(reader) === undefined;
		});

		// Changeset
		this.activeSessionChangesetObs = derived<ISessionChangeset | undefined>(reader => {
			const selectedChangesetId = this._selectedChangesetId.read(reader);
			const activeSessionChangesets = this.activeSessionChangesetsObs.read(reader);
			if (!activeSessionChangesets) {
				return undefined;
			}

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

		this.activeSessionChangesetLoadingObs = derived(reader => {
			const changeset = this.activeSessionChangesetObs.read(reader);
			// Not having an active changeset indicates that we have switched
			// between sessions and the changesets are still being loaded. When
			// switching between sessions, we need to clear the changes list.
			return changeset?.isLoadingChanges.read(reader) ?? false;
		});

		const activeSessionBaseBranchProtected = derived(reader => {
			const activeSession = this.sessionsService.activeSession.read(reader);
			return activeSession?.workspace.read(reader)?.folders[0]?.gitRepository?.baseBranchProtected === true;
		});

		this.activeSessionChangesetOperationsObs = derived(reader => {
			const changeset = this.activeSessionChangesetObs.read(reader);
			const operations = changeset?.operations.read(reader) ?? [];
			return activeSessionBaseBranchProtected.read(reader)
				? operations.filter(operation => operation.id !== AGENT_HOST_MERGE_CHANGESET_OPERATION_ID)
				: operations;
		});

		// Changes
		this.activeSessionChangesObs = derived(reader => {
			const changeset = this.activeSessionChangesetObs.read(reader);
			return changeset?.changes.read(reader) ?? [];
		});

		this.activeSessionLoadingObs = derived(reader => {
			const activeSession = this.sessionsService.activeSession.read(reader);
			const activeSessionLoading = activeSession?.loading.read(reader) ?? true;
			const activeSessionChangesetsLoading = this.activeSessionChangesetsLoadingObs.read(reader);
			const activeSessionChangesetLoading = this.activeSessionChangesetLoadingObs.read(reader);

			return activeSessionLoading || activeSessionChangesetsLoading || activeSessionChangesetLoading;
		});

		// Active session state
		this.activeSessionStateObs = this._getActiveSessionState();

		// View mode
		const storedMode = this.storageService.get('changesView.viewMode', StorageScope.WORKSPACE);
		const initialMode = storedMode === ChangesViewMode.Tree ? ChangesViewMode.Tree : ChangesViewMode.List;
		this._viewModeObs = observableValue<ChangesViewMode>(this, initialMode);

		// Reset changeset selection
		this._register(autorun(reader => {
			this.activeSessionResourceObs.read(reader);
			this.setChangesetId(undefined);
		}));
		this._register(sessionsManagementService.onDidReplaceSession(({ from, to }) => {
			const sectionCollapseState = this._sectionCollapseStateBySession.get(from.resource);
			if (sectionCollapseState) {
				this._sectionCollapseStateBySession.delete(from.resource);
				this._sectionCollapseStateBySession.set(to.resource, sectionCollapseState);
				this._sectionCollapseStateChanged.trigger(undefined);
			}

			const detailsViewState = this._detailsViewStateBySession.get(from.resource.toString());
			if (detailsViewState) {
				this._detailsViewStateBySession.delete(from.resource.toString());
				this._detailsViewStateBySession.set(to.resource.toString(), detailsViewState);
				this._saveViewState();
			}
			this.detailsViewStateTransferObs.set({ from: from.resource, to: to.resource }, undefined);
		}));
		this._register(sessionsManagementService.onDidDeleteSession(session => {
			this._deleteSessionViewState(session.resource);
		}));
		this._register(sessionsManagementService.onDidDiscardNewSession(session => this._deleteSessionViewState(session.resource)));
		this._register(sessionsManagementService.onDidReplaceNewDraftSession(({ from }) => this._deleteSessionViewState(from.resource)));

		// Global context keys
		this._bindContextKeys();
	}

	setSectionCollapsed(sessionResource: URI, section: ChangesViewSection, collapsed: boolean): void {
		const current = this._sectionCollapseStateBySession.get(sessionResource) ?? DEFAULT_SECTION_COLLAPSE_STATE;
		if (current[section] === collapsed) {
			return;
		}

		const next = { ...current, [section]: collapsed };
		if (next.otherFiles === DEFAULT_SECTION_COLLAPSE_STATE.otherFiles && next.checks === DEFAULT_SECTION_COLLAPSE_STATE.checks) {
			this._sectionCollapseStateBySession.delete(sessionResource);
		} else {
			this._sectionCollapseStateBySession.set(sessionResource, next);
		}
		this._sectionCollapseStateChanged.trigger(undefined);
	}

	getDetailsViewState(sessionResource: URI, viewMode: ChangesViewMode): IChangesDetailsViewState | undefined {
		return this._detailsViewStateBySession.get(sessionResource.toString())?.[viewMode];
	}

	setDetailsViewState(sessionResource: URI, viewMode: ChangesViewMode, state: IChangesDetailsViewState): void {
		const key = sessionResource.toString();
		const current = this._detailsViewStateBySession.get(key);
		if (structuralEquals(current?.[viewMode], state)) {
			return;
		}
		this._detailsViewStateBySession.set(key, { ...current, [viewMode]: state });
		this._saveViewState();
	}

	private _deleteSessionViewState(sessionResource: URI): void {
		if (this._sectionCollapseStateBySession.delete(sessionResource)) {
			this._sectionCollapseStateChanged.trigger(undefined);
		}
		if (this._detailsViewStateBySession.delete(sessionResource.toString())) {
			this._saveViewState();
		}
	}

	private _loadViewState(): void {
		const entries = this.storageService.getObject<IStoredChangesViewState[]>(SESSION_VIEW_STATE_STORAGE_KEY, StorageScope.WORKSPACE, []);
		if (!Array.isArray(entries)) {
			this.storageService.remove(SESSION_VIEW_STATE_STORAGE_KEY, StorageScope.WORKSPACE);
			return;
		}

		for (const entry of entries) {
			if (typeof entry.sessionResource !== 'string') {
				continue;
			}

			const resource = URI.parse(entry.sessionResource);
			if (entry.detailsViewState) {
				this._detailsViewStateBySession.set(resource.toString(), entry.detailsViewState);
			}
		}
	}

	private _saveViewState(): void {
		if (this._detailsViewStateBySession.size === 0) {
			this.storageService.remove(SESSION_VIEW_STATE_STORAGE_KEY, StorageScope.WORKSPACE);
			return;
		}

		const entries: IStoredChangesViewState[] = [];
		this._detailsViewStateBySession.forEach((detailsViewState, sessionResource) => {
			entries.push({
				sessionResource,
				detailsViewState,
			});
		});
		this.storageService.store(SESSION_VIEW_STATE_STORAGE_KEY, JSON.stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	setChangesetFilesReviewState(resources: readonly URI[], reviewed: boolean): void {
		if (resources.length === 0) {
			return;
		}

		const changeset = this.activeSessionChangesetObs.get();
		if (!changeset || !changeset.setReviewState) {
			return;
		}

		changeset.setReviewState(resources, reviewed);
	}

	private _getActiveSessionState(): IObservable<ActiveSessionState | undefined> {
		const activeSessionStateObs = derivedObservableWithCache<ActiveSessionState | undefined>(this, (reader, lastValue) => {
			const loading = this.activeSessionLoadingObs.read(reader);
			if (loading) {
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

		return derivedOpts({ equalsFn: structuralEquals },
			reader => activeSessionStateObs.read(reader));
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
			const sessionResource = this.agentFeedbackService.activeFeedbackSessionResource.read(reader);

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

	private _bindContextKeys(): void {
		this._register(bindContextKey<boolean>(ChangesetReviewSupportContext, this.contextKeyService, reader => {
			const changeset = this.activeSessionChangesetObs.read(reader);
			return changeset?.capabilities?.review === true;
		}));

		this._register(bindContextKey<string[]>(ChangesetReviewedFilesContext, this.contextKeyService, reader => {
			const changes = this.activeSessionChangesObs.read(reader);

			return changes
				.filter(change => change.reviewed)
				.map(change => change.modifiedUri?.toString() ?? change.originalUri?.toString())
				.filter((uri: string | undefined) => uri !== undefined);
		}));

		const changesetOperationCountObs = derivedObservableWithCache<number>(this, (reader, lastValue) => {
			const changeset = this.activeSessionChangesetObs.read(reader);
			if (!changeset) {
				return lastValue ?? 0;
			}

			const operations = this.activeSessionChangesetOperationsObs.read(reader);
			return operations.filter(op => op.scopes.includes(SessionChangesetOperationScope.Changeset)).length;
		});

		this._register(bindContextKey<boolean>(ChangesetHasOperationsContext, this.contextKeyService, reader => {
			return changesetOperationCountObs.read(reader) > 0;
		}));
	}
}
