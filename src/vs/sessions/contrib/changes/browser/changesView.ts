/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/changesView.css';
import * as dom from '../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { ICompressedTreeNode } from '../../../../base/browser/ui/tree/compressedObjectTreeModel.js';
import { ICompressibleTreeRenderer } from '../../../../base/browser/ui/tree/objectTree.js';
import { IObjectTreeElement, ITreeNode } from '../../../../base/browser/ui/tree/tree.js';
import { ActionRunner, IAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { autorun, constObservable, derived, derivedOpts, IObservable, IObservableWithChange, ISettableObservable, ObservablePromise, observableSignalFromEvent, observableValue, runOnChange } from '../../../../base/common/observable.js';
import { basename, dirname } from '../../../../base/common/path.js';
import { ProgressBar } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { extUriBiasedIgnorePathCase, isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { MenuWorkbenchButtonBar } from '../../../../platform/actions/browser/buttonbar.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { MenuId, Action2, MenuItemAction, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownActionProvider } from '../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchCompressibleObjectTree } from '../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { defaultProgressBarStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { fillEditorsDragData } from '../../../../workbench/browser/dnd.js';
import { IResourceLabel, ResourceLabels } from '../../../../workbench/browser/labels.js';
import { ViewPane, IViewPaneOptions, ViewAction } from '../../../../workbench/browser/parts/views/viewPane.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatSessionFileChange, IChatSessionFileChange2, isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { chatEditingWidgetFileStateContextKey, ModifiedFileEntryState } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { createFileIconThemableTreeContainerScope } from '../../../../workbench/contrib/files/browser/views/explorerView.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../../workbench/services/editor/common/editorService.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { CodeReviewStateKind, getCodeReviewFilesFromSessionChanges, getCodeReviewVersion, ICodeReviewService, PRReviewStateKind } from '../../codeReview/browser/codeReviewService.js';
import { IAgentFeedbackService } from '../../agentFeedback/browser/agentFeedbackService.js';
import { GitDiffChange, IGitRepository, IGitService } from '../../../../workbench/contrib/git/common/gitService.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { CIStatusWidget } from './ciStatusWidget.js';
import { arrayEqualsC } from '../../../../base/common/equals.js';
import { GITHUB_REMOTE_FILE_SCHEME, SessionStatus } from '../../sessions/common/sessionData.js';
import { Orientation } from '../../../../base/browser/ui/sash/sash.js';
import { IView, Sizing, SplitView } from '../../../../base/browser/ui/splitview/splitview.js';
import { Color } from '../../../../base/common/color.js';
import { PANEL_SECTION_BORDER } from '../../../../workbench/common/theme.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../workbench/common/editor.js';

const $ = dom.$;

// --- Constants

export const CHANGES_VIEW_CONTAINER_ID = 'workbench.view.agentSessions.changesContainer';
export const CHANGES_VIEW_ID = 'workbench.view.agentSessions.changes';
const RUN_SESSION_CODE_REVIEW_ACTION_ID = 'sessions.codeReview.run';

// --- View Mode

export const enum ChangesViewMode {
	List = 'list',
	Tree = 'tree'
}

const changesViewModeContextKey = new RawContextKey<ChangesViewMode>('changesViewMode', ChangesViewMode.List);

// --- Versions Mode

const enum ChangesVersionMode {
	BranchChanges = 'branchChanges',
	OutgoingChanges = 'outgoingChanges',
	AllChanges = 'allChanges',
	LastTurn = 'lastTurn'
}

const enum IsolationMode {
	Workspace = 'workspace',
	Worktree = 'worktree'
}

const changesVersionModeContextKey = new RawContextKey<ChangesVersionMode>('sessions.changesVersionMode', ChangesVersionMode.BranchChanges);
const isMergeBaseBranchProtectedContextKey = new RawContextKey<boolean>('sessions.isMergeBaseBranchProtected', false);
const isolationModeContextKey = new RawContextKey<IsolationMode>('sessions.isolationMode', IsolationMode.Workspace);
const hasGitRepositoryContextKey = new RawContextKey<boolean>('sessions.hasGitRepository', true);
const hasPullRequestContextKey = new RawContextKey<boolean>('sessions.hasPullRequest', false);
const hasOpenPullRequestContextKey = new RawContextKey<boolean>('sessions.hasOpenPullRequest', false);
const hasIncomingChangesContextKey = new RawContextKey<boolean>('sessions.hasIncomingChanges', false);
const hasOutgoingChangesContextKey = new RawContextKey<boolean>('sessions.hasOutgoingChanges', false);

// --- List Item

type ChangeType = 'added' | 'modified' | 'deleted';

interface IChangesFileItem {
	readonly type: 'file';
	readonly uri: URI;
	readonly originalUri?: URI;
	readonly state: ModifiedFileEntryState;
	readonly isDeletion: boolean;
	readonly changeType: ChangeType;
	readonly linesAdded: number;
	readonly linesRemoved: number;
	readonly reviewCommentCount: number;
	readonly agentFeedbackCount: number;
}

interface IChangesFolderItem {
	readonly type: 'folder';
	readonly uri: URI;
	readonly name: string;
}

type ChangesTreeElement = IChangesFileItem | IChangesFolderItem;

function isChangesFileItem(element: ChangesTreeElement): element is IChangesFileItem {
	return element.type === 'file';
}

/**
 * Builds a tree of `IObjectTreeElement<ChangesTreeElement>` from a flat list of file items.
 * Groups files by their directory path segments to create a hierarchical tree structure.
 */
function buildTreeChildren(items: IChangesFileItem[]): IObjectTreeElement<ChangesTreeElement>[] {
	if (items.length === 0) {
		return [];
	}

	interface FolderNode {
		name: string;
		uri: URI;
		children: Map<string, FolderNode>;
		files: IChangesFileItem[];
	}

	const root: FolderNode = { name: '', uri: URI.file('/'), children: new Map(), files: [] };

	for (const item of items) {
		const fullDirPath = dirname(item.uri.path);

		// For github-remote-file URIs, strip the /{owner}/{repo}/{ref} prefix
		// so the tree shows repo-relative paths instead of internal URI segments.
		let displayDirPath = fullDirPath;
		let uriBasePrefix = '';
		if (item.uri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
			const parts = fullDirPath.split('/').filter(Boolean);
			if (parts.length >= 3) {
				uriBasePrefix = '/' + parts.slice(0, 3).join('/');
				displayDirPath = '/' + parts.slice(3).join('/');
			} else {
				uriBasePrefix = '/' + parts.join('/');
				displayDirPath = '/';
			}
		}

		const segments = displayDirPath.split('/').filter(Boolean);

		let current = root;
		let currentFullPath = uriBasePrefix;
		for (const segment of segments) {
			currentFullPath += '/' + segment;
			if (!current.children.has(segment)) {
				current.children.set(segment, {
					name: segment,
					uri: item.uri.with({ path: currentFullPath }),
					children: new Map(),
					files: []
				});
			}
			current = current.children.get(segment)!;
		}
		current.files.push(item);
	}

	function convert(node: FolderNode): IObjectTreeElement<ChangesTreeElement>[] {
		const result: IObjectTreeElement<ChangesTreeElement>[] = [];

		for (const [, child] of node.children) {
			const folderElement: IChangesFolderItem = { type: 'folder', uri: child.uri, name: child.name };
			const folderChildren = convert(child);
			result.push({
				element: folderElement,
				children: folderChildren,
				collapsible: true,
				collapsed: false,
			});
		}

		for (const file of node.files) {
			result.push({
				element: file,
				collapsible: false,
			});
		}

		return result;
	}

	return convert(root);
}

function toChangesFileItem(changes: GitDiffChange[], modifiedRef: string | undefined, originalRef: string | undefined): IChangesFileItem[] {
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
			state: ModifiedFileEntryState.Accepted,
			isDeletion,
			changeType: isDeletion ? 'deleted' : isAddition ? 'added' : 'modified',
			linesAdded: change.insertions,
			linesRemoved: change.deletions,
			reviewCommentCount: 0,
			agentFeedbackCount: 0,
		} satisfies IChangesFileItem;
	});
}

