/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/changesView.css';
import * as dom from '../../../../base/browser/dom.js';
import { ActionViewItem, BaseActionViewItem, IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Schemas } from '../../../../base/common/network.js';
import { renderLabelWithIcons } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { IObjectTreeElement, ITreeSorter } from '../../../../base/browser/ui/tree/tree.js';
import { ActionRunner, IAction, Separator, SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { autorun, derived, derivedObservableWithCache, IObservable, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { CountBadge } from '../../../../base/browser/ui/countBadge/countBadge.js';
import { ProgressBar } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { MenuWorkbenchButtonBar, WorkbenchButtonBar } from '../../../../platform/actions/browser/buttonbar.js';
import { getActionBarActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { MenuId, Action2, MenuItemAction, registerAction2, IMenuService } from '../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider } from '../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { MainEditorAreaVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchCompressibleObjectTree } from '../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
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
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { createFileIconThemableTreeContainerScope } from '../../../../workbench/contrib/files/browser/views/explorerView.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../../workbench/services/editor/common/editorService.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IMultiDiffEditorOptions } from '../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorWidgetImpl.js';
import { getChangesEditorLabels } from './changesEditorLabels.js';
import { ISessionChangesService } from './sessionChangesService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { CIStatusWidget } from './checksWidget.js';
import { SessionFilesWidget } from './sessionFilesWidget.js';
import { SessionFilesViewModel } from './sessionFilesViewModel.js';
import { GITHUB_REMOTE_FILE_SCHEME, ISessionChangesetOperation, SessionChangesetOperationScope, SessionChangesetOperationStatus, SessionStatus } from '../../../services/sessions/common/session.js';
import { isAgentHostProviderId } from '../../../common/agentHostSessionsProvider.js';
import { Orientation } from '../../../../base/browser/ui/sash/sash.js';
import { IView, LayoutPriority, Sizing, SplitView } from '../../../../base/browser/ui/splitview/splitview.js';
import { Color } from '../../../../base/common/color.js';
import { PANEL_SECTION_BORDER } from '../../../../workbench/common/theme.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../workbench/common/editor.js';
import { logChangesViewFileSelect, logChangesViewVersionModeChange, logChangesViewViewModeChange } from '../../../common/sessionsTelemetry.js';
import { ChecksViewModel } from './checksViewModel.js';
import { REVEAL_CI_CHECKS_COMMAND_ID } from './checksActions.js';
// eslint-disable-next-line local/code-import-patterns -- TODO: move skill button constants out of providers
import { AGENT_HOST_SKILL_BUTTON_UPDATE_PR_ID, isAgentHostSkillButtonId } from '../../providers/agentHost/browser/agentHostSkillButtons.js';
import { ActiveSessionContextKeys, CHANGES_VIEW_CONTAINER_ID, CHANGES_VIEW_ID, ChangesContextKeys, ChangesViewMode, IsolationMode, SESSIONS_CHANGES_OPEN_SINGLE_FILE_DIFF_SETTING } from '../common/changes.js';
import { buildTreeChildren, ChangesTreeElement, ChangesTreeRenderer, IChangesFileItem, IChangesTreeRootInfo, isChangesFileItem, toIChangesFileItem } from './changesViewRenderer.js';
import { ResourceTree } from '../../../../base/common/resourceTree.js';
import { compareFileNames, comparePaths } from '../../../../base/common/comparers.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { IChangesViewService } from '../common/changesViewService.js';
import { ChangesSummaryWidget } from './changesSummaryWidget.js';
import { Menus } from '../../../browser/menus.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';

const $ = dom.$;

// --- Constants

const RUN_SESSION_CODE_REVIEW_ACTION_ID = 'sessions.codeReview.run';
const VERSIONS_PICKER_ACTION_ID = 'chatEditing.versionsPicker';
const DIFF_STATS_ACTION_ID = 'workbench.changesView.action.viewChanges';
const DIFF_STATS_LABEL_ACTION_ID = 'workbench.changesView.action.diffStatsLabel';
const EMPTY_FILE_CHANGES_MIN_HEIGHT = 140;

/** Maximum number of file rows the tree pane's minimum size grows to accommodate. */
const TREE_PANE_MIN_SIZE_MAX_ROWS = 13;

/** Breathing room rendered beneath the last file row when the whole list fits. */
const TREE_PANE_LIST_BOTTOM_PADDING = 12;

// --- ButtonBar widget

/**
 * Common surface for the changes action button-bar widgets so hosts (e.g. the
 * editor-title actions bar) can react to and query whether any action rendered.
 */
interface IChangesButtonBarWidget extends IDisposable {
	/** Fires whenever the rendered actions change. */
	readonly onDidChangeActions: Event<void>;
	/** Whether the widget currently renders at least one action. */
	readonly hasActions: boolean;
}

class ChangesMenuWorkbenchButtonBarWidget extends Disposable implements IChangesButtonBarWidget {

	private readonly _onDidChangeActions = this._register(new Emitter<void>());
	readonly onDidChangeActions = this._onDidChangeActions.event;

	private _currentButtonBar: MenuWorkbenchButtonBar | undefined;
	get hasActions(): boolean { return (this._currentButtonBar?.buttons.length ?? 0) > 0; }

	constructor(
		container: HTMLElement,
		hasGitOperationInProgressObs: IObservable<boolean>,
		@IMenuService menuService: IMenuService,
		@IChangesViewService changesViewService: IChangesViewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService
	) {
		super();

		const outgoingChangesObs = derivedObservableWithCache<number | undefined>(this, (reader, lastValue) => {
			const activeSessionState = changesViewService.activeSessionStateObs.read(reader);
			const hasGitOperationInProgress = hasGitOperationInProgressObs.read(reader);
			if (hasGitOperationInProgress) {
				return lastValue;
			}

			return activeSessionState?.outgoingChanges;
		});

		const runningLabelObs = observableValue<string | IMarkdownString | undefined>(this, undefined);

		// Clear the running label override
		this._register(autorun(reader => {
			if (!hasGitOperationInProgressObs.read(reader)) {
				runningLabelObs.set(undefined, undefined);
			}
		}));

		this._register(autorun(reader => {
			const hasGitOperationInProgress = hasGitOperationInProgressObs.read(reader);
			const sessionResource = changesViewService.activeSessionResourceObs.read(reader);
			const outgoingChanges = outgoingChangesObs.read(reader) ?? 0;

			const buttonBar = new MenuWorkbenchButtonBar(
				container,
				MenuId.AgentsChangesToolbar,
				{
					telemetrySource: 'changesView',
					menuOptions: sessionResource
						? { arg: sessionResource }
						: { shouldForwardArgs: true },
					buttonConfigProvider: (action) => this._getButtonConfiguration(action, outgoingChanges, hasGitOperationInProgress, runningLabelObs)
				},
				menuService, contextKeyService, contextMenuService, keybindingService, telemetryService, hoverService
			);

			// Set the running label override
			reader.store.add(buttonBar.onWillRun(e => runningLabelObs.set(e.action.label, undefined)));

			this._currentButtonBar = buttonBar;
			reader.store.add(buttonBar.onDidChange(() => this._onDidChangeActions.fire()));
			this._onDidChangeActions.fire();

			reader.store.add(buttonBar);
		}));
	}

	private _getButtonConfiguration(action: IAction, outgoingChanges: number, hasGitOperationInProgress: boolean, runningLabelObs: IObservable<string | IMarkdownString | undefined>): { showIcon: boolean; showLabel: boolean; isSecondary?: boolean; customLabel?: string | IMarkdownString; customLabelObs?: IObservable<string | IMarkdownString | undefined>; customClass?: string } | undefined {
		if (
			action.id === 'github.copilot.sessions.commit' ||
			action.id === 'github.copilot.chat.createPullRequestCopilotCLIAgentSession.createPR'
		) {
			if (!hasGitOperationInProgress) {
				return { showIcon: true, showLabel: true, isSecondary: false };
			}
			const customLabelObs = derived(reader => {
				const running = runningLabelObs.read(reader);
				return `$(loading) ${running ?? action.label}`;
			});
			return { showIcon: false, showLabel: true, isSecondary: false, customLabelObs };
		}
		if (
			action.id === 'github.copilot.sessions.sync' ||
			action.id === 'github.copilot.sessions.commitAndSync'
		) {
			const labelWithCount = outgoingChanges > 0
				? `${action.label} ${outgoingChanges}↑`
				: `${action.label}`;
			if (!hasGitOperationInProgress) {
				return { showIcon: true, showLabel: true, isSecondary: false, customLabel: labelWithCount };
			}
			return { showIcon: false, showLabel: true, isSecondary: false, customLabel: `$(loading) ${labelWithCount}` };
		}
		if (
			action.id === 'github.copilot.claude.sessions.sync' ||
			action.id === AGENT_HOST_SKILL_BUTTON_UPDATE_PR_ID
		) {
			const customLabel = outgoingChanges > 0
				? `${action.label} ${outgoingChanges}↑`
				: action.label;
			return { customLabel, showIcon: true, showLabel: true, isSecondary: false };
		}
		if (
			action.id === RUN_SESSION_CODE_REVIEW_ACTION_ID ||
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
			action.id === 'github.copilot.claude.sessions.initializeRepository' ||
			action.id === 'github.copilot.claude.sessions.commit' ||
			action.id === 'github.copilot.claude.sessions.commitAndSync' ||
			action.id === 'agentSession.restore' ||
			action.id === 'sessions.action.fixCIChecks' ||
			isAgentHostSkillButtonId(action.id)
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

// --- ButtonBar widget (Agent Host)

class ChangesWorkbenchButtonBarWidget extends Disposable implements IChangesButtonBarWidget {

	private readonly _buttonBar: WorkbenchButtonBar;
	readonly onDidChangeActions: Event<void>;
	get hasActions(): boolean { return this._buttonBar.buttons.length > 0; }

	constructor(
		container: HTMLElement,
		@IMenuService menuService: IMenuService,
		@IChangesViewService changesViewService: IChangesViewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const menu = this._register(menuService.createMenu(MenuId.AgentsChangesToolbar, contextKeyService));

		const buttonBar = this._buttonBar = this._register(instantiationService.createInstance(
			WorkbenchButtonBar,
			container,
			{
				telemetrySource: 'changesView',
				buttonConfigProvider: (_action, index) => {
					return { showIcon: true, showLabel: index === 0 };
				}
			}
		));
		this.onDidChangeActions = Event.signal(buttonBar.onDidChange);

		const menuActionsObs = observableFromEvent(menu.onDidChange, () => {
			return getActionBarActions(menu.getActions({ shouldForwardArgs: true }));
		});

		const operationActionGroupsObs = derived<IAction[][]>(reader => {
			const changeset = changesViewService.activeSessionChangesetObs.read(reader);
			if (!changeset) {
				return [];
			}

			const operations = changesViewService.activeSessionChangesetOperationsObs.read(reader);
			const changesetOperations = operations
				.filter(op => op.scopes.includes(SessionChangesetOperationScope.Changeset));

			const toOperationAction = (op: ISessionChangesetOperation) => toAction({
				id: op.id,
				label: op.icon
					? op.status === SessionChangesetOperationStatus.Running
						? `$(loading) ${op.label}`
						: `$(${op.icon.id}) ${op.label}`
					: op.status === SessionChangesetOperationStatus.Running
						? `$(loading) ${op.label}`
						: op.label,
				tooltip: op.description ?? op.label,
				enabled: op.status !== SessionChangesetOperationStatus.Disabled && op.status !== SessionChangesetOperationStatus.Running,
				run: () => changeset.invokeOperation(op.id),
			});

			// Group the remaining changeset-scoped operations by their
			// group identifier, preserving the order in which groups
			// are first encountered.
			const groups = new Map<string | undefined, IAction[]>();
			for (const op of changesetOperations) {
				// Skip the running operations as they will be handled separately
				if (op.status === SessionChangesetOperationStatus.Running) {
					continue;
				}

				const action = toOperationAction(op);
				const groupActions = groups.get(op.group);
				if (groupActions) {
					groupActions.push(action);
				} else {
					groups.set(op.group, [action]);
				}
			}

			// Running operations are extracted into a dedicated group that appears first
			// so that the running operation acts as the primary action of the dropdown.
			const runningActions = changesetOperations
				.filter(op => op.status === SessionChangesetOperationStatus.Running)
				.map(toOperationAction);

			return [
				...(runningActions.length > 0
					? [runningActions]
					: []),
				...groups.values(),
			];
		});

		this._register(autorun(reader => {
			const isLoading = changesViewService.activeSessionLoadingObs.read(reader);
			if (isLoading) {
				return;
			}

			const operationActionGroups = operationActionGroupsObs.read(reader);
			const menuActions = menuActionsObs.read(reader);

			const primaryActions: IAction[] = [];
			const operationActions = operationActionGroups.flat();

			if (operationActions.length > 1) {
				// The action groups are build so that the
				// running action(s) appear in the first group
				const primaryAction = operationActions[0];

				// Join the groups with separators to
				// visually separate related operations.
				const dropdownActions: IAction[] = [];
				for (const group of operationActionGroups) {
					if (dropdownActions.length > 0) {
						dropdownActions.push(new Separator());
					}
					dropdownActions.push(...group);
				}

				primaryActions.push(new SubmenuAction('changesView.operations.primary.dropdown', primaryAction.label, dropdownActions));
			} else {
				primaryActions.push(...operationActions);
			}

			primaryActions.push(...menuActions.primary);
			buttonBar.update(primaryActions, menuActions.secondary);
		}));
	}
}

/**
 * Renders the session changes action button-bar (e.g. "Create Pull Request") into
 * a container, choosing the agent-host or git variant based on the active session.
 * Used to host the actions in the single-pane Changes editor header.
 */
export class ChangesActionsBar extends Disposable {
	constructor(
		container: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChangesViewService changesViewService: IChangesViewService,
		@ISessionsService sessionsService: ISessionsService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		container.classList.add('changes-actions-bar');

		const hasGitOperationInProgressGlobalObs = observableFromEvent(contextKeyService.onDidChangeContext, () =>
			contextKeyService.getContextKeyValue('sessions.hasGitOperationInProgress') === true);
		const hasGitOperationInProgressObs = derived(reader => {
			if (hasGitOperationInProgressGlobalObs.read(reader)) {
				return true;
			}
			return changesViewService.activeSessionStateObs.read(reader)?.hasGitOperationInProgress === true;
		});

		const isAgentHostSessionObs = derived(reader => {
			const activeSession = sessionsService.activeSession.read(reader);
			return activeSession ? isAgentHostProviderId(activeSession.providerId) : false;
		});

		let currentWidget: IChangesButtonBarWidget | undefined;
		const updateVisibility = () => {
			const status = sessionsService.activeSession.get()?.status.get();
			const visible = status !== SessionStatus.Untitled && (currentWidget?.hasActions ?? false);
			dom.setVisibility(visible, container);
		};

		this._register(autorun(reader => {
			dom.clearNode(container);

			const widget = isAgentHostSessionObs.read(reader)
				? instantiationService.createInstance(ChangesWorkbenchButtonBarWidget, container)
				: instantiationService.createInstance(ChangesMenuWorkbenchButtonBarWidget, container, hasGitOperationInProgressObs);
			reader.store.add(widget);
			currentWidget = widget;
			reader.store.add(widget.onDidChangeActions(() => updateVisibility()));
			updateVisibility();
		}));

		this._register(autorun(reader => {
			sessionsService.activeSession.read(reader)?.status.read(reader);
			updateVisibility();
		}));
	}

}

// --- Editor header menus (single-pane): the Changes editor declares
// Menus.SessionsEditorHeaderPrimary (Branch Changes picker + diff stats, left) and
// Menus.SessionsEditorHeaderSecondary (diff/code-review/view-mode actions, right), and
// the editor group renders them. The Create Pull Request bar (ChangesActionsBar) is
// hosted in the editor tabs title (Menus.SessionsEditorTitle); its custom action view
// item is provided by the Changes editor pane (SessionChangesEditor.getActionViewItem).
// The custom action view items below are registered globally by menu id so the
// header toolbars render them.

export const CHANGES_HEADER_ACTIONS_ID = 'workbench.changesView.headerActions';

/** Renders the {@link ChangesActionsBar} widget as the Create Pull Request editor tabs title action item. */
export class ChangesActionsBarActionViewItem extends BaseActionViewItem {
	constructor(
		action: IAction,
		options: IActionViewItemOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(undefined, action, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this._register(this.instantiationService.createInstance(ChangesActionsBar, container));
	}
}

/** Registers the Changes editor-header action view items keyed by the editor-header menu ids. */
class ChangesEditorHeaderContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.changesEditorHeader';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
	) {
		super();

		const onDidRegister = this._register(new Emitter<void>());

		this._register(actionViewItemService.register(Menus.SessionsEditorHeaderPrimary, VERSIONS_PICKER_ACTION_ID, (action, _options, instantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(ChangesPickerActionItem, action);
		}, onDidRegister.event));

		// Editor area VISIBLE: non-interactive "N files +X -Y" label.
		this._register(actionViewItemService.register(Menus.SessionsEditorHeaderPrimary, DIFF_STATS_LABEL_ACTION_ID, (action, options, instantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(SinglePaneChangesDiffStatsActionItem, action, options);
		}, onDidRegister.event));

		// Editor area CLOSED: interactive diff-stats (classic Changes view header action)
		// that opens the Changes editor on click.
		this._register(actionViewItemService.register(Menus.SessionsEditorHeaderPrimary, DIFF_STATS_ACTION_ID, (action, options, instantiationService) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(ChangesDiffStatsActionItem, action, options);
		}, onDidRegister.event));

		onDidRegister.fire();
	}
}
registerWorkbenchContribution2(ChangesEditorHeaderContribution.ID, ChangesEditorHeaderContribution, WorkbenchPhase.BlockRestore);

// --- View Pane

export class ChangesViewPane extends ViewPane {

	private bodyContainer: HTMLElement | undefined;
	private welcomeContainer: HTMLElement | undefined;
	private filesHeaderNode: HTMLElement | undefined;
	private fileHeaderToolbarContainer: HTMLElement | undefined;
	private contentContainer: HTMLElement | undefined;
	private listContainer: HTMLElement | undefined;
	// Actions container is positioned outside the card for this layout experiment
	private actionsContainer: HTMLElement | undefined;

	private changesProgressBar!: ProgressBar;
	private tree: WorkbenchCompressibleObjectTree<ChangesTreeElement> | undefined;
	private ciStatusWidget: CIStatusWidget | undefined;
	private sessionFilesWidget: SessionFilesWidget | undefined;
	private splitView: SplitView | undefined;
	private splitViewContainer: HTMLElement | undefined;
	private readonly treePaneSizeChange = this._register(new Emitter<number | undefined>());

	/** Computes the CI pane's default height (content, capped to a third of the split). */
	private computeCIPreferredHeight: (() => number) | undefined;
	/** Once the user drags a sash we stop imposing the CI pane's default height. */
	private ciPaneUserResized = false;

	private readonly isMergeBaseBranchProtectedContextKey: IContextKey<boolean>;
	private readonly isolationModeContextKey: IContextKey<IsolationMode>;
	private readonly hasGitRepositoryContextKey: IContextKey<boolean>;
	private readonly hasUpstreamContextKey: IContextKey<boolean>;
	private readonly hasIncomingChangesContextKey: IContextKey<boolean>;
	private readonly hasOutgoingChangesContextKey: IContextKey<boolean>;
	private readonly hasUncommittedChangesContextKey: IContextKey<boolean>;
	private readonly hasBranchChangesContextKey: IContextKey<boolean>;
	private readonly hasGitHubRemoteContextKey: IContextKey<boolean>;
	private readonly hasPullRequestContextKey: IContextKey<boolean>;
	private readonly hasOpenPullRequestContextKey: IContextKey<boolean>;
	private readonly hasGitOperationInProgressContextKey: IContextKey<boolean>;

	private readonly hasGitOperationInProgressObs: IObservable<boolean>;
	private readonly scopedInstantiationService: IInstantiationService;

	private readonly renderDisposables = this._register(new DisposableStore());

	// Track current body dimensions for list layout
	private currentBodyHeight = 0;
	private currentBodyWidth = 0;

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
		@IChangesViewService private readonly changesViewService: IChangesViewService,
		@IEditorService private readonly editorService: IEditorService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ILabelService private readonly labelService: ILabelService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ISessionChangesService private readonly sessionChangesService: ISessionChangesService,
		@IWorkbenchLayoutService private readonly workbenchLayoutService: IWorkbenchLayoutService,
	) {
		super({ ...options, titleMenuId: MenuId.ChatEditingSessionTitleToolbar }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		// Context keys
		this.isMergeBaseBranchProtectedContextKey = ActiveSessionContextKeys.IsMergeBaseBranchProtected.bindTo(this.scopedContextKeyService);
		this.isolationModeContextKey = ActiveSessionContextKeys.IsolationMode.bindTo(this.scopedContextKeyService);
		this.hasGitRepositoryContextKey = ActiveSessionContextKeys.HasGitRepository.bindTo(this.scopedContextKeyService);
		this.hasUpstreamContextKey = ActiveSessionContextKeys.HasUpstream.bindTo(this.scopedContextKeyService);
		this.hasIncomingChangesContextKey = ActiveSessionContextKeys.HasIncomingChanges.bindTo(this.scopedContextKeyService);
		this.hasOutgoingChangesContextKey = ActiveSessionContextKeys.HasOutgoingChanges.bindTo(this.scopedContextKeyService);
		this.hasUncommittedChangesContextKey = ActiveSessionContextKeys.HasUncommittedChanges.bindTo(this.scopedContextKeyService);
		this.hasBranchChangesContextKey = ActiveSessionContextKeys.HasBranchChanges.bindTo(this.scopedContextKeyService);
		this.hasGitHubRemoteContextKey = ActiveSessionContextKeys.HasGitHubRemote.bindTo(this.scopedContextKeyService);
		this.hasPullRequestContextKey = ActiveSessionContextKeys.HasPullRequest.bindTo(this.scopedContextKeyService);
		this.hasOpenPullRequestContextKey = ActiveSessionContextKeys.HasOpenPullRequest.bindTo(this.scopedContextKeyService);
		this.hasGitOperationInProgressContextKey = ActiveSessionContextKeys.HasGitOperationInProgress.bindTo(this.scopedContextKeyService);

		// Version mode
		this._register(bindContextKey(ChangesContextKeys.VersionMode, this.scopedContextKeyService, reader => {
			return this.changesViewService.activeSessionChangesetObs.read(reader)?.id ?? '';
		}));

		// View mode
		this._register(bindContextKey(ChangesContextKeys.ViewMode, this.scopedContextKeyService, reader => {
			return this.changesViewService.viewModeObs.read(reader);
		}));

		// Set chatSessionType on the view's context key service so ViewTitle menu items
		// can use it in their `when` clauses. Update reactively when the active session
		// changes.
		this._register(bindContextKey(ChatContextKeys.agentSessionType, this.scopedContextKeyService, reader => {
			return this.changesViewService.activeSessionTypeObs.read(reader) ?? '';
		}));

		// Git operation in progress set in the global context key service by the extension
		const hasGitOperationInProgressGlobalContextObs = observableFromEvent(this.contextKeyService.onDidChangeContext, () => {
			return this.contextKeyService.getContextKeyValue('sessions.hasGitOperationInProgress') === true;
		});

		// Git operation in progress set in the session state
		const hasGitOperationInProgressStateObs = derived(reader => {
			const activeSessionState = this.changesViewService.activeSessionStateObs.read(reader);
			return activeSessionState?.hasGitOperationInProgress === true;
		});

		this.hasGitOperationInProgressObs = derived(reader => {
			const hasGitOperationInProgressGlobalContext = hasGitOperationInProgressGlobalContextObs.read(reader);
			const hasGitOperationInProgressState = hasGitOperationInProgressStateObs.read(reader);

			// The global context key service is being set as soon as the command starts
			// so we need to prefer it first before falling back to the session state.
			const contextKeyValue = hasGitOperationInProgressGlobalContext === true
				? hasGitOperationInProgressGlobalContext
				: hasGitOperationInProgressState;

			// Propagate global context service value to the scoped context key service
			// as the scoped context key service is what it is being used in the view
			this.hasGitOperationInProgressContextKey.set(contextKeyValue);

			return contextKeyValue;
		});

		const scopedServiceCollection = new ServiceCollection([IContextKeyService, this.scopedContextKeyService]);
		this.scopedInstantiationService = this.instantiationService.createChild(scopedServiceCollection);
		this._register(this.scopedInstantiationService);
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

		// Files header (Branch Changes dropdown + diff stats). In the single-pane
		// redesign these live in the custom Changes editor instead, so the panel
		// omits its header; otherwise (original layout) the header is shown here.
		this.createFilesHeader(this.contentContainer);

		// Changes card progress bar
		const progressContainer = dom.append(this.contentContainer, $('.changes-progress'));
		this.changesProgressBar = this._register(new ProgressBar(progressContainer, defaultProgressBarStyles));
		this.changesProgressBar.stop().hide();

		// List container
		this.listContainer = dom.append(this.contentContainer, $('.changes-file-list'));

		// Welcome message for empty state (hidden by default, shown when no changes)
		this.welcomeContainer = dom.append(this.contentContainer, $('.changes-welcome'));
		this.welcomeContainer.style.display = 'none';

		const welcomeMessage = dom.append(this.welcomeContainer, $('.changes-welcome-message'));
		welcomeMessage.textContent = localize('changesView.noChanges', "Changed files and other session artifacts will appear here.");

		// Other Files widget - middle pane (files edited outside the workspace)
		this.sessionFilesWidget = this._register(this.scopedInstantiationService.createInstance(SessionFilesWidget, this.splitViewContainer));

		// CI Status widget — bottom pane
		this.ciStatusWidget = this._register(this.scopedInstantiationService.createInstance(CIStatusWidget, this.splitViewContainer));

		// Create SplitView
		this.splitView = this._register(new SplitView(this.splitViewContainer, {
			orientation: Orientation.VERTICAL,
			proportionalLayout: false,
		}));

		// Shared constants for pane sizing
		const ciMinHeight = CIStatusWidget.HEADER_HEIGHT + CIStatusWidget.MIN_BODY_HEIGHT;
		const sessionFilesMinHeight = SessionFilesWidget.HEADER_HEIGHT + SessionFilesWidget.MIN_BODY_HEIGHT;
		const getSessionFilesContentHeight = () => Math.max(SessionFilesWidget.HEADER_HEIGHT, this.sessionFilesWidget?.desiredHeight ?? 0);
		const getSessionFilesMinimumHeight = () => this.sessionFilesWidget?.collapsed ? SessionFilesWidget.HEADER_HEIGHT : Math.min(sessionFilesMinHeight, getSessionFilesContentHeight());
		const getSessionFilesPreferredHeight = () => Math.max(getSessionFilesMinimumHeight(), SessionFilesWidget.HEADER_HEIGHT + SessionFilesWidget.PREFERRED_BODY_HEIGHT);
		const getCIContentHeight = () => Math.max(CIStatusWidget.HEADER_HEIGHT, this.ciStatusWidget?.desiredHeight ?? 0);
		const getCIMinimumHeight = () => this.ciStatusWidget?.collapsed ? CIStatusWidget.HEADER_HEIGHT : Math.min(ciMinHeight, getCIContentHeight());
		// Preferred default size for the CI pane: content height, capped to a third of the split.
		const getCIPreferredHeight = () => {
			const contentHeight = getCIContentHeight();
			if (this.ciStatusWidget?.collapsed) {
				return CIStatusWidget.HEADER_HEIGHT;
			}
			const availableHeight = this.getSplitViewAvailableHeight();
			if (availableHeight > 0) {
				return Math.max(getCIMinimumHeight(), Math.min(contentHeight, Math.round(availableHeight / 3)));
			}
			return contentHeight;
		};
		this.computeCIPreferredHeight = getCIPreferredHeight;
		const thisView = this;

		// Top pane: file tree
		const treePane: IView = {
			element: this.contentContainer,
			get minimumSize() { return thisView.getTreePaneMinimumSize(); },
			get maximumSize() { return thisView.getTreePaneMaximumSize(); },
			onDidChange: this.treePaneSizeChange.event,
			layout: (height) => {
				this.contentContainer!.style.height = `${height}px`;
				this._layoutTreeInPane(height);
			},
		};

		// Middle pane: other files
		const sessionFilesElement = this.sessionFilesWidget.element;
		const sessionFilesWidget = this.sessionFilesWidget;
		const sessionFilesPane: IView = {
			element: sessionFilesElement,
			get minimumSize() { return getSessionFilesMinimumHeight(); },
			get maximumSize() { return sessionFilesWidget.collapsed ? SessionFilesWidget.HEADER_HEIGHT : Number.POSITIVE_INFINITY; },
			priority: LayoutPriority.High,
			onDidChange: Event.map(this.sessionFilesWidget.onDidChangeHeight, () => undefined),
			layout: (height) => {
				sessionFilesElement.style.height = `${height}px`;
				const bodyHeight = Math.max(0, height - SessionFilesWidget.HEADER_HEIGHT);
				sessionFilesWidget.layout(bodyHeight);
			},
		};

		// Bottom pane: CI checks
		const ciElement = this.ciStatusWidget.element;
		const ciWidget = this.ciStatusWidget;
		const ciPane: IView = {
			element: ciElement,
			get minimumSize() { return getCIMinimumHeight(); },
			get maximumSize() { return ciWidget.collapsed ? CIStatusWidget.HEADER_HEIGHT : getCIContentHeight(); },
			priority: LayoutPriority.Low,
			onDidChange: Event.map(this.ciStatusWidget.onDidChangeHeight, () => getCIContentHeight()),
			layout: (height) => {
				ciElement.style.height = `${height}px`;
				const bodyHeight = Math.max(0, height - CIStatusWidget.HEADER_HEIGHT);
				ciWidget.layout(bodyHeight);
			},
		};

		this.splitView.addView(treePane, Sizing.Distribute, 0, true);
		this.splitView.addView(sessionFilesPane, SessionFilesWidget.HEADER_HEIGHT + SessionFilesWidget.PREFERRED_BODY_HEIGHT, 1, true);
		this.splitView.addView(ciPane, CIStatusWidget.HEADER_HEIGHT + CIStatusWidget.PREFERRED_BODY_HEIGHT, 2, true);

		// Style the sash as a visible separator between sections
		const updateSplitViewStyles = () => {
			const borderColor = this.themeService.getColorTheme().getColor(PANEL_SECTION_BORDER);
			this.splitView!.style({ separatorBorder: borderColor ?? Color.transparent });
		};
		updateSplitViewStyles();
		this._register(this.themeService.onDidColorThemeChange(updateSplitViewStyles));

		// A manual sash drag hands layout control to the user: stop imposing the CI default size.
		this._register(this.splitView.onDidSashChange(() => { this.ciPaneUserResized = true; }));

		// Initially hide the other files and CI panes until content arrives
		this.splitView.setViewVisible(1, false);
		this.splitView.setViewVisible(2, false);

		// Other files pane (index 1)
		this._wireSectionPane(this.sessionFilesWidget, 1, SessionFilesWidget.HEADER_HEIGHT, getSessionFilesPreferredHeight);
		this._register(this.sessionFilesWidget.onDidChangeHeight(() => this.fireTreePaneSizeChange()));

		// CI checks pane (index 2)
		this._wireSectionPane(this.ciStatusWidget, 2, CIStatusWidget.HEADER_HEIGHT, getCIPreferredHeight, () => { this.ciPaneUserResized = false; });

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
		return this.changesViewService.activeSessionResourceObs.get();
	}

	private onVisible(): void {
		this.renderDisposables.clear();

		// Title actions
		this.renderDisposables.add(autorun(reader => {
			this.changesViewService.activeSessionResourceObs.read(reader);
			this.updateActions();
		}));

		// Loading
		this.renderDisposables.add(autorun(reader => {
			const isLoading = this.changesViewService.activeSessionChangesetLoadingObs.read(reader);
			if (isLoading) {
				this.changesProgressBar.infinite().show(200);
			} else {
				this.changesProgressBar.stop().hide();
			}
		}));

		// Changes
		const changesObs = derived(reader => {
			const changes = this.changesViewService.activeSessionChangesObs.read(reader);
			return toIChangesFileItem(changes);
		});

		// Changes statistics
		const topLevelStats = derivedObservableWithCache<{ files: number; added: number; removed: number } | undefined>(this, (reader, lastValue) => {
			const isLoading = this.changesViewService.activeSessionChangesetLoadingObs.read(reader);
			if (isLoading) {
				return lastValue;
			}

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
			// Bind context keys
			this._bindContextKeys(topLevelStats);

			// In the single-pane redesign the Create PR actions render in the Changes
			// editor header instead of the detail panel.
			this.createActionsButtonBar();
		}

		const activeSessionStatusObs = derived(reader => {
			const activeSession = this.sessionsService.activeSession.read(reader);
			return activeSession?.status.read(reader);
		});

		// Update visibility based on entries
		this.renderDisposables.add(autorun(reader => {
			if (this.changesViewService.activeSessionLoadingObs.read(reader)) {
				return;
			}

			// Hide the actions toolbar for untitled sessions.
			const activeSessionStatus = activeSessionStatusObs.read(reader);
			const isUntitled = activeSessionStatus === SessionStatus.Untitled;
			if (this.actionsContainer) {
				dom.setVisibility(this.isActionsContainerVisible(isUntitled), this.actionsContainer);
			}

			const stats = topLevelStats.read(reader);
			const hasEntries = stats !== undefined && stats.files > 0;

			// Files header visibility (original layout only; absent in single-pane redesign).
			if (this.filesHeaderNode) {
				const hasGitRepository = this.changesViewService.activeSessionHasGitRepositoryObs.read(reader);
				dom.setVisibility(!isUntitled && (hasGitRepository || hasEntries), this.filesHeaderNode);
			}
			if (this.fileHeaderToolbarContainer) {
				dom.setVisibility(hasEntries, this.fileHeaderToolbarContainer);
			}

			dom.setVisibility(hasEntries, this.listContainer!);
			dom.setVisibility(!hasEntries, this.welcomeContainer!);

			this.fireTreePaneSizeChange();
			this.layoutSplitView();
		}));

		// Create the tree
		if (!this.tree && this.listContainer) {
			this.tree = this.createChangesTree(this.listContainer, this.onDidChangeBodyVisibility, this._store);
		}

		// Register tree event handlers
		if (this.tree) {
			const tree = this.tree;

			// Re-layout when tree content changes so the card height adjusts
			this.renderDisposables.add(tree.onDidChangeContentHeight(() => {
				this.fireTreePaneSizeChange();
				this.layoutSplitView();
			}));

			this.renderDisposables.add(tree.onDidOpen((e) => {
				if (!e.element || !isChangesFileItem(e.element)) {
					return;
				}

				logChangesViewFileSelect(this.telemetryService, e.element.changeType);

				if (this.shouldOpenModalDiff()) {
					const items = changesObs.get();
					this._openFileItem(e.element, items, e.sideBySide, !!e.editorOptions?.preserveFocus, !!e.editorOptions?.pinned, items.length > 1);
					return;
				}

				if (this.shouldRevealFileInMultiDiffEditor()) {
					void this._openMultiFileDiffEditor(e.element.uri);
					return;
				}

				// Holding Alt inverts the configured single/multi file diff behavior.
				const altKey = !!(e.browserEvent as MouseEvent | KeyboardEvent | undefined)?.altKey;
				const openSingleFileDiff = this.configurationService.getValue<boolean>(SESSIONS_CHANGES_OPEN_SINGLE_FILE_DIFF_SETTING) !== altKey;
				if (openSingleFileDiff) {
					// Alt here only switches the diff mode, not the target group.
					const sideBySide = e.sideBySide && !altKey;
					void this._openSingleFileDiffEditor(e.element, sideBySide, !!e.editorOptions?.preserveFocus, !!e.editorOptions?.pinned);
					return;
				}

				// Open multi-file diff editor
				void this._openMultiFileDiffEditor(e.element.uri);
			}));
		}

		// Checks
		if (this.ciStatusWidget) {
			const checksViewModel = this.scopedInstantiationService.createInstance(ChecksViewModel);
			this.renderDisposables.add(checksViewModel);

			this.renderDisposables.add(this.ciStatusWidget.setInput(checksViewModel));
		}

		// Other files (files edited outside the workspace during the session)
		if (this.sessionFilesWidget) {
			const sessionFilesViewModel = this.scopedInstantiationService.createInstance(SessionFilesViewModel);
			this.renderDisposables.add(sessionFilesViewModel);

			this.renderDisposables.add(this.sessionFilesWidget.setInput(sessionFilesViewModel));
		}

		// Update tree data with combined entries
		this.renderDisposables.add(autorun(reader => {
			const changes = changesObs.read(reader);
			const viewMode = this.changesViewService.viewModeObs.read(reader);
			const changesetLoading = this.changesViewService.activeSessionChangesetLoadingObs.read(reader);

			// Read session state so this autorun re-runs when git state (e.g. branch
			// name) arrives asynchronously, since the tree root label depends on it.
			this.changesViewService.activeSessionStateObs.read(reader);

			if (!this.tree || changesetLoading) {
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

			this.fireTreePaneSizeChange();
			this.layoutSplitView();
		}));
	}

	private _bindContextKeys(topLevelStats: IObservable<{ files: number } | undefined>): void {
		// Request in progress (can be updated independently since it only affects action enablement, and not visibility)
		this.renderDisposables.add(bindContextKey(ChatContextKeys.requestInProgress, this.scopedContextKeyService, reader => {
			const activeSessionStatus = this.sessionsService.activeSession.read(reader)?.status.read(reader);
			return activeSessionStatus !== SessionStatus.Completed && activeSessionStatus !== SessionStatus.Error;
		}));

		// Has changes (can be updated independently since it only affects action enablement, and not visibility)
		this.renderDisposables.add(bindContextKey(ChatContextKeys.hasAgentSessionChanges, this.scopedContextKeyService, reader => {
			const stats = topLevelStats.read(reader);
			return stats !== undefined && stats.files > 0;
		}));

		// Bulk update the context keys
		this.renderDisposables.add(autorun(reader => {
			const state = this.changesViewService.activeSessionStateObs.read(reader);
			if (!state || state.hasGitOperationInProgress) {
				return;
			}

			this.logService.info(`[ChangesViewPane][_bindContextKeys] Context keys: ${JSON.stringify(state)}`);

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
				this.hasBranchChangesContextKey.set(state.hasBranchChanges === true);
				this.hasGitOperationInProgressContextKey.set(state.hasGitOperationInProgress === true);
			});
		}));
	}

	/** Layout the tree within its SplitView pane. */
	private _layoutTreeInPane(paneHeight: number): void {
		if (!this.tree) {
			return;
		}

		// Subtract the files header height (present in the original layout only).
		const filesHeaderHeight = this.filesHeaderNode?.offsetHeight ?? 0;
		const treeHeight = Math.max(0, paneHeight - filesHeaderHeight);
		this.tree.layout(treeHeight, this.currentBodyWidth);
		this.tree.getHTMLElement().style.height = `${treeHeight}px`;
	}

	private getTreePaneMinimumSize(): number {
		if (this.listContainer?.style.display === 'none') {
			return EMPTY_FILE_CHANGES_MIN_HEIGHT;
		}

		// Grow the minimum size to fit the file list (capped at TREE_PANE_MIN_SIZE_MAX_ROWS rows) plus header chrome.
		const filesHeaderHeight = this.filesHeaderNode?.offsetHeight ?? 0;
		const treeContentHeight = this.tree?.contentHeight ?? 0;
		const maxRowsHeight = TREE_PANE_MIN_SIZE_MAX_ROWS * ChangesTreeDelegate.ROW_HEIGHT;
		const cappedContentHeight = Math.min(treeContentHeight, maxRowsHeight);
		const bottomPadding = treeContentHeight <= maxRowsHeight ? TREE_PANE_LIST_BOTTOM_PADDING : 0;

		return Math.max(EMPTY_FILE_CHANGES_MIN_HEIGHT, filesHeaderHeight + cappedContentHeight + bottomPadding);
	}

	private getTreePaneMaximumSize(): number {
		if (!this.sessionFilesWidget?.visible || this.sessionFilesWidget.collapsed) {
			return Number.POSITIVE_INFINITY;
		}

		const filesHeaderHeight = this.filesHeaderNode?.offsetHeight ?? 0;
		const treeContentHeight = this.listContainer?.style.display === 'none' ? 0 : this.tree?.contentHeight ?? 0;
		const bottomPadding = treeContentHeight > 0 ? TREE_PANE_LIST_BOTTOM_PADDING : 0;
		return Math.max(this.getTreePaneMinimumSize(), filesHeaderHeight + treeContentHeight + bottomPadding);
	}

	private fireTreePaneSizeChange(): void {
		this.treePaneSizeChange.fire(undefined);
	}

	/** Compute the height available to the SplitView within the body. */
	private getSplitViewAvailableHeight(): number {
		const bodyHeight = this.currentBodyHeight;
		if (bodyHeight <= 0) {
			return 0;
		}
		const bodyPadding = 16; // 8px top + 8px bottom from .changes-view-body
		const actionsHeight = this.actionsContainer?.offsetHeight ?? 0;
		const actionsMargin = actionsHeight > 0 ? 8 : 0;
		return Math.max(0, bodyHeight - bodyPadding - actionsHeight - actionsMargin);
	}

	/** Layout the SplitView to fill available body space. */
	private layoutSplitView(): void {
		if (!this.splitView || !this.splitViewContainer) {
			return;
		}
		const availableHeight = this.getSplitViewAvailableHeight();
		if (availableHeight <= 0) {
			return;
		}
		this.splitViewContainer.style.height = `${availableHeight}px`;
		this.splitView.layout(availableHeight);
		this.applyCIDefaultSize();
	}

	/**
	 * Re-assert the CI pane's default height (capped to a third of the split) after layout.
	 * This is where the split height is reliably known — the preferred height can otherwise be
	 * evaluated during wiring when the body height is still 0, yielding an uncapped fallback.
	 * Once the user drags a sash we back off and preserve their chosen size.
	 */
	private applyCIDefaultSize(): void {
		if (!this.splitView || this.ciPaneUserResized || !this.computeCIPreferredHeight) {
			return;
		}
		if (!this.ciStatusWidget?.visible || this.ciStatusWidget.collapsed) {
			return;
		}
		const preferred = this.computeCIPreferredHeight();
		if (this.splitView.getViewSize(2) !== preferred) {
			this.splitView.resizeView(2, preferred);
		}
	}

	/**
	 * Wires a collapsible section widget (CI checks / other files) to its
	 * SplitView pane: toggling its header collapses/restores the pane, and
	 * changes to its content show/hide the pane and re-layout. Both section
	 * widgets share the same structural contract so this logic is reused.
	 */
	private _wireSectionPane(
		widget: { readonly collapsed: boolean; readonly visible: boolean; readonly onDidToggleCollapsed: Event<boolean>; readonly onDidChangeHeight: Event<void> },
		paneIndex: number,
		headerHeight: number,
		getPreferredHeight: () => number,
		onDidBecomeVisible?: () => void,
	): void {
		let savedPaneHeight = getPreferredHeight();

		this._register(widget.onDidToggleCollapsed(collapsed => {
			if (!this.splitView) {
				return;
			}
			if (collapsed) {
				// Save current size before collapsing
				const currentSize = this.splitView.getViewSize(paneIndex);
				if (currentSize > headerHeight) {
					savedPaneHeight = currentSize;
				}
				this.splitView.resizeView(paneIndex, headerHeight);
			} else {
				// Restore saved size on expand
				this.splitView.resizeView(paneIndex, savedPaneHeight);
			}
			this.layoutSplitView();
		}));

		this._register(widget.onDidChangeHeight(() => {
			if (!this.splitView) {
				return;
			}
			const visible = widget.visible;
			const isCurrentlyVisible = this.splitView.isViewVisible(paneIndex);
			if (visible !== isCurrentlyVisible) {
				this.splitView.setViewVisible(paneIndex, visible);
				if (visible && !widget.collapsed) {
					onDidBecomeVisible?.();
					savedPaneHeight = getPreferredHeight();
					this.splitView.resizeView(paneIndex, savedPaneHeight);
				}
			}
			this.layoutSplitView();
		}));
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
		// - workingDirectory: location of the worktree
		const activeSession = this.sessionsService.activeSession.get();
		const folder = activeSession?.workspace.get()?.folders[0];
		const workspaceFolderUri = folder?.workingDirectory;
		if (!folder?.root || !workspaceFolderUri) {
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
			const branchName = this.changesViewService.activeSessionStateObs.get()?.branchName;
			name = branchName
				? `${basename(folder.workingDirectory)} (${branchName})`
				: basename(folder.workingDirectory);
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
		const changeset = this.changesViewService.activeSessionChangesetObs.get();
		return changeset?.originalCheckpointRef.get() ?? '';
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
		contextKeyService: IContextKeyService,
		items: IChangesFileItem[],
		openFileItem: (item: IChangesFileItem, items: IChangesFileItem[], sideBySide: boolean, preserveFocus: boolean, pinned: boolean, includeSidebar: boolean) => void,
	): IDisposable {
		const disposables = new DisposableStore();

		container.classList.add('changes-file-list');

		const viewMode = this.changesViewService.viewModeObs.get();
		container.classList.toggle('list-mode', viewMode === ChangesViewMode.List);

		// "Changes" header
		const headerNode = dom.append(container, $('.changes-sidebar-header'));
		const headerLabel = dom.append(headerNode, $('span'));
		headerLabel.textContent = localize('changes', "Changes");
		const countBadge = disposables.add(new CountBadge(headerNode, { count: items.length }, defaultCountBadgeStyles));
		countBadge.setCount(items.length);

		const tree = this.createChangesTree(container, Event.None, disposables, () => tree.getSelection().filter(item => !!item && isChangesFileItem(item)), contextKeyService);

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
		contextKeyService?: IContextKeyService,
	): WorkbenchCompressibleObjectTree<ChangesTreeElement> {
		// When a scoped context key service is provided (e.g. when rendering into
		// the modal editor sidebar), create the tree with an instantiation service
		// that uses it so the tree's context descends from the modal. This keeps
		// modal-level context keys (e.g. `editorPartModal`) active while the tree
		// has focus.
		const treeInstantiationService = contextKeyService
			? disposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])))
			: this.instantiationService;

		const resourceLabels = disposables.add(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility }));
		const actionRunner = disposables.add(new ChangesViewActionRunner(
			() => this.changesViewService.activeSessionResourceObs.get(),
			() => this.getSessionDiscardRef(),
			getSelection ?? (() => this.getTreeSelection()),
		));
		return disposables.add(treeInstantiationService.createInstance(
			WorkbenchCompressibleObjectTree<ChangesTreeElement>,
			'ChangesViewTree',
			container,
			new ChangesTreeDelegate(),
			[this.instantiationService.createInstance(ChangesTreeRenderer, resourceLabels, actionRunner,
				() => {
					// Pass in the tree root to be used to compute the label description
					const activeSession = this.sessionsService.activeSession.get();
					const folder = activeSession?.workspace.get()?.folders[0];
					return folder?.root.scheme === GITHUB_REMOTE_FILE_SCHEME
						? URI.from({ scheme: Schemas.copilotPr, path: '/' })
						: folder?.workingDirectory;
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
				indent: this.changesViewService.viewModeObs.get() === ChangesViewMode.List ? 0 : 8,
				compressionEnabled: true,
				sorter: new ChangesTreeSorter(() => this.changesViewService.viewModeObs.get()),
				twistieAdditionalCssClass: (e: unknown) => {
					return this.changesViewService.viewModeObs.get() === ChangesViewMode.List
						? 'force-no-twistie'
						: undefined;
				},
			}
		));
	}

	async openChanges(resource?: URI): Promise<void> {
		const items = this.changesViewService.activeSessionChangesObs.get();
		if (items.length === 0) {
			return;
		}

		if (this.shouldOpenModalDiff()) {
			const changes = toIChangesFileItem(items);
			const changeToOpen = resource ? changes.find(c => isEqual(c.uri, resource)) : undefined;
			await this._openFileItem(changeToOpen ?? changes[0], changes, false, false, false, changes.length > 1);
			return;
		}

		// Open multi-file diff editor
		await this._openMultiFileDiffEditor(resource);
	}

	/**
	 * Renders the files header (Branch Changes dropdown + diff stats) into the panel.
	 * Standard layout only; {@link SinglePaneChangesViewPane} overrides this to a no-op
	 * because the header lives in the custom Changes editor instead.
	 */
	protected createFilesHeader(contentContainer: HTMLElement): void {
		this.filesHeaderNode = dom.append(contentContainer, $('.changes-files-header'));

		const filesHeaderToolbarContainer = dom.append(this.filesHeaderNode, $('.changes-files-header-toolbar'));
		this._register(this.scopedInstantiationService.createInstance(MenuWorkbenchToolBar, filesHeaderToolbarContainer, MenuId.ChatEditingSessionChangesFileHeaderToolbar, {
			menuOptions: { shouldForwardArgs: true },
			actionViewItemProvider: (action) => {
				if (action.id === 'chatEditing.versionsPicker' && action instanceof MenuItemAction) {
					return this.scopedInstantiationService.createInstance(ChangesPickerActionItem, action);
				}
				return undefined;
			},
		}));

		this.fileHeaderToolbarContainer = dom.append(this.filesHeaderNode, $('.changes-files-header-right-toolbar'));
		this._register(this.scopedInstantiationService.createInstance(MenuWorkbenchToolBar, this.fileHeaderToolbarContainer, MenuId.ChatEditingSessionChangesFileHeaderRightToolbar, {
			menuOptions: { shouldForwardArgs: true },
			actionViewItemProvider: (action, options) => {
				if (action.id === ChangesDiffStatsAction.ID && action instanceof MenuItemAction) {
					return this.scopedInstantiationService.createInstance(ChangesDiffStatsActionItem, action, options);
				}
				return undefined;
			},
		}));
	}

	/**
	 * Renders the Create-PR actions button bar into the actions container. Standard
	 * layout only; {@link SinglePaneChangesViewPane} overrides this to a no-op because
	 * the actions render in the Changes editor header instead.
	 */
	protected createActionsButtonBar(): void {
		if (!this.actionsContainer) {
			return;
		}

		const isAgentHostSessionObs = derived(reader => {
			const activeSession = this.sessionsService.activeSession.read(reader);
			return activeSession ? isAgentHostProviderId(activeSession.providerId) : false;
		});

		this.renderDisposables.add(autorun(reader => {
			dom.clearNode(this.actionsContainer!);

			const isAgentHostSession = isAgentHostSessionObs.read(reader);

			const widget = isAgentHostSession
				? this.scopedInstantiationService.createInstance(ChangesWorkbenchButtonBarWidget, this.actionsContainer!)
				: this.scopedInstantiationService.createInstance(ChangesMenuWorkbenchButtonBarWidget, this.actionsContainer!, this.hasGitOperationInProgressObs);
			reader.store.add(widget);
		}));
	}

	/**
	 * Whether the actions container should be shown for the given session state.
	 * Standard layout shows it for non-untitled sessions; {@link SinglePaneChangesViewPane}
	 * never shows it (the actions live in the Changes editor).
	 */
	protected isActionsContainerVisible(isUntitled: boolean): boolean {
		return !isUntitled;
	}

	/**
	 * Whether clicking a file opens the modal single-file diff (vs the multi-file
	 * diff editor). Standard layout honors the `workbench.editor.useModal` setting;
	 * {@link SinglePaneChangesViewPane} always opens the multi-file diff.
	 */
	protected shouldOpenModalDiff(): boolean {
		return this.configurationService.getValue<string>('workbench.editor.useModal') === 'all';
	}

	protected shouldRevealFileInMultiDiffEditor(): boolean {
		return false;
	}

	/**
	 * Reveal the CI checks section: expand it if collapsed and move keyboard
	 * focus into it. No-op when there are no checks to show.
	 */
	revealChecks(): void {
		if (!this.ciStatusWidget || !this.ciStatusWidget.visible) {
			return;
		}
		this.ciStatusWidget.expand();
		this.ciStatusWidget.focus();
	}

	private async _openFileItem(item: IChangesFileItem, items: IChangesFileItem[], sideBySide: boolean, preserveFocus: boolean, pinned: boolean, includeSidebar: boolean): Promise<void> {
		const { uri: modifiedFileUri, originalUri, isDeletion } = item;
		const currentIndex = items.indexOf(item);

		const sidebar = includeSidebar ? {
			render: (container: unknown, onDidLayout: Event<{ readonly height: number; readonly width: number }>, contextKeyService: IContextKeyService) => {
				return this.renderSidebarList(container as HTMLElement, onDidLayout, contextKeyService, items, this._openFileItem.bind(this));
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
		const labels = getChangesEditorLabels(item.uri, this.labelService);

		if (isDeletion && originalUri) {
			this.editorService.openEditor({
				resource: originalUri,
				...labels,
				options: { preserveFocus, pinned, modal: { sidebar, navigation } }
			}, group);
			return;
		}

		if (originalUri) {
			this.editorService.openEditor({
				original: { resource: originalUri },
				modified: { resource: modifiedFileUri },
				...labels,
				options: { preserveFocus, pinned, modal: { sidebar, navigation } }
			}, group);
			return;
		}

		this.editorService.openEditor({
			resource: modifiedFileUri,
			...labels,
			options: { preserveFocus, pinned, modal: { sidebar, navigation } }
		}, group);
	}

	private async _openSingleFileDiffEditor(item: IChangesFileItem, sideBySide: boolean, preserveFocus: boolean, pinned: boolean): Promise<void> {
		const { uri, originalUri, isDeletion } = item;
		const group = sideBySide ? SIDE_GROUP : ACTIVE_GROUP;
		const labels = getChangesEditorLabels(uri, this.labelService);

		// Always open a diff editor. Added files (no original) and deleted files
		// (no modified) are shown as a diff against an empty side, matching the
		// "Open Changes" action.
		const modifiedUri = isDeletion ? undefined : uri;
		await this.editorService.openEditor({
			original: { resource: originalUri },
			modified: { resource: modifiedUri },
			...labels,
			options: { preserveFocus, pinned }
		}, group);
	}

	private async _openMultiFileDiffEditor(reveal?: URI): Promise<void> {
		const sessionResource = this.changesViewService.activeSessionResourceObs.get();
		const changes = this.changesViewService.activeSessionChangesObs.get();

		if (!sessionResource || changes.length === 0) {
			return;
		}

		// Opening a file diff is a deliberate action, so reveal the (possibly hidden)
		// editor area explicitly to show it. The Changes editor is otherwise excluded
		// from auto reveal-on-open, and the explicit reveal is not undone by the
		// automatic single-pane hide rules.
		(this.workbenchLayoutService as IAgentWorkbenchLayoutService).revealEditorPartExplicitly();

		// Determine the reveal target (original/modified URI pair) from the
		// current change list, so the multi-diff editor can navigate to it.
		let options: IMultiDiffEditorOptions | undefined;
		if (reveal) {
			const target = changes.find(c => isEqual(c.modifiedUri, reveal));
			if (target) {
				options = {
					viewState: {
						revealData: {
							resource: {
								original: target.originalUri,
								modified: target.modifiedUri,
							},
						},
					},
				} satisfies IMultiDiffEditorOptions;
			}
		}

		// Open the session Changes editor using the sessions source URI. The
		// resource list is resolved via `ChangesMultiDiffSourceResolver` and
		// updates reactively as `activeSessionChangesObs` changes.
		await this.sessionChangesService.openChangesEditor(sessionResource, options);
	}

	override dispose(): void {
		this.tree = undefined;
		super.dispose();
	}
}

/**
 * Changes view for the single-pane layout: the files list lives in the docked
 * detail panel while the Branch Changes header, Create-PR actions, and diffs are
 * shown in the custom Changes editor. Overrides the standard hooks to omit the
 * in-panel header/actions and always open the multi-file diff.
 */
export class SinglePaneChangesViewPane extends ChangesViewPane {

	protected override createFilesHeader(_contentContainer: HTMLElement): void {
		// No in-panel header in single-pane; it lives in the Changes editor.
	}

	protected override createActionsButtonBar(): void {
		// No in-panel Create-PR actions in single-pane; they live in the Changes editor header.
	}

	protected override isActionsContainerVisible(_isUntitled: boolean): boolean {
		return false;
	}

	protected override shouldOpenModalDiff(): boolean {
		return false;
	}

	protected override shouldRevealFileInMultiDiffEditor(): boolean {
		return true;
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
			icon: Codicon.listFlat,
			toggled: ChangesContextKeys.ViewMode.isEqualTo(ChangesViewMode.List),
			menu: {
				id: MenuId.ChatEditingSessionTitleToolbar,
				group: '1_viewmode',
				order: 1
			}
		});
	}

	async runInView(accessor: ServicesAccessor, _view: ChangesViewPane): Promise<void> {
		logChangesViewViewModeChange(accessor.get(ITelemetryService), ChangesViewMode.List);
		accessor.get(IChangesViewService).setViewMode(ChangesViewMode.List);
	}
}

class SetChangesTreeViewModeAction extends ViewAction<ChangesViewPane> {
	constructor() {
		super({
			id: 'workbench.changesView.action.setTreeViewMode',
			title: localize('setTreeViewMode', "View as Tree"),
			viewId: CHANGES_VIEW_ID,
			f1: false,
			icon: Codicon.listTree,
			toggled: ChangesContextKeys.ViewMode.isEqualTo(ChangesViewMode.Tree),
			menu: {
				id: MenuId.ChatEditingSessionTitleToolbar,
				group: '1_viewmode',
				order: 2
			}
		});
	}

	async runInView(accessor: ServicesAccessor, _view: ChangesViewPane): Promise<void> {
		logChangesViewViewModeChange(accessor.get(ITelemetryService), ChangesViewMode.Tree);
		accessor.get(IChangesViewService).setViewMode(ChangesViewMode.Tree);
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
				when: ActiveSessionContextKeys.HasGitRepository,
			}, {
				id: Menus.SessionsEditorHeaderPrimary,
				group: 'navigation',
				order: 1,
				when: ActiveSessionContextKeys.HasGitRepository,
			}],
		});
	}

	override async run(): Promise<void> { }
}
registerAction2(VersionsPickerAction);

