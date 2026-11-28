/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { localize2 } from '../../../../../nls.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { IFileContent, IFileService } from '../../../../../platform/files/common/files.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IViewPaneOptions } from '../../../../browser/parts/views/viewPane.js';
import { IViewContainerModel, IViewDescriptor, IViewDescriptorService, IViewPaneContainer, ViewContainer, ViewContainerLocation } from '../../../../common/views.js';
import { IDecorationsService } from '../../../../services/decorations/common/decorations.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { ILifecycleService, LifecyclePhase, StartupKind } from '../../../../services/lifecycle/common/lifecycle.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { INotebookDocumentService } from '../../../../services/notebook/common/notebookDocumentService.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { IWorkspaceFolderLabelService } from '../../../../services/workspaces/common/workspaceFolderLabelService.js';
import { FixtureMenuService } from '../chat/chatFixtureUtils.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

import { ActiveSessionState, ChangesViewSection, IChangesDetailsViewState, IChangesSessionObservables, IChangesViewSectionCollapseState, IChangesViewService } from '../../../../contrib/sessions/common/changesViewService.js';
import { CHANGES_VIEW_CONTAINER_ID, CHANGES_VIEW_ID, ChangesViewMode, IsolationMode } from '../../../../contrib/sessions/common/changes.js';
import { DesktopChangesViewPane } from '../../../../contrib/sessionChanges/browser/changesView.js';
import '../../../../../sessions/contrib/changes/browser/changesView.contribution.js';
import { ISessionChangesService, SessionChangesService } from '../../../../contrib/sessionChanges/browser/sessionChangesService.js';
import { GitHubPullRequestCIModel } from '../../../../contrib/sessions/browser/github/models/githubPullRequestCIModel.js';
import { IGitHubService } from '../../../../contrib/sessions/browser/github/githubService.js';
import { GitHubCheckConclusion, GitHubCheckStatus, GitHubCIOverallStatus, IGitHubCICheck } from '../../../../contrib/sessions/common/github/types.js';
import { IFocusedSessionHostService } from '../../../../services/sessions/browser/sessionHost.js';
import { focusedSessionHostServiceOf, ITestSessionWithChat, sessionHostServiceOf, stubSessionHosts, testGridPanes } from '../../../../contrib/sessions/test/browser/sessionHostTestUtils.js';
import { ISessionsService } from '../../../../contrib/sessions/browser/sessionsService.js';
import { BRANCH_CHANGES_CHANGESET_ID, IChat, IGitHubInfo, ISession, ISessionCapabilities, ISessionChangesetFolderFailure, ISessionChangeset, ISessionChangesetOperation, ISessionChangesSummary, ISessionFileChange, ISessionGitRepository, ISessionWorkspace, SessionRepositoryKind, SessionStatus } from '../../../../services/sessions/common/session.js';
import type { IChangesRepository, IChangesRepositoryGroup } from '../../../../contrib/sessions/common/changesRepositories.js';
import { ChangesViewService } from '../../../../contrib/sessionChanges/browser/changesViewService.js';
import { IAgentFeedbackService } from '../../../../contrib/sessions/browser/agentFeedback.js';
import { ICodeReviewService, PRReviewStateKind } from '../../../../contrib/sessions/browser/codeReviewService.js';
import { ISessionsManagementService } from '../../../../contrib/sessions/common/sessionsManagement.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestStorageService } from '../../../common/workbenchTestServices.js';
import { isIChatSessionFileChange2 } from '../../../../common/chatSessionFileChange.js';
import { testIWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';

interface IChangesViewFixtureOptions {
	readonly viewMode: ChangesViewMode;
	readonly changes: readonly ISessionFileChange[];
	/** The checks of the pull request of the session's first folder, which the Changes show for all repositories. */
	readonly checks?: readonly IGitHubCICheck[];
	/** The checks of the pull request of other repositories, by their root, which the Changes show while one is picked. */
	readonly repositoryChecks?: ReadonlyMap<string, readonly IGitHubCICheck[]>;
	readonly reviewCommentCounts?: ReadonlyMap<string, number>;
	readonly agentFeedbackCounts?: ReadonlyMap<string, number>;
	readonly sectionCollapseState?: IChangesViewSectionCollapseState;
	readonly height?: number;
	/** A chat in several repositories: the vscode and vscode-docs folders and a repository found in vscode. */
	readonly repositories?: {
		/** The root of the repository shown on its own. */
		readonly selected?: URI;
		/** The root of a repository whose changes could not be computed. */
		readonly failed?: URI;
		/** Instead, two folders of one repository, mono, and the vscode-docs folder. */
		readonly sharedRoot?: boolean;
	};
}

const WORKSPACE_URI = URI.file('/workspace/vscode');
const VIEW_WIDTH = 380;
const VIEW_HEIGHT = 520;

class FixtureChangesViewService extends Disposable implements IChangesViewService {
	declare readonly _serviceBrand: undefined;

	readonly activeSessionResourceObs: IObservable<URI | undefined>;
	readonly activeSessionTypeObs: IObservable<string | undefined>;
	readonly activeSessionIsVirtualWorkspaceObs: IObservable<boolean>;
	readonly activeSessionChangesObs: IObservable<readonly ISessionFileChange[]>;
	readonly activeSessionChangesSummaryObs: IObservable<ISessionChangesSummary | undefined>;
	readonly activeSessionChangesetsObs: IObservable<readonly ISessionChangeset[] | undefined>;
	readonly activeSessionChangesetsLoadingObs: IObservable<boolean>;
	readonly activeSessionChangesetObs: IObservable<ISessionChangeset | undefined>;
	readonly activeSessionChangesetLoadingObs: IObservable<boolean>;
	readonly activeSessionChangesetOperationsObs: IObservable<readonly ISessionChangesetOperation[]>;
	readonly activeSessionHasGitRepositoryObs: IObservable<boolean>;
	readonly activeSessionReviewCommentCountByFileObs: IObservable<Map<string, number>>;
	readonly activeSessionAgentFeedbackCountByFileObs: IObservable<Map<string, number>>;
	readonly activeSessionStateObs: IObservable<ActiveSessionState | undefined>;
	readonly activeSessionBaseBranchRefObs = constObservable<string | undefined>(undefined);
	readonly activeSessionLoadingObs: IObservable<boolean>;
	readonly activeSessionSectionCollapseStateObs: IObservable<IChangesViewSectionCollapseState>;
	readonly activeSessionRepositoriesObs: IObservable<readonly IChangesRepository[]>;
	readonly activeSessionRepositoryObs: IObservable<IChangesRepository | undefined>;
	readonly activeSessionOperationsChangesetObs: IObservable<ISessionChangeset | undefined>;
	getSessionChanges(): IChangesSessionObservables {
		return {
			resourceObs: this.activeSessionResourceObs,
			typeObs: this.activeSessionTypeObs,
			isVirtualWorkspaceObs: this.activeSessionIsVirtualWorkspaceObs,
			hasGitRepositoryObs: this.activeSessionHasGitRepositoryObs,
			reviewCommentCountByFileObs: this.activeSessionReviewCommentCountByFileObs,
			agentFeedbackCountByFileObs: this.activeSessionAgentFeedbackCountByFileObs,
			changesetsLoadingObs: this.activeSessionChangesetsLoadingObs,
			changesetsObs: this.activeSessionChangesetsObs,
			changesetObs: this.activeSessionChangesetObs,
			changesetLoadingObs: this.activeSessionChangesetLoadingObs,
			changesetOperationsObs: this.activeSessionChangesetOperationsObs,
			changesObs: this.activeSessionChangesObs,
			loadingObs: this.activeSessionLoadingObs,
			changesSummaryObs: this.activeSessionChangesSummaryObs,
			sectionCollapseStateObs: this.activeSessionSectionCollapseStateObs,
			stateObs: this.activeSessionStateObs,
			baseBranchRefObs: this.activeSessionBaseBranchRefObs,
			repositoriesObs: this.activeSessionRepositoriesObs,
			repositoryObs: this.activeSessionRepositoryObs,
			operationsChangesetObs: this.activeSessionOperationsChangesetObs,
		};
	}

	readonly detailsViewStateTransferObs = constObservable(undefined);
	readonly viewModeObs = observableValue<ChangesViewMode>(this, ChangesViewMode.List);
	private readonly _repositories: ChangesViewService;

	constructor(session: ITestSessionWithChat, options: IChangesViewFixtureOptions) {
		super();

		const changeset = createChangeset(options.changes, options.repositories?.failed);
		this.viewModeObs.set(options.viewMode, undefined);
		// The repositories, their grouping and the changes of the shown one are the real service's
		this._repositories = this._register(new ChangesViewService(
			new class extends mock<IAgentFeedbackService>() {
				override readonly onDidChangeFeedback = Event.None;
				override readonly activeFeedbackSessionResource = constObservable(URI.from({ scheme: 'fixture-feedback' }));
				override getFeedback() { return []; }
			}(),
			new class extends mock<ICodeReviewService>() {
				override getPRReviewState() { return constObservable({ kind: PRReviewStateKind.None } as const); }
			}(),
			this._register(new MockContextKeyService()),
			sessionHostServiceOf(this._store, { mainWindowActiveSession: constObservable(session), gridShown: constObservable([]), windowSessions: constObservable([]) }),
			this._register(new TestStorageService()),
			new class extends mock<ISessionsManagementService>() {
				override readonly onDidReplaceSession = Event.None;
				override readonly onDidDeleteSession = Event.None;
				override readonly onDidDeleteChat = Event.None;
				override readonly onDidDiscardNewSession = Event.None;
				override readonly onDidReplaceNewDraftSession = Event.None;
			}(),
			new class extends mock<IUriIdentityService>() { override readonly extUri = extUriBiasedIgnorePathCase; }(),
		));
		this._repositories.setRepository(options.repositories?.selected);
		const repositories = this._repositories.activeSessionRepositoriesObs.get();
		const repository = this._repositories.activeSessionRepositoryObs.get();
		const changes = repository
			? this._repositories.groupByRepository(options.changes, getChangeUri, repositories).find(group => group.repository === repository)?.items ?? []
			: options.changes;
		this.activeSessionRepositoriesObs = constObservable(repositories);
		this.activeSessionRepositoryObs = constObservable(repository);
		this.activeSessionOperationsChangesetObs = constObservable(changeset);
		this.activeSessionResourceObs = constObservable(session.resource);
		this.activeSessionTypeObs = constObservable(session.sessionType);
		this.activeSessionIsVirtualWorkspaceObs = constObservable(false);
		this.activeSessionChangesObs = constObservable(changes);
		this.activeSessionChangesSummaryObs = constObservable(changes.length === 0 ? undefined : {
			additions: changes.reduce((total, change) => total + change.insertions, 0),
			deletions: changes.reduce((total, change) => total + change.deletions, 0),
			files: changes.length,
		});
		this.activeSessionChangesetsObs = constObservable([changeset]);
		this.activeSessionChangesetsLoadingObs = constObservable(false);
		this.activeSessionChangesetObs = constObservable(changeset);
		this.activeSessionChangesetLoadingObs = constObservable(false);
		this.activeSessionChangesetOperationsObs = constObservable<readonly ISessionChangesetOperation[]>([]);
		this.activeSessionHasGitRepositoryObs = constObservable(true);
		this.activeSessionReviewCommentCountByFileObs = constObservable(new Map(options.reviewCommentCounts));
		this.activeSessionAgentFeedbackCountByFileObs = constObservable(new Map(options.agentFeedbackCounts));
		this.activeSessionSectionCollapseStateObs = constObservable(options.sectionCollapseState ?? { checks: false });
		this.activeSessionStateObs = constObservable({
			isolationMode: IsolationMode.Worktree,
			hasGitRepository: true,
			branchName: 'feature/changes-view-fixtures',
			baseBranchName: 'main',
			upstreamBranchName: 'origin/feature/changes-view-fixtures',
			isMergeBaseBranchProtected: true,
			incomingChanges: 0,
			outgoingChanges: 2,
			uncommittedChanges: 0,
			hasBranchChanges: options.changes.length > 0,
			hasGitHubRemote: true,
			hasPullRequest: (options.checks?.length ?? 0) > 0,
			hasOpenPullRequest: (options.checks?.length ?? 0) > 0,
			hasGitOperationInProgress: false,
		});
		this.activeSessionLoadingObs = constObservable(false);
	}

	setSectionCollapsed(_sessionResource: URI, _section: ChangesViewSection, _collapsed: boolean): void { }

	getDetailsViewState(_sessionResource: URI, _viewMode: ChangesViewMode): IChangesDetailsViewState | undefined { return undefined; }

	setDetailsViewState(_sessionResource: URI, _viewMode: ChangesViewMode, _state: IChangesDetailsViewState): void { }

	setChangesetId(_changesetId: string | undefined): void { }
	setRepository(_repositoryRoot: URI | undefined): void { }

	findRepositoryFailure(repository: IChangesRepository, failures: readonly ISessionChangesetFolderFailure[]): ISessionChangesetFolderFailure | undefined {
		return this._repositories.findRepositoryFailure(repository, failures);
	}

	groupByRepository<T>(items: readonly T[], getResource: (item: T) => URI, repositories: readonly IChangesRepository[], failures?: readonly ISessionChangesetFolderFailure[]): IChangesRepositoryGroup<T>[] {
		return this._repositories.groupByRepository(items, getResource, repositories, failures);
	}
	showChangeset(_changeset: ISessionChangeset): void { }

	setChangesetFilesReviewState(_resources: readonly URI[], _reviewed: boolean): void { }

	setViewMode(mode: ChangesViewMode): void {
		this.viewModeObs.set(mode, undefined);
	}
}

class FixtureViewPaneContainer extends mock<IViewPaneContainer>() { }

const changesViewContainer: ViewContainer = {
	id: CHANGES_VIEW_CONTAINER_ID,
	title: localize2('fixtureChangesContainer', 'Changes'),
	ctorDescriptor: new SyncDescriptor(FixtureViewPaneContainer),
};

const changesViewDescriptor: IViewDescriptor = {
	id: CHANGES_VIEW_ID,
	name: localize2('fixtureChangesView', 'Changes'),
	ctorDescriptor: new SyncDescriptor(DesktopChangesViewPane),
	containerIcon: Codicon.gitCompare,
};

class FixtureViewContainerModel extends mock<IViewContainerModel>() {
	override readonly viewContainer = changesViewContainer;
	override readonly title = 'Changes';
	override readonly icon: ThemeIcon | URI | undefined = Codicon.gitCompare;
	override readonly keybindingId = undefined;
	override readonly onDidChangeContainerInfo = Event.None;
	override readonly allViewDescriptors = [changesViewDescriptor];
	override readonly onDidChangeAllViewDescriptors = Event.None;
	override readonly activeViewDescriptors = [changesViewDescriptor];
	override readonly onDidChangeActiveViewDescriptors = Event.None;
	override readonly visibleViewDescriptors = [changesViewDescriptor];
	override readonly onDidAddVisibleViewDescriptors = Event.None;
	override readonly onDidRemoveVisibleViewDescriptors = Event.None;
	override readonly onDidMoveVisibleViewDescriptors = Event.None;

	override isVisible(): boolean { return true; }
	override setVisible(): void { }
	override isCollapsed(): boolean { return false; }
	override setCollapsed(): void { }
	override getSize(): number | undefined { return undefined; }
	override setSizes(): void { }
	override move(): void { }
}

class FixtureViewDescriptorService extends mock<IViewDescriptorService>() {
	override readonly viewContainers = [changesViewContainer];
	override readonly onDidChangeViewContainers = Event.None;
	override readonly onDidChangeContainerLocation = Event.None;
	override readonly onDidChangeContainer = Event.None;
	override readonly onDidChangeLocation = Event.None;

	private readonly _model = new FixtureViewContainerModel();

	override getDefaultViewContainer(): ViewContainer | undefined { return changesViewContainer; }
	override getViewContainerById(): ViewContainer | null { return changesViewContainer; }
	override isViewContainerRemovedPermanently(): boolean { return false; }
	override getDefaultViewContainerLocation(): ViewContainerLocation | null { return ViewContainerLocation.AuxiliaryBar; }
	override getViewContainerLocation(): ViewContainerLocation | null { return ViewContainerLocation.AuxiliaryBar; }
	override getViewContainersByLocation(): ViewContainer[] { return [changesViewContainer]; }
	override getViewContainerModel(): IViewContainerModel { return this._model; }
	override moveViewContainerToLocation(): void { }
	override getViewContainerBadgeEnablementState(): boolean { return true; }
	override setViewContainerBadgeEnablementState(): void { }
	override getViewDescriptorById(): IViewDescriptor | null { return changesViewDescriptor; }
	override getViewContainerByViewId(): ViewContainer | null { return changesViewContainer; }
	override getDefaultContainerById(): ViewContainer | null { return changesViewContainer; }
	override getViewLocationById(): ViewContainerLocation | null { return ViewContainerLocation.AuxiliaryBar; }
	override canMoveViews(): boolean { return false; }
	override moveViewsToContainer(): void { }
	override moveViewToLocation(): void { }
	override reset(): void { }
}

function createChangeset(changes: readonly ISessionFileChange[], failedRepository?: URI): ISessionChangeset {
	return new class extends mock<ISessionChangeset>() {
		override readonly folderFailures = constObservable(failedRepository ? [{ workingDirectory: failedRepository, message: 'Git is not available in this folder' }] : []);
		override readonly id = BRANCH_CHANGES_CHANGESET_ID;
		override readonly label = 'Branch Changes';
		override readonly isEnabled = constObservable(true);
		override readonly isDefault = constObservable(true);
		override readonly isLoadingChanges = constObservable(false);
		override readonly changes = constObservable(changes);
		override readonly operations = constObservable([]);
		override readonly originalCheckpointRef = constObservable(undefined);
		override readonly modifiedCheckpointRef = constObservable(undefined);
		override async invokeOperation(): Promise<void> { }
	}();
}

const DOCS_URI = URI.file('/workspace/vscode-docs');
const COPILOT_URI = URI.file('/workspace/vscode/extensions/copilot');

function createRepositoriesWorkspace(): ISessionWorkspace {
	const workspace = createWorkspace();
	const docsRepository: ISessionGitRepository = { uri: DOCS_URI, workTreeUri: undefined, branchName: 'docs/projects', baseBranchName: 'main', gitHubInfo: constObservable<IGitHubInfo | undefined>(undefined) };
	return {
		...workspace,
		folders: [...workspace.folders, { root: DOCS_URI, workingDirectory: DOCS_URI, name: 'vscode-docs', description: undefined, gitRepository: docsRepository }],
		repositories: [
			{ root: WORKSPACE_URI, folder: WORKSPACE_URI, kind: SessionRepositoryKind.Folder },
			{ root: COPILOT_URI, folder: WORKSPACE_URI, kind: SessionRepositoryKind.Nested, gitRepository: { uri: COPILOT_URI, workTreeUri: undefined, branchName: 'main', baseBranchName: 'main', gitHubInfo: constObservable<IGitHubInfo | undefined>(undefined) } },
			{ root: DOCS_URI, folder: DOCS_URI, kind: SessionRepositoryKind.Folder },
		],
	};
}

const MONO_URI = URI.file('/workspace/mono');
const MONO_APP_URI = URI.file('/workspace/mono/app');
const MONO_LIB_URI = URI.file('/workspace/mono/lib');

/** Two folders of the mono repository, which the host lists once under the first, and the vscode-docs folder. */
function createSharedRootWorkspace(): ISessionWorkspace {
	const gitRepository = (uri: URI, branchName: string): ISessionGitRepository => ({ uri, workTreeUri: undefined, branchName, baseBranchName: 'main', gitHubInfo: constObservable<IGitHubInfo | undefined>(undefined) });
	const folder = (uri: URI, name: string, branchName: string) => ({ root: uri, workingDirectory: uri, name, description: undefined, gitRepository: gitRepository(uri, branchName) });
	return {
		uri: MONO_APP_URI,
		label: 'mono',
		icon: Codicon.folder,
		folders: [folder(MONO_APP_URI, 'app', 'feature/shared'), folder(MONO_LIB_URI, 'lib', 'feature/shared'), folder(DOCS_URI, 'vscode-docs', 'docs/projects')],
		repositories: [
			{ root: MONO_URI, folder: MONO_APP_URI, kind: SessionRepositoryKind.Folder },
			{ root: DOCS_URI, folder: DOCS_URI, kind: SessionRepositoryKind.Folder },
		],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	};
}

function createFixtureWorkspace(options: IChangesViewFixtureOptions): ISessionWorkspace {
	if (options.repositories?.sharedRoot) {
		return createSharedRootWorkspace();
	}
	return options.repositories ? createRepositoriesWorkspace() : createWorkspace();
}

function createWorkspace(): ISessionWorkspace {
	const gitRepository: ISessionGitRepository = {
		uri: WORKSPACE_URI,
		workTreeUri: URI.file('/workspace/.worktrees/changes-view-fixtures'),
		branchName: 'feature/changes-view-fixtures',
		baseBranchName: 'main',
		baseBranchProtected: true,
		hasGitHubRemote: true,
		upstreamBranchName: 'origin/feature/changes-view-fixtures',
		outgoingChanges: 2,
		uncommittedChanges: 0,
		gitHubInfo: constObservable<IGitHubInfo | undefined>({
			owner: 'microsoft',
			repo: 'vscode',
			pullRequest: {
				number: 293163,
				uri: URI.parse('https://github.com/microsoft/vscode/pull/293163'),
				icon: Codicon.gitPullRequest,
			},
		}),
	};

	return {
		uri: WORKSPACE_URI,
		label: 'vscode',
		icon: Codicon.folder,
		folders: [{
			root: WORKSPACE_URI,
			workingDirectory: WORKSPACE_URI,
			name: 'vscode',
			description: undefined,
			gitRepository,
		}],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	};
}

function createSession(options: IChangesViewFixtureOptions): ITestSessionWithChat {
	const capabilities: ISessionCapabilities = {
		supportsMultipleChats: false,
		supportsRename: true,
	};
	const changesets = [createChangeset(options.changes)];
	// A chat without its own folders shares the session's workspace.
	const workspace = constObservable(createFixtureWorkspace(options));
	const chat = new class extends mock<IChat>() {
		// Whose repository selection the Changes keep
		override readonly resource = URI.parse('fixture-chat://changes-view');
		override readonly changes = constObservable(options.changes);
		override readonly changesets = constObservable(changesets);
		override readonly workspace = workspace;
	}();

	return new class extends mock<ITestSessionWithChat>() {
		override readonly sessionId = 'fixture:changes-view';
		override readonly resource = URI.parse('fixture-session://changes-view');
		override readonly providerId = 'fixture';
		override readonly sessionType = 'fixture';
		override readonly icon = Codicon.account;
		override readonly createdAt = new Date('2026-05-14T12:00:00Z');
		override readonly workspace = workspace;
		override readonly title = constObservable('Changes view fixture');
		override readonly updatedAt = constObservable(new Date('2026-05-14T12:30:00Z'));
		override readonly status = constObservable(SessionStatus.Completed);
		override readonly modelId = constObservable(undefined);
		override readonly mode = constObservable(undefined);
		override readonly loading = constObservable(false);
		override readonly isArchived = constObservable(false);
		override readonly isRead = constObservable(true);
		override readonly description = constObservable(undefined);
		override readonly lastTurnEnd = constObservable(undefined);
		override readonly chats = constObservable([chat]);
		override readonly mainChat = constObservable(chat);
		override readonly capabilities = constObservable(capabilities);
		override readonly activeChat = constObservable(chat);
		override readonly isCreated = constObservable(true);
		override readonly sticky = constObservable(false);
		override readonly openChats = constObservable([chat]);
		override readonly closedChats = constObservable([]);
		override readonly lastClosedChat = undefined;
		override readonly visibleChatTabs = constObservable([chat]);
		override readonly shouldShowChatTabs = constObservable(false);
	}();
}

function createFileChange(path: string, kind: 'added' | 'modified' | 'deleted', insertions: number, deletions: number, root = '/workspace/vscode'): ISessionFileChange {
	const uri = URI.file(`${root}/${path}`);
	return {
		uri,
		originalUri: kind === 'added' ? undefined : URI.file(`${root}/.baseline/${path}`),
		modifiedUri: kind === 'deleted' ? undefined : uri,
		insertions,
		deletions,
	};
}

function createCheck(id: number, name: string, status: GitHubCheckStatus, conclusion?: GitHubCheckConclusion): IGitHubCICheck {
	return {
		id,
		name,
		status,
		conclusion,
		startedAt: '2026-05-14T12:00:00Z',
		completedAt: status === GitHubCheckStatus.Completed ? '2026-05-14T12:05:00Z' : undefined,
		detailsUrl: `https://github.com/microsoft/vscode/actions/runs/${id}`,
	};
}

function createCIModel(checks: readonly IGitHubCICheck[] | undefined): GitHubPullRequestCIModel | undefined {
	if (!checks?.length) {
		return undefined;
	}
	const visibleChecks: readonly IGitHubCICheck[] = checks;

	return new class extends mock<GitHubPullRequestCIModel>() {
		override readonly owner = 'microsoft';
		override readonly repo = 'vscode';
		override readonly prNumber = 293163;
		override readonly headSha = 'abcdef1234567890';
		override readonly checks = constObservable(visibleChecks);
		override readonly overallStatus = constObservable(GitHubCIOverallStatus.Failure);
		override readonly fixRequested = constObservable(false);
		override markFixRequested(): void { }
		override async refresh(): Promise<void> { }
		override async rerunFailedCheck(): Promise<void> { }
		override async getCheckRunAnnotations(): Promise<string> { return ''; }
		override startPolling() { return { dispose() { } }; }
	}();
}

function createGitHubService(checks: readonly IGitHubCICheck[] | undefined, repositoryChecks?: ReadonlyMap<string, readonly IGitHubCICheck[]>): IGitHubService {
	const firstFolderCI = createCIModel(checks);
	const repositoryCI = new Map([...repositoryChecks ?? []].map(([root, repositoryChecks]) => [root, createCIModel(repositoryChecks)]));
	return new class extends mock<IGitHubService>() {
		override readonly activeSessionPullRequestObs = constObservable(undefined);
		override readonly activeSessionPullRequestCIObs = constObservable(firstFolderCI);
		override readonly activeSessionPullRequestReviewThreadsObs = constObservable(undefined);
		// As the service: the pull request of the repository the Changes show, else of the session's first folder
		override getSessionPullRequest(_sessionObs: IObservable<ISession | undefined>, repositoryObs?: IObservable<IChangesRepository | undefined>): ReturnType<IGitHubService['getSessionPullRequest']> {
			const pullRequestCIObs = derived(reader => {
				const repository = repositoryObs?.read(reader);
				return repository && repositoryCI.has(repository.root.toString()) ? repositoryCI.get(repository.root.toString()) : firstFolderCI;
			});
			return { pullRequestObs: constObservable(undefined), pullRequestCIObs, pullRequestReviewThreadsObs: constObservable(undefined) };
		}
		override createPullRequestModelReference(): ReturnType<IGitHubService['createPullRequestModelReference']> { throw new Error('Not implemented in fixture.'); }
		override createPullRequestReviewThreadsModelReference(): ReturnType<IGitHubService['createPullRequestReviewThreadsModelReference']> { throw new Error('Not implemented in fixture.'); }
		override createPullRequestCIModelReference(): ReturnType<IGitHubService['createPullRequestCIModelReference']> { throw new Error('Not implemented in fixture.'); }
		override async getChangedFiles() { return []; }
		override async findPullRequestNumberByHeadBranch() { return undefined; }
	}();
}

function getChangeUri(change: ISessionFileChange): URI {
	return isIChatSessionFileChange2(change) ? change.uri : change.modifiedUri;
}

function renderChangesView(ctx: ComponentFixtureContext, options: IChangesViewFixtureOptions): void {
	const { container, disposableStore, theme } = ctx;
	const height = options.height ?? VIEW_HEIGHT;
	const session = createSession(options);
	const changesViewService = disposableStore.add(new FixtureChangesViewService(session, options));

	container.style.width = `${VIEW_WIDTH}px`;
	container.style.height = `${height}px`;
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';
	container.classList.add('agent-sessions-workbench', 'dock-detail-panel');

	const host = dom.append(container, dom.$('.part.auxiliarybar'));
	host.style.width = '100%';
	host.style.height = '100%';

	const paneView = dom.append(host, dom.$('.monaco-pane-view'));
	paneView.style.width = '100%';
	paneView.style.height = '100%';

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.define(IMenuService, FixtureMenuService);
			reg.define(IListService, ListService);
			reg.define(ISessionChangesService, SessionChangesService);
			reg.defineInstance(IChangesViewService, changesViewService);
			reg.defineInstance(IGitHubService, createGitHubService(options.checks, options.repositoryChecks));
			reg.defineInstance(IViewDescriptorService, new FixtureViewDescriptorService());
			reg.defineInstance(ISessionsService, new class extends mock<ISessionsService>() {
				readonly activeSession = constObservable<ITestSessionWithChat | undefined>(session);
				readonly gridShown = constObservable([session]);
				override readonly slotPanes = testGridPanes(this.gridShown);
				override readonly onDidToggleSessionStickiness = Event.None;
			}());
			reg.defineInstance(IDecorationsService, new class extends mock<IDecorationsService>() { override onDidChangeDecorations = Event.None; }());
			reg.defineInstance(ITextFileService, new class extends mock<ITextFileService>() { override readonly untitled = new class extends mock<ITextFileService['untitled']>() { override readonly onDidChangeLabel = Event.None; }(); }());
			reg.defineInstance(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() { override onDidChangeWorkspaceFolders = Event.None; override getWorkspace(): IWorkspace { return testIWorkspace({ id: 'fixture', folders: [], configuration: undefined }); } }());
			reg.defineInstance(IWorkspaceFolderLabelService, new class extends mock<IWorkspaceFolderLabelService>() {
				override getWorkspaceFolderLabel(): string {
					return 'vscode (feature/changes-view-fixtures)';
				}
			}());
			reg.defineInstance(INotebookDocumentService, new class extends mock<INotebookDocumentService>() { override getNotebook() { return undefined; } }());
			reg.defineInstance(IFileService, new class extends mock<IFileService>() {
				override async readFile(resource: URI): Promise<IFileContent> {
					return new class extends mock<IFileContent>() {
						override readonly resource = resource;
						override readonly value = VSBuffer.fromString('before');
					}();
				}
			}());
			reg.defineInstance(IEditorService, new class extends mock<IEditorService>() {
				override readonly onDidActiveEditorChange = Event.None;
				override readonly onDidVisibleEditorsChange = Event.None;
				override readonly onDidEditorsChange = Event.None;
				override async openEditor(): Promise<undefined> { return undefined; }
			}());
			reg.defineInstance(IExtensionService, new class extends mock<IExtensionService>() { override readonly onDidChangeExtensions = Event.None; }());
			reg.defineInstance(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() { }());
			reg.defineInstance(ILifecycleService, new class extends mock<ILifecycleService>() {
				override readonly startupKind = StartupKind.NewWindow;
				override phase = LifecyclePhase.Restored;
				override readonly onBeforeShutdown = Event.None;
				override readonly onShutdownVeto = Event.None;
				override readonly onBeforeShutdownError = Event.None;
				override readonly onWillShutdown = Event.None;
				override readonly willShutdown = false;
				override readonly onDidShutdown = Event.None;
				override async when(): Promise<void> { }
				override async shutdown(): Promise<void> { }
			}());
		},
	});
	stubSessionHosts(instantiationService, disposableStore, { session: constObservable<ITestSessionWithChat | undefined>(session) });
	instantiationService.stub(IFocusedSessionHostService, focusedSessionHostServiceOf(constObservable<ITestSessionWithChat | undefined>(session)));

	const view = disposableStore.add(instantiationService.createInstance(DesktopChangesViewPane, {
		id: CHANGES_VIEW_ID,
		title: 'Changes',
		minimumBodySize: 0,
		maximumBodySize: Number.POSITIVE_INFINITY,
	} satisfies IViewPaneOptions));

	view.render();
	paneView.appendChild(view.element);
	view.setVisible(true);
	view.orthogonalSize = VIEW_WIDTH;
	view.layout(height);
}