// --- View Model

class ChangesViewModel extends Disposable {
	readonly sessionsChangedSignal: IObservable<void>;
	readonly activeSessionResourceObs: IObservable<URI | undefined>;
	readonly activeSessionBranchNameObs: IObservable<string | undefined>;
	readonly activeSessionBaseBranchNameObs: IObservable<string | undefined>;
	readonly activeSessionUpstreamBranchNameObs: IObservable<string | undefined>;
	readonly activeSessionIsolationModeObs: IObservable<IsolationMode>;
	readonly activeSessionRepositoryObs: IObservableWithChange<IGitRepository | undefined>;
	readonly activeSessionChangesObs: IObservable<readonly (IChatSessionFileChange | IChatSessionFileChange2)[]>;
	readonly activeSessionHasGitRepositoryObs: IObservable<boolean>;
	readonly activeSessionFirstCheckpointRefObs: IObservable<string | undefined>;
	readonly activeSessionLastCheckpointRefObs: IObservable<string | undefined>;

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
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IGitService private readonly gitService: IGitService,
		@ISessionsManagementService private readonly sessionManagementService: ISessionsManagementService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		// Active session changes
		this.sessionsChangedSignal = observableSignalFromEvent(this,
			this.sessionManagementService.onDidChangeSessions);

		// Active session resource
		this.activeSessionResourceObs = derivedOpts({ equalsFn: isEqual }, reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			return activeSession?.resource;
		});

		// Active session changes
		this.activeSessionChangesObs = derivedOpts({
			equalsFn: arrayEqualsC<IChatSessionFileChange | IChatSessionFileChange2>()
		}, reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			if (!activeSession) {
				return Iterable.empty();
			}
			return activeSession.changes.read(reader) as readonly (IChatSessionFileChange | IChatSessionFileChange2)[];
		});

		const activeSessionRepositoryObs = derived(reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			return activeSession?.workspace.read(reader)?.repositories[0];
		});

		// Active session isolation mode
		this.activeSessionIsolationModeObs = derived(reader => {
			const activeSessionRepository = activeSessionRepositoryObs.read(reader);
			return activeSessionRepository?.workingDirectory === undefined
				? IsolationMode.Workspace
				: IsolationMode.Worktree;
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

		this.activeSessionRepositoryObs = derived<IGitRepository | undefined>(reader => {
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
			return activeSessionRepositoryObs.read(reader)?.baseBranchName;
		});

		// Active session upstream branch name
		this.activeSessionUpstreamBranchNameObs = derived(reader => {
			const repositoryState = this.activeSessionRepositoryObs.read(reader)?.state.read(reader);
			return repositoryState?.HEAD?.upstream
				? `${repositoryState.HEAD.upstream.remote}/${repositoryState.HEAD.upstream.name}`
				: undefined;
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

			return model?.metadata?.firstCheckpointRef as string | undefined;
		});

		// Active session last checkpoint ref
		this.activeSessionLastCheckpointRefObs = derived(reader => {
			const sessionResource = this.activeSessionResourceObs.read(reader);
			if (!sessionResource) {
				return undefined;
			}

			this.sessionsChangedSignal.read(reader);
			const model = this.agentSessionsService.getSession(sessionResource);
			return model?.metadata?.lastCheckpointRef as string | undefined;
		});

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
}

// --- View Pane

export class ChangesViewPane extends ViewPane {

	private bodyContainer: HTMLElement | undefined;
	private welcomeContainer: HTMLElement | undefined;
	private filesHeaderNode: HTMLElement | undefined;
	private filesCountBadge: HTMLElement | undefined;
	private contentContainer: HTMLElement | undefined;
	private overviewContainer: HTMLElement | undefined;
	private summaryContainer: HTMLElement | undefined;
	private listContainer: HTMLElement | undefined;
	// Actions container is positioned outside the card for this layout experiment
	private actionsContainer: HTMLElement | undefined;

	private changesProgressBar!: ProgressBar;
	private tree: WorkbenchCompressibleObjectTree<ChangesTreeElement> | undefined;
	private ciStatusWidget: CIStatusWidget | undefined;
	private splitView: SplitView | undefined;
	private splitViewContainer: HTMLElement | undefined;

	private readonly renderDisposables = this._register(new DisposableStore());

	// Track current body dimensions for list layout
	private currentBodyHeight = 0;
	private currentBodyWidth = 0;

	readonly viewModel: ChangesViewModel;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IEditorService private readonly editorService: IEditorService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@ISessionsManagementService private readonly sessionManagementService: ISessionsManagementService,
		@ILabelService private readonly labelService: ILabelService,
		@ICodeReviewService private readonly codeReviewService: ICodeReviewService,
		@IGitHubService private readonly gitHubService: IGitHubService,
		@IAgentFeedbackService private readonly agentFeedbackService: IAgentFeedbackService,
	) {
		super({ ...options, titleMenuId: MenuId.ChatEditingSessionTitleToolbar }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this.viewModel = this.instantiationService.createInstance(ChangesViewModel);
		this._register(this.viewModel);

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

	protected override renderBody(container: HTMLElement): void {
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
			this.contentContainer!.classList.toggle('has-file-icons', this.themeService.getFileIconTheme().hasFileIcons);
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

		// Overview section (header with summary only - actions moved outside card)
		this.overviewContainer = dom.append(this.contentContainer, $('.chat-editing-session-overview'));
		this.summaryContainer = dom.append(this.overviewContainer, $('.changes-summary'));

		// Changes card progress bar
		const progressContainer = dom.append(this.contentContainer, $('.changes-progress'));
		this.changesProgressBar = this._register(new ProgressBar(progressContainer, defaultProgressBarStyles));
		this.changesProgressBar.stop().hide();

		// List container
		this.listContainer = dom.append(this.contentContainer, $('.changes-file-list'));

		// Welcome message for empty state
		this.welcomeContainer = dom.append(this.contentContainer, $('.changes-welcome'));
		const welcomeIcon = dom.append(this.welcomeContainer, $('.changes-welcome-icon'));
		welcomeIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.diffMultiple));
		const welcomeMessage = dom.append(this.welcomeContainer, $('.changes-welcome-message'));
		welcomeMessage.textContent = localize('changesView.noChanges', "Changed files and other session artifacts will appear here.");

		// CI Status widget — bottom pane
		this.ciStatusWidget = this._register(this.instantiationService.createInstance(CIStatusWidget, this.splitViewContainer));

		// Create SplitView
		this.splitView = this._register(new SplitView(this.splitViewContainer, {
			orientation: Orientation.VERTICAL,
			proportionalLayout: false,
		}));

		// Shared constants for pane sizing
		const ciMinHeight = CIStatusWidget.HEADER_HEIGHT + CIStatusWidget.MIN_BODY_HEIGHT;
		const treeMinHeight = 3 * ChangesTreeDelegate.ROW_HEIGHT;

		// Top pane: file tree
		const treePane: IView = {
			element: this.contentContainer,
			minimumSize: treeMinHeight,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: Event.None,
			layout: (height) => {
				this.contentContainer!.style.height = `${height}px`;
				this._layoutTreeInPane(height);
			},
		};

		// Bottom pane: CI checks
		const ciElement = this.ciStatusWidget.element;
		const ciWidget = this.ciStatusWidget;
		const ciPane: IView = {
			element: ciElement,
			minimumSize: ciMinHeight,
			maximumSize: Number.POSITIVE_INFINITY,
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
			this.splitView!.style({ separatorBorder: borderColor ?? Color.transparent });
		};
		updateSplitViewStyles();
		this._register(this.themeService.onDidColorThemeChange(updateSplitViewStyles));

		// Initially hide CI pane until checks arrive
		this.splitView.setViewVisible(1, false);

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
			} else {
				this.renderDisposables.clear();
			}
		}));

		// Trigger initial render if already visible
		if (this.isBodyVisible()) {
			this.onVisible();
		}
	}

	override getActionsContext(): URI | undefined {
		return this.viewModel.activeSessionResourceObs.get();
	}

	private onVisible(): void {
		this.renderDisposables.clear();

		const reviewCommentCountByFileObs = derived(reader => {
			const sessionResource = this.viewModel.activeSessionResourceObs.read(reader);
			const changes = [...this.viewModel.activeSessionChangesObs.read(reader)];

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

			const reviewFiles = getCodeReviewFilesFromSessionChanges(changes as readonly IChatSessionFileChange[] | readonly IChatSessionFileChange2[]);
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

		const agentFeedbackCountByFileObs = derived(reader => {
			const sessionResource = this.viewModel.activeSessionResourceObs.read(reader);
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

		// Convert session file changes to list items (cloud/background sessions)
		const sessionFilesObs = derived(reader => {
			const reviewCommentCountByFile = reviewCommentCountByFileObs.read(reader);
			const agentFeedbackCountByFile = agentFeedbackCountByFileObs.read(reader);
			const changes = [...this.viewModel.activeSessionChangesObs.read(reader)];

			return changes.map((entry): IChangesFileItem => {
				const isDeletion = entry.modifiedUri === undefined;
				const isAddition = entry.originalUri === undefined;
				const uri = isIChatSessionFileChange2(entry)
					? entry.modifiedUri ?? entry.uri
					: entry.modifiedUri;
				return {
					type: 'file',
					uri,
					originalUri: entry.originalUri,
					state: ModifiedFileEntryState.Accepted,
					isDeletion,
					changeType: isDeletion ? 'deleted' : isAddition ? 'added' : 'modified',
					linesAdded: entry.insertions,
					linesRemoved: entry.deletions,
					reviewCommentCount: reviewCommentCountByFile.get(uri.fsPath) ?? 0,
					agentFeedbackCount: agentFeedbackCountByFile.get(uri.fsPath) ?? 0,
				};
			});
		});

		const allChangesObs = derived(reader => {
			const repository = this.viewModel.activeSessionRepositoryObs.read(reader);
			const firstCheckpointRef = this.viewModel.activeSessionFirstCheckpointRefObs.read(reader);
			const lastCheckpointRef = this.viewModel.activeSessionLastCheckpointRefObs.read(reader);

			if (!repository || !firstCheckpointRef || !lastCheckpointRef) {
				return constObservable(undefined);
			}

			const diffPromise = repository.diffBetweenWithStats(firstCheckpointRef, lastCheckpointRef);
			return new ObservablePromise(diffPromise).resolvedValue;
		});

		const lastTurnChangesObs = derived(reader => {
			const repository = this.viewModel.activeSessionRepositoryObs.read(reader);
			const lastCheckpointRef = this.viewModel.activeSessionLastCheckpointRefObs.read(reader);

			if (!repository || !lastCheckpointRef) {
				return constObservable(undefined);
			}

			const diffPromise = repository.diffBetweenWithStats(`${lastCheckpointRef}^`, lastCheckpointRef);
			return new ObservablePromise(diffPromise).resolvedValue;
		});

		const isLoadingChangesObs = derived(reader => {
			const versionMode = this.viewModel.versionModeObs.read(reader);
			if (versionMode !== ChangesVersionMode.AllChanges && versionMode !== ChangesVersionMode.LastTurn) {
				return false;
			}

			const repository = this.viewModel.activeSessionRepositoryObs.read(reader);
			if (!repository) {
				return false;
			}

			const allChangesResult = allChangesObs.read(reader).read(reader);
			const lastTurnChangesResult = lastTurnChangesObs.read(reader).read(reader);
			return allChangesResult === undefined || lastTurnChangesResult === undefined;
		});

		this.renderDisposables.add(autorun(reader => {
			const isLoading = isLoadingChangesObs.read(reader);
			if (isLoading) {
				this.changesProgressBar.infinite().show(200);
			} else {
				this.changesProgressBar.stop().hide();
			}
		}));

		// Combine both entry sources for display
		const combinedEntriesObs = derived(reader => {
			const versionMode = this.viewModel.versionModeObs.read(reader);

			const sourceEntries: IChangesFileItem[] = [];
			if (versionMode === ChangesVersionMode.BranchChanges) {
				const sessionFiles = sessionFilesObs.read(reader);
				sourceEntries.push(...sessionFiles);
			} else if (versionMode === ChangesVersionMode.AllChanges) {
				const allChanges = allChangesObs.read(reader).read(reader) ?? [];
				const firstCheckpointRef = this.viewModel.activeSessionFirstCheckpointRefObs.read(reader);
				const lastCheckpointRef = this.viewModel.activeSessionLastCheckpointRefObs.read(reader);
				sourceEntries.push(...toChangesFileItem(allChanges, lastCheckpointRef, firstCheckpointRef));
			} else if (versionMode === ChangesVersionMode.LastTurn) {
				const diffChanges = lastTurnChangesObs.read(reader).read(reader) ?? [];
				const lastCheckpointRef = this.viewModel.activeSessionLastCheckpointRefObs.read(undefined);
				sourceEntries.push(...toChangesFileItem(diffChanges, lastCheckpointRef, lastCheckpointRef ? `${lastCheckpointRef}^` : undefined));
			}

			const resources = new Set();
			const entries: IChangesFileItem[] = [];
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

			let lastHasChanges = false;
			this.renderDisposables.add(bindContextKey(ChatContextKeys.hasAgentSessionChanges, this.scopedContextKeyService, reader => {
				if (isLoadingChangesObs.read(reader)) {
					return lastHasChanges;
				}
				const { files } = topLevelStats.read(reader);
				lastHasChanges = files > 0;
				return lastHasChanges;
			}));

			this.renderDisposables.add(bindContextKey(ChatContextKeys.requestInProgress, this.scopedContextKeyService, reader => {
				const activeSessionStatus = this.sessionManagementService.activeSession.read(reader)?.status.read(reader);
				return activeSessionStatus !== SessionStatus.Completed && activeSessionStatus !== SessionStatus.Error;
			}));

			this.renderDisposables.add(bindContextKey(isolationModeContextKey, this.scopedContextKeyService, reader => {
				return this.viewModel.activeSessionIsolationModeObs.read(reader);
			}));

			this.renderDisposables.add(bindContextKey(hasGitRepositoryContextKey, this.scopedContextKeyService, reader => {
				return this.viewModel.activeSessionHasGitRepositoryObs.read(reader);
			}));

			this.renderDisposables.add(bindContextKey(isMergeBaseBranchProtectedContextKey, this.scopedContextKeyService, reader => {
				const activeSession = this.sessionManagementService.activeSession.read(reader);
				return activeSession?.workspace.read(reader)?.repositories[0]?.baseBranchProtected === true;
			}));

			this.renderDisposables.add(bindContextKey(hasPullRequestContextKey, this.scopedContextKeyService, reader => {
				const activeSession = this.sessionManagementService.activeSession.read(reader);
				const gitHubInfo = activeSession?.gitHubInfo.read(reader);
				return gitHubInfo?.pullRequest?.uri !== undefined;
			}));

			this.renderDisposables.add(bindContextKey(hasOpenPullRequestContextKey, this.scopedContextKeyService, reader => {
				const activeSession = this.sessionManagementService.activeSession.read(reader);
				const gitHubInfo = activeSession?.gitHubInfo.read(reader);
				if (gitHubInfo?.pullRequest?.uri === undefined) {
					return false;
				}
				const iconId = gitHubInfo.pullRequest.icon?.id;
				return iconId !== undefined &&
					(iconId === Codicon.gitPullRequestDraft.id ||
						iconId === Codicon.gitPullRequest.id);
			}));

			this.renderDisposables.add(bindContextKey(hasIncomingChangesContextKey, this.scopedContextKeyService, reader => {
				const repository = this.viewModel.activeSessionRepositoryObs.read(reader);
				const repositoryState = repository?.state.read(reader);
				return (repositoryState?.HEAD?.behind ?? 0) > 0;
			}));

			const outgoingChangesObs = derived(reader => {
				const repository = this.viewModel.activeSessionRepositoryObs.read(reader);
				const repositoryState = repository?.state.read(reader);
				return repositoryState?.HEAD?.ahead ?? 0;
			});

			this.renderDisposables.add(bindContextKey(hasOutgoingChangesContextKey, this.scopedContextKeyService, reader => {
				const outgoingChanges = outgoingChangesObs.read(reader);
				return outgoingChanges > 0;
			}));

			const scopedServiceCollection = new ServiceCollection([IContextKeyService, this.scopedContextKeyService]);
			const scopedInstantiationService = this.instantiationService.createChild(scopedServiceCollection);
			this.renderDisposables.add(scopedInstantiationService);

			this.renderDisposables.add(autorun(reader => {
				const outgoingChanges = outgoingChangesObs.read(reader);
				const sessionResource = this.viewModel.activeSessionResourceObs.read(reader);

				// Read code review state to update the button label dynamically
				let reviewCommentCount: number | undefined;
				let codeReviewLoading = false;
				if (sessionResource) {
					const prReviewState = this.codeReviewService.getPRReviewState(sessionResource).read(reader);
					const prReviewCommentCount = prReviewState.kind === PRReviewStateKind.Loaded ? prReviewState.comments.length : 0;
					const activeSession = this.sessionManagementService.activeSession.read(reader);
					const sessionChanges = activeSession?.changes.read(reader);
					if (sessionChanges && sessionChanges.length > 0) {
						const reviewFiles = getCodeReviewFilesFromSessionChanges(sessionChanges);
						const reviewVersion = getCodeReviewVersion(reviewFiles);
						const reviewState = this.codeReviewService.getReviewState(sessionResource).read(reader);
						if (reviewState.kind === CodeReviewStateKind.Loading && reviewState.version === reviewVersion) {
							codeReviewLoading = true;
						} else {
							const codeReviewCommentCount = reviewState.kind === CodeReviewStateKind.Result && reviewState.version === reviewVersion ? reviewState.comments.length : 0;
							const totalReviewCommentCount = codeReviewCommentCount + prReviewCommentCount;
							if (totalReviewCommentCount > 0) {
								reviewCommentCount = totalReviewCommentCount;
							}
						}
					} else if (prReviewCommentCount > 0) {
						reviewCommentCount = prReviewCommentCount;
					}
				}

				reader.store.add(scopedInstantiationService.createInstance(
					MenuWorkbenchButtonBar,
					this.actionsContainer!,
					MenuId.ChatEditingSessionChangesToolbar,
					{
						telemetrySource: 'changesView',
						disableWhileRunning: true,
						menuOptions: sessionResource
							? { args: [sessionResource, this.agentSessionsService.getSession(sessionResource)?.metadata] }
							: { shouldForwardArgs: true },
						buttonConfigProvider: (action) => {
							if (action.id === 'chatEditing.viewChanges' || action.id === 'chatEditing.viewPreviousEdits' || action.id === 'chatEditing.viewAllSessionChanges' || action.id === 'chat.openSessionWorktreeInVSCode') {
								return { showIcon: true, showLabel: false, isSecondary: true };
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
							if (action.id === 'chatEditing.synchronizeChanges') {
								return { showIcon: true, showLabel: true, isSecondary: false };
							}
							if (action.id === 'github.copilot.chat.createPullRequestCopilotCLIAgentSession.createPR') {
								return { showIcon: true, showLabel: true, isSecondary: false };
							}
							if (action.id === 'github.copilot.chat.createPullRequestCopilotCLIAgentSession.updatePR') {
								const customLabel = outgoingChanges > 0
									? `${action.label} ${outgoingChanges}↑`
									: action.label;
								return { customLabel, showIcon: true, showLabel: true, isSecondary: false };
							}
							if (action.id === 'github.copilot.chat.openPullRequestCopilotCLIAgentSession.openPR') {
								return { showIcon: true, showLabel: false, isSecondary: true };
							}
							if (action.id === 'github.copilot.chat.mergeCopilotCLIAgentSessionChanges.merge') {
								return { showIcon: true, showLabel: true, isSecondary: false };
							}
							if (action.id === 'github.copilot.sessions.commitChanges') {
								return { showIcon: true, showLabel: true, isSecondary: false };
							}
							if (action.id === 'agentSession.markAsDone') {
								return { showIcon: true, showLabel: true, isSecondary: false };
							}

							return undefined;
						}
					}
				));
			}));
		}

		// Update visibility and file count badge based on entries
		this.renderDisposables.add(autorun(reader => {
			if (isLoadingChangesObs.read(reader)) {
				return;
			}

			const { files } = topLevelStats.read(reader);
			const hasEntries = files > 0;

			dom.setVisibility(hasEntries, this.listContainer!);
			dom.setVisibility(!hasEntries, this.welcomeContainer!);

			if (this.filesCountBadge) {
				this.filesCountBadge.textContent = `${files}`;
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

			const openFileItem = (item: IChangesFileItem, items: IChangesFileItem[], sideBySide: boolean, preserveFocus: boolean, pinned: boolean, includeSidebar: boolean) => {
				const { uri: modifiedFileUri, originalUri, isDeletion } = item;
				const currentIndex = items.indexOf(item);

				const sidebar = includeSidebar ? {
					render: (container: unknown, onDidLayout: Event<{ readonly height: number; readonly width: number }>) => {
						return this.renderSidebarList(container as HTMLElement, onDidLayout, items, openFileItem);
					}
				} : undefined;

				const navigation = {
					total: items.length,
					current: currentIndex,
					navigate: (index: number) => {
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

				const items = combinedEntriesObs.get();
				openFileItem(e.element, items, e.sideBySide, !!e.editorOptions?.preserveFocus, !!e.editorOptions?.pinned, items.length > 1);
			}));
		}

		// Bind CI status widget to active session's PR CI model
		if (this.ciStatusWidget) {
			const activeSessionResourceObs = derived(this, reader => this.sessionManagementService.activeSession.read(reader)?.resource);

			const ciModelObs = derived(this, reader => {
				const session = this.sessionManagementService.activeSession.read(reader);
				if (!session) {
					return undefined;
				}
				const gitHubInfo = session.gitHubInfo.read(reader);
				if (!gitHubInfo?.pullRequest) {
					return undefined;
				}
				const prModel = this.gitHubService.getPullRequest(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);
				const pr = prModel.pullRequest.read(reader);
				if (!pr) {
					return undefined;
				}
				// Use the PR's headSha (commit SHA) rather than the branch
				// name so CI checks can still be fetched after branch deletion
				// (e.g. after the PR is merged).
				const ciModel = this.gitHubService.getPullRequestCI(gitHubInfo.owner, gitHubInfo.repo, pr.headSha);
				ciModel.refresh();
				ciModel.startPolling();
				reader.store.add({ dispose: () => ciModel.stopPolling() });
				return ciModel;
			});
			this.renderDisposables.add(this.ciStatusWidget.bind(ciModelObs, activeSessionResourceObs));
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
			this.listContainer?.classList.toggle('list-mode', viewMode === ChangesViewMode.List);

			if (viewMode === ChangesViewMode.Tree) {
				// Tree mode: build hierarchical tree from file entries
				const treeChildren = buildTreeChildren(entries);
				this.tree.setChildren(null, treeChildren);
			} else {
				// List mode: flat list of file items
				const listChildren: IObjectTreeElement<ChangesTreeElement>[] = entries.map(item => ({
					element: item,
					collapsible: false,
				}));
				this.tree.setChildren(null, listChildren);
			}

			this.layoutSplitView();
		}));
	}

	/** Layout the tree within its SplitView pane. */
	private _layoutTreeInPane(paneHeight: number): void {
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
	private layoutSplitView(): void {
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

	private getTreeSelection(): IChangesFileItem[] {
		const selection = this.tree?.getSelection() ?? [];
		return selection.filter(item => !!item && isChangesFileItem(item));
	}

	private getSessionDiscardRef(): string {
		const versionMode = this.viewModel.versionModeObs.get();
		const firstCheckpointRef = this.viewModel.activeSessionFirstCheckpointRefObs.get();
		const lastCheckpointRef = this.viewModel.activeSessionLastCheckpointRefObs.get();

		return versionMode === ChangesVersionMode.LastTurn
			? lastCheckpointRef
				? `${lastCheckpointRef}^`
				: ''
			: firstCheckpointRef ?? '';
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.currentBodyHeight = height;
		this.currentBodyWidth = width;
		this.layoutSplitView();
	}

	override focus(): void {
		super.focus();
		this.tree?.domFocus();
	}

	private renderSidebarList(
		container: HTMLElement,
		onDidLayout: Event<{ readonly height: number; readonly width: number }>,
		items: IChangesFileItem[],
		openFileItem: (item: IChangesFileItem, items: IChangesFileItem[], sideBySide: boolean, preserveFocus: boolean, pinned: boolean, includeSidebar: boolean) => void,
	): IDisposable {
		const disposables = new DisposableStore();

		container.classList.add('changes-file-list');

		const tree = this.createChangesTree(container, Event.None, disposables, () => tree.getSelection().filter(item => !!item && isChangesFileItem(item)));

		tree.setChildren(null, items.map(item => ({ element: item as ChangesTreeElement, collapsible: false })));

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

			const index = items.findIndex(i =>
				(primaryResource !== undefined && isEqual(i.uri, primaryResource)) ||
				(secondaryResource !== undefined && i.originalUri !== undefined && isEqual(i.originalUri, secondaryResource))
			);
			if (index >= 0) {
				updatingSelection = true;
				try {
					tree.setFocus([items[index]]);
					tree.setSelection([items[index]]);
					tree.reveal(items[index]);
				} finally {
					updatingSelection = false;
				}
			}
		}));

		// Layout on resize
		disposables.add(onDidLayout(e => tree.layout(e.height, e.width)));

		return disposables;
	}

	private createChangesTree(
		container: HTMLElement,
		onDidChangeVisibility: Event<boolean>,
		disposables: DisposableStore,
		getSelection?: () => IChangesFileItem[],
	): WorkbenchCompressibleObjectTree<ChangesTreeElement> {
		const resourceLabels = disposables.add(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility }));
		const actionRunner = disposables.add(new ChangesViewActionRunner(
			() => this.viewModel.activeSessionResourceObs.get(),
			() => this.getSessionDiscardRef(),
			getSelection ?? (() => this.getTreeSelection()),
		));
		return disposables.add(this.instantiationService.createInstance(
			WorkbenchCompressibleObjectTree<ChangesTreeElement>,
			'ChangesViewTree',
			container,
			new ChangesTreeDelegate(),
			[this.instantiationService.createInstance(ChangesTreeRenderer, this.viewModel, resourceLabels, MenuId.ChatEditingSessionChangeToolbar, actionRunner)],
			{
				alwaysConsumeMouseWheel: false,
				accessibilityProvider: {
					getAriaLabel: (element: ChangesTreeElement) => isChangesFileItem(element) ? basename(element.uri.path) : element.name,
					getWidgetAriaLabel: () => localize('changesViewTree', "Changes Tree")
				},
				dnd: {
					getDragURI: (element: ChangesTreeElement) => element.uri.toString(),
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
							const elements = data.getData() as ChangesTreeElement[];
							const uris = elements.filter(isChangesFileItem).map(e => e.uri);
							this.instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, uris, originalEvent));
						} catch {
							// noop
						}
					},
				},
				identityProvider: {
					getId: (element: ChangesTreeElement) => element.uri.toString()
				},
				indent: this.viewModel.viewModeObs.get() === ChangesViewMode.List ? 0 : 8,
				compressionEnabled: true,
				twistieAdditionalCssClass: (e: unknown) => {
					return this.viewModel.viewModeObs.get() === ChangesViewMode.List
						? 'force-no-twistie'
						: undefined;
				},
			}
		));
	}

	override dispose(): void {
		this.tree = undefined;
		super.dispose();
	}
}

