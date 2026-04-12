/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/changesView.css';
import * as dom from '../../../../base/browser/dom.js';
import { Schemas } from '../../../../base/common/network.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { IObjectTreeElement, ITreeSorter } from '../../../../base/browser/ui/tree/tree.js';
import { ActionRunner, IAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { autorun, derived, derivedOpts, IObservable } from '../../../../base/common/observable.js';
import { CountBadge } from '../../../../base/browser/ui/countBadge/countBadge.js';
import { ProgressBar } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { MenuWorkbenchButtonBar } from '../../../../platform/actions/browser/buttonbar.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { MenuId, Action2, MenuItemAction, registerAction2, IMenuService } from '../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownActionProvider } from '../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
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
import { defaultCountBadgeStyles, defaultProgressBarStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { fillEditorsDragData } from '../../../../workbench/browser/dnd.js';
import { ResourceLabels } from '../../../../workbench/browser/labels.js';
import { ViewPane, IViewPaneOptions, ViewAction } from '../../../../workbench/browser/parts/views/viewPane.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { CHAT_CATEGORY } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { createFileIconThemableTreeContainerScope } from '../../../../workbench/contrib/files/browser/views/explorerView.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../../workbench/services/editor/common/editorService.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { CodeReviewStateKind, getCodeReviewFilesFromSessionChanges, getCodeReviewVersion, ICodeReviewService, PRReviewStateKind } from '../../codeReview/browser/codeReviewService.js';
import { CIStatusWidget } from './checksWidget.js';
import { COPILOT_CLOUD_SESSION_TYPE, GITHUB_REMOTE_FILE_SCHEME, SessionStatus } from '../../../services/sessions/common/session.js';
import { Orientation } from '../../../../base/browser/ui/sash/sash.js';
import { IView, Sizing, SplitView } from '../../../../base/browser/ui/splitview/splitview.js';
import { Color } from '../../../../base/common/color.js';
import { PANEL_SECTION_BORDER } from '../../../../workbench/common/theme.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../workbench/common/editor.js';
import { logChangesViewFileSelect, logChangesViewVersionModeChange, logChangesViewViewModeChange } from '../../../common/sessionsTelemetry.js';
import { ChecksViewModel } from './checksViewModel.js';
import { ActiveSessionContextKeys, CHANGES_VIEW_CONTAINER_ID, CHANGES_VIEW_ID, ChangesContextKeys, ChangesVersionMode, ChangesViewMode, IsolationMode } from '../common/changes.js';
import { buildTreeChildren, ChangesTreeElement, ChangesTreeRenderer, IChangesFileItem, IChangesTreeRootInfo, isChangesFileItem, toIChangesFileItem } from './changesViewRenderer.js';
import { ChangesViewModel } from './changesViewModel.js';
import { ResourceTree } from '../../../../base/common/resourceTree.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { compareFileNames, comparePaths } from '../../../../base/common/comparers.js';

const $ = dom.$;

// --- Constants

const RUN_SESSION_CODE_REVIEW_ACTION_ID = 'sessions.codeReview.run';

// --- ButtonBar widget

class ChangesButtonBarWidget extends Disposable {
	constructor(
		container: HTMLElement,
		viewModel: ChangesViewModel,
		@IAgentSessionsService agentSessionsService: IAgentSessionsService,
		@IMenuService menuService: IMenuService,
		@ICodeReviewService codeReviewService: ICodeReviewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService
	) {
		super();

		const outgoingChangesObs = derived(reader => {
			const activeSessionState = viewModel.activeSessionStateObs.read(reader);
			return activeSessionState?.outgoingChanges ?? 0;
		});

		const reviewStateObs = derivedOpts<{ isLoading: boolean; commentCount: number | undefined }>({ equalsFn: structuralEquals }, reader => {
			const sessionResource = viewModel.activeSessionResourceObs.read(reader);
			if (!sessionResource) {
				return { isLoading: false, commentCount: undefined };
			}

			const sessionChanges = viewModel.activeSessionChangesObs.read(reader);
			const prReviewState = codeReviewService.getPRReviewState(sessionResource).read(reader);
			const prReviewCommentCount = prReviewState.kind === PRReviewStateKind.Loaded
				? prReviewState.comments.length
				: 0;

			let isLoading = false;
			let commentCount: number | undefined;
			if (sessionChanges && sessionChanges.length > 0) {
				const reviewFiles = getCodeReviewFilesFromSessionChanges(sessionChanges);
				const reviewVersion = getCodeReviewVersion(reviewFiles);
				const reviewState = codeReviewService.getReviewState(sessionResource).read(reader);

				if (reviewState.kind === CodeReviewStateKind.Loading && reviewState.version === reviewVersion) {
					isLoading = true;
				} else {
					const codeReviewCommentCount = reviewState.kind === CodeReviewStateKind.Result && reviewState.version === reviewVersion
						? reviewState.comments.length
						: 0;
					const totalReviewCommentCount = codeReviewCommentCount + prReviewCommentCount;
					if (totalReviewCommentCount > 0) {
						commentCount = totalReviewCommentCount;
					}
				}
			} else if (prReviewCommentCount > 0) {
				commentCount = prReviewCommentCount;
			}

			return { isLoading, commentCount };
		});

		this._register(autorun(reader => {
			const sessionResource = viewModel.activeSessionResourceObs.read(reader);
			const outgoingChanges = outgoingChangesObs.read(reader);
			const reviewState = reviewStateObs.read(reader);

			reader.store.add(new MenuWorkbenchButtonBar(
				container,
				MenuId.ChatEditingSessionChangesToolbar,
				{
					telemetrySource: 'changesView',
					disableWhileRunning: true,
					menuOptions: sessionResource
						? { args: [sessionResource, agentSessionsService.getSession(sessionResource)?.metadata] }
						: { shouldForwardArgs: true },
					buttonConfigProvider: (action) => this._getButtonConfiguration(action, outgoingChanges, reviewState)
				},
				menuService, contextKeyService, contextMenuService, keybindingService, telemetryService, hoverService
			));
		}));
	}

	private _getButtonConfiguration(action: IAction, outgoingChanges: number, reviewState: { isLoading: boolean; commentCount: number | undefined }): { showIcon: boolean; showLabel: boolean; isSecondary?: boolean; customLabel?: string; customClass?: string } | undefined {
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
			if (reviewState.isLoading) {
				return { showIcon: true, showLabel: true, isSecondary: true, customLabel: '$(loading~spin)', customClass: 'code-review-loading' };
			}
			if (reviewState.commentCount !== undefined) {
				return { showIcon: true, showLabel: true, isSecondary: true, customLabel: String(reviewState.commentCount), customClass: 'code-review-comments' };
			}
			return { showIcon: true, showLabel: false, isSecondary: true };
		}
		if (
			action.id === 'chatEditing.viewAllSessionChanges' ||
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

	private readonly isMergeBaseBranchProtectedContextKey: IContextKey<boolean>;
	private readonly isolationModeContextKey: IContextKey<IsolationMode>;
	private readonly hasGitRepositoryContextKey: IContextKey<boolean>;
	private readonly hasUpstreamContextKey: IContextKey<boolean>;
	private readonly hasIncomingChangesContextKey: IContextKey<boolean>;
	private readonly hasOpenPullRequestContextKey: IContextKey<boolean>;
	private readonly hasOutgoingChangesContextKey: IContextKey<boolean>;
	private readonly hasPullRequestContextKey: IContextKey<boolean>;
	private readonly hasGitHubRemoteContextKey: IContextKey<boolean>;
	private readonly hasUncommittedChangesContextKey: IContextKey<boolean>;

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
		@ISessionsManagementService private readonly sessionManagementService: ISessionsManagementService,
		@ILabelService private readonly labelService: ILabelService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super({ ...options, titleMenuId: MenuId.ChatEditingSessionTitleToolbar }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this.viewModel = this.instantiationService.createInstance(ChangesViewModel);
		this._register(this.viewModel);

		// Context keys
		this.isMergeBaseBranchProtectedContextKey = ActiveSessionContextKeys.IsMergeBaseBranchProtected.bindTo(this.scopedContextKeyService);
		this.isolationModeContextKey = ActiveSessionContextKeys.IsolationMode.bindTo(this.scopedContextKeyService);
		this.hasGitRepositoryContextKey = ActiveSessionContextKeys.HasGitRepository.bindTo(this.scopedContextKeyService);
		this.hasUpstreamContextKey = ActiveSessionContextKeys.HasUpstream.bindTo(this.scopedContextKeyService);
		this.hasIncomingChangesContextKey = ActiveSessionContextKeys.HasIncomingChanges.bindTo(this.scopedContextKeyService);
		this.hasOutgoingChangesContextKey = ActiveSessionContextKeys.HasOutgoingChanges.bindTo(this.scopedContextKeyService);
		this.hasUncommittedChangesContextKey = ActiveSessionContextKeys.HasUncommittedChanges.bindTo(this.scopedContextKeyService);
		this.hasGitHubRemoteContextKey = ActiveSessionContextKeys.HasGitHubRemote.bindTo(this.scopedContextKeyService);
		this.hasPullRequestContextKey = ActiveSessionContextKeys.HasPullRequest.bindTo(this.scopedContextKeyService);
		this.hasOpenPullRequestContextKey = ActiveSessionContextKeys.HasOpenPullRequest.bindTo(this.scopedContextKeyService);

		// Version mode
		this._register(bindContextKey(ChangesContextKeys.VersionMode, this.scopedContextKeyService, reader => {
			return this.viewModel.versionModeObs.read(reader);
		}));

		// View mode
		this._register(bindContextKey(ChangesContextKeys.ViewMode, this.scopedContextKeyService, reader => {
			return this.viewModel.viewModeObs.read(reader);
		}));

		// Set chatSessionType on the view's context key service so ViewTitle menu items
		// can use it in their `when` clauses. Update reactively when the active session
		// changes.
		this._register(bindContextKey(ChatContextKeys.agentSessionType, this.scopedContextKeyService, reader => {
			return this.viewModel.activeSessionTypeObs.read(reader) ?? '';
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

		// Title actions
		this.renderDisposables.add(autorun(reader => {
			this.viewModel.activeSessionResourceObs.read(reader);
			this.updateActions();
		}));

		// Loading
		this.renderDisposables.add(autorun(reader => {
			const isLoading = this.viewModel.activeSessionIsLoadingObs.read(reader);
			if (isLoading) {
				this.changesProgressBar.infinite().show(200);
			} else {
				this.changesProgressBar.stop().hide();
			}
		}));

		// Changes
		const changesObs = derived(reader => {
			const changes = this.viewModel.activeSessionChangesObs.read(reader);
			return toIChangesFileItem(changes);
		});

		// Changes statistics
		const topLevelStats = derived(reader => {
			const entries = changesObs.read(reader);

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
			this._bindContextKeys(topLevelStats);

			const scopedServiceCollection = new ServiceCollection([IContextKeyService, this.scopedContextKeyService]);
			const scopedInstantiationService = this.instantiationService.createChild(scopedServiceCollection);
			this.renderDisposables.add(scopedInstantiationService);

			this.renderDisposables.add(scopedInstantiationService.createInstance(
				ChangesButtonBarWidget, this.actionsContainer, this.viewModel));
		}

		const activeSessionStatusObs = derived(reader => {
			const activeSession = this.sessionManagementService.activeSession.read(reader);
			return activeSession?.status.read(reader);
		});

		// Update visibility and file count badge based on entries
		this.renderDisposables.add(autorun(reader => {
			if (this.viewModel.activeSessionIsLoadingObs.read(reader)) {
				return;
			}

			// Hide the actions toolbar for untitled sessions.
			const activeSessionStatus = activeSessionStatusObs.read(reader);
			if (this.actionsContainer) {
				dom.setVisibility(activeSessionStatus !== undefined && activeSessionStatus !== SessionStatus.Untitled, this.actionsContainer);
			}

			const hasGitRepository = this.viewModel.activeSessionHasGitRepositoryObs.read(reader);
			dom.setVisibility(hasGitRepository, this.filesHeaderNode!);

			const { files } = topLevelStats.read(reader);
			const hasEntries = files > 0;

			dom.setVisibility(hasEntries, this.listContainer!);
			dom.setVisibility(!hasEntries, this.welcomeContainer!);

			if (this.filesCountBadge) {
				this.filesCountBadge.textContent = `${files}`;
				this.filesCountBadge.style.display = '';
			}

			this.layoutSplitView();
		}));

		// Update summary text (line counts only, file count is shown in badge)
		if (this.summaryContainer) {
			dom.clearNode(this.summaryContainer);

			const linesAddedSpan = dom.$('.working-set-lines-added');
			const linesRemovedSpan = dom.$('.working-set-lines-removed');

			this.summaryContainer.appendChild(linesAddedSpan);
			this.summaryContainer.appendChild(linesRemovedSpan);

			this.renderDisposables.add(autorun(reader => {
				if (this.viewModel.activeSessionIsLoadingObs.read(reader)) {
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

			this.renderDisposables.add(tree.onDidOpen((e) => {
				if (!e.element || !isChangesFileItem(e.element)) {
					return;
				}

				logChangesViewFileSelect(this.telemetryService, e.element.changeType);

				const items = changesObs.get();
				this._openFileItem(e.element, items, e.sideBySide, !!e.editorOptions?.preserveFocus, !!e.editorOptions?.pinned, items.length > 1);
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
			const changes = changesObs.read(reader);
			const viewMode = this.viewModel.viewModeObs.read(reader);
			const isLoading = this.viewModel.activeSessionIsLoadingObs.read(reader);

			if (!this.tree || isLoading) {
				return;
			}

			// Toggle list-mode class to remove tree indentation in list mode
			this.listContainer?.classList.toggle('list-mode', viewMode === ChangesViewMode.List);

			if (viewMode === ChangesViewMode.Tree) {
				// Tree mode: build hierarchical tree from file entries
				const treeRootInfo = this.getTreeRootInfo(changes);
				const treeChildren = buildTreeChildren(changes, treeRootInfo);
				this.tree.setChildren(null, treeChildren);
			} else {
				// List mode: flat list of file items
				const listChildren = changes.map(item => ({
					element: item,
					collapsible: false,
				} satisfies IObjectTreeElement<ChangesTreeElement>));
				this.tree.setChildren(null, listChildren);
			}

			this.layoutSplitView();
		}));
	}

	private _bindContextKeys(topLevelStats: IObservable<{ files: number }>): void {
		// Request in progress (can be updated independently since it only affects action enablement, and not visibility)
		this.renderDisposables.add(bindContextKey(ChatContextKeys.requestInProgress, this.scopedContextKeyService, reader => {
			const activeSessionStatus = this.sessionManagementService.activeSession.read(reader)?.status.read(reader);
			return activeSessionStatus !== SessionStatus.Completed && activeSessionStatus !== SessionStatus.Error;
		}));

		// Has changes (can be updated independently since it only affects action enablement, and not visibility)
		this.renderDisposables.add(bindContextKey(ChatContextKeys.hasAgentSessionChanges, this.scopedContextKeyService, reader => {
			const { files } = topLevelStats.read(reader);
			return files > 0;
		}));

		// Bulk update the context keys
		this.renderDisposables.add(autorun(reader => {
			const state = this.viewModel.activeSessionStateObs.read(reader);
			if (!state) {
				return;
			}

			this.scopedContextKeyService.bufferChangeEvents(() => {
				this.isolationModeContextKey.set(state.isolationMode);
				this.hasGitRepositoryContextKey.set(state.hasGitRepository);
				this.isMergeBaseBranchProtectedContextKey.set(state.isMergeBaseBranchProtected === true);
				this.hasGitHubRemoteContextKey.set(state.hasGitHubRemote === true);
				this.hasPullRequestContextKey.set(state.hasPullRequest === true);
				this.hasOpenPullRequestContextKey.set(state.hasOpenPullRequest === true);
				this.hasUpstreamContextKey.set(state.upstreamBranchName !== undefined);
				this.hasIncomingChangesContextKey.set(state.incomingChanges !== undefined && state.incomingChanges > 0);
				this.hasOutgoingChangesContextKey.set(state.outgoingChanges !== undefined && state.outgoingChanges > 0);
				this.hasUncommittedChangesContextKey.set(state.uncommittedChanges !== undefined && state.uncommittedChanges > 0);
			});
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

		let name: string = '';
		let resourceTreeRootUri = workspaceFolderUri;

		if (workspaceFolderUri.scheme === GITHUB_REMOTE_FILE_SCHEME) {
			// Cloud session
			resourceTreeRootUri = URI.from({ scheme: Schemas.copilotPr, path: '/' });
			const segments = workspaceFolderUri.path.split('/').filter(Boolean);
			name = `${segments.slice(0, 2).join('/')} (${decodeURIComponent(segments[2])})`;
		} else {
			// Local session
			const branchName = this.viewModel.activeSessionStateObs.get()?.branchName;
			name = repository.workingDirectory
				? `${basename(repository.uri)} (${branchName})`
				: basename(repository.uri);
		}

		return {
			root: {
				type: 'root',
				uri: workspaceFolderUri,
				name
			},
			resourceTreeRootUri
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

		if (this.tree && this.tree.getNode(null).visibleChildrenCount > 0) {
			this.tree.domFocus();
		}
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

		// "Changes" header
		const headerNode = dom.append(container, $('.changes-sidebar-header'));
		const headerLabel = dom.append(headerNode, $('span'));
		headerLabel.textContent = localize('changes', "Changes");
		const countBadge = disposables.add(new CountBadge(headerNode, { count: items.length }, defaultCountBadgeStyles));
		countBadge.setCount(items.length);

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

		// Layout on resize, accounting for the header height
		disposables.add(onDidLayout(e => {
			const headerHeight = headerNode.offsetHeight;
			tree.layout(Math.max(0, e.height - headerHeight), e.width);
		}));

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
					return repository?.uri.scheme === GITHUB_REMOTE_FILE_SCHEME
						? URI.from({ scheme: Schemas.copilotPr, path: '/' })
						: repository?.workingDirectory ?? repository?.uri;
				})],
			{
				alwaysConsumeMouseWheel: false,
				accessibilityProvider: {
					getAriaLabel: (element: ChangesTreeElement) => isChangesFileItem(element) ? basename(element.uri) : element.name,
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
				sorter: new ChangesTreeSorter(() => this.viewModel.viewModeObs.get()),
				twistieAdditionalCssClass: (e: unknown) => {
					return this.viewModel.viewModeObs.get() === ChangesViewMode.List
						? 'force-no-twistie'
						: undefined;
				},
			}
		));
	}

	async openChanges(): Promise<void> {
		const items = this.viewModel.activeSessionChangesObs.get();
		if (items.length === 0) {
			return;
		}

		const changes = toIChangesFileItem(items);
		await this._openFileItem(changes[0], changes, false, false, false, changes.length > 1);
	}

	private async _openFileItem(item: IChangesFileItem, items: IChangesFileItem[], sideBySide: boolean, preserveFocus: boolean, pinned: boolean, includeSidebar: boolean): Promise<void> {
		const { uri: modifiedFileUri, originalUri, isDeletion } = item;
		const currentIndex = items.indexOf(item);

		const sidebar = includeSidebar ? {
			render: (container: unknown, onDidLayout: Event<{ readonly height: number; readonly width: number }>) => {
				return this.renderSidebarList(container as HTMLElement, onDidLayout, items, this._openFileItem.bind(this));
			}
		} : undefined;

		const navigation = {
			total: items.length,
			current: currentIndex,
			navigate: (index: number) => {
				const target = items[index];
				if (target) {
					this._openFileItem(target, items, false, false, false, includeSidebar);
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

// --- Tree Delegate and Sorter

class ChangesTreeDelegate implements IListVirtualDelegate<ChangesTreeElement> {
	static readonly ROW_HEIGHT = 22;

	getHeight(_element: ChangesTreeElement): number {
		return ChangesTreeDelegate.ROW_HEIGHT;
	}

	getTemplateId(_element: ChangesTreeElement): string {
		return ChangesTreeRenderer.TEMPLATE_ID;
	}
}

class ChangesTreeSorter implements ITreeSorter<ChangesTreeElement> {
	constructor(private readonly viewMode: () => ChangesViewMode) { }

	compare(a: ChangesTreeElement, b: ChangesTreeElement): number {
		if (this.viewMode() === ChangesViewMode.List) {
			// List
			const aPath = (a as IChangesFileItem).uri.fsPath;
			const bPath = (b as IChangesFileItem).uri.fsPath;

			return comparePaths(aPath, bPath);
		}

		// Tree
		const aIsDirectory = ResourceTree.isResourceNode(a);
		const bIsDirectory = ResourceTree.isResourceNode(b);

		if (aIsDirectory !== bIsDirectory) {
			return aIsDirectory ? -1 : 1;
		}

		const aName = ResourceTree.isResourceNode(a)
			? a.name
			: basename((a as IChangesFileItem).uri);
		const bName = ResourceTree.isResourceNode(b)
			? b.name
			: basename((b as IChangesFileItem).uri);

		return compareFileNames(aName, bName);
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
			toggled: ChangesContextKeys.ViewMode.isEqualTo(ChangesViewMode.List),
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
			toggled: ChangesContextKeys.ViewMode.isEqualTo(ChangesViewMode.Tree),
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
				const state = viewModel.activeSessionStateObs.get();
				const branchName = state?.branchName;
				const baseBranchName = state?.baseBranchName;

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
						enabled: viewModel.activeSessionTypeObs.get() === COPILOT_CLOUD_SESSION_TYPE ||
							(viewModel.activeSessionFirstCheckpointRefObs.get() !== undefined &&
								viewModel.activeSessionLastCheckpointRefObs.get() !== undefined),
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
						enabled: viewModel.activeSessionTypeObs.get() === COPILOT_CLOUD_SESSION_TYPE ||
							(viewModel.activeSessionFirstCheckpointRefObs.get() !== undefined &&
								viewModel.activeSessionLastCheckpointRefObs.get() !== undefined),
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
