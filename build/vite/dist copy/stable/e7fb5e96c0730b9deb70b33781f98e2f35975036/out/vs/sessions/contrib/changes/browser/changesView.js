/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ChangesTreeRenderer_1;
import './media/changesView.css';
import * as dom from '../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ActionRunner } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { autorun, constObservable, derived, derivedObservableWithCache, derivedOpts, ObservablePromise, observableSignalFromEvent, observableValue, runOnChange } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/path.js';
import { ResourceTree } from '../../../../base/common/resourceTree.js';
import { ProgressBar } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { dirname, extUriBiasedIgnorePathCase, isEqual, relativePath } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { MenuWorkbenchButtonBar } from '../../../../platform/actions/browser/buttonbar.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { MenuId, Action2, MenuItemAction, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchCompressibleObjectTree } from '../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { defaultProgressBarStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { fillEditorsDragData } from '../../../../workbench/browser/dnd.js';
import { ResourceLabels } from '../../../../workbench/browser/labels.js';
import { ViewPane, ViewAction } from '../../../../workbench/browser/parts/views/viewPane.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { chatEditingWidgetFileStateContextKey } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { createFileIconThemableTreeContainerScope } from '../../../../workbench/contrib/files/browser/views/explorerView.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../../workbench/services/editor/common/editorService.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { getCodeReviewFilesFromSessionChanges, getCodeReviewVersion, ICodeReviewService } from '../../codeReview/browser/codeReviewService.js';
import { IAgentFeedbackService } from '../../agentFeedback/browser/agentFeedbackService.js';
import { IGitService } from '../../../../workbench/contrib/git/common/gitService.js';
import { CIStatusWidget } from './checksWidget.js';
import { arrayEqualsC, structuralEquals } from '../../../../base/common/equals.js';
import { GITHUB_REMOTE_FILE_SCHEME } from '../../sessions/common/sessionData.js';
import { Sizing, SplitView } from '../../../../base/browser/ui/splitview/splitview.js';
import { Color } from '../../../../base/common/color.js';
import { PANEL_SECTION_BORDER } from '../../../../workbench/common/theme.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../workbench/common/editor.js';
import { logChangesViewFileSelect, logChangesViewVersionModeChange, logChangesViewViewModeChange } from '../../../common/sessionsTelemetry.js';
import { ChecksViewModel } from './checksViewModel.js';
const $ = dom.$;
// --- Constants
export const CHANGES_VIEW_CONTAINER_ID = 'workbench.view.agentSessions.changesContainer';
export const CHANGES_VIEW_ID = 'workbench.view.agentSessions.changes';
const RUN_SESSION_CODE_REVIEW_ACTION_ID = 'sessions.codeReview.run';
// --- View Mode
export var ChangesViewMode;
(function (ChangesViewMode) {
    ChangesViewMode["List"] = "list";
    ChangesViewMode["Tree"] = "tree";
})(ChangesViewMode || (ChangesViewMode = {}));
const changesViewModeContextKey = new RawContextKey('changesViewMode', "list" /* ChangesViewMode.List */);
// --- Versions Mode
var ChangesVersionMode;
(function (ChangesVersionMode) {
    ChangesVersionMode["BranchChanges"] = "branchChanges";
    ChangesVersionMode["OutgoingChanges"] = "outgoingChanges";
    ChangesVersionMode["AllChanges"] = "allChanges";
    ChangesVersionMode["LastTurn"] = "lastTurn";
})(ChangesVersionMode || (ChangesVersionMode = {}));
var IsolationMode;
(function (IsolationMode) {
    IsolationMode["Workspace"] = "workspace";
    IsolationMode["Worktree"] = "worktree";
})(IsolationMode || (IsolationMode = {}));
const changesVersionModeContextKey = new RawContextKey('sessions.changesVersionMode', "branchChanges" /* ChangesVersionMode.BranchChanges */);
const isMergeBaseBranchProtectedContextKey = new RawContextKey('sessions.isMergeBaseBranchProtected', false);
const isolationModeContextKey = new RawContextKey('sessions.isolationMode', "workspace" /* IsolationMode.Workspace */);
const hasGitRepositoryContextKey = new RawContextKey('sessions.hasGitRepository', true);
const hasPullRequestContextKey = new RawContextKey('sessions.hasPullRequest', false);
const hasOpenPullRequestContextKey = new RawContextKey('sessions.hasOpenPullRequest', false);
const hasIncomingChangesContextKey = new RawContextKey('sessions.hasIncomingChanges', false);
const hasOutgoingChangesContextKey = new RawContextKey('sessions.hasOutgoingChanges', false);
const hasUncommittedChangesContextKey = new RawContextKey('sessions.hasUncommittedChanges', true);
function isChangesFileItem(element) {
    return !ResourceTree.isResourceNode(element) && element.type === 'file';
}
function isChangesRootItem(element) {
    return !ResourceTree.isResourceNode(element) && element.type === 'root';
}
/**
 * Builds a tree of `ICompressedTreeElement<ChangesTreeElement>` from a flat list of file items
 * using a `ResourceTree` to group files by their directory path segments.
 */
function buildTreeChildren(items, treeRootInfo) {
    if (items.length === 0) {
        return [];
    }
    let rootUri = treeRootInfo?.resourceTreeRootUri ?? URI.file('/');
    // For github-remote-file URIs, set the root to /{owner}/{repo}/{ref}
    // so the tree shows repo-relative paths instead of internal URI segments.
    if (!treeRootInfo && items[0].uri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
        const parts = items[0].uri.path.split('/').filter(Boolean);
        if (parts.length >= 3) {
            rootUri = items[0].uri.with({ path: '/' + parts.slice(0, 3).join('/') });
        }
    }
    const resourceTree = new ResourceTree(undefined, rootUri, extUriBiasedIgnorePathCase);
    for (const item of items) {
        resourceTree.add(item.uri, item);
    }
    function convertChildren(parent) {
        const result = [];
        for (const child of parent.children) {
            if (child.element && child.childrenCount === 0) {
                // Leaf node — just the file item
                result.push({
                    element: child.element,
                    collapsible: false,
                    incompressible: true,
                });
            }
            else {
                // Folder node. Ensure that the first level of folders under
                // the root folder are not being collapsed with the root folder
                // as that is a special node showing the workspace folder and
                // branch information.
                result.push({
                    element: child,
                    children: convertChildren(child),
                    incompressible: parent === resourceTree.root,
                    collapsible: true,
                    collapsed: false,
                });
            }
        }
        return result;
    }
    const children = convertChildren(resourceTree.root);
    if (!treeRootInfo) {
        return children;
    }
    return [{
            element: treeRootInfo.root,
            children,
            collapsible: true,
            collapsed: false,
            incompressible: true,
        }];
}
function toChangesFileItem(changes, modifiedRef, originalRef) {
    return changes.map(change => {
        const isDeletion = change.modifiedUri === undefined;
        const isAddition = change.originalUri === undefined;
        const uri = change.modifiedUri ?? change.uri;
        const fileUri = isDeletion
            ? uri
            : modifiedRef
                ? uri.with({ scheme: 'git', query: JSON.stringify({ path: uri.fsPath, ref: modifiedRef }) })
                : uri;
        const originalUri = isAddition
            ? change.originalUri
            : originalRef
                ? fileUri.with({ scheme: 'git', query: JSON.stringify({ path: fileUri.fsPath, ref: originalRef }) })
                : change.originalUri;
        return {
            type: 'file',
            uri: fileUri,
            originalUri,
            state: 1 /* ModifiedFileEntryState.Accepted */,
            isDeletion,
            changeType: isDeletion ? 'deleted' : isAddition ? 'added' : 'modified',
            linesAdded: change.insertions,
            linesRemoved: change.deletions
        };
    });
}
// --- View Model
let ChangesViewModel = class ChangesViewModel extends Disposable {
    setVersionMode(mode) {
        if (this.versionModeObs.get() === mode) {
            return;
        }
        this.versionModeObs.set(mode, undefined);
    }
    setViewMode(mode) {
        if (this.viewModeObs.get() === mode) {
            return;
        }
        this.viewModeObs.set(mode, undefined);
        this.storageService.store('changesView.viewMode', mode, 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
    }
    constructor(agentFeedbackService, agentSessionsService, codeReviewService, gitService, sessionManagementService, storageService) {
        super();
        this.agentFeedbackService = agentFeedbackService;
        this.agentSessionsService = agentSessionsService;
        this.codeReviewService = codeReviewService;
        this.gitService = gitService;
        this.sessionManagementService = sessionManagementService;
        this.storageService = storageService;
        // Active session changes
        this.sessionsChangedSignal = observableSignalFromEvent(this, this.sessionManagementService.onDidChangeSessions);
        // Active session resource
        this.activeSessionResourceObs = derivedOpts({ equalsFn: isEqual }, reader => {
            const activeSession = this.sessionManagementService.activeSession.read(reader);
            return activeSession?.resource;
        });
        // Active session changes
        this.activeSessionChangesObs = derivedOpts({
            equalsFn: arrayEqualsC()
        }, reader => {
            const activeSession = this.sessionManagementService.activeSession.read(reader);
            if (!activeSession) {
                return Iterable.empty();
            }
            return activeSession.changes.read(reader);
        });
        const activeSessionRepositoryObs = derived(reader => {
            const activeSession = this.sessionManagementService.activeSession.read(reader);
            return activeSession?.workspace.read(reader)?.repositories[0];
        });
        // Active session isolation mode
        this.activeSessionIsolationModeObs = derived(reader => {
            const activeSessionRepository = activeSessionRepositoryObs.read(reader);
            return activeSessionRepository?.workingDirectory === undefined
                ? "workspace" /* IsolationMode.Workspace */
                : "worktree" /* IsolationMode.Worktree */;
        });
        // Active session repository
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
        this.activeSessionRepositoryObs = derived(reader => {
            const activeSessionRepositoryPromise = activeSessionRepositoryPromiseObs.read(reader);
            if (activeSessionRepositoryPromise === undefined) {
                return undefined;
            }
            return activeSessionRepositoryPromise.read(reader);
        });
        // Active session branch name
        this.activeSessionBranchNameObs = derived(reader => {
            const repository = activeSessionRepositoryObs.read(reader);
            const repositoryState = this.activeSessionRepositoryObs.read(reader)?.state.read(reader);
            return repository?.detail ?? repositoryState?.HEAD?.name;
        });
        // Active session base branch name
        this.activeSessionBaseBranchNameObs = derived(reader => {
            const sessionResource = this.activeSessionResourceObs.read(reader);
            if (!sessionResource) {
                return undefined;
            }
            this.sessionsChangedSignal.read(reader);
            const model = this.agentSessionsService.getSession(sessionResource);
            return model?.metadata?.baseBranchName;
        });
        // Active session has git repository
        this.activeSessionHasGitRepositoryObs = derived(reader => {
            const sessionResource = this.activeSessionResourceObs.read(reader);
            if (!sessionResource) {
                return false;
            }
            this.sessionsChangedSignal.read(reader);
            const model = this.agentSessionsService.getSession(sessionResource);
            return model?.metadata?.repositoryPath !== undefined;
        });
        // Active session first checkpoint ref
        this.activeSessionFirstCheckpointRefObs = derived(reader => {
            const sessionResource = this.activeSessionResourceObs.read(reader);
            if (!sessionResource) {
                return undefined;
            }
            this.sessionsChangedSignal.read(reader);
            const model = this.agentSessionsService.getSession(sessionResource);
            return model?.metadata?.firstCheckpointRef;
        });
        // Active session last checkpoint ref
        this.activeSessionLastCheckpointRefObs = derived(reader => {
            const sessionResource = this.activeSessionResourceObs.read(reader);
            if (!sessionResource) {
                return undefined;
            }
            this.sessionsChangedSignal.read(reader);
            const model = this.agentSessionsService.getSession(sessionResource);
            return model?.metadata?.lastCheckpointRef;
        });
        // Active session all changes
        this.activeSessionAllChangesObs = derived(reader => {
            const repository = this.activeSessionRepositoryObs.read(reader);
            const firstCheckpointRef = this.activeSessionFirstCheckpointRefObs.read(reader);
            const lastCheckpointRef = this.activeSessionLastCheckpointRefObs.read(reader);
            if (!repository || !firstCheckpointRef || !lastCheckpointRef) {
                return constObservable([]);
            }
            const diffPromise = repository.diffBetweenWithStats(firstCheckpointRef, lastCheckpointRef);
            return new ObservablePromise(diffPromise).resolvedValue;
        });
        // Active session last turn changes
        this.activeSessionLastTurnChangesObs = derived(reader => {
            const repository = this.activeSessionRepositoryObs.read(reader);
            const lastCheckpointRef = this.activeSessionLastCheckpointRefObs.read(reader);
            if (!repository || !lastCheckpointRef) {
                return constObservable([]);
            }
            const diffPromise = repository.diffBetweenWithStats(`${lastCheckpointRef}^`, lastCheckpointRef);
            return new ObservablePromise(diffPromise).resolvedValue;
        });
        this.activeSessionReviewCommentCountByFileObs = derived(reader => {
            const sessionResource = this.activeSessionResourceObs.read(reader);
            const changes = [...this.activeSessionChangesObs.read(reader)];
            if (!sessionResource) {
                return new Map();
            }
            const result = new Map();
            const prReviewState = this.codeReviewService.getPRReviewState(sessionResource).read(reader);
            if (prReviewState.kind === "loaded" /* PRReviewStateKind.Loaded */) {
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
            if (reviewState.kind !== "result" /* CodeReviewStateKind.Result */ || reviewState.version !== reviewVersion) {
                return result;
            }
            for (const comment of reviewState.comments) {
                const uriKey = comment.uri.fsPath;
                result.set(uriKey, (result.get(uriKey) ?? 0) + 1);
            }
            return result;
        });
        this.activeSessionAgentFeedbackCountByFileObs = derived(reader => {
            const sessionResource = this.activeSessionResourceObs.read(reader);
            if (!sessionResource) {
                return new Map();
            }
            observableSignalFromEvent(this, this.agentFeedbackService.onDidChangeFeedback).read(reader);
            const feedbackItems = this.agentFeedbackService.getFeedback(sessionResource);
            const result = new Map();
            for (const item of feedbackItems) {
                if (!item.sourcePRReviewCommentId) {
                    const uriKey = item.resourceUri.fsPath;
                    result.set(uriKey, (result.get(uriKey) ?? 0) + 1);
                }
            }
            return result;
        });
        // Version mode
        this.versionModeObs = observableValue(this, "branchChanges" /* ChangesVersionMode.BranchChanges */);
        this._register(runOnChange(this.activeSessionResourceObs, () => {
            this.setVersionMode("branchChanges" /* ChangesVersionMode.BranchChanges */);
        }));
        // View mode
        const storedMode = this.storageService.get('changesView.viewMode', 1 /* StorageScope.WORKSPACE */);
        const initialMode = storedMode === "tree" /* ChangesViewMode.Tree */ ? "tree" /* ChangesViewMode.Tree */ : "list" /* ChangesViewMode.List */;
        this.viewModeObs = observableValue(this, initialMode);
    }
};
ChangesViewModel = __decorate([
    __param(0, IAgentFeedbackService),
    __param(1, IAgentSessionsService),
    __param(2, ICodeReviewService),
    __param(3, IGitService),
    __param(4, ISessionsManagementService),
    __param(5, IStorageService)
], ChangesViewModel);
// --- View Pane
let ChangesViewPane = class ChangesViewPane extends ViewPane {
    constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, editorService, agentSessionsService, sessionManagementService, labelService, codeReviewService, telemetryService) {
        super({ ...options, titleMenuId: MenuId.ChatEditingSessionTitleToolbar }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
        this.editorService = editorService;
        this.agentSessionsService = agentSessionsService;
        this.sessionManagementService = sessionManagementService;
        this.labelService = labelService;
        this.codeReviewService = codeReviewService;
        this.telemetryService = telemetryService;
        this.renderDisposables = this._register(new DisposableStore());
        // Track current body dimensions for list layout
        this.currentBodyHeight = 0;
        this.currentBodyWidth = 0;
        this.viewModel = this.instantiationService.createInstance(ChangesViewModel);
        this._register(this.viewModel);
        // Context keys
        this.isMergeBaseBranchProtectedContextKey = isMergeBaseBranchProtectedContextKey.bindTo(this.scopedContextKeyService);
        this.isolationModeContextKey = isolationModeContextKey.bindTo(this.scopedContextKeyService);
        this.hasGitRepositoryContextKey = hasGitRepositoryContextKey.bindTo(this.scopedContextKeyService);
        this.hasChangesContextKey = ChatContextKeys.hasAgentSessionChanges.bindTo(this.scopedContextKeyService);
        this.hasIncomingChangesContextKey = hasIncomingChangesContextKey.bindTo(this.scopedContextKeyService);
        this.hasOutgoingChangesContextKey = hasOutgoingChangesContextKey.bindTo(this.scopedContextKeyService);
        this.hasUncommittedChangesContextKey = hasUncommittedChangesContextKey.bindTo(this.scopedContextKeyService);
        this.hasPullRequestContextKey = hasPullRequestContextKey.bindTo(this.scopedContextKeyService);
        this.hasOpenPullRequestContextKey = hasOpenPullRequestContextKey.bindTo(this.scopedContextKeyService);
        // Version mode
        this._register(bindContextKey(changesVersionModeContextKey, this.scopedContextKeyService, reader => {
            return this.viewModel.versionModeObs.read(reader);
        }));
        // View mode
        this._register(bindContextKey(changesViewModeContextKey, this.scopedContextKeyService, reader => {
            return this.viewModel.viewModeObs.read(reader);
        }));
        // Set chatSessionType on the view's context key service so ViewTitle menu items
        // can use it in their `when` clauses. Update reactively when the active session
        // changes.
        this._register(bindContextKey(ChatContextKeys.agentSessionType, this.scopedContextKeyService, reader => {
            const activeSession = this.sessionManagementService.activeSession.read(reader);
            return activeSession?.sessionType ?? '';
        }));
        // Title actions
        this._register(autorun(reader => {
            this.viewModel.activeSessionResourceObs.read(reader);
            this.updateActions();
        }));
    }
    renderBody(container) {
        super.renderBody(container);
        this.bodyContainer = dom.append(container, $('.changes-view-body'));
        // Actions container - positioned outside and above the card
        this.actionsContainer = dom.append(this.bodyContainer, $('.chat-editing-session-actions.outside-card'));
        // SplitView container for resizable file tree / CI checks split
        this.splitViewContainer = dom.append(this.bodyContainer, $('.changes-splitview-container'));
        // Main container with file icons support (the "card") — top pane
        this.contentContainer = dom.append(this.splitViewContainer, $('.chat-editing-session-container.show-file-icons'));
        this._register(createFileIconThemableTreeContainerScope(this.contentContainer, this.themeService));
        // Toggle class based on whether the file icon theme has file icons
        const updateHasFileIcons = () => {
            this.contentContainer.classList.toggle('has-file-icons', this.themeService.getFileIconTheme().hasFileIcons);
        };
        updateHasFileIcons();
        this._register(this.themeService.onDidFileIconThemeChange(updateHasFileIcons));
        // Files header
        this.filesHeaderNode = dom.append(this.contentContainer, $('.changes-files-header'));
        const filesHeaderToolbarContainer = dom.append(this.filesHeaderNode, $('.changes-files-header-toolbar'));
        this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, filesHeaderToolbarContainer, MenuId.ChatEditingSessionChangesFileHeaderToolbar, {
            menuOptions: { shouldForwardArgs: true },
            actionViewItemProvider: (action) => {
                if (action.id === 'chatEditing.versionsPicker' && action instanceof MenuItemAction) {
                    return this.instantiationService.createInstance(ChangesPickerActionItem, action, this.viewModel);
                }
                return undefined;
            },
        }));
        this.filesCountBadge = dom.append(this.filesHeaderNode, $('.changes-files-count'));
        this.filesCountBadge.style.display = 'none';
        // Overview section (header with summary only - actions moved outside card)
        this.overviewContainer = dom.append(this.contentContainer, $('.chat-editing-session-overview'));
        this.summaryContainer = dom.append(this.overviewContainer, $('.changes-summary'));
        // Changes card progress bar
        const progressContainer = dom.append(this.contentContainer, $('.changes-progress'));
        this.changesProgressBar = this._register(new ProgressBar(progressContainer, defaultProgressBarStyles));
        this.changesProgressBar.stop().hide();
        // List container
        this.listContainer = dom.append(this.contentContainer, $('.changes-file-list'));
        // Welcome message for empty state (hidden by default, shown when no changes)
        this.welcomeContainer = dom.append(this.contentContainer, $('.changes-welcome'));
        this.welcomeContainer.style.display = 'none';
        const welcomeIcon = dom.append(this.welcomeContainer, $('.changes-welcome-icon'));
        welcomeIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.diffMultiple));
        const welcomeMessage = dom.append(this.welcomeContainer, $('.changes-welcome-message'));
        welcomeMessage.textContent = localize('changesView.noChanges', "Changed files and other session artifacts will appear here.");
        // CI Status widget — bottom pane
        this.ciStatusWidget = this._register(this.instantiationService.createInstance(CIStatusWidget, this.splitViewContainer));
        // Create SplitView
        this.splitView = this._register(new SplitView(this.splitViewContainer, {
            orientation: 0 /* Orientation.VERTICAL */,
            proportionalLayout: false,
        }));
        // Shared constants for pane sizing
        const ciMinHeight = CIStatusWidget.HEADER_HEIGHT + CIStatusWidget.MIN_BODY_HEIGHT;
        const treeMinHeight = 3 * ChangesTreeDelegate.ROW_HEIGHT;
        // Top pane: file tree
        const treePane = {
            element: this.contentContainer,
            minimumSize: treeMinHeight,
            maximumSize: Number.POSITIVE_INFINITY,
            onDidChange: Event.None,
            layout: (height) => {
                this.contentContainer.style.height = `${height}px`;
                this._layoutTreeInPane(height);
            },
        };
        // Bottom pane: CI checks
        const ciElement = this.ciStatusWidget.element;
        const ciWidget = this.ciStatusWidget;
        const ciPane = {
            element: ciElement,
            get minimumSize() { return ciWidget.collapsed ? CIStatusWidget.HEADER_HEIGHT : ciMinHeight; },
            get maximumSize() { return ciWidget.collapsed ? CIStatusWidget.HEADER_HEIGHT : Number.POSITIVE_INFINITY; },
            onDidChange: Event.map(this.ciStatusWidget.onDidChangeHeight, () => undefined),
            layout: (height) => {
                ciElement.style.height = `${height}px`;
                const bodyHeight = Math.max(0, height - CIStatusWidget.HEADER_HEIGHT);
                ciWidget.layout(bodyHeight);
            },
        };
        this.splitView.addView(treePane, Sizing.Distribute, 0, true);
        this.splitView.addView(ciPane, CIStatusWidget.HEADER_HEIGHT + CIStatusWidget.PREFERRED_BODY_HEIGHT, 1, true);
        // Style the sash as a visible separator between sections
        const updateSplitViewStyles = () => {
            const borderColor = this.themeService.getColorTheme().getColor(PANEL_SECTION_BORDER);
            this.splitView.style({ separatorBorder: borderColor ?? Color.transparent });
        };
        updateSplitViewStyles();
        this._register(this.themeService.onDidColorThemeChange(updateSplitViewStyles));
        // Initially hide CI pane until checks arrive
        this.splitView.setViewVisible(1, false);
        let savedCIPaneHeight = CIStatusWidget.HEADER_HEIGHT + CIStatusWidget.PREFERRED_BODY_HEIGHT;
        this._register(this.ciStatusWidget.onDidToggleCollapsed(collapsed => {
            if (!this.splitView || !this.ciStatusWidget) {
                return;
            }
            if (collapsed) {
                // Save current size before collapsing
                const currentSize = this.splitView.getViewSize(1);
                if (currentSize > CIStatusWidget.HEADER_HEIGHT) {
                    savedCIPaneHeight = currentSize;
                }
                this.splitView.resizeView(1, CIStatusWidget.HEADER_HEIGHT);
            }
            else {
                // Restore saved size on expand
                this.splitView.resizeView(1, savedCIPaneHeight);
            }
            this.layoutSplitView();
        }));
        this._register(this.ciStatusWidget.onDidChangeHeight(() => {
            if (!this.splitView || !this.ciStatusWidget) {
                return;
            }
            const visible = this.ciStatusWidget.visible;
            const isCurrentlyVisible = this.splitView.isViewVisible(1);
            if (visible !== isCurrentlyVisible) {
                this.splitView.setViewVisible(1, visible);
            }
            this.layoutSplitView();
        }));
        this._register(this.onDidChangeBodyVisibility(visible => {
            if (visible) {
                this.onVisible();
            }
            else {
                this.renderDisposables.clear();
            }
        }));
        // Trigger initial render if already visible
        if (this.isBodyVisible()) {
            this.onVisible();
        }
    }
    getActionsContext() {
        return this.viewModel.activeSessionResourceObs.get();
    }
    onVisible() {
        this.renderDisposables.clear();
        // Convert session file changes to list items (cloud/background sessions)
        const sessionFilesObs = derived(reader => {
            const changes = [...this.viewModel.activeSessionChangesObs.read(reader)];
            return changes.map((entry) => {
                const isDeletion = entry.modifiedUri === undefined;
                const isAddition = entry.originalUri === undefined;
                const uri = isIChatSessionFileChange2(entry)
                    ? entry.modifiedUri ?? entry.uri
                    : entry.modifiedUri;
                return {
                    type: 'file',
                    uri,
                    originalUri: entry.originalUri,
                    state: 1 /* ModifiedFileEntryState.Accepted */,
                    isDeletion,
                    changeType: isDeletion ? 'deleted' : isAddition ? 'added' : 'modified',
                    linesAdded: entry.insertions,
                    linesRemoved: entry.deletions
                };
            });
        });
        const isLoadingChangesObs = derived(reader => {
            // If there is a git repository, wait for the repository to be opened first,
            // as there are many context keys that depend on the repository information.
            const hasGitRepository = this.viewModel.activeSessionHasGitRepositoryObs.read(reader);
            if (hasGitRepository && this.viewModel.activeSessionRepositoryObs.read(reader) === undefined) {
                return true;
            }
            const versionMode = this.viewModel.versionModeObs.read(reader);
            if (versionMode === "branchChanges" /* ChangesVersionMode.BranchChanges */) {
                return false;
            }
            if (versionMode === "allChanges" /* ChangesVersionMode.AllChanges */) {
                const allChangesResult = this.viewModel.activeSessionAllChangesObs.read(reader).read(reader);
                return allChangesResult === undefined;
            }
            if (versionMode === "lastTurn" /* ChangesVersionMode.LastTurn */) {
                const lastTurnChangesResult = this.viewModel.activeSessionLastTurnChangesObs.read(reader).read(reader);
                return lastTurnChangesResult === undefined;
            }
            return false;
        });
        this.renderDisposables.add(autorun(reader => {
            const isLoading = isLoadingChangesObs.read(reader);
            if (isLoading) {
                this.changesProgressBar.infinite().show(200);
            }
            else {
                this.changesProgressBar.stop().hide();
            }
        }));
        // Combine both entry sources for display
        const combinedEntriesObs = derived(reader => {
            const versionMode = this.viewModel.versionModeObs.read(reader);
            const hasGitRepository = this.viewModel.activeSessionHasGitRepositoryObs.read(reader);
            if (!hasGitRepository) {
                return [];
            }
            const sourceEntries = [];
            if (versionMode === "branchChanges" /* ChangesVersionMode.BranchChanges */) {
                const sessionFiles = sessionFilesObs.read(reader);
                sourceEntries.push(...sessionFiles);
            }
            else if (versionMode === "allChanges" /* ChangesVersionMode.AllChanges */) {
                const allChanges = this.viewModel.activeSessionAllChangesObs.read(reader).read(reader) ?? [];
                const firstCheckpointRef = this.viewModel.activeSessionFirstCheckpointRefObs.read(undefined);
                const lastCheckpointRef = this.viewModel.activeSessionLastCheckpointRefObs.read(undefined);
                sourceEntries.push(...toChangesFileItem(allChanges, lastCheckpointRef, firstCheckpointRef));
            }
            else if (versionMode === "lastTurn" /* ChangesVersionMode.LastTurn */) {
                const diffChanges = this.viewModel.activeSessionLastTurnChangesObs.read(reader).read(reader) ?? [];
                const lastCheckpointRef = this.viewModel.activeSessionLastCheckpointRefObs.read(undefined);
                sourceEntries.push(...toChangesFileItem(diffChanges, lastCheckpointRef, lastCheckpointRef ? `${lastCheckpointRef}^` : undefined));
            }
            const resources = new Set();
            const entries = [];
            for (const item of sourceEntries) {
                if (!resources.has(item.uri.fsPath)) {
                    resources.add(item.uri.fsPath);
                    entries.push(item);
                }
            }
            return entries.sort((a, b) => extUriBiasedIgnorePathCase.compare(a.uri, b.uri));
        });
        // Calculate stats from combined entries
        const topLevelStats = derived(reader => {
            const entries = combinedEntriesObs.read(reader);
            let added = 0, removed = 0;
            for (const entry of entries) {
                added += entry.linesAdded;
                removed += entry.linesRemoved;
            }
            return { files: entries.length, added, removed };
        });
        // Setup context keys and actions toolbar
        if (this.actionsContainer) {
            dom.clearNode(this.actionsContainer);
            // Bind context keys
            this._bindContextKeys(isLoadingChangesObs, topLevelStats);
            const scopedServiceCollection = new ServiceCollection([IContextKeyService, this.scopedContextKeyService]);
            const scopedInstantiationService = this.instantiationService.createChild(scopedServiceCollection);
            this.renderDisposables.add(scopedInstantiationService);
            const outgoingChangesObs = derived(reader => {
                const repository = this.viewModel.activeSessionRepositoryObs.read(reader);
                const repositoryState = repository?.state.read(reader);
                return repositoryState?.HEAD?.ahead ?? 0;
            });
            this.renderDisposables.add(autorun(reader => {
                const outgoingChanges = outgoingChangesObs.read(reader);
                const sessionResource = this.viewModel.activeSessionResourceObs.read(reader);
                // Read code review state to update the button label dynamically
                let reviewCommentCount;
                let codeReviewLoading = false;
                if (sessionResource) {
                    const prReviewState = this.codeReviewService.getPRReviewState(sessionResource).read(reader);
                    const prReviewCommentCount = prReviewState.kind === "loaded" /* PRReviewStateKind.Loaded */ ? prReviewState.comments.length : 0;
                    const activeSession = this.sessionManagementService.activeSession.read(reader);
                    const sessionChanges = activeSession?.changes.read(reader);
                    if (sessionChanges && sessionChanges.length > 0) {
                        const reviewFiles = getCodeReviewFilesFromSessionChanges(sessionChanges);
                        const reviewVersion = getCodeReviewVersion(reviewFiles);
                        const reviewState = this.codeReviewService.getReviewState(sessionResource).read(reader);
                        if (reviewState.kind === "loading" /* CodeReviewStateKind.Loading */ && reviewState.version === reviewVersion) {
                            codeReviewLoading = true;
                        }
                        else {
                            const codeReviewCommentCount = reviewState.kind === "result" /* CodeReviewStateKind.Result */ && reviewState.version === reviewVersion ? reviewState.comments.length : 0;
                            const totalReviewCommentCount = codeReviewCommentCount + prReviewCommentCount;
                            if (totalReviewCommentCount > 0) {
                                reviewCommentCount = totalReviewCommentCount;
                            }
                        }
                    }
                    else if (prReviewCommentCount > 0) {
                        reviewCommentCount = prReviewCommentCount;
                    }
                }
                reader.store.add(scopedInstantiationService.createInstance(MenuWorkbenchButtonBar, this.actionsContainer, MenuId.ChatEditingSessionChangesToolbar, {
                    telemetrySource: 'changesView',
                    disableWhileRunning: true,
                    menuOptions: sessionResource
                        ? { args: [sessionResource, this.agentSessionsService.getSession(sessionResource)?.metadata] }
                        : { shouldForwardArgs: true },
                    buttonConfigProvider: (action) => {
                        if (action.id === 'github.copilot.sessions.sync' ||
                            action.id === 'github.copilot.chat.createPullRequestCopilotCLIAgentSession.updatePR') {
                            const customLabel = outgoingChanges > 0
                                ? `${action.label} ${outgoingChanges}↑`
                                : action.label;
                            return { customLabel, showIcon: true, showLabel: true, isSecondary: false };
                        }
                        if (action.id === RUN_SESSION_CODE_REVIEW_ACTION_ID) {
                            if (codeReviewLoading) {
                                return { showIcon: true, showLabel: true, isSecondary: true, customLabel: '$(loading~spin)', customClass: 'code-review-loading' };
                            }
                            if (reviewCommentCount !== undefined) {
                                return { showIcon: true, showLabel: true, isSecondary: true, customLabel: String(reviewCommentCount), customClass: 'code-review-comments' };
                            }
                            return { showIcon: true, showLabel: false, isSecondary: true };
                        }
                        if (action.id === 'chatEditing.viewAllSessionChanges' ||
                            action.id === 'github.copilot.chat.openPullRequestCopilotCLIAgentSession.openPR') {
                            return { showIcon: true, showLabel: false, isSecondary: true };
                        }
                        if (action.id === 'agentFeedbackEditor.action.submitActiveSession') {
                            return { showIcon: false, showLabel: true, isSecondary: false };
                        }
                        if (action.id === 'github.copilot.chat.createPullRequestCopilotCLIAgentSession.createPR' ||
                            action.id === 'github.copilot.chat.mergeCopilotCLIAgentSessionChanges.merge' ||
                            action.id === 'github.copilot.chat.checkoutPullRequestReroute' ||
                            action.id === 'pr.checkoutFromChat' ||
                            action.id === 'github.copilot.sessions.initializeRepository' ||
                            action.id === 'github.copilot.sessions.commit' ||
                            action.id === 'agentSession.markAsDone') {
                            return { showIcon: true, showLabel: true, isSecondary: false };
                        }
                        // Unknown actions (e.g. extension-contributed): only hide the label when an icon is present.
                        if (action instanceof MenuItemAction) {
                            const icon = action.item.icon;
                            if (icon) {
                                // Icon-only button (no forced secondary state so primary/secondary can be inferred).
                                return { showIcon: true, showLabel: false };
                            }
                        }
                        // Fall back to default button behavior for actions without an icon.
                        return undefined;
                    }
                }));
            }));
        }
        // Update visibility and file count badge based on entries
        this.renderDisposables.add(autorun(reader => {
            if (isLoadingChangesObs.read(reader)) {
                return;
            }
            const hasGitRepository = this.viewModel.activeSessionHasGitRepositoryObs.read(reader);
            dom.setVisibility(hasGitRepository, this.filesHeaderNode);
            const { files } = topLevelStats.read(reader);
            const hasEntries = files > 0;
            dom.setVisibility(hasEntries, this.listContainer);
            dom.setVisibility(!hasEntries, this.welcomeContainer);
            if (this.filesCountBadge) {
                this.filesCountBadge.textContent = `${files}`;
                this.filesCountBadge.style.display = '';
            }
        }));
        // Update summary text (line counts only, file count is shown in badge)
        if (this.summaryContainer) {
            dom.clearNode(this.summaryContainer);
            const linesAddedSpan = dom.$('.working-set-lines-added');
            const linesRemovedSpan = dom.$('.working-set-lines-removed');
            this.summaryContainer.appendChild(linesAddedSpan);
            this.summaryContainer.appendChild(linesRemovedSpan);
            this.renderDisposables.add(autorun(reader => {
                if (isLoadingChangesObs.read(reader)) {
                    return;
                }
                const { added, removed } = topLevelStats.read(reader);
                linesAddedSpan.textContent = `+${added}`;
                linesRemovedSpan.textContent = `-${removed}`;
            }));
        }
        // Create the tree
        if (!this.tree && this.listContainer) {
            this.tree = this.createChangesTree(this.listContainer, this.onDidChangeBodyVisibility, this._store);
        }
        // Register tree event handlers
        if (this.tree) {
            const tree = this.tree;
            // Re-layout when collapse state changes so the card height adjusts
            this.renderDisposables.add(tree.onDidChangeContentHeight(() => this.layoutSplitView()));
            const openFileItem = (item, items, sideBySide, preserveFocus, pinned, includeSidebar) => {
                const { uri: modifiedFileUri, originalUri, isDeletion } = item;
                const currentIndex = items.indexOf(item);
                const sidebar = includeSidebar ? {
                    render: (container, onDidLayout) => {
                        return this.renderSidebarList(container, onDidLayout, items, openFileItem);
                    }
                } : undefined;
                const navigation = {
                    total: items.length,
                    current: currentIndex,
                    navigate: (index) => {
                        const target = items[index];
                        if (target) {
                            openFileItem(target, items, false, false, false, includeSidebar);
                        }
                    }
                };
                const group = sideBySide ? SIDE_GROUP : ACTIVE_GROUP;
                if (isDeletion && originalUri) {
                    this.editorService.openEditor({
                        resource: originalUri,
                        options: { preserveFocus, pinned, modal: { sidebar, navigation } }
                    }, group);
                    return;
                }
                if (originalUri) {
                    this.editorService.openEditor({
                        original: { resource: originalUri },
                        modified: { resource: modifiedFileUri },
                        options: { preserveFocus, pinned, modal: { sidebar, navigation } }
                    }, group);
                    return;
                }
                this.editorService.openEditor({
                    resource: modifiedFileUri,
                    options: { preserveFocus, pinned, modal: { sidebar, navigation } }
                }, group);
            };
            this.renderDisposables.add(tree.onDidOpen((e) => {
                if (!e.element || !isChangesFileItem(e.element)) {
                    return;
                }
                logChangesViewFileSelect(this.telemetryService, e.element.changeType);
                const items = combinedEntriesObs.get();
                openFileItem(e.element, items, e.sideBySide, !!e.editorOptions?.preserveFocus, !!e.editorOptions?.pinned, items.length > 1);
            }));
        }
        // Checks
        if (this.ciStatusWidget) {
            const checksViewModel = this.instantiationService.createInstance(ChecksViewModel);
            this.renderDisposables.add(checksViewModel);
            this.renderDisposables.add(this.ciStatusWidget.setInput(checksViewModel));
        }
        // Update tree data with combined entries
        this.renderDisposables.add(autorun(reader => {
            const entries = combinedEntriesObs.read(reader);
            const viewMode = this.viewModel.viewModeObs.read(reader);
            const isLoading = isLoadingChangesObs.read(reader);
            if (!this.tree || isLoading) {
                return;
            }
            // Toggle list-mode class to remove tree indentation in list mode
            this.listContainer?.classList.toggle('list-mode', viewMode === "list" /* ChangesViewMode.List */);
            if (viewMode === "tree" /* ChangesViewMode.Tree */) {
                // Tree mode: build hierarchical tree from file entries
                const treeRootInfo = this.getTreeRootInfo(entries);
                const treeChildren = buildTreeChildren(entries, treeRootInfo);
                this.tree.setChildren(null, treeChildren);
            }
            else {
                // List mode: flat list of file items
                const listChildren = entries.map(item => ({
                    element: item,
                    collapsible: false,
                }));
                this.tree.setChildren(null, listChildren);
            }
            this.layoutSplitView();
        }));
    }
    _bindContextKeys(isLoadingChangesObs, topLevelStats) {
        // Request in progress (can be updated independently since it only affects action enablement, and not visibility)
        this.renderDisposables.add(bindContextKey(ChatContextKeys.requestInProgress, this.scopedContextKeyService, reader => {
            const activeSessionStatus = this.sessionManagementService.activeSession.read(reader)?.status.read(reader);
            return activeSessionStatus !== 3 /* SessionStatus.Completed */ && activeSessionStatus !== 4 /* SessionStatus.Error */;
        }));
        // The following context keys have to be updated together based on the combined entries
        // to avoid flickering of actions when switching between sessions and changes are loading
        const contextKeysRawObs = derivedObservableWithCache(this, (reader, lastValue) => {
            const isLoading = isLoadingChangesObs.read(reader);
            if (isLoading) {
                return lastValue;
            }
            const activeSession = this.sessionManagementService.activeSession.read(reader);
            const repository = this.viewModel.activeSessionRepositoryObs.read(reader);
            // Changes state
            const { files } = topLevelStats.read(reader);
            const hasChanges = files > 0;
            // Session state
            const isolationMode = this.viewModel.activeSessionIsolationModeObs.read(reader);
            const hasGitRepository = this.viewModel.activeSessionHasGitRepositoryObs.read(reader);
            const isMergeBaseBranchProtected = activeSession?.workspace.read(reader)?.repositories[0]?.baseBranchProtected === true;
            // Pull request state
            const gitHubInfo = activeSession?.gitHubInfo.read(reader);
            const hasPullRequest = gitHubInfo?.pullRequest?.uri !== undefined;
            const hasOpenPullRequest = hasPullRequest &&
                (gitHubInfo.pullRequest.icon?.id === Codicon.gitPullRequestDraft.id ||
                    gitHubInfo.pullRequest.icon?.id === Codicon.gitPullRequest.id);
            // Repository state
            const repositoryState = repository?.state.read(reader);
            const hasIncomingChanges = (repositoryState?.HEAD?.behind ?? 0) > 0;
            const hasOutgoingChanges = (repositoryState?.HEAD?.ahead ?? 0) > 0;
            const hasUncommittedChanges = (repositoryState?.mergeChanges.length ?? 0) > 0 ||
                (repositoryState?.indexChanges.length ?? 0) > 0 ||
                (repositoryState?.workingTreeChanges.length ?? 0) > 0 ||
                (repositoryState?.untrackedChanges.length ?? 0) > 0;
            return {
                hasChanges,
                isolationMode,
                hasGitRepository,
                isMergeBaseBranchProtected,
                hasPullRequest,
                hasOpenPullRequest,
                hasIncomingChanges,
                hasOutgoingChanges,
                hasUncommittedChanges,
            };
        });
        // Create a derived observable that only emits when the
        // context keys actually change to avoid unnecessary updates
        const contextKeysObs = derivedOpts({
            equalsFn: structuralEquals
        }, reader => {
            const contextKeysRaw = contextKeysRawObs.read(reader);
            return contextKeysRaw;
        });
        // Bulk update the context keys
        this.renderDisposables.add(autorun(reader => {
            const contextKeys = contextKeysObs.read(reader);
            if (!contextKeys) {
                return;
            }
            this.scopedContextKeyService.bufferChangeEvents(() => {
                this.hasChangesContextKey.set(contextKeys.hasChanges);
                this.isMergeBaseBranchProtectedContextKey.set(contextKeys.isMergeBaseBranchProtected);
                this.isolationModeContextKey.set(contextKeys.isolationMode);
                this.hasGitRepositoryContextKey.set(contextKeys.hasGitRepository);
                this.hasPullRequestContextKey.set(contextKeys.hasPullRequest);
                this.hasOpenPullRequestContextKey.set(contextKeys.hasOpenPullRequest);
                this.hasIncomingChangesContextKey.set(contextKeys.hasIncomingChanges);
                this.hasOutgoingChangesContextKey.set(contextKeys.hasOutgoingChanges);
                this.hasUncommittedChangesContextKey.set(contextKeys.hasUncommittedChanges);
            });
        }));
    }
    /** Layout the tree within its SplitView pane. */
    _layoutTreeInPane(paneHeight) {
        if (!this.tree) {
            return;
        }
        // Subtract overview/padding within the content container
        const overviewHeight = this.overviewContainer?.offsetHeight ?? 0;
        const filesHeaderHeight = this.filesHeaderNode?.offsetHeight ?? 0;
        const treeHeight = Math.max(0, paneHeight - filesHeaderHeight - overviewHeight);
        this.tree.layout(treeHeight, this.currentBodyWidth);
        this.tree.getHTMLElement().style.height = `${treeHeight}px`;
    }
    /** Layout the SplitView to fill available body space. */
    layoutSplitView() {
        if (!this.splitView || !this.splitViewContainer) {
            return;
        }
        const bodyHeight = this.currentBodyHeight;
        if (bodyHeight <= 0) {
            return;
        }
        const bodyPadding = 16; // 8px top + 8px bottom from .changes-view-body
        const actionsHeight = this.actionsContainer?.offsetHeight ?? 0;
        const actionsMargin = actionsHeight > 0 ? 8 : 0;
        const availableHeight = Math.max(0, bodyHeight - bodyPadding - actionsHeight - actionsMargin);
        this.splitViewContainer.style.height = `${availableHeight}px`;
        this.splitView.layout(availableHeight);
    }
    getTreeSelection() {
        const selection = this.tree?.getSelection() ?? [];
        return selection.filter(item => !!item && isChangesFileItem(item));
    }
    getTreeRootInfo(items) {
        if (items.length === 0) {
            return undefined;
        }
        // Get the repository details for the session
        // - uri: location of the repository
        // - workingDirectory (optional): location of the worktree
        const activeSession = this.sessionManagementService.activeSession.get();
        const repository = activeSession?.workspace.get()?.repositories[0];
        const workspaceFolderUri = repository?.workingDirectory ?? repository?.uri;
        if (!repository?.uri || !workspaceFolderUri) {
            return undefined;
        }
        const sampleUri = items[0].uri;
        let resourceTreeRootUri = workspaceFolderUri;
        if (sampleUri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
            const parts = sampleUri.path.split('/').filter(Boolean);
            if (parts.length >= 3) {
                resourceTreeRootUri = sampleUri.with({ path: '/' + parts.slice(0, 3).join('/'), query: '', fragment: '' });
            }
        }
        else if (sampleUri.scheme !== workspaceFolderUri.scheme || sampleUri.authority !== workspaceFolderUri.authority) {
            resourceTreeRootUri = sampleUri.with({ path: workspaceFolderUri.path, authority: workspaceFolderUri.authority, query: '', fragment: '' });
        }
        return {
            root: {
                type: 'root',
                uri: workspaceFolderUri,
                name: repository.workingDirectory
                    ? `${basename(repository.uri.fsPath)} (${this.viewModel.activeSessionBranchNameObs.get()})`
                    : basename(repository.uri.fsPath),
            },
            resourceTreeRootUri,
        };
    }
    getSessionDiscardRef() {
        const versionMode = this.viewModel.versionModeObs.get();
        const firstCheckpointRef = this.viewModel.activeSessionFirstCheckpointRefObs.get();
        const lastCheckpointRef = this.viewModel.activeSessionLastCheckpointRefObs.get();
        return versionMode === "lastTurn" /* ChangesVersionMode.LastTurn */
            ? lastCheckpointRef
                ? `${lastCheckpointRef}^`
                : ''
            : firstCheckpointRef ?? '';
    }
    layoutBody(height, width) {
        super.layoutBody(height, width);
        this.currentBodyHeight = height;
        this.currentBodyWidth = width;
        this.layoutSplitView();
    }
    focus() {
        super.focus();
        this.tree?.domFocus();
    }
    renderSidebarList(container, onDidLayout, items, openFileItem) {
        const disposables = new DisposableStore();
        container.classList.add('changes-file-list');
        const viewMode = this.viewModel.viewModeObs.get();
        container.classList.toggle('list-mode', viewMode === "list" /* ChangesViewMode.List */);
        const tree = this.createChangesTree(container, Event.None, disposables, () => tree.getSelection().filter(item => !!item && isChangesFileItem(item)));
        if (viewMode === "tree" /* ChangesViewMode.Tree */) {
            tree.setChildren(null, buildTreeChildren(items, this.getTreeRootInfo(items)));
        }
        else {
            tree.setChildren(null, items.map(item => ({ element: item, collapsible: false })));
        }
        // Open file on selection. The `updatingSelection` guard relies on
        // `tree.setFocus`/`setSelection` firing events synchronously.
        let updatingSelection = false;
        disposables.add(tree.onDidOpen(e => {
            if (e.element && isChangesFileItem(e.element) && !updatingSelection) {
                openFileItem(e.element, items, e.sideBySide, !!e.editorOptions.preserveFocus, !!e.editorOptions.pinned, false /* preserve existing sidebar */);
            }
        }));
        // Track active editor and highlight in sidebar
        disposables.add(Event.runAndSubscribe(this.editorService.onDidActiveEditorChange, () => {
            const activeEditor = this.editorService.activeEditor;
            if (!activeEditor) {
                return;
            }
            const primaryResource = EditorResourceAccessor.getCanonicalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
            const secondaryResource = EditorResourceAccessor.getCanonicalUri(activeEditor, { supportSideBySide: SideBySideEditor.SECONDARY });
            const index = items.findIndex(i => (primaryResource !== undefined && isEqual(i.uri, primaryResource)) ||
                (secondaryResource !== undefined && i.originalUri !== undefined && isEqual(i.originalUri, secondaryResource)));
            if (index >= 0) {
                updatingSelection = true;
                try {
                    tree.setFocus([items[index]]);
                    tree.setSelection([items[index]]);
                    tree.reveal(items[index]);
                }
                finally {
                    updatingSelection = false;
                }
            }
        }));
        // Layout on resize
        disposables.add(onDidLayout(e => tree.layout(e.height, e.width)));
        return disposables;
    }
    createChangesTree(container, onDidChangeVisibility, disposables, getSelection) {
        const resourceLabels = disposables.add(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility }));
        const actionRunner = disposables.add(new ChangesViewActionRunner(() => this.viewModel.activeSessionResourceObs.get(), () => this.getSessionDiscardRef(), getSelection ?? (() => this.getTreeSelection())));
        return disposables.add(this.instantiationService.createInstance((WorkbenchCompressibleObjectTree), 'ChangesViewTree', container, new ChangesTreeDelegate(), [this.instantiationService.createInstance(ChangesTreeRenderer, this.viewModel, resourceLabels, actionRunner, () => {
                // Pass in the tree root to be used to compute the label description
                const activeSession = this.sessionManagementService.activeSession.get();
                const repository = activeSession?.workspace.get()?.repositories[0];
                return repository?.workingDirectory ?? repository?.uri;
            })], {
            alwaysConsumeMouseWheel: false,
            accessibilityProvider: {
                getAriaLabel: (element) => isChangesFileItem(element) ? basename(element.uri.path) : element.name,
                getWidgetAriaLabel: () => localize('changesViewTree', "Changes Tree")
            },
            dnd: {
                getDragURI: (element) => element.uri.toString(),
                getDragLabel: (elements) => {
                    const uris = elements.map(e => e.uri);
                    if (uris.length === 1) {
                        return this.labelService.getUriLabel(uris[0], { relative: true });
                    }
                    return `${uris.length}`;
                },
                dispose: () => { },
                onDragOver: () => false,
                drop: () => { },
                onDragStart: (data, originalEvent) => {
                    try {
                        const elements = data.getData();
                        const uris = elements.filter(isChangesFileItem).map(e => e.uri);
                        this.instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, uris, originalEvent));
                    }
                    catch {
                        // noop
                    }
                },
            },
            identityProvider: {
                getId: (element) => element.uri.toString()
            },
            indent: this.viewModel.viewModeObs.get() === "list" /* ChangesViewMode.List */ ? 0 : 8,
            compressionEnabled: true,
            twistieAdditionalCssClass: (e) => {
                return this.viewModel.viewModeObs.get() === "list" /* ChangesViewMode.List */
                    ? 'force-no-twistie'
                    : undefined;
            },
        }));
    }
    dispose() {
        this.tree = undefined;
        super.dispose();
    }
};
ChangesViewPane = __decorate([
    __param(1, IKeybindingService),
    __param(2, IContextMenuService),
    __param(3, IConfigurationService),
    __param(4, IContextKeyService),
    __param(5, IViewDescriptorService),
    __param(6, IInstantiationService),
    __param(7, IOpenerService),
    __param(8, IThemeService),
    __param(9, IHoverService),
    __param(10, IEditorService),
    __param(11, IAgentSessionsService),
    __param(12, ISessionsManagementService),
    __param(13, ILabelService),
    __param(14, ICodeReviewService),
    __param(15, ITelemetryService)
], ChangesViewPane);
export { ChangesViewPane };
let ChangesViewPaneContainer = class ChangesViewPaneContainer extends ViewPaneContainer {
    constructor(layoutService, telemetryService, instantiationService, contextMenuService, themeService, storageService, configurationService, extensionService, contextService, viewDescriptorService, logService) {
        super(CHANGES_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService, logService);
    }
    create(parent) {
        super.create(parent);
        parent.classList.add('changes-viewlet');
    }
};
ChangesViewPaneContainer = __decorate([
    __param(0, IWorkbenchLayoutService),
    __param(1, ITelemetryService),
    __param(2, IInstantiationService),
    __param(3, IContextMenuService),
    __param(4, IThemeService),
    __param(5, IStorageService),
    __param(6, IConfigurationService),
    __param(7, IExtensionService),
    __param(8, IWorkspaceContextService),
    __param(9, IViewDescriptorService),
    __param(10, ILogService)
], ChangesViewPaneContainer);
export { ChangesViewPaneContainer };
// --- Action Runner
class ChangesViewActionRunner extends ActionRunner {
    constructor(getSessionResource, getSessionDiscardRef, getSelectedFileItems) {
        super();
        this.getSessionResource = getSessionResource;
        this.getSessionDiscardRef = getSessionDiscardRef;
        this.getSelectedFileItems = getSelectedFileItems;
    }
    async runAction(action, context) {
        if (!(action instanceof MenuItemAction)) {
            return super.runAction(action, context);
        }
        const sessionResource = this.getSessionResource();
        const discardRef = this.getSessionDiscardRef();
        const selection = this.getSelectedFileItems();
        const contextIsSelected = selection.some(s => s === context);
        const actualContext = contextIsSelected ? selection : [context];
        const args = actualContext.map(e => {
            if (ResourceTree.isResourceNode(e)) {
                return ResourceTree.collect(e);
            }
            return isChangesFileItem(e) ? [e] : [];
        }).flat();
        await action.run(sessionResource, discardRef, ...args.map(item => item.uri));
    }
}
// --- Tree Delegate & Renderer
class ChangesTreeDelegate {
    static { this.ROW_HEIGHT = 22; }
    getHeight(_element) {
        return ChangesTreeDelegate.ROW_HEIGHT;
    }
    getTemplateId(_element) {
        return ChangesTreeRenderer.TEMPLATE_ID;
    }
}
let ChangesTreeRenderer = class ChangesTreeRenderer {
    static { ChangesTreeRenderer_1 = this; }
    static { this.TEMPLATE_ID = 'changesTreeRenderer'; }
    constructor(viewModel, labels, actionRunner, getRootUri, instantiationService, contextKeyService, labelService, sessionManagementService) {
        this.viewModel = viewModel;
        this.labels = labels;
        this.actionRunner = actionRunner;
        this.getRootUri = getRootUri;
        this.instantiationService = instantiationService;
        this.contextKeyService = contextKeyService;
        this.labelService = labelService;
        this.sessionManagementService = sessionManagementService;
        this.templateId = ChangesTreeRenderer_1.TEMPLATE_ID;
    }
    renderTemplate(container) {
        const templateDisposables = new DisposableStore();
        const label = templateDisposables.add(this.labels.create(container, { supportHighlights: true, supportIcons: true }));
        const reviewCommentsBadge = dom.$('.changes-review-comments-badge');
        label.element.appendChild(reviewCommentsBadge);
        const agentFeedbackBadge = dom.$('.changes-agent-feedback-badge');
        label.element.appendChild(agentFeedbackBadge);
        const lineCountsContainer = $('.working-set-line-counts');
        const addedSpan = dom.$('.working-set-lines-added');
        const removedSpan = dom.$('.working-set-lines-removed');
        lineCountsContainer.appendChild(addedSpan);
        lineCountsContainer.appendChild(removedSpan);
        label.element.appendChild(lineCountsContainer);
        const actionBarContainer = $('.chat-collapsible-list-action-bar');
        const contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(actionBarContainer));
        const scopedInstantiationService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
        const toolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, MenuId.ChatEditingSessionChangeToolbar, { menuOptions: { shouldForwardArgs: true, arg: undefined }, actionRunner: this.actionRunner }));
        label.element.appendChild(actionBarContainer);
        templateDisposables.add(bindContextKey(ChatContextKeys.agentSessionType, contextKeyService, reader => {
            const activeSession = this.sessionManagementService.activeSession.read(reader);
            return activeSession?.sessionType ?? '';
        }));
        templateDisposables.add(bindContextKey(hasGitRepositoryContextKey, contextKeyService, reader => {
            return this.viewModel.activeSessionHasGitRepositoryObs.read(reader);
        }));
        templateDisposables.add(bindContextKey(changesVersionModeContextKey, contextKeyService, reader => {
            return this.viewModel.versionModeObs.read(reader);
        }));
        const decorationBadge = dom.$('.changes-decoration-badge');
        label.element.appendChild(decorationBadge);
        return { label, toolbar, contextKeyService, reviewCommentsBadge, agentFeedbackBadge, decorationBadge, addedSpan, removedSpan, lineCountsContainer, elementDisposables: new DisposableStore(), templateDisposables };
    }
    renderElement(node, _index, templateData) {
        const element = node.element;
        templateData.label.element.style.display = 'flex';
        if (isChangesRootItem(element)) {
            // Root element
            this.renderRootElement(element, templateData);
        }
        else if (ResourceTree.isResourceNode(element)) {
            // Folder element
            this.renderFolderElement(element, templateData);
        }
        else {
            // File element
            this.renderFileElement(element, templateData);
        }
    }
    renderCompressedElements(node, _index, templateData) {
        const compressed = node.element;
        const folder = compressed.elements[compressed.elements.length - 1];
        templateData.label.element.style.display = 'flex';
        const label = compressed.elements.map(e => e.name);
        templateData.label.setResource({ resource: folder.uri, name: label }, {
            fileKind: FileKind.FOLDER,
            separator: this.labelService.getSeparator(folder.uri.scheme),
        });
        // Hide file-specific decorations for folders
        templateData.reviewCommentsBadge.style.display = 'none';
        templateData.agentFeedbackBadge.style.display = 'none';
        templateData.decorationBadge.style.display = 'none';
        templateData.lineCountsContainer.style.display = 'none';
        if (templateData.toolbar) {
            templateData.toolbar.context = folder;
        }
        if (templateData.contextKeyService) {
            chatEditingWidgetFileStateContextKey.bindTo(templateData.contextKeyService).set(undefined);
        }
    }
    renderFileElement(data, templateData) {
        const root = this.getRootUri();
        const viewMode = this.viewModel.viewModeObs.get();
        templateData.label.setResource({
            resource: data.uri,
            name: basename(data.uri.path),
            description: viewMode === "list" /* ChangesViewMode.List */
                ? root
                    ? relativePath(root, dirname(data.uri))
                    : undefined
                : undefined,
        }, {
            fileKind: FileKind.FILE,
            fileDecorations: undefined,
            strikethrough: data.changeType === 'deleted'
        });
        const showChangeDecorations = data.changeType !== 'none';
        // Show file-specific decorations for changed files only
        templateData.lineCountsContainer.style.display = showChangeDecorations ? '' : 'none';
        templateData.decorationBadge.style.display = showChangeDecorations ? '' : 'none';
        // Review comments
        templateData.elementDisposables.add(autorun(reader => {
            const reviewCommentByFile = this.viewModel.activeSessionReviewCommentCountByFileObs.read(reader);
            const reviewCommentCount = reviewCommentByFile?.get(data.uri.fsPath) ?? 0;
            if (reviewCommentCount > 0) {
                templateData.reviewCommentsBadge.style.display = '';
                templateData.reviewCommentsBadge.className = 'changes-review-comments-badge';
                templateData.reviewCommentsBadge.replaceChildren(dom.$('.codicon.codicon-comment-unresolved'), dom.$('span', undefined, `${reviewCommentCount}`));
            }
            else {
                templateData.reviewCommentsBadge.style.display = 'none';
                templateData.reviewCommentsBadge.replaceChildren();
            }
        }));
        // Agent feedback
        templateData.elementDisposables.add(autorun(reader => {
            const agentFeedbackByFile = this.viewModel.activeSessionAgentFeedbackCountByFileObs.read(reader);
            const agentFeedbackCount = agentFeedbackByFile?.get(data.uri.fsPath) ?? 0;
            if (agentFeedbackCount > 0) {
                templateData.agentFeedbackBadge.style.display = '';
                templateData.agentFeedbackBadge.className = 'changes-agent-feedback-badge';
                templateData.agentFeedbackBadge.replaceChildren(dom.$('.codicon.codicon-comment'), dom.$('span', undefined, `${agentFeedbackCount}`));
            }
            else {
                templateData.agentFeedbackBadge.style.display = 'none';
                templateData.agentFeedbackBadge.replaceChildren();
            }
        }));
        const badge = templateData.decorationBadge;
        badge.className = 'changes-decoration-badge';
        if (showChangeDecorations) {
            // Update decoration badge (A/M/D)
            switch (data.changeType) {
                case 'added':
                    badge.textContent = 'A';
                    badge.classList.add('added');
                    break;
                case 'deleted':
                    badge.textContent = 'D';
                    badge.classList.add('deleted');
                    break;
                case 'modified':
                default:
                    badge.textContent = 'M';
                    badge.classList.add('modified');
                    break;
            }
            templateData.addedSpan.textContent = `+${data.linesAdded}`;
            templateData.removedSpan.textContent = `-${data.linesRemoved}`;
            // eslint-disable-next-line no-restricted-syntax
            templateData.label.element.querySelector('.monaco-icon-name-container')?.classList.add('modified');
        }
        else {
            badge.textContent = '';
            // eslint-disable-next-line no-restricted-syntax
            templateData.label.element.querySelector('.monaco-icon-name-container')?.classList.remove('modified');
        }
        if (templateData.toolbar) {
            templateData.toolbar.context = data;
        }
        if (templateData.contextKeyService) {
            chatEditingWidgetFileStateContextKey.bindTo(templateData.contextKeyService).set(data.state);
        }
    }
    renderRootElement(data, templateData) {
        templateData.label.setResource({
            resource: data.uri,
            name: data.name,
        }, {
            fileKind: FileKind.ROOT_FOLDER,
            separator: this.labelService.getSeparator(data.uri.scheme, data.uri.authority),
        });
        templateData.reviewCommentsBadge.style.display = 'none';
        templateData.agentFeedbackBadge.style.display = 'none';
        templateData.decorationBadge.style.display = 'none';
        templateData.lineCountsContainer.style.display = 'none';
        if (templateData.toolbar) {
            templateData.toolbar.context = data.uri;
        }
        if (templateData.contextKeyService) {
            chatEditingWidgetFileStateContextKey.bindTo(templateData.contextKeyService).set(undefined);
        }
    }
    renderFolderElement(node, templateData) {
        templateData.label.setFile(node.uri, {
            fileKind: FileKind.FOLDER,
            hidePath: true,
        });
        // Hide file-specific decorations for folders
        templateData.reviewCommentsBadge.style.display = 'none';
        templateData.agentFeedbackBadge.style.display = 'none';
        templateData.decorationBadge.style.display = 'none';
        templateData.lineCountsContainer.style.display = 'none';
        if (templateData.toolbar) {
            templateData.toolbar.context = node;
        }
        if (templateData.contextKeyService) {
            chatEditingWidgetFileStateContextKey.bindTo(templateData.contextKeyService).set(undefined);
        }
    }
    disposeElement(_element, _index, templateData) {
        templateData.elementDisposables.clear();
    }
    disposeCompressedElements(_element, _index, templateData) {
        templateData.elementDisposables.clear();
    }
    disposeTemplate(templateData) {
        templateData.elementDisposables.dispose();
        templateData.templateDisposables.dispose();
    }
};
ChangesTreeRenderer = ChangesTreeRenderer_1 = __decorate([
    __param(4, IInstantiationService),
    __param(5, IContextKeyService),
    __param(6, ILabelService),
    __param(7, ISessionsManagementService)
], ChangesTreeRenderer);
// --- View Mode Actions
class SetChangesListViewModeAction extends ViewAction {
    constructor() {
        super({
            id: 'workbench.changesView.action.setListViewMode',
            title: localize('setListViewMode', "View as List"),
            viewId: CHANGES_VIEW_ID,
            f1: false,
            icon: Codicon.listTree,
            toggled: changesViewModeContextKey.isEqualTo("list" /* ChangesViewMode.List */),
            menu: {
                id: MenuId.ChatEditingSessionTitleToolbar,
                group: '1_viewmode',
                order: 1
            }
        });
    }
    async runInView(accessor, view) {
        logChangesViewViewModeChange(accessor.get(ITelemetryService), "list" /* ChangesViewMode.List */);
        view.viewModel.setViewMode("list" /* ChangesViewMode.List */);
    }
}
class SetChangesTreeViewModeAction extends ViewAction {
    constructor() {
        super({
            id: 'workbench.changesView.action.setTreeViewMode',
            title: localize('setTreeViewMode', "View as Tree"),
            viewId: CHANGES_VIEW_ID,
            f1: false,
            icon: Codicon.listFlat,
            toggled: changesViewModeContextKey.isEqualTo("tree" /* ChangesViewMode.Tree */),
            menu: {
                id: MenuId.ChatEditingSessionTitleToolbar,
                group: '1_viewmode',
                order: 2
            }
        });
    }
    async runInView(accessor, view) {
        logChangesViewViewModeChange(accessor.get(ITelemetryService), "tree" /* ChangesViewMode.Tree */);
        view.viewModel.setViewMode("tree" /* ChangesViewMode.Tree */);
    }
}
registerAction2(SetChangesListViewModeAction);
registerAction2(SetChangesTreeViewModeAction);
// --- Versions Picker Action
class VersionsPickerAction extends Action2 {
    static { this.ID = 'chatEditing.versionsPicker'; }
    constructor() {
        super({
            id: VersionsPickerAction.ID,
            title: localize2('chatEditing.versionsPicker', 'Versions'),
            category: CHAT_CATEGORY,
            icon: Codicon.listFilter,
            f1: false,
            menu: [{
                    id: MenuId.ChatEditingSessionChangesFileHeaderToolbar,
                    group: 'navigation',
                    order: 9,
                }],
        });
    }
    async run() { }
}
registerAction2(VersionsPickerAction);
let ChangesPickerActionItem = class ChangesPickerActionItem extends ActionWidgetDropdownActionViewItem {
    constructor(action, viewModel, actionWidgetService, keybindingService, contextKeyService, sessionManagementService, telemetryService) {
        const actionProvider = {
            getActions: () => {
                const branchName = viewModel.activeSessionBranchNameObs.get();
                const baseBranchName = viewModel.activeSessionBaseBranchNameObs.get();
                return [
                    {
                        ...action,
                        id: 'chatEditing.versionsBranchChanges',
                        label: localize('chatEditing.versionsBranchChanges', 'Branch Changes'),
                        description: branchName && baseBranchName
                            ? `${branchName} → ${baseBranchName}`
                            : branchName,
                        checked: viewModel.versionModeObs.get() === "branchChanges" /* ChangesVersionMode.BranchChanges */,
                        category: { label: 'changes', order: 1, showHeader: false },
                        run: async () => {
                            viewModel.setVersionMode("branchChanges" /* ChangesVersionMode.BranchChanges */);
                            logChangesViewVersionModeChange(this.telemetryService, "branchChanges" /* ChangesVersionMode.BranchChanges */);
                            if (this.element) {
                                this.renderLabel(this.element);
                            }
                        },
                    },
                    {
                        ...action,
                        id: 'chatEditing.versionsAllChanges',
                        label: localize('chatEditing.versionsAllChanges', 'All Changes'),
                        description: localize('chatEditing.versionsAllChanges.description', 'Show all changes made in this session'),
                        checked: viewModel.versionModeObs.get() === "allChanges" /* ChangesVersionMode.AllChanges */,
                        category: { label: 'checkpoints', order: 2, showHeader: false },
                        enabled: viewModel.activeSessionFirstCheckpointRefObs.get() !== undefined &&
                            viewModel.activeSessionLastCheckpointRefObs.get() !== undefined,
                        run: async () => {
                            viewModel.setVersionMode("allChanges" /* ChangesVersionMode.AllChanges */);
                            logChangesViewVersionModeChange(this.telemetryService, "allChanges" /* ChangesVersionMode.AllChanges */);
                            if (this.element) {
                                this.renderLabel(this.element);
                            }
                        },
                    },
                    {
                        ...action,
                        id: 'chatEditing.versionsLastTurnChanges',
                        label: localize('chatEditing.versionsLastTurnChanges', "Last Turn's Changes"),
                        description: localize('chatEditing.versionsLastTurnChanges.description', 'Show only changes from the last turn'),
                        checked: viewModel.versionModeObs.get() === "lastTurn" /* ChangesVersionMode.LastTurn */,
                        category: { label: 'checkpoints', order: 3, showHeader: false },
                        enabled: viewModel.activeSessionFirstCheckpointRefObs.get() !== undefined &&
                            viewModel.activeSessionLastCheckpointRefObs.get() !== undefined,
                        run: async () => {
                            viewModel.setVersionMode("lastTurn" /* ChangesVersionMode.LastTurn */);
                            logChangesViewVersionModeChange(this.telemetryService, "lastTurn" /* ChangesVersionMode.LastTurn */);
                            if (this.element) {
                                this.renderLabel(this.element);
                            }
                        },
                    },
                ];
            },
        };
        super(action, { actionProvider, listOptions: { descriptionBelow: true } }, actionWidgetService, keybindingService, contextKeyService, telemetryService);
        this.viewModel = viewModel;
        this.telemetryService = telemetryService;
        this._register(autorun(reader => {
            viewModel.versionModeObs.read(reader);
            if (this.element) {
                this.renderLabel(this.element);
            }
        }));
    }
    renderLabel(element) {
        const mode = this.viewModel.versionModeObs.get();
        const label = mode === "branchChanges" /* ChangesVersionMode.BranchChanges */
            ? localize('sessionsChanges.versionsBranchChanges', "Branch Changes")
            : mode === "allChanges" /* ChangesVersionMode.AllChanges */
                ? localize('sessionsChanges.versionsAllChanges', "All Changes")
                : localize('sessionsChanges.versionsLastTurn', "Last Turn's Changes");
        dom.reset(element, dom.$('span', undefined, label), ...renderLabelWithIcons('$(chevron-down)'));
        this.updateAriaLabel();
        return null;
    }
};
ChangesPickerActionItem = __decorate([
    __param(2, IActionWidgetService),
    __param(3, IKeybindingService),
    __param(4, IContextKeyService),
    __param(5, ISessionsManagementService),
    __param(6, ITelemetryService)
], ChangesPickerActionItem);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhbmdlc1ZpZXcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2NoYW5nZXMvYnJvd3Nlci9jaGFuZ2VzVmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyx5QkFBeUIsQ0FBQztBQUNqQyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBSzNGLE9BQU8sRUFBRSxZQUFZLEVBQVcsTUFBTSxvQ0FBb0MsQ0FBQztBQUMzRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFlLE1BQU0sc0NBQXNDLENBQUM7QUFDaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxXQUFXLEVBQTJELGlCQUFpQixFQUFFLHlCQUF5QixFQUFFLGVBQWUsRUFBRSxXQUFXLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN4USxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDM0QsT0FBTyxFQUFpQixZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDckYsT0FBTyxFQUFFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEgsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFN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