export class ChangesViewPaneContainer extends ViewPaneContainer {
	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExtensionService extensionService: IExtensionService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@ILogService logService: ILogService,
	) {
		super(CHANGES_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService, logService);
	}

	override create(parent: HTMLElement): void {
		super.create(parent);
		parent.classList.add('changes-viewlet');
	}
}

// --- Action Runner

class ChangesViewActionRunner extends ActionRunner {

	constructor(
		private readonly getSessionResource: () => URI | undefined,
		private readonly getSessionDiscardRef: () => string,
		private readonly getSelectedFileItems: () => IChangesFileItem[]
	) {
		super();
	}

	protected override async runAction(action: IAction, context: URI): Promise<void> {
		if (!(action instanceof MenuItemAction)) {
			return super.runAction(action, context);
		}

		const sessionResource = this.getSessionResource();
		const discardRef = this.getSessionDiscardRef();
		const selection = this.getSelectedFileItems();
		const contextIsSelected = selection.some(s => isEqual(s.uri, context));
		const actualContext = contextIsSelected ? selection.map(s => s.uri) : [context];
		await action.run(sessionResource, discardRef, ...actualContext);
	}
}

// --- Tree Delegate & Renderer

class ChangesTreeDelegate implements IListVirtualDelegate<ChangesTreeElement> {
	static readonly ROW_HEIGHT = 22;

