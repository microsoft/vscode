/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { localize2 } from '../../../../../nls.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { IFileContent, IFileService } from '../../../../../platform/files/common/files.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IViewPaneOptions } from '../../../../browser/parts/views/viewPane.js';
import { IViewContainerModel, IViewDescriptor, IViewDescriptorService, IViewPaneContainer, ViewContainer, ViewContainerLocation } from '../../../../common/views.js';
import { isIChatSessionFileChange2 } from '../../../../contrib/chat/common/chatSessionsService.js';
import { IDecorationsService } from '../../../../services/decorations/common/decorations.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { ILifecycleService, LifecyclePhase, StartupKind } from '../../../../services/lifecycle/common/lifecycle.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { INotebookDocumentService } from '../../../../services/notebook/common/notebookDocumentService.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { FixtureMenuService } from '../chat/chatFixtureUtils.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

// eslint-disable-next-line local/code-import-patterns
import { ActiveSessionState, IChangesViewService } from '../../../../../sessions/contrib/changes/common/changesViewService.js';
// eslint-disable-next-line local/code-import-patterns
import { CHANGES_VIEW_CONTAINER_ID, CHANGES_VIEW_ID, ChangesViewMode, IsolationMode } from '../../../../../sessions/contrib/changes/common/changes.js';
// eslint-disable-next-line local/code-import-patterns
import { ChangesViewPane } from '../../../../../sessions/contrib/changes/browser/changesView.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionChangesService, SessionChangesService } from '../../../../../sessions/contrib/changes/browser/sessionChangesService.js';
// eslint-disable-next-line local/code-import-patterns
import { GitHubPullRequestCIModel } from '../../../../../sessions/contrib/github/browser/models/githubPullRequestCIModel.js';
// eslint-disable-next-line local/code-import-patterns
import { IGitHubService } from '../../../../../sessions/contrib/github/browser/githubService.js';
// eslint-disable-next-line local/code-import-patterns
import { GitHubCheckConclusion, GitHubCheckStatus, GitHubCIOverallStatus, IGitHubCICheck } from '../../../../../sessions/contrib/github/common/types.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsService } from '../../../../../sessions/services/sessions/browser/sessionsService.js';
// eslint-disable-next-line local/code-import-patterns
import { IActiveSession } from '../../../../../sessions/services/sessions/common/sessionsManagement.js';
// eslint-disable-next-line local/code-import-patterns
import { BRANCH_CHANGES_CHANGESET_ID, IChat, IGitHubInfo, ISessionCapabilities, ISessionChangeset, ISessionChangesetOperation, ISessionFile, ISessionFileChange, ISessionGitRepository, ISessionWorkspace, SessionFileOperation, SessionStatus } from '../../../../../sessions/services/sessions/common/session.js';

interface IChangesViewFixtureOptions {
	readonly viewMode: ChangesViewMode;
	readonly changes: readonly ISessionFileChange[];
	readonly otherFiles?: readonly ISessionFile[];
	readonly checks?: readonly IGitHubCICheck[];
	readonly reviewCommentCounts?: ReadonlyMap<string, number>;
	readonly agentFeedbackCounts?: ReadonlyMap<string, number>;
	readonly height?: number;
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
	readonly viewModeObs = observableValue<ChangesViewMode>(this, ChangesViewMode.List);