const SAMPLE_CHANGES = [
	createFileChange('src/vs/workbench/contrib/sessions/browser/changes/changesView.ts', 'modified', 42, 18),
	createFileChange('src/vs/workbench/contrib/sessions/browser/changes/checksWidget.ts', 'modified', 24, 9),
	createFileChange('src/vs/workbench/contrib/sessions/browser/changes/media/checksWidget.css', 'modified', 6, 2),
	createFileChange('src/vs/sessions/contrib/changes/test/browser/changesView.fixture.ts', 'added', 132, 0),
	createFileChange('src/vs/sessions/contrib/changes/browser/oldChangesLayout.ts', 'deleted', 0, 47),
];

const REPOSITORY_CHANGES = [
	createFileChange('src/vs/workbench/contrib/sessionChanges/browser/changesView.ts', 'modified', 42, 18),
	createFileChange('src/vs/workbench/contrib/sessionChanges/browser/changesRepositoryPicker.ts', 'added', 210, 0),
	createFileChange('src/extension/prompts/node/agentPrompt.ts', 'modified', 8, 3, COPILOT_URI.path),
	createFileChange('release-notes/v1_120.md', 'modified', 24, 2, DOCS_URI.path),
	createFileChange('docs/agents/projects.md', 'added', 96, 0, DOCS_URI.path),
];