	getHeight(_element: ChangesTreeElement): number {
		return ChangesTreeDelegate.ROW_HEIGHT;
	}

	getTemplateId(_element: ChangesTreeElement): string {
		return ChangesTreeRenderer.TEMPLATE_ID;
	}
}

interface IChangesTreeTemplate {
	readonly label: IResourceLabel;
	readonly templateDisposables: DisposableStore;
	readonly toolbar: MenuWorkbenchToolBar | undefined;
	readonly contextKeyService: IContextKeyService | undefined;
	readonly reviewCommentsBadge: HTMLElement;
	readonly agentFeedbackBadge: HTMLElement;
	readonly decorationBadge: HTMLElement;
	readonly addedSpan: HTMLElement;
	readonly removedSpan: HTMLElement;
	readonly lineCountsContainer: HTMLElement;
}

class ChangesTreeRenderer implements ICompressibleTreeRenderer<ChangesTreeElement, void, IChangesTreeTemplate> {
	static TEMPLATE_ID = 'changesTreeRenderer';
	readonly templateId: string = ChangesTreeRenderer.TEMPLATE_ID;

	constructor(
		private viewModel: ChangesViewModel,
		private labels: ResourceLabels,
		private menuId: MenuId | undefined,
		private actionRunner: ActionRunner | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ILabelService private readonly labelService: ILabelService,
		@ISessionsManagementService private readonly sessionManagementService: ISessionsManagementService,
	) { }