	constructor(session: IActiveSession, options: IChangesViewFixtureOptions) {
		super();

		const changeset = createChangeset(options.changes);
		this.viewModeObs.set(options.viewMode, undefined);
		this.activeSessionResourceObs = constObservable(session.resource);
		this.activeSessionTypeObs = constObservable(session.sessionType);
		this.activeSessionIsVirtualWorkspaceObs = constObservable(false);
		this.activeSessionChangesObs = constObservable(options.changes);
		this.activeSessionChangesetsObs = constObservable([changeset]);
		this.activeSessionChangesetsLoadingObs = constObservable(false);
		this.activeSessionChangesetObs = constObservable(changeset);
		this.activeSessionChangesetLoadingObs = constObservable(false);
		this.activeSessionChangesetOperationsObs = constObservable<readonly ISessionChangesetOperation[]>([]);
		this.activeSessionHasGitRepositoryObs = constObservable(true);
		this.activeSessionReviewCommentCountByFileObs = constObservable(new Map(options.reviewCommentCounts));
		this.activeSessionAgentFeedbackCountByFileObs = constObservable(new Map(options.agentFeedbackCounts));
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

	setChangesetId(_changesetId: string | undefined): void { }

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
	ctorDescriptor: new SyncDescriptor(ChangesViewPane),
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

function createChangeset(changes: readonly ISessionFileChange[]): ISessionChangeset {
	return new class extends mock<ISessionChangeset>() {
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

function createSession(options: IChangesViewFixtureOptions): IActiveSession {
	const capabilities: ISessionCapabilities = {
		supportsMultipleChats: false,
		supportsRename: true,
	};
	const changesets = [createChangeset(options.changes)];
	const chat = new class extends mock<IChat>() { }();

	return new class extends mock<IActiveSession>() {
		override readonly sessionId = 'fixture:changes-view';
		override readonly resource = URI.parse('fixture-session://changes-view');
		override readonly providerId = 'fixture';
		override readonly sessionType = 'fixture';
		override readonly icon = Codicon.account;
		override readonly createdAt = new Date('2026-05-14T12:00:00Z');
		override readonly workspace = constObservable(createWorkspace());
		override readonly title = constObservable('Changes view fixture');
		override readonly updatedAt = constObservable(new Date('2026-05-14T12:30:00Z'));
		override readonly status = constObservable(SessionStatus.Completed);
		override readonly changes = constObservable(options.changes);
		override readonly changesets = constObservable(changesets);
		override readonly externalChanges = constObservable(options.otherFiles ?? []);
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

function createFileChange(path: string, kind: 'added' | 'modified' | 'deleted', insertions: number, deletions: number): ISessionFileChange {
	const uri = URI.file(`/workspace/vscode/${path}`);
	return {
		uri,
		originalUri: kind === 'added' ? undefined : URI.file(`/workspace/vscode/.baseline/${path}`),
		modifiedUri: kind === 'deleted' ? undefined : uri,
		insertions,
		deletions,
	};
}

function createOtherFile(path: string, operation: SessionFileOperation): ISessionFile {
	return {
		uri: URI.file(path),
		operation,
		originalUri: operation === SessionFileOperation.Modified ? URI.file(`${path}.before`) : undefined,
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

function createGitHubService(checks: readonly IGitHubCICheck[] | undefined): IGitHubService {
	return new class extends mock<IGitHubService>() {
		override readonly activeSessionPullRequestObs = constObservable(undefined);
		override readonly activeSessionPullRequestCIObs = constObservable(createCIModel(checks));
		override readonly activeSessionPullRequestReviewThreadsObs = constObservable(undefined);
		override createRepositoryModelReference(): ReturnType<IGitHubService['createRepositoryModelReference']> { throw new Error('Not implemented in fixture.'); }
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
			reg.defineInstance(IGitHubService, createGitHubService(options.checks));
			reg.defineInstance(IViewDescriptorService, new FixtureViewDescriptorService());
			reg.defineInstance(ISessionsService, new class extends mock<ISessionsService>() {
				override readonly activeSession = constObservable<IActiveSession | undefined>(session);
				override readonly visibleSessions = constObservable([session]);
				override readonly onDidToggleSessionStickiness = Event.None;
			}());
			reg.defineInstance(IDecorationsService, new class extends mock<IDecorationsService>() { override onDidChangeDecorations = Event.None; }());
			reg.defineInstance(ITextFileService, new class extends mock<ITextFileService>() { override readonly untitled = new class extends mock<ITextFileService['untitled']>() { override readonly onDidChangeLabel = Event.None; }(); }());
			reg.defineInstance(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() { override onDidChangeWorkspaceFolders = Event.None; override getWorkspace(): IWorkspace { return { id: 'fixture', folders: [], configuration: undefined }; } }());
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

	const view = disposableStore.add(instantiationService.createInstance(ChangesViewPane, {
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
	createFileChange('src/vs/sessions/contrib/changes/browser/changesView.ts', 'modified', 42, 18),
	createFileChange('src/vs/sessions/contrib/changes/browser/sessionFilesWidget.ts', 'modified', 24, 9),
	createFileChange('src/vs/sessions/contrib/changes/browser/media/sessionFilesWidget.css', 'modified', 6, 2),
	createFileChange('src/vs/sessions/contrib/changes/test/browser/changesView.fixture.ts', 'added', 132, 0),
	createFileChange('src/vs/sessions/contrib/changes/browser/oldChangesLayout.ts', 'deleted', 0, 47),
];

const SAMPLE_OTHER_FILES = [
	createOtherFile('/home/user/.config/code/settings.json', SessionFileOperation.Modified),
	createOtherFile('/home/user/.config/copilot/agents/inbox.agent.md', SessionFileOperation.Created),
	createOtherFile('/home/user/.cache/copilot/session.log', SessionFileOperation.Deleted),
	createOtherFile('/tmp/session-notes.md', SessionFileOperation.Created),
	createOtherFile('/home/user/.gitconfig', SessionFileOperation.Modified),
	createOtherFile('/home/user/.ssh/config', SessionFileOperation.Modified),
	createOtherFile('/home/user/.local/share/copilot/state.json', SessionFileOperation.Created),
	createOtherFile('/home/user/.vscode-insiders/argv.json', SessionFileOperation.Modified),
];

const SAMPLE_CHECKS = [
	createCheck(1001, 'Linux / Unit Tests', GitHubCheckStatus.Completed, GitHubCheckConclusion.Success),
	createCheck(1002, 'Windows / Unit Tests', GitHubCheckStatus.Completed, GitHubCheckConclusion.Failure),
	createCheck(1003, 'macOS / Smoke Tests', GitHubCheckStatus.InProgress),
	createCheck(1004, 'Hygiene', GitHubCheckStatus.Queued),
	createCheck(1005, 'Compile', GitHubCheckStatus.Completed, GitHubCheckConclusion.Success),
];

export default defineThemedFixtureGroup({ path: 'sessions/changes/' }, {
	AllSections_List: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderChangesView(ctx, {
			viewMode: ChangesViewMode.List,
			changes: SAMPLE_CHANGES,
			otherFiles: SAMPLE_OTHER_FILES,
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
			otherFiles: SAMPLE_OTHER_FILES.slice(0, 3),
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

	NoFileChangesWithOtherFiles: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderChangesView(ctx, {
			viewMode: ChangesViewMode.List,
			changes: [],
			otherFiles: SAMPLE_OTHER_FILES,
			checks: SAMPLE_CHECKS.slice(0, 2),
			height: 440,
		}),
	}),

	Empty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderChangesView(ctx, {
			viewMode: ChangesViewMode.List,
			changes: [],
			otherFiles: [],
			checks: [],
			height: 280,
		}),
	}),
});