export class ChangesPickerActionItem extends ActionWidgetDropdownActionViewItem {
	constructor(
		action: MenuItemAction,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChangesViewService private readonly changesViewService: IChangesViewService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		const actionProvider: IActionWidgetDropdownActionProvider = {
			getActions: () => {
				const changesets = changesViewService.activeSessionChangesetsObs.get() ?? [];
				const selectedChangeset = changesViewService.activeSessionChangesetObs.get();

				return changesets.map(changeset => ({
					...action,
					id: `agents.changes.changeset.${changeset.id}`,
					label: changeset.label,
					detail: changeset.description,
					checked: selectedChangeset?.id === changeset.id,
					category: {
						label: changeset.category ?? '',
						showHeader: false,
						order: 0
					},
					enabled: changeset.isEnabled.get(),
					run: async () => {
						changesViewService.setChangesetId(changeset.id);
						logChangesViewVersionModeChange(this.telemetryService, changeset.id);
					}
				} satisfies IActionWidgetDropdownAction));
			},
		};

		super(action, { actionProvider, listOptions: { detailItemHeight: 44 } }, actionWidgetService, keybindingService, contextKeyService, telemetryService);

		this._register(autorun(reader => {
			changesViewService.activeSessionChangesetObs.read(reader);

			if (this.element) {
				this.renderLabel(this.element);
			}
		}));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('changes-picker-action-rich');
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		const changeset = this.changesViewService.activeSessionChangesetObs.get();
		if (!changeset) {
			return null;
		}

		dom.reset(element, dom.$('span', undefined, changeset.label), ...renderLabelWithIcons('$(chevron-down)'));
		this.updateAriaLabel();
		return null;
	}
}