	renderTemplate(container: HTMLElement): IChangesTreeTemplate {
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

		let toolbar: MenuWorkbenchToolBar | undefined;
		let contextKeyService: IContextKeyService | undefined;
		if (this.menuId) {
			const actionBarContainer = $('.chat-collapsible-list-action-bar');
			contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(actionBarContainer));
			const scopedInstantiationService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
			toolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, actionBarContainer, this.menuId, { menuOptions: { shouldForwardArgs: true, arg: undefined }, actionRunner: this.actionRunner }));
			label.element.appendChild(actionBarContainer);

			templateDisposables.add(bindContextKey(ChatContextKeys.agentSessionType, contextKeyService, reader => {
				const activeSession = this.sessionManagementService.activeSession.read(reader);
				return activeSession?.sessionType ?? '';
			}));

			templateDisposables.add(bindContextKey(changesVersionModeContextKey, contextKeyService, reader => {
				return this.viewModel.versionModeObs.read(reader);
			}));
		}

		const decorationBadge = dom.$('.changes-decoration-badge');
		label.element.appendChild(decorationBadge);

		return { templateDisposables, label, toolbar, contextKeyService, reviewCommentsBadge, agentFeedbackBadge, decorationBadge, addedSpan, removedSpan, lineCountsContainer };
	}

	renderElement(node: ITreeNode<ChangesTreeElement, void>, _index: number, templateData: IChangesTreeTemplate): void {
		const element = node.element;
		templateData.label.element.style.display = 'flex';

		if (isChangesFileItem(element)) {
			this.renderFileElement(element, templateData);
		} else {
			this.renderFolderElement(element, templateData);
		}
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<ChangesTreeElement>, void>, _index: number, templateData: IChangesTreeTemplate): void {
		const compressed = node.element;
		const lastElement = compressed.elements[compressed.elements.length - 1];

		templateData.label.element.style.display = 'flex';

		if (isChangesFileItem(lastElement)) {
			// Shouldn't happen in practice - files don't get compressed
			this.renderFileElement(lastElement, templateData);
		} else {
			// Compressed folder chain - show joined folder names
			const label = compressed.elements.map(e => isChangesFileItem(e) ? basename(e.uri.path) : e.name);
			templateData.label.setResource({ resource: lastElement.uri, name: label }, {
				fileKind: FileKind.FOLDER,
				separator: this.labelService.getSeparator(lastElement.uri.scheme),
			});

			// Hide file-specific decorations for folders
			templateData.reviewCommentsBadge.style.display = 'none';
			templateData.agentFeedbackBadge.style.display = 'none';
			templateData.decorationBadge.style.display = 'none';
			templateData.lineCountsContainer.style.display = 'none';

			if (templateData.toolbar) {
				templateData.toolbar.context = undefined;
			}
			if (templateData.contextKeyService) {
				chatEditingWidgetFileStateContextKey.bindTo(templateData.contextKeyService).set(undefined!);
			}
		}
	}

	private renderFileElement(data: IChangesFileItem, templateData: IChangesTreeTemplate): void {
		templateData.label.setFile(data.uri, {
			fileKind: FileKind.FILE,
			fileDecorations: undefined,
			strikethrough: data.changeType === 'deleted',
			hidePath: true,
		});

		// Show file-specific decorations
		templateData.lineCountsContainer.style.display = '';
		templateData.decorationBadge.style.display = '';

		if (data.reviewCommentCount > 0) {
			templateData.reviewCommentsBadge.style.display = '';
			templateData.reviewCommentsBadge.className = 'changes-review-comments-badge';
			templateData.reviewCommentsBadge.replaceChildren(
				dom.$('.codicon.codicon-comment-unresolved'),
				dom.$('span', undefined, `${data.reviewCommentCount}`)
			);
		} else {
			templateData.reviewCommentsBadge.style.display = 'none';
			templateData.reviewCommentsBadge.replaceChildren();
		}

		if (data.agentFeedbackCount > 0) {
			templateData.agentFeedbackBadge.style.display = '';
			templateData.agentFeedbackBadge.className = 'changes-agent-feedback-badge';
			templateData.agentFeedbackBadge.replaceChildren(
				dom.$('.codicon.codicon-comment'),
				dom.$('span', undefined, `${data.agentFeedbackCount}`)
			);
		} else {
			templateData.agentFeedbackBadge.style.display = 'none';
			templateData.agentFeedbackBadge.replaceChildren();
		}

		// Update decoration badge (A/M/D)
		const badge = templateData.decorationBadge;
		badge.className = 'changes-decoration-badge';
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

		if (templateData.toolbar) {
			templateData.toolbar.context = data.uri;
		}
		if (templateData.contextKeyService) {
			chatEditingWidgetFileStateContextKey.bindTo(templateData.contextKeyService).set(data.state);
		}
	}

	private renderFolderElement(data: IChangesFolderItem, templateData: IChangesTreeTemplate): void {
		templateData.label.setFile(data.uri, {
			fileKind: FileKind.FOLDER,
		});

		// Hide file-specific decorations for folders
		templateData.reviewCommentsBadge.style.display = 'none';
		templateData.agentFeedbackBadge.style.display = 'none';
		templateData.decorationBadge.style.display = 'none';
		templateData.lineCountsContainer.style.display = 'none';

		if (templateData.toolbar) {
			templateData.toolbar.context = undefined;
		}
		if (templateData.contextKeyService) {
			chatEditingWidgetFileStateContextKey.bindTo(templateData.contextKeyService).set(undefined!);
		}
	}

	disposeTemplate(templateData: IChangesTreeTemplate): void {
		templateData.templateDisposables.dispose();
	}
}

