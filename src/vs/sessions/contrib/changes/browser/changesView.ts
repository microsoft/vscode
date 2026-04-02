/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/changesView.css';
import * as dom from '../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { ICompressedTreeElement, ICompressedTreeNode } from '../../../../base/browser/ui/tree/compressedObjectTreeModel.js';
import { ICompressibleTreeRenderer } from '../../../../base/browser/ui/tree/objectTree.js';
import { IObjectTreeElement, ITreeNode } from '../../../../base/browser/ui/tree/tree.js';
import { ActionRunner, IAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { autorun, constObservable, derived, derivedOpts, IObservable, IObservableWithChange, ISettableObservable, ObservablePromise, observableSignalFromEvent, observableValue, runOnChange } from '../../../../base/common/observable.js';
import { basename } from '../../../../base/common/path.js';
import { IResourceNode, ResourceTree } from '../../../../base/common/resourceTree.js';
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
import { IActionWidgetDropdownActionProvider } from '../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
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
import { IResourceLabel, ResourceLabel, ResourceLabels } from '../../../../workbench/browser/labels.js';
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
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
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
import { logChangesViewFileSelect, logChangesViewVersionModeChange, logChangesViewViewModeChange } from '../../../common/sessionsTelemetry.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { MultiDiffEditorWidget } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidget.js';
import { IDocumentDiffItem, IMultiDiffEditorModel } from '../../../../editor/browser/widget/multiDiffEditor/model.js';
import { IWorkbenchUIElementFactory } from '../../../../editor/browser/widget/multiDiffEditor/workbenchUIElementFactory.js';
import { RefCounted } from '../../../../editor/browser/widget/diffEditor/utils.js';
import { isDefined } from '../../../../base/common/types.js';

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
const hasUncommittedChangesContextKey = new RawContextKey<boolean>('sessions.hasUncommittedChanges', true);
const changesViewDiffPanelOpenContextKey = new RawContextKey<boolean>('changesViewDiffPanelOpen', false);

// --- List Item

type ChangeType = 'added' | 'modified' | 'deleted' | 'none';

interface IChangesFileItem {
	readonly type: 'file';
	readonly uri: URI;
	readonly originalUri?: URI;
	readonly state: ModifiedFileEntryState;
	readonly isDeletion: boolean;
	readonly changeType: ChangeType;
	readonly linesAdded: number;
	readonly linesRemoved: number;
}

interface IChangesRootItem {
	readonly type: 'root';
	readonly uri: URI;
	readonly name: string;
}

interface IChangesTreeRootInfo {
	readonly root: IChangesRootItem;
	readonly resourceTreeRootUri: URI;
}

type ChangesTreeElement = IChangesRootItem | IChangesFileItem | IResourceNode<IChangesFileItem, undefined>;

function isChangesFileItem(element: ChangesTreeElement): element is IChangesFileItem {
	return !ResourceTree.isResourceNode(element) && element.type === 'file';
}

function isChangesRootItem(element: ChangesTreeElement): element is IChangesRootItem {
	return !ResourceTree.isResourceNode(element) && element.type === 'root';
}

/**
 * Builds a tree of `ICompressedTreeElement<ChangesTreeElement>` from a flat list of file items
 * using a `ResourceTree` to group files by their directory path segments.
 */
function buildTreeChildren(items: IChangesFileItem[], treeRootInfo?: IChangesTreeRootInfo): ICompressedTreeElement<ChangesTreeElement>[] {
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

	const resourceTree = new ResourceTree<IChangesFileItem, undefined>(undefined, rootUri, extUriBiasedIgnorePathCase);
	for (const item of items) {
		resourceTree.add(item.uri, item);
	}

	function convertChildren(parent: IResourceNode<IChangesFileItem, undefined>): ICompressedTreeElement<ChangesTreeElement>[] {
		const result: ICompressedTreeElement<ChangesTreeElement>[] = [];
		for (const child of parent.children) {
			if (child.element && child.childrenCount === 0) {
				// Leaf node — just the file item
				result.push({
					element: child.element,
					collapsible: false,
					incompressible: true,
				});
			} else {
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
			linesRemoved: change.deletions
		} satisfies IChangesFileItem;
	});
}

// --- View Model

class ChangesViewModel extends Disposable {
	readonly sessionsChangedSignal: IObservable<void>;
	readonly activeSessionResourceObs: IObservable<URI | undefined>;
	readonly activeSessionBranchNameObs: IObservable<string | undefined>;
	readonly activeSessionBaseBranchNameObs: IObservable<string | undefined>;
	readonly activeSessionIsolationModeObs: IObservable<IsolationMode>;
	readonly activeSessionRepositoryObs: IObservableWithChange<IGitRepository | undefined>;
	readonly activeSessionChangesObs: IObservable<readonly (IChatSessionFileChange | IChatSessionFileChange2)[]>;
	readonly activeSessionReviewCommentCountByFileObs: IObservable<Map<string, number>>;
	readonly activeSessionAgentFeedbackCountByFileObs: IObservable<Map<string, number>>;
	readonly activeSessionAllChangesObs: IObservableWithChange<IObservable<GitDiffChange[] | undefined>>;
	readonly activeSessionLastTurnChangesObs: IObservableWithChange<IObservable<GitDiffChange[] | undefined>>;
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
		@IAgentFeedbackService private readonly agentFeedbackService: IAgentFeedbackService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@ICodeReviewService private readonly codeReviewService: ICodeReviewService,
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
			const sessionResource = this.activeSessionResourceObs.read(reader);
			if (!sessionResource) {
				return undefined;
			}

			this.sessionsChangedSignal.read(reader);
			const model = this.agentSessionsService.getSession(sessionResource);
			return model?.metadata?.baseBranchName as string | undefined;
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

		this.activeSessionAgentFeedbackCountByFileObs = derived(reader => {
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

	private treeAndDiffContainer: HTMLElement | undefined;
	private diffPanelContainer: HTMLElement | undefined;
	private horizontalSplitView: SplitView<number> | undefined;
	private _multiDiffWidget: MultiDiffEditorWidget | undefined;
	private readonly _currentDiffModelDisposable = this._register(new MutableDisposable());
	private readonly _diffPanelOpenObs = observableValue<boolean>(this, false);
	private _savedDiffPanelWidth = 0;
	private _savedAuxBarWidth = 0;
	private currentTreeWidth = 0;
	private _combinedEntriesObs: IObservable<IChangesFileItem[]> | undefined;

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
		@IWorkbenchLayoutService private readonly workbenchLayoutService: IWorkbenchLayoutService,
		@IStorageService private readonly storageService: IStorageService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
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

		// Bind diff panel open context key
		this._register(bindContextKey(changesViewDiffPanelOpenContextKey, this.scopedContextKeyService, reader => {
			return this._diffPanelOpenObs.read(reader);
		}));

		// Restore saved diff panel width
		this._savedDiffPanelWidth = this.storageService.getNumber('workbench.changesView.diffPanelWidth', StorageScope.WORKSPACE, 0);

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

		// Wrapper for the horizontal split between file tree (left) and inline diff panel (right)
		this.treeAndDiffContainer = dom.append(this.splitViewContainer, $('.changes-tree-and-diff-container'));

		// Main container with file icons support (the "card") — left side of horizontal split
		this.contentContainer = dom.append(this.treeAndDiffContainer, $('.chat-editing-session-container.show-file-icons'));
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

		// Diff panel — right side of the horizontal split (initially hidden)
		this.diffPanelContainer = dom.append(this.treeAndDiffContainer, $('.changes-diff-panel'));

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

		// Top pane: tree + inline diff (horizontal split wrapper)
		const treePane: IView = {
			element: this.treeAndDiffContainer,
			minimumSize: treeMinHeight,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: Event.None,
			layout: (height) => {
				this.treeAndDiffContainer!.style.height = `${height}px`;
				if (this.horizontalSplitView) {
					this.horizontalSplitView.layout(this.currentBodyWidth, height);
				} else {
					this._layoutTreeInPane(height);
				}
			},
		};

		// Bottom pane: CI checks
		const ciElement = this.ciStatusWidget.element;
		const ciWidget = this.ciStatusWidget;
		const ciPane: IView = {
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

		// Horizontal split: file tree (left) | inline diff panel (right)
		const TREE_MIN_WIDTH = 180;
		const DIFF_PANEL_MIN_WIDTH = 300;

		const treePaneH: IView<number> = {
			element: this.contentContainer,
			minimumSize: TREE_MIN_WIDTH,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: Event.None,
			layout: (width, _offset, height) => {
				this.currentTreeWidth = width;
				this.contentContainer!.style.width = `${width}px`;
				this.contentContainer!.style.height = `${height ?? 0}px`;
				this._layoutTreeInPane(height ?? 0);
			},
		};

		const diffPaneH: IView<number> = {
			element: this.diffPanelContainer,
			minimumSize: DIFF_PANEL_MIN_WIDTH,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: Event.None,
			layout: (width, _offset, height) => {
				this.diffPanelContainer!.style.width = `${width}px`;
				this.diffPanelContainer!.style.height = `${height ?? 0}px`;
				if (this._multiDiffWidget) {
					this._multiDiffWidget.layout(new dom.Dimension(width, height ?? 0));
				}
			},
		};

		this.horizontalSplitView = this._register(new SplitView<number>(this.treeAndDiffContainer, {
			orientation: Orientation.HORIZONTAL,
			proportionalLayout: false,
		}));
		// Diff panel on the left (index 0), file tree on the right (index 1)
		this.horizontalSplitView.addView(diffPaneH, Sizing.Distribute, 0);
		this.horizontalSplitView.addView(treePaneH, Sizing.Distribute, 1);

		// Initially hide the diff panel
		this.horizontalSplitView.setViewVisible(0, false);

		// Style the sash as a visible separator between sections
		const updateSplitViewStyles = () => {
			const borderColor = this.themeService.getColorTheme().getColor(PANEL_SECTION_BORDER);
			this.splitView!.style({ separatorBorder: borderColor ?? Color.transparent });
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
			} else {
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

		// Convert session file changes to list items (cloud/background sessions)
		const sessionFilesObs = derived(reader => {
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
					linesRemoved: entry.deletions
				};
			});
		});

		const isLoadingChangesObs = derived(reader => {
			const versionMode = this.viewModel.versionModeObs.read(reader);
			if (versionMode === ChangesVersionMode.BranchChanges) {
				return false;
			}

			if (versionMode === ChangesVersionMode.AllChanges) {
				const allChangesResult = this.viewModel.activeSessionAllChangesObs.read(reader).read(reader);
				return allChangesResult === undefined;
			}

			if (versionMode === ChangesVersionMode.LastTurn) {
				const lastTurnChangesResult = this.viewModel.activeSessionLastTurnChangesObs.read(reader).read(reader);
				return lastTurnChangesResult === undefined;
			}

			return false;
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
			const hasGitRepository = this.viewModel.activeSessionHasGitRepositoryObs.read(reader);
			if (!hasGitRepository) {
				return [];
			}

			const sourceEntries: IChangesFileItem[] = [];
			if (versionMode === ChangesVersionMode.BranchChanges) {
				const sessionFiles = sessionFilesObs.read(reader);
				sourceEntries.push(...sessionFiles);
			} else if (versionMode === ChangesVersionMode.AllChanges) {
				const allChanges = this.viewModel.activeSessionAllChangesObs.read(reader).read(reader) ?? [];
				const firstCheckpointRef = this.viewModel.activeSessionFirstCheckpointRefObs.read(undefined);
				const lastCheckpointRef = this.viewModel.activeSessionLastCheckpointRefObs.read(undefined);
				sourceEntries.push(...toChangesFileItem(allChanges, lastCheckpointRef, firstCheckpointRef));
			} else if (versionMode === ChangesVersionMode.LastTurn) {
				const diffChanges = this.viewModel.activeSessionLastTurnChangesObs.read(reader).read(reader) ?? [];
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

		// Keep a reference so _openDiffPanel can access the current entries
		this._combinedEntriesObs = combinedEntriesObs;

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
				if (!repositoryState) {
					return 0;
				}

				return repositoryState?.HEAD?.ahead ?? 0;
			});

			this.renderDisposables.add(bindContextKey(hasOutgoingChangesContextKey, this.scopedContextKeyService, reader => {
				const outgoingChanges = outgoingChangesObs.read(reader);
				return outgoingChanges > 0;
			}));

			this.renderDisposables.add(bindContextKey(hasUncommittedChangesContextKey, this.scopedContextKeyService, reader => {
				const repository = this.viewModel.activeSessionRepositoryObs.read(reader);
				const repositoryState = repository?.state.read(reader);
				if (!repositoryState) {
					return true;
				}

				return (repositoryState?.mergeChanges.length ?? 0) > 0 ||
					(repositoryState?.indexChanges.length ?? 0) > 0 ||
					(repositoryState?.workingTreeChanges.length ?? 0) > 0 ||
					(repositoryState?.untrackedChanges.length ?? 0) > 0;
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
							if (
								action.id === 'github.copilot.sessions.sync' ||
								action.id === 'github.copilot.chat.createPullRequestCopilotCLIAgentSession.updatePR'
							) {
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
							if (
								action.id === 'chatEditing.viewAllSessionChanges' ||
								action.id === 'sessions.changes.toggleDiffPanel' ||
								action.id === 'github.copilot.chat.openPullRequestCopilotCLIAgentSession.openPR'
							) {
								return { showIcon: true, showLabel: false, isSecondary: true };
							}
							if (action.id === 'agentFeedbackEditor.action.submitActiveSession') {
								return { showIcon: false, showLabel: true, isSecondary: false };
							}
							if (
								action.id === 'github.copilot.chat.createPullRequestCopilotCLIAgentSession.createPR' ||
								action.id === 'github.copilot.chat.mergeCopilotCLIAgentSessionChanges.merge' ||
								action.id === 'github.copilot.chat.checkoutPullRequestReroute' ||
								action.id === 'pr.checkoutFromChat' ||
								action.id === 'github.copilot.sessions.initializeRepository' ||
								action.id === 'github.copilot.sessions.commit' ||
								action.id === 'agentSession.markAsDone'
							) {
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
					}
				));
			}));
		}

		// Update visibility and file count badge based on entries
		this.renderDisposables.add(autorun(reader => {
			if (isLoadingChangesObs.read(reader)) {
				return;
			}

			const hasGitRepository = this.viewModel.activeSessionHasGitRepositoryObs.read(reader);
			dom.setVisibility(hasGitRepository, this.filesHeaderNode!);

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
				// When the inline diff panel is open, reveal the file there instead of opening a modal editor
				if (this._diffPanelOpenObs.get() && this._multiDiffWidget) {
					this._multiDiffWidget.reveal(
						{
							original: item.originalUri,
							modified: item.isDeletion ? undefined : item.uri,
						},
						{ highlight: true }
					);

					const targetResource = item.isDeletion ? item.originalUri : item.uri;
					if (targetResource) {
						const editor = this._multiDiffWidget.tryGetCodeEditor(targetResource);
						editor?.editor.focus();
					}
					return;
				}

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

				logChangesViewFileSelect(this.telemetryService, e.element.changeType);

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

		// Keep the inline diff model in sync with changes when the panel is open
		this.renderDisposables.add(autorun(reader => {
			const isOpen = this._diffPanelOpenObs.read(reader);
			const entries = combinedEntriesObs.read(reader);
			if (isOpen) {
				// Fire-and-forget: update the diff model with the latest entries
				this._buildAndSetDiffModel(entries);
			}
		}));

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
				const treeRootInfo = this.getTreeRootInfo(entries);
				const treeChildren = buildTreeChildren(entries, treeRootInfo);
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
		// Use the tree's allocated width from the horizontal split when available
		const treeWidth = this.currentTreeWidth > 0 ? this.currentTreeWidth : this.currentBodyWidth;
		this.tree.layout(treeHeight, treeWidth);
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

	private getTreeRootInfo(items: readonly IChangesFileItem[]): IChangesTreeRootInfo | undefined {
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
		} else if (sampleUri.scheme !== workspaceFolderUri.scheme || sampleUri.authority !== workspaceFolderUri.authority) {
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

		const viewMode = this.viewModel.viewModeObs.get();
		container.classList.toggle('list-mode', viewMode === ChangesViewMode.List);

		const tree = this.createChangesTree(container, Event.None, disposables, () => tree.getSelection().filter(item => !!item && isChangesFileItem(item)));

		if (viewMode === ChangesViewMode.Tree) {
			tree.setChildren(null, buildTreeChildren(items, this.getTreeRootInfo(items)));
		} else {
			tree.setChildren(null, items.map(item => ({ element: item as ChangesTreeElement, collapsible: false })));
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
			[this.instantiationService.createInstance(ChangesTreeRenderer, this.viewModel, resourceLabels, actionRunner,
				() => {
					// Pass in the tree root to be used to compute the label description
					const activeSession = this.sessionManagementService.activeSession.get();
					const repository = activeSession?.workspace.get()?.repositories[0];
					return repository?.workingDirectory ?? repository?.uri;
				})],
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


	/** Toggles the inline multi-diff panel to the right of the file tree. */
	public toggleDiffPanel(): void {
		if (this._diffPanelOpenObs.get()) {
			this._closeDiffPanel();
		} else {
			this._openDiffPanel();
		}
	}

	private _openDiffPanel(): void {
		if (!this.horizontalSplitView || !this.diffPanelContainer) {
			return;
		}

		// Lazily create the widget on first open
		if (!this._multiDiffWidget) {
			const factory: IWorkbenchUIElementFactory = {
				createResourceLabel: (element) => {
					const label = this.instantiationService.createInstance(ResourceLabel, element, {});
					return {
						setUri(uri, options = {}) {
							if (!uri) { label.element.clear(); }
							else { label.element.setFile(uri, { strikethrough: options?.strikethrough }); }
						},
						dispose() { label.dispose(); }
					};
				}
			};
			this._multiDiffWidget = this._store.add(
				this.instantiationService.createInstance(MultiDiffEditorWidget, this.diffPanelContainer, factory)
			);
		}

		// Show the diff panel with a sensible default width (2/3 of available, or saved width)
		const defaultWidth = this._savedDiffPanelWidth > 0
			? this._savedDiffPanelWidth
			: Math.floor(this.currentBodyWidth * 2 / 3);
		const treeWidthBeforeOpen = this.currentTreeWidth;
		this.horizontalSplitView.setViewVisible(0, true);
		this.horizontalSplitView.resizeView(0, defaultWidth);

		// Widen the auxiliary bar to make room for the diff panel
		const currentAuxSize = this.workbenchLayoutService.getSize(Parts.AUXILIARYBAR_PART);
		this._savedAuxBarWidth = currentAuxSize.width;
		this.workbenchLayoutService.setSize(Parts.AUXILIARYBAR_PART, {
			width: currentAuxSize.width + defaultWidth,
			height: currentAuxSize.height,
		});

		// Keep the tree width stable when opening the diff panel.
		if (treeWidthBeforeOpen > 0) {
			this.horizontalSplitView.resizeView(1, treeWidthBeforeOpen);
		}

		this._diffPanelOpenObs.set(true, undefined);
		this.layoutSplitView();

		// Build diff model from current combined entries
		const items = this._combinedEntriesObs?.get() ?? [];
		this._buildAndSetDiffModel(items);
	}

	private _closeDiffPanel(): void {
		if (this.horizontalSplitView) {
			// Save current width before hiding so we can restore it next time
			this._savedDiffPanelWidth = this.horizontalSplitView.getViewSize(0);
			this.storageService.store('workbench.changesView.diffPanelWidth', this._savedDiffPanelWidth, StorageScope.WORKSPACE, StorageTarget.USER);
			this.horizontalSplitView.setViewVisible(0, false);
		}

		// Restore the auxiliary bar to its original width
		if (this._savedAuxBarWidth > 0) {
			const currentAuxSize = this.workbenchLayoutService.getSize(Parts.AUXILIARYBAR_PART);
			this.workbenchLayoutService.setSize(Parts.AUXILIARYBAR_PART, {
				width: this._savedAuxBarWidth,
				height: currentAuxSize.height,
			});
			this._savedAuxBarWidth = 0;
		}

		this._currentDiffModelDisposable.clear();
		this._multiDiffWidget?.setViewModel(undefined);
		this._diffPanelOpenObs.set(false, undefined);
		this.layoutSplitView();
	}

	private async _buildAndSetDiffModel(items: IChangesFileItem[]): Promise<void> {
		this._currentDiffModelDisposable.clear();

		if (!this._multiDiffWidget || items.length === 0) {
			this._multiDiffWidget?.setViewModel(undefined);
			return;
		}

		// Clear view while loading
		this._multiDiffWidget.setViewModel(undefined);

		const store = new DisposableStore();

		// Resolve all text models in parallel
		const docItems = await Promise.all(items.map(async (item): Promise<RefCounted<IDocumentDiffItem> | undefined> => {
			const itemStore = new DisposableStore();
			try {
				const [originalRef, modifiedRef] = await Promise.all([
					item.originalUri ? this.textModelService.createModelReference(item.originalUri) : Promise.resolve(undefined),
					item.isDeletion ? Promise.resolve(undefined) : this.textModelService.createModelReference(item.uri),
				]);
				if (originalRef) { itemStore.add(originalRef); }
				if (modifiedRef) { itemStore.add(modifiedRef); }
				const docItem: IDocumentDiffItem = {
					original: originalRef?.object.textEditorModel,
					modified: modifiedRef?.object.textEditorModel,
				};
				return store.add(RefCounted.createOfNonDisposable(docItem, itemStore, this));
			} catch {
				itemStore.dispose();
				return undefined;
			}
		}));

		// If panel was closed while awaiting, discard the result
		if (!this._diffPanelOpenObs.get()) {
			store.dispose();
			return;
		}

		const validDocs = docItems.filter(isDefined);
		const model: IMultiDiffEditorModel = {
			documents: {
				get value() { return validDocs; },
				onDidChange: Event.None,
			}
		};

		const viewModel = store.add(this._multiDiffWidget.createViewModel(model));
		this._multiDiffWidget.setViewModel(viewModel);
		this._currentDiffModelDisposable.value = store;
		this.layoutSplitView();
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

	protected override async runAction(action: IAction, context: ChangesTreeElement): Promise<void> {
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
	readonly toolbar: MenuWorkbenchToolBar | undefined;
	readonly contextKeyService: IContextKeyService | undefined;
	readonly reviewCommentsBadge: HTMLElement;
	readonly agentFeedbackBadge: HTMLElement;
	readonly decorationBadge: HTMLElement;
	readonly addedSpan: HTMLElement;
	readonly removedSpan: HTMLElement;
	readonly lineCountsContainer: HTMLElement;
	readonly elementDisposables: DisposableStore;
	readonly templateDisposables: DisposableStore;
}

class ChangesTreeRenderer implements ICompressibleTreeRenderer<ChangesTreeElement, void, IChangesTreeTemplate> {
	static TEMPLATE_ID = 'changesTreeRenderer';
	readonly templateId: string = ChangesTreeRenderer.TEMPLATE_ID;

	constructor(
		private viewModel: ChangesViewModel,
		private labels: ResourceLabels,
		private actionRunner: ActionRunner | undefined,
		private getRootUri: () => URI | undefined,
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

	renderElement(node: ITreeNode<ChangesTreeElement, void>, _index: number, templateData: IChangesTreeTemplate): void {
		const element = node.element;
		templateData.label.element.style.display = 'flex';

		if (isChangesRootItem(element)) {
			// Root element
			this.renderRootElement(element, templateData);
		} else if (ResourceTree.isResourceNode(element)) {
			// Folder element
			this.renderFolderElement(element, templateData);
		} else {
			// File element
			this.renderFileElement(element, templateData);
		}
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<ChangesTreeElement>, void>, _index: number, templateData: IChangesTreeTemplate): void {
		const compressed = node.element as ICompressedTreeNode<IResourceNode<IChangesFileItem, undefined>>;
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
			chatEditingWidgetFileStateContextKey.bindTo(templateData.contextKeyService).set(undefined!);
		}
	}

	private renderFileElement(data: IChangesFileItem, templateData: IChangesTreeTemplate): void {
		const root = this.getRootUri();
		const viewMode = this.viewModel.viewModeObs.get();

		templateData.label.setResource({
			resource: data.uri,
			name: basename(data.uri.path),
			description: viewMode === ChangesViewMode.List
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
				templateData.reviewCommentsBadge.replaceChildren(
					dom.$('.codicon.codicon-comment-unresolved'),
					dom.$('span', undefined, `${reviewCommentCount}`)
				);
			} else {
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
				templateData.agentFeedbackBadge.replaceChildren(
					dom.$('.codicon.codicon-comment'),
					dom.$('span', undefined, `${agentFeedbackCount}`)
				);
			} else {
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
		} else {
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

	private renderRootElement(data: IChangesRootItem, templateData: IChangesTreeTemplate): void {
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
			chatEditingWidgetFileStateContextKey.bindTo(templateData.contextKeyService).set(undefined!);
		}
	}

	private renderFolderElement(node: IResourceNode<IChangesFileItem, undefined>, templateData: IChangesTreeTemplate): void {
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
			chatEditingWidgetFileStateContextKey.bindTo(templateData.contextKeyService).set(undefined!);
		}
	}

	disposeElement(_element: ITreeNode<ChangesTreeElement, void>, _index: number, templateData: IChangesTreeTemplate): void {
		templateData.elementDisposables.clear();
	}

	disposeCompressedElements(_element: ITreeNode<ICompressedTreeNode<ChangesTreeElement>, void>, _index: number, templateData: IChangesTreeTemplate): void {
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: IChangesTreeTemplate): void {
		templateData.elementDisposables.dispose();
		templateData.templateDisposables.dispose();
	}
}

// --- Inline Diff Panel Toggle Action (Sessions window only)

class ToggleInlineDiffPanelAction extends ViewAction<ChangesViewPane> {
	static readonly ID = 'sessions.changes.toggleDiffPanel';

	constructor() {
		super({
			id: ToggleInlineDiffPanelAction.ID,
			title: localize2('sessions.changes.toggleDiffPanel', 'View All Changes'),
			viewId: CHANGES_VIEW_ID,
			f1: false,
			icon: Codicon.diffMultiple,
			toggled: changesViewDiffPanelOpenContextKey.isEqualTo(true),
			precondition: ContextKeyExpr.and(
				ContextKeyExpr.equals('isSessionsWindow', true),
				ChatContextKeys.hasAgentSessionChanges,
			),
			menu: [{
				id: MenuId.ChatEditingSessionChangesToolbar,
				group: 'navigation',
				order: 10,
				when: ContextKeyExpr.equals('isSessionsWindow', true),
			}],
		});
	}

	async runInView(_accessor: ServicesAccessor, view: ChangesViewPane): Promise<void> {
		view.toggleDiffPanel();
	}
}
registerAction2(ToggleInlineDiffPanelAction);

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

	async runInView(accessor: ServicesAccessor, view: ChangesViewPane): Promise<void> {
		logChangesViewViewModeChange(accessor.get(ITelemetryService), ChangesViewMode.List);
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

	async runInView(accessor: ServicesAccessor, view: ChangesViewPane): Promise<void> {
		logChangesViewViewModeChange(accessor.get(ITelemetryService), ChangesViewMode.Tree);
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
		@ITelemetryService private readonly telemetryService: ITelemetryService,
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
						description: branchName && baseBranchName
							? `${branchName} → ${baseBranchName}`
							: branchName,
						checked: viewModel.versionModeObs.get() === ChangesVersionMode.BranchChanges,
						category: { label: 'changes', order: 1, showHeader: false },
						run: async () => {
							viewModel.setVersionMode(ChangesVersionMode.BranchChanges);
							logChangesViewVersionModeChange(this.telemetryService, ChangesVersionMode.BranchChanges);
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
							logChangesViewVersionModeChange(this.telemetryService, ChangesVersionMode.AllChanges);
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
							logChangesViewVersionModeChange(this.telemetryService, ChangesVersionMode.LastTurn);
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

	protected override renderLabel(element: HTMLElement): IDisposable | null {
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