const MANY_CHANGES = Array.from({ length: 40 }, (_, index) =>
	createFileChange(`src/feature/changed-file-${String(index + 1).padStart(2, '0')}.ts`, 'modified', index + 1, index % 4)
);

const SAMPLE_CHECKS = [
	createCheck(1001, 'Linux / Unit Tests', GitHubCheckStatus.Completed, GitHubCheckConclusion.Success),
	createCheck(1002, 'Windows / Unit Tests', GitHubCheckStatus.Completed, GitHubCheckConclusion.Failure),
	createCheck(1003, 'macOS / Smoke Tests', GitHubCheckStatus.InProgress),
	createCheck(1004, 'Hygiene', GitHubCheckStatus.Queued),
	createCheck(1005, 'Compile', GitHubCheckStatus.Completed, GitHubCheckConclusion.Success),
];

/** The checks of the vscode-docs pull request, unlike those of vscode's. */
const DOCS_CHECKS = [
	createCheck(2001, 'Docs / Markdown Lint', GitHubCheckStatus.Completed, GitHubCheckConclusion.Failure),
	createCheck(2002, 'Docs / Link Check', GitHubCheckStatus.InProgress),
];
const REPOSITORY_CHECKS = new Map([[DOCS_URI.toString(), DOCS_CHECKS]]);