// --- View Mode Actions

class SetChangesListViewModeAction extends ViewAction<ChangesViewPane> {
	constructor() {
		super({
			id: 'workbench.changesView.action.setListViewMode',
			title: localize('setListViewMode', "View as List"),
			viewId: CHANGES_VIEW_ID,
			f1: false,
			icon: Codicon.listTree,
			toggled: changesViewModeContextKey.isEqualTo(ChangesViewMode.List),
			menu: {
				id: MenuId.ChatEditingSessionTitleToolbar,
				group: '1_viewmode',
				order: 1
			}
		});
	}

	async runInView(_: ServicesAccessor, view: ChangesViewPane): Promise<void> {
		view.viewModel.setViewMode(ChangesViewMode.List);
	}
}

class SetChangesTreeViewModeAction extends ViewAction<ChangesViewPane> {
	constructor() {
		super({
			id: 'workbench.changesView.action.setTreeViewMode',
			title: localize('setTreeViewMode', "View as Tree"),
			viewId: CHANGES_VIEW_ID,
			f1: false,
			icon: Codicon.listFlat,
			toggled: changesViewModeContextKey.isEqualTo(ChangesViewMode.Tree),
			menu: {
				id: MenuId.ChatEditingSessionTitleToolbar,
				group: '1_viewmode',
				order: 2
			}
		});
	}