// --- Diff Stats Actions
//
// Two variants render in the editor-group header's left title bar (SessionsEditorHeaderPrimary):
//  - Editor area VISIBLE: a non-interactive "N files +X -Y" label (ChangesDiffStatsLabelAction,
//    rendered by SinglePaneChangesDiffStatsActionItem).
//  - Editor area CLOSED: the interactive diff-stats from the classic Changes view header
//    (ChangesDiffStatsAction, rendered by ChangesDiffStatsActionItem) — clicking it opens the
//    Changes editor. It resolves the Changes view because the detail panel is showing it.

/**
 * Non-interactive diff-stats label shown on the editor-group header (left) while the
 * editor area is visible. It only presents the "N files +X -Y" summary and is not
 * clickable — the {@link SinglePaneChangesDiffStatsActionItem} swallows clicks.
 */
class ChangesDiffStatsLabelAction extends Action2 {
	static readonly ID = DIFF_STATS_LABEL_ACTION_ID;

	constructor() {
		super({
			id: ChangesDiffStatsLabelAction.ID,
			title: localize2('changesView.diffStatsLabel', 'Changes Stats'),
			f1: false,
			menu: [{
				id: Menus.SessionsEditorHeaderPrimary,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.and(ChatContextKeys.hasAgentSessionChanges, MainEditorAreaVisibleContext)
			}],
		});
	}