export default defineThemedFixtureGroup({ path: 'sessions/changes/' }, {
	AllSections_List: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderChangesView(ctx, {
			viewMode: ChangesViewMode.List,
			changes: SAMPLE_CHANGES,
			checks: SAMPLE_CHECKS,
			reviewCommentCounts: new Map([[getChangeUri(SAMPLE_CHANGES[0]).fsPath, 2]]),
			agentFeedbackCounts: new Map([[getChangeUri(SAMPLE_CHANGES[1]).fsPath, 1]]),
		}),
	}),

	TreeMode: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderChangesView(ctx, {
			viewMode: ChangesViewMode.Tree,
			changes: SAMPLE_CHANGES,
			checks: SAMPLE_CHECKS.slice(0, 3),
		}),
	}),

	FilesAndChecksOnly: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderChangesView(ctx, {
			viewMode: ChangesViewMode.List,
			changes: SAMPLE_CHANGES,
			checks: SAMPLE_CHECKS,
			height: 440,
		}),
	}),

	ManyChanges: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderChangesView(ctx, {
			viewMode: ChangesViewMode.List,
			changes: MANY_CHANGES,
			checks: SAMPLE_CHECKS,
			height: 1252,
		}),
	}),

	CollapsedSections: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderChangesView(ctx, {
			viewMode: ChangesViewMode.List,
			changes: SAMPLE_CHANGES,
			checks: SAMPLE_CHECKS,
			sectionCollapseState: { checks: true },
			height: 440,
		}),
	}),

	NoFileChanges: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderChangesView(ctx, {
			viewMode: ChangesViewMode.List,
			changes: [],
			checks: SAMPLE_CHECKS.slice(0, 2),
			height: 440,
		}),
	}),

	Repositories_List: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The changed files are grouped under three root rows, vscode, extensions/copilot and vscode-docs, each with its branch beside its name and its files listed below it with paths relative to that repository.'],
		render: ctx => renderChangesView(ctx, {
			viewMode: ChangesViewMode.List,
			changes: REPOSITORY_CHANGES,
			repositories: {},
			height: 440,
		}),
	}),

	Repositories_SharedRoot: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['Two root rows, mono and vscode-docs, each with its branch: the files of both the app and lib folders of the mono repository are listed together under the one mono row.'],
		render: ctx => renderChangesView(ctx, {
			viewMode: ChangesViewMode.List,
			changes: [
				createFileChange('src/main.ts', 'modified', 12, 4, MONO_APP_URI.path),
				createFileChange('src/index.ts', 'added', 30, 0, MONO_LIB_URI.path),
				createFileChange('docs/agents/projects.md', 'added', 96, 0, DOCS_URI.path),
			],
			repositories: { sharedRoot: true },
			height: 320,
		}),
	}),

	Repositories_Tree: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderChangesView(ctx, {
			viewMode: ChangesViewMode.Tree,
			changes: REPOSITORY_CHANGES,
			repositories: {},
			height: 520,
		}),
	}),

	Repositories_OneShown: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['Only the vscode-docs root row and its two files show, the changes of the repository picked on its own.'],
		render: ctx => renderChangesView(ctx, {
			viewMode: ChangesViewMode.List,
			changes: REPOSITORY_CHANGES,
			repositories: { selected: DOCS_URI },
			height: 320,
		}),
	}),

	Repositories_Failed: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['The vscode-docs root row shows "Git is not available in this folder" in the error color instead of its branch, with no files under it; the other repositories show their files.'],
		render: ctx => renderChangesView(ctx, {
			viewMode: ChangesViewMode.List,
			changes: REPOSITORY_CHANGES.slice(0, 3),
			repositories: { failed: DOCS_URI },
			height: 360,
		}),
	}),

	Repositories_OtherChanges: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['After the repository root rows, a last root row "Other Changes" lists the file changed outside every repository.'],
		render: ctx => renderChangesView(ctx, {
			viewMode: ChangesViewMode.List,
			changes: [...REPOSITORY_CHANGES, createFileChange('notes/plan.md', 'added', 12, 0, '/workspace/scratch')],
			repositories: {},
			height: 480,
		}),
	}),

	Repositories_OneShownFailed: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['Only the vscode-docs root row shows, picked on its own, with "Git is not available in this folder" in the error color and no files under it.'],
		render: ctx => renderChangesView(ctx, {
			viewMode: ChangesViewMode.List,
			changes: REPOSITORY_CHANGES.slice(0, 3),
			repositories: { selected: DOCS_URI, failed: DOCS_URI },
			height: 200,
		}),
	}),

	Repositories_ChecksAll: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['With all repositories shown, the Checks list the vscode pull request\'s checks: Linux / Unit Tests, Windows / Unit Tests failing, macOS / Smoke Tests, Hygiene and Compile.'],
		render: ctx => renderChangesView(ctx, {
			viewMode: ChangesViewMode.List,
			changes: REPOSITORY_CHANGES,
			checks: SAMPLE_CHECKS,
			repositoryChecks: REPOSITORY_CHECKS,
			repositories: {},
			height: 640,
		}),
	}),

	Repositories_ChecksOneShown: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['With vscode-docs picked, its root row and files show, and the Checks list only the vscode-docs pull request\'s checks: Docs / Markdown Lint failing and Docs / Link Check in progress.'],
		render: ctx => renderChangesView(ctx, {
			viewMode: ChangesViewMode.List,
			changes: REPOSITORY_CHANGES,
			checks: SAMPLE_CHECKS,
			repositoryChecks: REPOSITORY_CHECKS,
			repositories: { selected: DOCS_URI },
			height: 440,
		}),
	}),

	Empty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A centered empty state shows the semibold title "Changes" above the secondary text "No changed files", with compact spacing and no icon.'],
		render: ctx => renderChangesView(ctx, {
			viewMode: ChangesViewMode.List,
			changes: [],
			checks: [],
			height: 280,
		}),
	}),
});