	async runInView(_: ServicesAccessor, view: ChangesViewPane): Promise<void> {
		view.viewModel.setViewMode(ChangesViewMode.Tree);
	}
}

registerAction2(SetChangesListViewModeAction);
registerAction2(SetChangesTreeViewModeAction);

// --- Versions Picker Action

class VersionsPickerAction extends Action2 {
	static readonly ID = 'chatEditing.versionsPicker';

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

	override async run(): Promise<void> { }
}
registerAction2(VersionsPickerAction);

class ChangesPickerActionItem extends ActionWidgetDropdownActionViewItem {
	constructor(
		action: MenuItemAction,
		private readonly viewModel: ChangesViewModel,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsManagementService sessionManagementService: ISessionsManagementService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		const actionProvider: IActionWidgetDropdownActionProvider = {
			getActions: () => {
				const branchName = viewModel.activeSessionBranchNameObs.get();
				const baseBranchName = viewModel.activeSessionBaseBranchNameObs.get();

				return [
					{
						...action,
						id: 'chatEditing.versionsBranchChanges',
						label: localize('chatEditing.versionsBranchChanges', 'Branch Changes'),
						description: `${branchName} → ${baseBranchName}`,
						checked: viewModel.versionModeObs.get() === ChangesVersionMode.BranchChanges,
						category: { label: 'changes', order: 1, showHeader: false },
						run: async () => {
							viewModel.setVersionMode(ChangesVersionMode.BranchChanges);
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
						checked: viewModel.versionModeObs.get() === ChangesVersionMode.AllChanges,
						category: { label: 'checkpoints', order: 2, showHeader: false },
						enabled: viewModel.activeSessionFirstCheckpointRefObs.get() !== undefined &&
							viewModel.activeSessionLastCheckpointRefObs.get() !== undefined,
						run: async () => {
							viewModel.setVersionMode(ChangesVersionMode.AllChanges);
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
						checked: viewModel.versionModeObs.get() === ChangesVersionMode.LastTurn,
						category: { label: 'checkpoints', order: 3, showHeader: false },
						enabled: viewModel.activeSessionFirstCheckpointRefObs.get() !== undefined &&
							viewModel.activeSessionLastCheckpointRefObs.get() !== undefined,
						run: async () => {
							viewModel.setVersionMode(ChangesVersionMode.LastTurn);
							if (this.element) {
								this.renderLabel(this.element);
							}
						},
					},
				];
			},
		};

		super(action, { actionProvider, listOptions: { descriptionBelow: true } }, actionWidgetService, keybindingService, contextKeyService, telemetryService);

		this._register(autorun(reader => {
			viewModel.versionModeObs.read(reader);
			if (this.element) {
				this.renderLabel(this.element);
			}
		}));
	}

	protected override renderLabel(element: HTMLElement): null {
		const mode = this.viewModel.versionModeObs.get();
		const label = mode === ChangesVersionMode.BranchChanges
			? localize('sessionsChanges.versionsBranchChanges', "Branch Changes")
			: mode === ChangesVersionMode.AllChanges
				? localize('sessionsChanges.versionsAllChanges', "All Changes")
				: localize('sessionsChanges.versionsLastTurn', "Last Turn's Changes");

		dom.reset(element, dom.$('span', undefined, label), ...renderLabelWithIcons('$(chevron-down)'));
		this.updateAriaLabel();
		return null;
	}
}