	override async run(): Promise<void> { /* non-interactive label */ }
}
registerAction2(ChangesDiffStatsLabelAction);

class ChangesDiffStatsAction extends Action2 {
	static readonly ID = 'workbench.changesView.action.viewChanges';

	constructor() {
		super({
			id: ChangesDiffStatsAction.ID,
			title: localize2('changesView.viewChanges', 'View All Changes'),
			f1: false,
			menu: [{
				id: MenuId.ChatEditingSessionChangesFileHeaderRightToolbar,
				group: 'navigation',
				order: 1,
				when: ChatContextKeys.hasAgentSessionChanges
			}, {
				id: Menus.SessionsEditorHeaderPrimary,
				group: 'navigation',
				order: 2,
				// Shown only when the editor area is collapsed; clicking it opens the
				// (currently closed) Changes editor. While the editor area is visible the
				// non-interactive label (ChangesDiffStatsLabelAction) takes this slot.
				when: ContextKeyExpr.and(ChatContextKeys.hasAgentSessionChanges, MainEditorAreaVisibleContext.negate())
			}],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const view = viewsService.getViewWithId<ChangesViewPane>(CHANGES_VIEW_ID);
		await view?.openChanges();
	}
}
registerAction2(ChangesDiffStatsAction);

/**
 * Opens the Changes view and reveals (expands + focuses) the CI checks section.
 * Used by the CI failures banner above the chat input.
 */
class RevealCIChecksAction extends Action2 {
	static readonly ID = REVEAL_CI_CHECKS_COMMAND_ID;

	constructor() {
		super({
			id: RevealCIChecksAction.ID,
			title: localize2('revealChecks', 'Reveal Checks'),
			category: CHAT_CATEGORY,
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const view = await viewsService.openView<ChangesViewPane>(CHANGES_VIEW_ID, true);
		view?.revealChecks();
	}
}
registerAction2(RevealCIChecksAction);

class ChangesDiffStatsActionItem extends ActionViewItem {
	protected readonly _widget: ChangesSummaryWidget;

	constructor(
		action: MenuItemAction,
		options: IActionViewItemOptions,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(null, action, { ...options, icon: false, label: false });

		this._widget = this._register(instantiationService.createInstance(ChangesSummaryWidget));

		this._register(autorun(reader => {
			const changesSummary = this._widget.summary.read(reader);
			if (changesSummary === undefined) {
				return;
			}

			this.updateTooltip();
		}));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('changes-diff-stats-action');

		if (!this.label) {
			return;
		}

		this.renderLabelContents(this.label);
	}

	/**
	 * Renders the diff-stats content into the action label. The base shows the
	 * animated +/- summary; {@link SinglePaneChangesDiffStatsActionItem} overrides
	 * this to a richer "N files +X -Y" label for the single-pane editor header.
	 */
	protected renderLabelContents(label: HTMLElement): void {
		this._widget.render(label);
	}

	protected override getTooltip(): string | undefined {
		const changesSummary = this._widget.summary.get();
		if (changesSummary === undefined) {
			return undefined;
		}

		const { files, additions, deletions } = changesSummary;
		return localize('changesView.diffStats.label', '{0} files, {1} additions, {2} deletions', files, additions, deletions);
	}
}

/**
 * Diff-stats label for the single-pane Changes editor header: a richer "N files +X -Y"
 * rendering (the detail-panel header uses the compact animated base rendering). It is a
 * **non-interactive status label** — no hover background and clicks are swallowed. Adds
 * the `changes-diff-stats-action-rich` marker class so its styling applies wherever it
 * renders (the classic internal header or the single-pane editor-group header).
 */
export class SinglePaneChangesDiffStatsActionItem extends ChangesDiffStatsActionItem {

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('changes-diff-stats-action-rich');
	}

	override onClick(event: dom.EventLike): void {
		// Non-interactive: this is a status label, not an action.
		dom.EventHelper.stop(event, true);
	}

	override focus(): void {
		// Not focusable: it is a label, not an interactive action.
	}

	protected override renderLabelContents(label: HTMLElement): void {
		this._register(autorun(reader => {
			const summary = this._widget.summary.read(reader);
			if (summary === undefined) {
				return;
			}

			const { files, additions, deletions } = summary;
			const filesLabel = files === 1
				? localize('changesView.diffStats.file', "1 file")
				: localize('changesView.diffStats.files', "{0} files", files);

			dom.reset(
				label,
				dom.$('span.changes-diff-stats-files', undefined, filesLabel),
				dom.$('span.working-set-lines-added', undefined, `+${additions}`),
				dom.$('span.working-set-lines-removed', undefined, `-${deletions}`)
			);
		}));
	}
}
