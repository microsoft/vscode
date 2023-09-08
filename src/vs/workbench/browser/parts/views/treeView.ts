/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DataTransfers, IDragAndDropData } from 'vs/base/browser/dnd';
import * as DOM from 'vs/base/browser/dom';
import { renderMarkdownAsPlaintext } from 'vs/base/browser/markdownRenderer';
import { ActionBar, IActionViewItemProvider } from 'vs/base/browser/ui/actionbar/actionbar';
import { ActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { IHoverDelegate, IHoverDelegateOptions } from 'vs/base/browser/ui/iconLabel/iconHoverDelegate';
import { ITooltipMarkdownString } from 'vs/base/browser/ui/iconLabel/iconLabelHover';
import { IIdentityProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ElementsDragAndDropData } from 'vs/base/browser/ui/list/listView';
import { IAsyncDataSource, ITreeContextMenuEvent, ITreeDragAndDrop, ITreeDragOverReaction, ITreeNode, ITreeRenderer, TreeDragOverBubble } from 'vs/base/browser/ui/tree/tree';
import { CollapseAllAction } from 'vs/base/browser/ui/tree/treeDefaults';
import { ActionRunner, IAction } from 'vs/base/common/actions';
import { timeout } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { isCancellationError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { createMatches, FuzzyScore } from 'vs/base/common/filters';
import { IMarkdownString, isMarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Mimes } from 'vs/base/common/mime';
import { Schemas } from 'vs/base/common/network';
import { basename, dirname } from 'vs/base/common/resources';
import { isFalsyOrWhitespace } from 'vs/base/common/strings';
import { isString } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import 'vs/css!./media/views';
import { VSDataTransfer } from 'vs/base/common/dataTransfer';
import { localize } from 'vs/nls';
import { createActionViewItem, createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { Action2, IMenu, IMenuService, MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { FileKind } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILabelService } from 'vs/platform/label/common/label';
import { WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { ILogService } from 'vs/platform/log/common/log';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { Registry } from 'vs/platform/registry/common/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ColorScheme } from 'vs/platform/theme/common/theme';
import { FileThemeIcon, FolderThemeIcon, IThemeService } from 'vs/platform/theme/common/themeService';
import { ThemeIcon } from 'vs/base/common/themables';
import { fillEditorsDragData } from 'vs/workbench/browser/dnd';
import { IResourceLabel, ResourceLabels } from 'vs/workbench/browser/labels';
import { API_OPEN_DIFF_EDITOR_COMMAND_ID, API_OPEN_EDITOR_COMMAND_ID } from 'vs/workbench/browser/parts/editor/editorCommands';
import { IViewPaneOptions, ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { PANEL_BACKGROUND, SIDE_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { Extensions, ITreeItem, ITreeItemLabel, ITreeView, ITreeViewDataProvider, ITreeViewDescriptor, ITreeViewDragAndDropController, IViewBadge, IViewDescriptorService, IViewsRegistry, ResolvableTreeItem, TreeCommand, TreeItemCollapsibleState, TreeViewItemHandleArg, TreeViewPaneHandleArg, ViewContainer, ViewContainerLocation } from 'vs/workbench/common/views';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IHoverService } from 'vs/workbench/services/hover/browser/hover';
import { ITreeViewsService } from 'vs/workbench/services/views/browser/treeViewsService';
import { CodeDataTransfers, LocalSelectionTransfer } from 'vs/platform/dnd/browser/dnd';
import { toExternalVSDataTransfer } from 'vs/editor/browser/dnd';
import { CheckboxStateHandler, TreeItemCheckbox } from 'vs/workbench/browser/parts/views/checkbox';
import { setTimeout0 } from 'vs/base/common/platform';
import { AriaRole } from 'vs/base/browser/ui/aria/aria';
import { TelemetryTrustedValue } from 'vs/platform/telemetry/common/telemetryUtils';
import { ITreeViewsDnDService } from 'vs/editor/common/services/treeViewsDndService';
import { DraggedTreeItemsIdentifier } from 'vs/editor/common/services/treeViewsDnd';
import { IMarkdownRenderResult, MarkdownRenderer } from 'vs/editor/contrib/markdownRenderer/browser/markdownRenderer';

export class TreeViewPane extends ViewPane {

	protected readonly treeView: ITreeView;
	private _container: HTMLElement | undefined;
	private _actionRunner: MultipleSelectionActionRunner;

	constructor(
		options: IViewletViewOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@INotificationService notificationService: INotificationService
	) {
		super({ ...(options as IViewPaneOptions), titleMenuId: MenuId.ViewTitle, donotForwardArgs: false }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);
		const { treeView } = (<ITreeViewDescriptor>Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).getView(options.id));
		this.treeView = treeView;
		this._register(this.treeView.onDidChangeActions(() => this.updateActions(), this));
		this._register(this.treeView.onDidChangeTitle((newTitle) => this.updateTitle(newTitle)));
		this._register(this.treeView.onDidChangeDescription((newDescription) => this.updateTitleDescription(newDescription)));
		this._register(toDisposable(() => {
			if (this._container && this.treeView.container && (this._container === this.treeView.container)) {
				this.treeView.setVisibility(false);
			}
		}));
		this._register(this.onDidChangeBodyVisibility(() => this.updateTreeVisibility()));
		this._register(this.treeView.onDidChangeWelcomeState(() => this._onDidChangeViewWelcomeState.fire()));
		if (options.title !== this.treeView.title) {
			this.updateTitle(this.treeView.title);
		}
		if (options.titleDescription !== this.treeView.description) {
			this.updateTitleDescription(this.treeView.description);
		}
		this._actionRunner = new MultipleSelectionActionRunner(notificationService, () => this.treeView.getSelection());

		this.updateTreeVisibility();
	}

	override focus(): void {
		super.focus();
		this.treeView.focus();
	}

	protected override renderBody(container: HTMLElement): void {
		this._container = container;
		super.renderBody(container);
		this.renderTreeView(container);
	}

	override shouldShowWelcome(): boolean {
		return ((this.treeView.dataProvider === undefined) || !!this.treeView.dataProvider.isTreeEmpty) && (this.treeView.message === undefined);
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.layoutTreeView(height, width);
	}

	override getOptimalWidth(): number {
		return this.treeView.getOptimalWidth();
	}

	protected renderTreeView(container: HTMLElement): void {
		this.treeView.show(container);
	}

	protected layoutTreeView(height: number, width: number): void {
		this.treeView.layout(height, width);
	}

	private updateTreeVisibility(): void {
		this.treeView.setVisibility(this.isBodyVisible());
	}

	override getActionRunner() {
		return this._actionRunner;
	}

	override getActionsContext(): TreeViewPaneHandleArg {
		return { $treeViewId: this.id, $focusedTreeItem: true, $selectedTreeItems: true };
	}

}

class Root implements ITreeItem {
	label = { label: 'root' };
	handle = '0';
	parentHandle: string | undefined = undefined;
	collapsibleState = TreeItemCollapsibleState.Expanded;
	children: ITreeItem[] | undefined = undefined;
}

function isTreeCommandEnabled(treeCommand: TreeCommand, contextKeyService: IContextKeyService): boolean {
	const command = CommandsRegistry.getCommand(treeCommand.originalId ? treeCommand.originalId : treeCommand.id);
	if (command) {
		const commandAction = MenuRegistry.getCommand(command.id);
		const precondition = commandAction && commandAction.precondition;
		if (precondition) {
			return contextKeyService.contextMatchesRules(precondition);
		}
	}
	return true;
}

function isRenderedMessageValue(messageValue: string | IMarkdownRenderResult | undefined): messageValue is IMarkdownRenderResult {
	return !!messageValue && typeof messageValue !== 'string' && 'element' in messageValue && 'dispose' in messageValue;
}

const noDataProviderMessage = localize('no-dataprovider', "There is no data provider registered that can provide view data.");

export const RawCustomTreeViewContextKey = new RawContextKey<boolean>('customTreeView', false);

class Tree extends WorkbenchAsyncDataTree<ITreeItem, ITreeItem, FuzzyScore> { }

abstract class AbstractTreeView extends Disposable implements ITreeView {

	private isVisible: boolean = false;
	private _hasIconForParentNode = false;
	private _hasIconForLeafNode = false;

	private collapseAllContextKey: RawContextKey<boolean> | undefined;
	private collapseAllContext: IContextKey<boolean> | undefined;
	private collapseAllToggleContextKey: RawContextKey<boolean> | undefined;
	private collapseAllToggleContext: IContextKey<boolean> | undefined;
	private refreshContextKey: RawContextKey<boolean> | undefined;
	private refreshContext: IContextKey<boolean> | undefined;

	private focused: boolean = false;
	private domNode!: HTMLElement;
	private treeContainer: HTMLElement | undefined;
	private _messageValue: string | { element: HTMLElement; dispose: () => void } | undefined;
	private _canSelectMany: boolean = false;
	private _manuallyManageCheckboxes: boolean = false;
	private messageElement: HTMLElement | undefined;
	private tree: Tree | undefined;
	private treeLabels: ResourceLabels | undefined;
	private treeViewDnd: CustomTreeViewDragAndDrop | undefined;
	private _container: HTMLElement | undefined;

	private root: ITreeItem;
	private markdownRenderer: MarkdownRenderer | undefined;
	private elementsToRefresh: ITreeItem[] = [];
	private lastSelection: readonly ITreeItem[] = [];
	private lastActive: ITreeItem;

	private readonly _onDidExpandItem: Emitter<ITreeItem> = this._register(new Emitter<ITreeItem>());
	readonly onDidExpandItem: Event<ITreeItem> = this._onDidExpandItem.event;

	private readonly _onDidCollapseItem: Emitter<ITreeItem> = this._register(new Emitter<ITreeItem>());
	readonly onDidCollapseItem: Event<ITreeItem> = this._onDidCollapseItem.event;

	private _onDidChangeSelectionAndFocus: Emitter<{ selection: readonly ITreeItem[]; focus: ITreeItem }> = this._register(new Emitter<{ selection: readonly ITreeItem[]; focus: ITreeItem }>());
	readonly onDidChangeSelectionAndFocus: Event<{ selection: readonly ITreeItem[]; focus: ITreeItem }> = this._onDidChangeSelectionAndFocus.event;

	private readonly _onDidChangeVisibility: Emitter<boolean> = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility.event;

	private readonly _onDidChangeActions: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeActions: Event<void> = this._onDidChangeActions.event;

	private readonly _onDidChangeWelcomeState: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeWelcomeState: Event<void> = this._onDidChangeWelcomeState.event;

	private readonly _onDidChangeTitle: Emitter<string> = this._register(new Emitter<string>());
	readonly onDidChangeTitle: Event<string> = this._onDidChangeTitle.event;

	private readonly _onDidChangeDescription: Emitter<string | undefined> = this._register(new Emitter<string | undefined>());
	readonly onDidChangeDescription: Event<string | undefined> = this._onDidChangeDescription.event;

	private readonly _onDidChangeCheckboxState: Emitter<readonly ITreeItem[]> = this._register(new Emitter<readonly ITreeItem[]>());
	readonly onDidChangeCheckboxState: Event<readonly ITreeItem[]> = this._onDidChangeCheckboxState.event;

	private readonly _onDidCompleteRefresh: Emitter<void> = this._register(new Emitter<void>());

	constructor(
		readonly id: string,
		private _title: string,
		@IThemeService private readonly themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IProgressService protected readonly progressService: IProgressService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@INotificationService private readonly notificationService: INotificationService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IHoverService private readonly hoverService: IHoverService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IActivityService private readonly activityService: IActivityService,
		@ILogService private readonly logService: ILogService
	) {
		super();
		this.root = new Root();
		this.lastActive = this.root;
		// Try not to add anything that could be costly to this constructor. It gets called once per tree view
		// during startup, and anything added here can affect performance.
	}

	private _isInitialized: boolean = false;
	private initialize() {
		if (this._isInitialized) {
			return;
		}
		this._isInitialized = true;

		// Remember when adding to this method that it isn't called until the the view is visible, meaning that
		// properties could be set and events could be fired before we're initialized and that this needs to be handled.

		this.contextKeyService.bufferChangeEvents(() => {
			this.initializeShowCollapseAllAction();
			this.initializeCollapseAllToggle();
			this.initializeShowRefreshAction();
		});

		this.treeViewDnd = this.instantiationService.createInstance(CustomTreeViewDragAndDrop, this.id);
		if (this._dragAndDropController) {
			this.treeViewDnd.controller = this._dragAndDropController;
		}

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('explorer.decorations')) {
				this.doRefresh([this.root]); /** soft refresh **/
			}
		}));
		this._register(this.viewDescriptorService.onDidChangeLocation(({ views, from, to }) => {
			if (views.some(v => v.id === this.id)) {
				this.tree?.updateOptions({ overrideStyles: { listBackground: this.viewLocation === ViewContainerLocation.Panel ? PANEL_BACKGROUND : SIDE_BAR_BACKGROUND } });
			}
		}));
		this.registerActions();

		this.create();
	}

	get viewContainer(): ViewContainer {
		return this.viewDescriptorService.getViewContainerByViewId(this.id)!;
	}

	get viewLocation(): ViewContainerLocation {
		return this.viewDescriptorService.getViewLocationById(this.id)!;
	}
	private _dragAndDropController: ITreeViewDragAndDropController | undefined;
	get dragAndDropController(): ITreeViewDragAndDropController | undefined {
		return this._dragAndDropController;
	}
	set dragAndDropController(dnd: ITreeViewDragAndDropController | undefined) {
		this._dragAndDropController = dnd;
		if (this.treeViewDnd) {
			this.treeViewDnd.controller = dnd;
		}
	}

	private _dataProvider: ITreeViewDataProvider | undefined;
	get dataProvider(): ITreeViewDataProvider | undefined {
		return this._dataProvider;
	}

	set dataProvider(dataProvider: ITreeViewDataProvider | undefined) {
		if (dataProvider) {
			const self = this;
			this._dataProvider = new class implements ITreeViewDataProvider {
				private _isEmpty: boolean = true;
				private _onDidChangeEmpty: Emitter<void> = new Emitter();
				public onDidChangeEmpty: Event<void> = this._onDidChangeEmpty.event;

				get isTreeEmpty(): boolean {
					return this._isEmpty;
				}

				async getChildren(node?: ITreeItem): Promise<ITreeItem[]> {
					let children: ITreeItem[];
					const checkboxesUpdated: ITreeItem[] = [];
					if (node && node.children) {
						children = node.children;
					} else {
						node = node ?? self.root;
						node.children = await (node instanceof Root ? dataProvider.getChildren() : dataProvider.getChildren(node));
						children = node.children ?? [];
						children.forEach(child => {
							child.parent = node;
							if (!self.manuallyManageCheckboxes && (node?.checkbox?.isChecked === true) && (child.checkbox?.isChecked === false)) {
								child.checkbox.isChecked = true;
								checkboxesUpdated.push(child);
							}
						});
					}
					if (node instanceof Root) {
						const oldEmpty = this._isEmpty;
						this._isEmpty = children.length === 0;
						if (oldEmpty !== this._isEmpty) {
							this._onDidChangeEmpty.fire();
						}
					}
					if (checkboxesUpdated.length > 0) {
						self._onDidChangeCheckboxState.fire(checkboxesUpdated);
					}
					return children;
				}
			};
			if (this._dataProvider.onDidChangeEmpty) {
				this._register(this._dataProvider.onDidChangeEmpty(() => {
					this.updateCollapseAllToggle();
					this._onDidChangeWelcomeState.fire();
				}));
			}
			this.updateMessage();
			this.refresh();
		} else {
			this._dataProvider = undefined;
			this.updateMessage();
		}

		this._onDidChangeWelcomeState.fire();
	}

	private _message: string | IMarkdownString | undefined;
	get message(): string | IMarkdownString | undefined {
		return this._message;
	}

	set message(message: string | IMarkdownString | undefined) {
		this._message = message;
		this.updateMessage();
		this._onDidChangeWelcomeState.fire();
	}

	get title(): string {
		return this._title;
	}

	set title(name: string) {
		this._title = name;
		this._onDidChangeTitle.fire(this._title);
	}

	private _description: string | undefined;
	get description(): string | undefined {
		return this._description;
	}

	set description(description: string | undefined) {
		this._description = description;
		this._onDidChangeDescription.fire(this._description);
	}

	private _badge: IViewBadge | undefined;
	private _badgeActivity: IDisposable | undefined;
	get badge(): IViewBadge | undefined {
		return this._badge;
	}

	set badge(badge: IViewBadge | undefined) {

		if (this._badge?.value === badge?.value &&
			this._badge?.tooltip === badge?.tooltip) {
			return;
		}

		if (this._badgeActivity) {
			this._badgeActivity.dispose();
			this._badgeActivity = undefined;
		}

		this._badge = badge;

		if (badge) {
			const activity = {
				badge: new NumberBadge(badge.value, () => badge.tooltip),
				priority: 50
			};
			this._badgeActivity = this.activityService.showViewActivity(this.id, activity);
		}
	}

	get canSelectMany(): boolean {
		return this._canSelectMany;
	}

	set canSelectMany(canSelectMany: boolean) {
		const oldCanSelectMany = this._canSelectMany;
		this._canSelectMany = canSelectMany;
		if (this._canSelectMany !== oldCanSelectMany) {
			this.tree?.updateOptions({ multipleSelectionSupport: this.canSelectMany });
		}
	}

	get manuallyManageCheckboxes(): boolean {
		return this._manuallyManageCheckboxes;
	}

	set manuallyManageCheckboxes(manuallyManageCheckboxes: boolean) {
		this._manuallyManageCheckboxes = manuallyManageCheckboxes;
	}

	get hasIconForParentNode(): boolean {
		return this._hasIconForParentNode;
	}

	get hasIconForLeafNode(): boolean {
		return this._hasIconForLeafNode;
	}

	get visible(): boolean {
		return this.isVisible;
	}

	private initializeShowCollapseAllAction(startingValue: boolean = false) {
		if (!this.collapseAllContext) {
			this.collapseAllContextKey = new RawContextKey<boolean>(`treeView.${this.id}.enableCollapseAll`, startingValue, localize('treeView.enableCollapseAll', "Whether the the tree view with id {0} enables collapse all.", this.id));
			this.collapseAllContext = this.collapseAllContextKey.bindTo(this.contextKeyService);
		}
		return true;
	}

	get showCollapseAllAction(): boolean {
		this.initializeShowCollapseAllAction();
		return !!this.collapseAllContext?.get();
	}

	set showCollapseAllAction(showCollapseAllAction: boolean) {
		this.initializeShowCollapseAllAction(showCollapseAllAction);
		this.collapseAllContext?.set(showCollapseAllAction);
	}


	private initializeShowRefreshAction(startingValue: boolean = false) {
		if (!this.refreshContext) {
			this.refreshContextKey = new RawContextKey<boolean>(`treeView.${this.id}.enableRefresh`, startingValue, localize('treeView.enableRefresh', "Whether the tree view with id {0} enables refresh.", this.id));
			this.refreshContext = this.refreshContextKey.bindTo(this.contextKeyService);
		}
	}

	get showRefreshAction(): boolean {
		this.initializeShowRefreshAction();
		return !!this.refreshContext?.get();
	}

	set showRefreshAction(showRefreshAction: boolean) {
		this.initializeShowRefreshAction(showRefreshAction);
		this.refreshContext?.set(showRefreshAction);
	}

	private registerActions() {
		const that = this;
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.treeView.${that.id}.refresh`,
					title: localize('refresh', "Refresh"),
					menu: {
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.and(ContextKeyExpr.equals('view', that.id), that.refreshContextKey),
						group: 'navigation',
						order: Number.MAX_SAFE_INTEGER - 1,
					},
					icon: Codicon.refresh
				});
			}
			async run(): Promise<void> {
				return that.refresh();
			}
		}));
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `workbench.actions.treeView.${that.id}.collapseAll`,
					title: localize('collapseAll', "Collapse All"),
					menu: {
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.and(ContextKeyExpr.equals('view', that.id), that.collapseAllContextKey),
						group: 'navigation',
						order: Number.MAX_SAFE_INTEGER,
					},
					precondition: that.collapseAllToggleContextKey,
					icon: Codicon.collapseAll
				});
			}
			async run(): Promise<void> {
				if (that.tree) {
					return new CollapseAllAction<ITreeItem, ITreeItem, FuzzyScore>(that.tree, true).run();
				}
			}
		}));
	}

	setVisibility(isVisible: boolean): void {
		// Throughout setVisibility we need to check if the tree view's data provider still exists.
		// This can happen because the `getChildren` call to the extension can return
		// after the tree has been disposed.

		this.initialize();
		isVisible = !!isVisible;
		if (this.isVisible === isVisible) {
			return;
		}

		this.isVisible = isVisible;

		if (this.tree) {
			if (this.isVisible) {
				DOM.show(this.tree.getHTMLElement());
			} else {
				DOM.hide(this.tree.getHTMLElement()); // make sure the tree goes out of the tabindex world by hiding it
			}

			if (this.isVisible && this.elementsToRefresh.length && this.dataProvider) {
				this.doRefresh(this.elementsToRefresh);
				this.elementsToRefresh = [];
			}
		}

		setTimeout0(() => {
			if (this.dataProvider) {
				this._onDidChangeVisibility.fire(this.isVisible);
			}
		});

		if (this.visible) {
			this.activate();
		}
	}

	protected abstract activate(): void;

	focus(reveal: boolean = true, revealItem?: ITreeItem): void {
		if (this.tree && this.root.children && this.root.children.length > 0) {
			// Make sure the current selected element is revealed
			const element = revealItem ?? this.tree.getSelection()[0];
			if (element && reveal) {
				this.tree.reveal(element, 0.5);
			}

			// Pass Focus to Viewer
			this.tree.domFocus();
		} else if (this.tree && this.treeContainer && !this.treeContainer.classList.contains('hide')) {
			this.tree.domFocus();
		} else {
			this.domNode.focus();
		}
	}

	show(container: HTMLElement): void {
		this._container = container;
		DOM.append(container, this.domNode);
	}

	private create() {
		this.domNode = DOM.$('.tree-explorer-viewlet-tree-view');
		this.messageElement = DOM.append(this.domNode, DOM.$('.message'));
		this.updateMessage();
		this.treeContainer = DOM.append(this.domNode, DOM.$('.customview-tree'));
		this.treeContainer.classList.add('file-icon-themable-tree', 'show-file-icons');
		const focusTracker = this._register(DOM.trackFocus(this.domNode));
		this._register(focusTracker.onDidFocus(() => this.focused = true));
		this._register(focusTracker.onDidBlur(() => this.focused = false));
	}

	protected createTree() {
		const actionViewItemProvider = createActionViewItem.bind(undefined, this.instantiationService);
		const treeMenus = this._register(this.instantiationService.createInstance(TreeMenus, this.id));
		this.treeLabels = this._register(this.instantiationService.createInstance(ResourceLabels, this));
		const dataSource = this.instantiationService.createInstance(TreeDataSource, this, <T>(task: Promise<T>) => this.progressService.withProgress({ location: this.id }, () => task));
		const aligner = new Aligner(this.themeService);
		const checkboxStateHandler = this._register(new CheckboxStateHandler());
		const renderer = this.instantiationService.createInstance(TreeRenderer, this.id, treeMenus, this.treeLabels, actionViewItemProvider, aligner, checkboxStateHandler, this.manuallyManageCheckboxes);
		this._register(renderer.onDidChangeCheckboxState(e => this._onDidChangeCheckboxState.fire(e)));

		const widgetAriaLabel = this._title;

		this.tree = this._register(this.instantiationService.createInstance(Tree, this.id, this.treeContainer!, new TreeViewDelegate(), [renderer],
			dataSource, {
			identityProvider: new TreeViewIdentityProvider(),
			accessibilityProvider: {
				getAriaLabel(element: ITreeItem): string | null {
					if (element.accessibilityInformation) {
						return element.accessibilityInformation.label;
					}

					if (isString(element.tooltip)) {
						return element.tooltip;
					} else {
						if (element.resourceUri && !element.label) {
							// The custom tree has no good information on what should be used for the aria label.
							// Allow the tree widget's default aria label to be used.
							return null;
						}
						let buildAriaLabel: string = '';
						if (element.label) {
							buildAriaLabel += element.label.label + ' ';
						}
						if (element.description) {
							buildAriaLabel += element.description;
						}
						return buildAriaLabel;
					}
				},
				getRole(element: ITreeItem): AriaRole | undefined {
					return element.accessibilityInformation?.role ?? 'treeitem';
				},
				getWidgetAriaLabel(): string {
					return widgetAriaLabel;
				}
			},
			keyboardNavigationLabelProvider: {
				getKeyboardNavigationLabel: (item: ITreeItem) => {
					return item.label ? item.label.label : (item.resourceUri ? basename(URI.revive(item.resourceUri)) : undefined);
				}
			},
			expandOnlyOnTwistieClick: (e: ITreeItem) => {
				return !!e.command || !!e.checkbox || this.configurationService.getValue<'singleClick' | 'doubleClick'>('workbench.tree.expandMode') === 'doubleClick';
			},
			collapseByDefault: (e: ITreeItem): boolean => {
				return e.collapsibleState !== TreeItemCollapsibleState.Expanded;
			},
			multipleSelectionSupport: this.canSelectMany,
			dnd: this.treeViewDnd,
			overrideStyles: {
				listBackground: this.viewLocation === ViewContainerLocation.Panel ? PANEL_BACKGROUND : SIDE_BAR_BACKGROUND
			}
		}) as WorkbenchAsyncDataTree<ITreeItem, ITreeItem, FuzzyScore>);
		treeMenus.setContextKeyService(this.tree.contextKeyService);
		aligner.tree = this.tree;
		const actionRunner = new MultipleSelectionActionRunner(this.notificationService, () => this.tree!.getSelection());
		renderer.actionRunner = actionRunner;

		this.tree.contextKeyService.createKey<boolean>(this.id, true);
		const customTreeKey = RawCustomTreeViewContextKey.bindTo(this.tree.contextKeyService);
		customTreeKey.set(true);
		this._register(this.tree.onContextMenu(e => this.onContextMenu(treeMenus, e, actionRunner)));

		this._register(this.tree.onDidChangeSelection(e => {
			this.lastSelection = e.elements;
			this.lastActive = this.tree?.getFocus()[0] ?? this.lastActive;
			this._onDidChangeSelectionAndFocus.fire({ selection: this.lastSelection, focus: this.lastActive });
		}));
		this._register(this.tree.onDidChangeFocus(e => {
			if (e.elements.length && (e.elements[0] !== this.lastActive)) {
				this.lastActive = e.elements[0];
				this.lastSelection = this.tree?.getSelection() ?? this.lastSelection;
				this._onDidChangeSelectionAndFocus.fire({ selection: this.lastSelection, focus: this.lastActive });
			}
		}));
		this._register(this.tree.onDidChangeCollapseState(e => {
			if (!e.node.element) {
				return;
			}

			const element: ITreeItem = Array.isArray(e.node.element.element) ? e.node.element.element[0] : e.node.element.element;
			if (e.node.collapsed) {
				this._onDidCollapseItem.fire(element);
			} else {
				this._onDidExpandItem.fire(element);
			}
		}));
		this.tree.setInput(this.root).then(() => this.updateContentAreas());

		this._register(this.tree.onDidOpen(async (e) => {
			if (!e.browserEvent) {
				return;
			}
			if (e.browserEvent.target && (e.browserEvent.target as HTMLElement).classList.contains(TreeItemCheckbox.checkboxClass)) {
				return;
			}
			const selection = this.tree!.getSelection();
			const command = await this.resolveCommand(selection.length === 1 ? selection[0] : undefined);

			if (command && isTreeCommandEnabled(command, this.contextKeyService)) {
				let args = command.arguments || [];
				if (command.id === API_OPEN_EDITOR_COMMAND_ID || command.id === API_OPEN_DIFF_EDITOR_COMMAND_ID) {
					// Some commands owned by us should receive the
					// `IOpenEvent` as context to open properly
					args = [...args, e];
				}

				try {
					await this.commandService.executeCommand(command.id, ...args);
				} catch (err) {
					this.notificationService.error(err);
				}
			}
		}));

		this._register(treeMenus.onDidChange((changed) => {
			if (this.tree?.hasNode(changed)) {
				this.tree?.rerender(changed);
			}
		}));
	}

	private async resolveCommand(element: ITreeItem | undefined): Promise<TreeCommand | undefined> {
		let command = element?.command;
		if (element && !command) {
			if ((element instanceof ResolvableTreeItem) && element.hasResolve) {
				await element.resolve(new CancellationTokenSource().token);
				command = element.command;
			}
		}
		return command;
	}

	private onContextMenu(treeMenus: TreeMenus, treeEvent: ITreeContextMenuEvent<ITreeItem>, actionRunner: MultipleSelectionActionRunner): void {
		this.hoverService.hideHover();
		const node: ITreeItem | null = treeEvent.element;
		if (node === null) {
			return;
		}
		const event: UIEvent = treeEvent.browserEvent;

		event.preventDefault();
		event.stopPropagation();

		this.tree!.setFocus([node]);
		const actions = treeMenus.getResourceContextActions(node);
		if (!actions.length) {
			return;
		}
		this.contextMenuService.showContextMenu({
			getAnchor: () => treeEvent.anchor,

			getActions: () => actions,

			getActionViewItem: (action) => {
				const keybinding = this.keybindingService.lookupKeybinding(action.id);
				if (keybinding) {
					return new ActionViewItem(action, action, { label: true, keybinding: keybinding.getLabel() });
				}
				return undefined;
			},

			onHide: (wasCancelled?: boolean) => {
				if (wasCancelled) {
					this.tree!.domFocus();
				}
			},

			getActionsContext: () => (<TreeViewItemHandleArg>{ $treeViewId: this.id, $treeItemHandle: node.handle }),

			actionRunner
		});
	}

	protected updateMessage(): void {
		if (this._message) {
			this.showMessage(this._message);
		} else if (!this.dataProvider) {
			this.showMessage(noDataProviderMessage);
		} else {
			this.hideMessage();
		}
		this.updateContentAreas();
	}

	private showMessage(message: string | IMarkdownString): void {
		if (isRenderedMessageValue(this._messageValue)) {
			this._messageValue.dispose();
		}
		if (isMarkdownString(message) && !this.markdownRenderer) {
			this.markdownRenderer = this.instantiationService.createInstance(MarkdownRenderer, {});
		}
		this._messageValue = isMarkdownString(message) ? this.markdownRenderer!.render(message) : message;
		if (!this.messageElement) {
			return;
		}
		this.messageElement.classList.remove('hide');
		this.resetMessageElement();
		if (typeof this._messageValue === 'string' && !isFalsyOrWhitespace(this._messageValue)) {
			this.messageElement.textContent = this._messageValue;
		} else if (isRenderedMessageValue(this._messageValue)) {
			this.messageElement.appendChild(this._messageValue.element);
		}
		this.layout(this._height, this._width);
	}

	private hideMessage(): void {
		this.resetMessageElement();
		this.messageElement?.classList.add('hide');
		this.layout(this._height, this._width);
	}

	private resetMessageElement(): void {
		if (this.messageElement) {
			DOM.clearNode(this.messageElement);
		}
	}

	private _height: number = 0;
	private _width: number = 0;
	layout(height: number, width: number) {
		if (height && width && this.messageElement && this.treeContainer) {
			this._height = height;
			this._width = width;
			const treeHeight = height - DOM.getTotalHeight(this.messageElement);
			this.treeContainer.style.height = treeHeight + 'px';
			this.tree?.layout(treeHeight, width);
		}
	}

	getOptimalWidth(): number {
		if (this.tree) {
			const parentNode = this.tree.getHTMLElement();
			const childNodes = ([] as HTMLElement[]).slice.call(parentNode.querySelectorAll('.outline-item-label > a'));
			return DOM.getLargestChildWidth(parentNode, childNodes);
		}
		return 0;
	}

	async refresh(elements?: readonly ITreeItem[]): Promise<void> {
		if (this.dataProvider && this.tree) {
			if (this.refreshing) {
				await Event.toPromise(this._onDidCompleteRefresh.event);
			}
			if (!elements) {
				elements = [this.root];
				// remove all waiting elements to refresh if root is asked to refresh
				this.elementsToRefresh = [];
			}
			for (const element of elements) {
				element.children = undefined; // reset children
			}
			if (this.isVisible) {
				return this.doRefresh(elements);
			} else {
				if (this.elementsToRefresh.length) {
					const seen: Set<string> = new Set<string>();
					this.elementsToRefresh.forEach(element => seen.add(element.handle));
					for (const element of elements) {
						if (!seen.has(element.handle)) {
							this.elementsToRefresh.push(element);
						}
					}
				} else {
					this.elementsToRefresh.push(...elements);
				}
			}
		}
		return undefined;
	}

	async expand(itemOrItems: ITreeItem | ITreeItem[]): Promise<void> {
		const tree = this.tree;
		if (!tree) {
			return;
		}
		try {
			itemOrItems = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
			for (const element of itemOrItems) {
				await tree.expand(element, false);
			}
		} catch (e) {
			// The extension could have changed the tree during the reveal.
			// Because of that, we ignore errors.
		}
	}

	isCollapsed(item: ITreeItem): boolean {
		return !!this.tree?.isCollapsed(item);
	}

	setSelection(items: ITreeItem[]): void {
		this.tree?.setSelection(items);
	}

	getSelection(): ITreeItem[] {
		return this.tree?.getSelection() ?? [];
	}

	setFocus(item?: ITreeItem): void {
		if (this.tree) {
			if (item) {
				this.focus(true, item);
				this.tree.setFocus([item]);
			} else {
				this.tree.setFocus([]);
			}
		}
	}

	async reveal(item: ITreeItem): Promise<void> {
		if (this.tree) {
			return this.tree.reveal(item);
		}
	}

	private refreshing: boolean = false;
	private async doRefresh(elements: readonly ITreeItem[]): Promise<void> {
		const tree = this.tree;
		if (tree && this.visible) {
			this.refreshing = true;
			const oldSelection = tree.getSelection();
			try {
				await Promise.all(elements.map(element => tree.updateChildren(element, true, true)));
			} catch (e) {
				// When multiple calls are made to refresh the tree in quick succession,
				// we can get a "Tree element not found" error. This is expected.
				// Ideally this is fixable, so log instead of ignoring so the error is preserved.
				this.logService.error(e);
			}
			const newSelection = tree.getSelection();
			if (oldSelection.length !== newSelection.length || oldSelection.some((value, index) => value.handle !== newSelection[index].handle)) {
				this.lastSelection = newSelection;
				this._onDidChangeSelectionAndFocus.fire({ selection: this.lastSelection, focus: this.lastActive });
			}
			this.refreshing = false;
			this._onDidCompleteRefresh.fire();
			this.updateContentAreas();
			if (this.focused) {
				this.focus(false);
			}
			this.updateCollapseAllToggle();
		}
	}

	private initializeCollapseAllToggle() {
		if (!this.collapseAllToggleContext) {
			this.collapseAllToggleContextKey = new RawContextKey<boolean>(`treeView.${this.id}.toggleCollapseAll`, false, localize('treeView.toggleCollapseAll', "Whether collapse all is toggled for the tree view with id {0}.", this.id));
			this.collapseAllToggleContext = this.collapseAllToggleContextKey.bindTo(this.contextKeyService);
		}
	}

	private updateCollapseAllToggle() {
		if (this.showCollapseAllAction) {
			this.initializeCollapseAllToggle();
			this.collapseAllToggleContext?.set(!!this.root.children && (this.root.children.length > 0) &&
				this.root.children.some(value => value.collapsibleState !== TreeItemCollapsibleState.None));
		}
	}

	private updateContentAreas(): void {
		const isTreeEmpty = !this.root.children || this.root.children.length === 0;
		// Hide tree container only when there is a message and tree is empty and not refreshing
		if (this._messageValue && isTreeEmpty && !this.refreshing && this.treeContainer) {
			// If there's a dnd controller then hiding the tree prevents it from being dragged into.
			if (!this.dragAndDropController) {
				this.treeContainer.classList.add('hide');
			}
			this.domNode.setAttribute('tabindex', '0');
		} else if (this.treeContainer) {
			this.treeContainer.classList.remove('hide');
			if (this.domNode === DOM.getActiveElement()) {
				this.focus();
			}
			this.domNode.removeAttribute('tabindex');
		}
	}

	get container(): HTMLElement | undefined {
		return this._container;
	}
}

class TreeViewIdentityProvider implements IIdentityProvider<ITreeItem> {
	getId(element: ITreeItem): { toString(): string } {
		return element.handle;
	}
}

class TreeViewDelegate implements IListVirtualDelegate<ITreeItem> {

	getHeight(element: ITreeItem): number {
		return TreeRenderer.ITEM_HEIGHT;
	}

	getTemplateId(element: ITreeItem): string {
		return TreeRenderer.TREE_TEMPLATE_ID;
	}
}

class TreeDataSource implements IAsyncDataSource<ITreeItem, ITreeItem> {

	constructor(
		private treeView: ITreeView,
		private withProgress: <T>(task: Promise<T>) => Promise<T>
	) {
	}

	hasChildren(element: ITreeItem): boolean {
		return !!this.treeView.dataProvider && (element.collapsibleState !== TreeItemCollapsibleState.None);
	}

	async getChildren(element: ITreeItem): Promise<ITreeItem[]> {
		let result: ITreeItem[] = [];
		if (this.treeView.dataProvider) {
			try {
				result = (await this.withProgress(this.treeView.dataProvider.getChildren(element))) ?? [];
			} catch (e) {
				if (!(<string>e.message).startsWith('Bad progress location:')) {
					throw e;
				}
			}
		}
		return result;
	}
}

interface ITreeExplorerTemplateData {
	readonly elementDisposable: DisposableStore;
	readonly container: HTMLElement;
	readonly resourceLabel: IResourceLabel;
	readonly icon: HTMLElement;
	readonly checkboxContainer: HTMLElement;
	checkbox?: TreeItemCheckbox;
	readonly actionBar: ActionBar;
}

class TreeRenderer extends Disposable implements ITreeRenderer<ITreeItem, FuzzyScore, ITreeExplorerTemplateData> {
	static readonly ITEM_HEIGHT = 22;
	static readonly TREE_TEMPLATE_ID = 'treeExplorer';

	private readonly _onDidChangeCheckboxState: Emitter<readonly ITreeItem[]> = this._register(new Emitter<readonly ITreeItem[]>());
	readonly onDidChangeCheckboxState: Event<readonly ITreeItem[]> = this._onDidChangeCheckboxState.event;

	private _actionRunner: MultipleSelectionActionRunner | undefined;
	private _hoverDelegate: IHoverDelegate;
	private _hasCheckbox: boolean = false;
	private _renderedElements = new Map<string, { original: ITreeNode<ITreeItem, FuzzyScore>; rendered: ITreeExplorerTemplateData }>(); // tree item handle to template data

	constructor(
		private treeViewId: string,
		private menus: TreeMenus,
		private labels: ResourceLabels,
		private actionViewItemProvider: IActionViewItemProvider,
		private aligner: Aligner,
		private checkboxStateHandler: CheckboxStateHandler,
		private readonly manuallyManageCheckboxes: boolean,
		@IThemeService private readonly themeService: IThemeService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILabelService private readonly labelService: ILabelService,
		@IHoverService private readonly hoverService: IHoverService,
		@ITreeViewsService private readonly treeViewsService: ITreeViewsService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();
		this._hoverDelegate = {
			showHover: (options: IHoverDelegateOptions) => this.hoverService.showHover(options),
			delay: <number>this.configurationService.getValue('workbench.hover.delay')
		};
		this._register(this.themeService.onDidFileIconThemeChange(() => this.rerender()));
		this._register(this.themeService.onDidColorThemeChange(() => this.rerender()));
		this._register(checkboxStateHandler.onDidChangeCheckboxState(items => {
			this.updateCheckboxes(items);
		}));
	}

	get templateId(): string {
		return TreeRenderer.TREE_TEMPLATE_ID;
	}

	set actionRunner(actionRunner: MultipleSelectionActionRunner) {
		this._actionRunner = actionRunner;
	}

	renderTemplate(container: HTMLElement): ITreeExplorerTemplateData {
		container.classList.add('custom-view-tree-node-item');

		const checkboxContainer = DOM.append(container, DOM.$(''));
		const resourceLabel = this.labels.create(container, { supportHighlights: true, hoverDelegate: this._hoverDelegate });
		const icon = DOM.prepend(resourceLabel.element, DOM.$('.custom-view-tree-node-item-icon'));
		const actionsContainer = DOM.append(resourceLabel.element, DOM.$('.actions'));
		const actionBar = new ActionBar(actionsContainer, {
			actionViewItemProvider: this.actionViewItemProvider
		});

		return { resourceLabel, icon, checkboxContainer, actionBar, container, elementDisposable: new DisposableStore() };
	}

	private getHover(label: string | undefined, resource: URI | null, node: ITreeItem): string | ITooltipMarkdownString | undefined {
		if (!(node instanceof ResolvableTreeItem) || !node.hasResolve) {
			if (resource && !node.tooltip) {
				return undefined;
			} else if (node.tooltip === undefined) {
				return label;
			} else if (!isString(node.tooltip)) {
				return { markdown: node.tooltip, markdownNotSupportedFallback: resource ? undefined : renderMarkdownAsPlaintext(node.tooltip) }; // Passing undefined as the fallback for a resource falls back to the old native hover
			} else if (node.tooltip !== '') {
				return node.tooltip;
			} else {
				return undefined;
			}
		}

		return {
			markdown: typeof node.tooltip === 'string' ? node.tooltip :
				(token: CancellationToken): Promise<IMarkdownString | string | undefined> => {
					return new Promise<IMarkdownString | string | undefined>((resolve) => {
						node.resolve(token).then(() => resolve(node.tooltip));
					});
				},
			markdownNotSupportedFallback: resource ? undefined : (label ?? '') // Passing undefined as the fallback for a resource falls back to the old native hover
		};
	}

	renderElement(element: ITreeNode<ITreeItem, FuzzyScore>, index: number, templateData: ITreeExplorerTemplateData): void {
		const node = element.element;
		const resource = node.resourceUri ? URI.revive(node.resourceUri) : null;
		const treeItemLabel: ITreeItemLabel | undefined = node.label ? node.label : (resource ? { label: basename(resource) } : undefined);
		const description = isString(node.description) ? node.description : resource && node.description === true ? this.labelService.getUriLabel(dirname(resource), { relative: true }) : undefined;
		const label = treeItemLabel ? treeItemLabel.label : undefined;
		const matches = (treeItemLabel && treeItemLabel.highlights && label) ? treeItemLabel.highlights.map(([start, end]) => {
			if (start < 0) {
				start = label.length + start;
			}
			if (end < 0) {
				end = label.length + end;
			}
			if ((start >= label.length) || (end > label.length)) {
				return ({ start: 0, end: 0 });
			}
			if (start > end) {
				const swap = start;
				start = end;
				end = swap;
			}
			return ({ start, end });
		}) : undefined;
		const icon = this.themeService.getColorTheme().type === ColorScheme.LIGHT ? node.icon : node.iconDark;
		const iconUrl = icon ? URI.revive(icon) : undefined;
		const title = this.getHover(label, resource, node);

		// reset
		templateData.actionBar.clear();
		templateData.icon.style.color = '';

		let commandEnabled = true;
		if (node.command) {
			commandEnabled = isTreeCommandEnabled(node.command, this.contextKeyService);
		}

		this.renderCheckbox(node, templateData);

		if (resource) {
			const fileDecorations = this.configurationService.getValue<{ colors: boolean; badges: boolean }>('explorer.decorations');
			const labelResource = resource ? resource : URI.parse('missing:_icon_resource');
			templateData.resourceLabel.setResource({ name: label, description, resource: labelResource }, {
				fileKind: this.getFileKind(node),
				title,
				hideIcon: this.shouldHideResourceLabelIcon(iconUrl, node.themeIcon),
				fileDecorations,
				extraClasses: ['custom-view-tree-node-item-resourceLabel'],
				matches: matches ? matches : createMatches(element.filterData),
				strikethrough: treeItemLabel?.strikethrough,
				disabledCommand: !commandEnabled,
				labelEscapeNewLines: true,
				forceLabel: !!node.label
			});
		} else {
			templateData.resourceLabel.setResource({ name: label, description }, {
				title,
				hideIcon: true,
				extraClasses: ['custom-view-tree-node-item-resourceLabel'],
				matches: matches ? matches : createMatches(element.filterData),
				strikethrough: treeItemLabel?.strikethrough,
				disabledCommand: !commandEnabled,
				labelEscapeNewLines: true
			});
		}

		if (iconUrl) {
			templateData.icon.className = 'custom-view-tree-node-item-icon';
			templateData.icon.style.backgroundImage = DOM.asCSSUrl(iconUrl);
		} else {
			let iconClass: string | undefined;
			if (this.shouldShowThemeIcon(!!resource, node.themeIcon)) {
				iconClass = ThemeIcon.asClassName(node.themeIcon);
				if (node.themeIcon.color) {
					templateData.icon.style.color = this.themeService.getColorTheme().getColor(node.themeIcon.color.id)?.toString() ?? '';
				}
			}
			templateData.icon.className = iconClass ? `custom-view-tree-node-item-icon ${iconClass}` : '';
			templateData.icon.style.backgroundImage = '';
		}

		if (!commandEnabled) {
			templateData.icon.className = templateData.icon.className + ' disabled';
			if (templateData.container.parentElement) {
				templateData.container.parentElement.className = templateData.container.parentElement.className + ' disabled';
			}
		}

		templateData.actionBar.context = <TreeViewItemHandleArg>{ $treeViewId: this.treeViewId, $treeItemHandle: node.handle };

		const menuActions = this.menus.getResourceActions(node);
		if (menuActions.menu) {
			templateData.elementDisposable.add(menuActions.menu);
		}
		templateData.actionBar.push(menuActions.actions, { icon: true, label: false });

		if (this._actionRunner) {
			templateData.actionBar.actionRunner = this._actionRunner;
		}
		this.setAlignment(templateData.container, node);
		this.treeViewsService.addRenderedTreeItemElement(node, templateData.container);

		// remember rendered element
		this._renderedElements.set(element.element.handle, { original: element, rendered: templateData });
	}

	private rerender() {
		// As we add items to the map during this call we can't directly use the map in the for loop
		// but have to create a copy of the keys first
		const keys = new Set(this._renderedElements.keys());
		for (const key of keys) {
			const value = this._renderedElements.get(key);
			if (value) {
				this.disposeElement(value.original, 0, value.rendered);
				this.renderElement(value.original, 0, value.rendered);
			}
		}
	}

	private renderCheckbox(node: ITreeItem, templateData: ITreeExplorerTemplateData) {
		if (node.checkbox) {
			// The first time we find a checkbox we want to rerender the visible tree to adapt the alignment
			if (!this._hasCheckbox) {
				this._hasCheckbox = true;
				this.rerender();
			}
			if (!templateData.checkbox) {
				const checkbox = new TreeItemCheckbox(templateData.checkboxContainer, this.checkboxStateHandler, this._hoverDelegate);
				templateData.checkbox = checkbox;
			}
			templateData.checkbox.render(node);
		}
		else if (templateData.checkbox) {
			templateData.checkbox.dispose();
			templateData.checkbox = undefined;
		}
	}

	private setAlignment(container: HTMLElement, treeItem: ITreeItem) {
		container.parentElement!.classList.toggle('align-icon-with-twisty', !this._hasCheckbox && this.aligner.alignIconWithTwisty(treeItem));
	}

	private shouldHideResourceLabelIcon(iconUrl: URI | undefined, icon: ThemeIcon | undefined): boolean {
		// We always hide the resource label in favor of the iconUrl when it's provided.
		// When `ThemeIcon` is provided, we hide the resource label icon in favor of it only if it's a not a file icon.
		return (!!iconUrl || (!!icon && !this.isFileKindThemeIcon(icon)));
	}

	private shouldShowThemeIcon(hasResource: boolean, icon: ThemeIcon | undefined): icon is ThemeIcon {
		if (!icon) {
			return false;
		}

		// If there's a resource and the icon is a file icon, then the icon (or lack thereof) will already be coming from the
		// icon theme and should use whatever the icon theme has provided.
		return !(hasResource && this.isFileKindThemeIcon(icon));
	}

	private isFolderThemeIcon(icon: ThemeIcon | undefined): boolean {
		return icon?.id === FolderThemeIcon.id;
	}

	private isFileKindThemeIcon(icon: ThemeIcon | undefined): boolean {
		if (icon) {
			return icon.id === FileThemeIcon.id || this.isFolderThemeIcon(icon);
		} else {
			return false;
		}
	}

	private getFileKind(node: ITreeItem): FileKind {
		if (node.themeIcon) {
			switch (node.themeIcon.id) {
				case FileThemeIcon.id:
					return FileKind.FILE;
				case FolderThemeIcon.id:
					return FileKind.FOLDER;
			}
		}
		return node.collapsibleState === TreeItemCollapsibleState.Collapsed || node.collapsibleState === TreeItemCollapsibleState.Expanded ? FileKind.FOLDER : FileKind.FILE;
	}

	private updateCheckboxes(items: ITreeItem[]) {
		const additionalItems: ITreeItem[] = [];

		if (!this.manuallyManageCheckboxes) {
			for (const item of items) {
				if (item.checkbox !== undefined) {

					function checkChildren(currentItem: ITreeItem) {
						for (const child of (currentItem.children ?? [])) {
							if ((child.checkbox !== undefined) && (currentItem.checkbox !== undefined) && (child.checkbox.isChecked !== currentItem.checkbox.isChecked)) {
								child.checkbox.isChecked = currentItem.checkbox.isChecked;
								additionalItems.push(child);
								checkChildren(child);
							}
						}
					}
					checkChildren(item);

					const visitedParents: Set<ITreeItem> = new Set();
					function checkParents(currentItem: ITreeItem) {
						if (currentItem.parent && (currentItem.parent.checkbox !== undefined) && currentItem.parent.children) {
							if (visitedParents.has(currentItem.parent)) {
								return;
							} else {
								visitedParents.add(currentItem.parent);
							}

							let someUnchecked = false;
							let someChecked = false;
							for (const child of currentItem.parent.children) {
								if (someUnchecked && someChecked) {
									break;
								}
								if (child.checkbox !== undefined) {
									if (child.checkbox.isChecked) {
										someChecked = true;
									} else {
										someUnchecked = true;
									}
								}
							}
							if (someChecked && !someUnchecked && (currentItem.parent.checkbox.isChecked !== true)) {
								currentItem.parent.checkbox.isChecked = true;
								additionalItems.push(currentItem.parent);
								checkParents(currentItem.parent);
							} else if (someUnchecked && (currentItem.parent.checkbox.isChecked !== false)) {
								currentItem.parent.checkbox.isChecked = false;
								additionalItems.push(currentItem.parent);
								checkParents(currentItem.parent);
							}
						}
					}
					checkParents(item);
				}
			}
		}
		items = items.concat(additionalItems);
		items.forEach(item => {
			const renderedItem = this._renderedElements.get(item.handle);
			if (renderedItem) {
				renderedItem.rendered.checkbox?.render(item);
			}
		});
		this._onDidChangeCheckboxState.fire(items);
	}

	disposeElement(resource: ITreeNode<ITreeItem, FuzzyScore>, index: number, templateData: ITreeExplorerTemplateData): void {
		templateData.elementDisposable.clear();

		this._renderedElements.delete(resource.element.handle);
		this.treeViewsService.removeRenderedTreeItemElement(resource.element);

		templateData.checkbox?.dispose();
		templateData.checkbox = undefined;
	}

	disposeTemplate(templateData: ITreeExplorerTemplateData): void {
		templateData.resourceLabel.dispose();
		templateData.actionBar.dispose();
		templateData.elementDisposable.dispose();
	}
}

class Aligner extends Disposable {
	private _tree: WorkbenchAsyncDataTree<ITreeItem, ITreeItem, FuzzyScore> | undefined;

	constructor(private themeService: IThemeService) {
		super();
	}

	set tree(tree: WorkbenchAsyncDataTree<ITreeItem, ITreeItem, FuzzyScore>) {
		this._tree = tree;
	}

	public alignIconWithTwisty(treeItem: ITreeItem): boolean {
		if (treeItem.collapsibleState !== TreeItemCollapsibleState.None) {
			return false;
		}
		if (!this.hasIcon(treeItem)) {
			return false;
		}

		if (this._tree) {
			const parent: ITreeItem = this._tree.getParentElement(treeItem) || this._tree.getInput();
			if (this.hasIcon(parent)) {
				return !!parent.children && parent.children.some(c => c.collapsibleState !== TreeItemCollapsibleState.None && !this.hasIcon(c));
			}
			return !!parent.children && parent.children.every(c => c.collapsibleState === TreeItemCollapsibleState.None || !this.hasIcon(c));
		} else {
			return false;
		}
	}

	private hasIcon(node: ITreeItem): boolean {
		const icon = this.themeService.getColorTheme().type === ColorScheme.LIGHT ? node.icon : node.iconDark;
		if (icon) {
			return true;
		}
		if (node.resourceUri || node.themeIcon) {
			const fileIconTheme = this.themeService.getFileIconTheme();
			const isFolder = node.themeIcon ? node.themeIcon.id === FolderThemeIcon.id : node.collapsibleState !== TreeItemCollapsibleState.None;
			if (isFolder) {
				return fileIconTheme.hasFileIcons && fileIconTheme.hasFolderIcons;
			}
			return fileIconTheme.hasFileIcons;
		}
		return false;
	}
}

class MultipleSelectionActionRunner extends ActionRunner {

	constructor(notificationService: INotificationService, private getSelectedResources: (() => ITreeItem[])) {
		super();
		this._register(this.onDidRun(e => {
			if (e.error && !isCancellationError(e.error)) {
				notificationService.error(localize('command-error', 'Error running command {1}: {0}. This is likely caused by the extension that contributes {1}.', e.error.message, e.action.id));
			}
		}));
	}

	protected override async runAction(action: IAction, context: TreeViewItemHandleArg | TreeViewPaneHandleArg): Promise<void> {
		const selection = this.getSelectedResources();
		let selectionHandleArgs: TreeViewItemHandleArg[] | undefined = undefined;
		let actionInSelected: boolean = false;
		if (selection.length > 1) {
			selectionHandleArgs = selection.map(selected => {
				if ((selected.handle === (context as TreeViewItemHandleArg).$treeItemHandle) || (context as TreeViewPaneHandleArg).$selectedTreeItems) {
					actionInSelected = true;
				}
				return { $treeViewId: context.$treeViewId, $treeItemHandle: selected.handle };
			});
		}

		if (!actionInSelected) {
			selectionHandleArgs = undefined;
		}

		await action.run(context, selectionHandleArgs);
	}
}

class TreeMenus extends Disposable implements IDisposable {
	private contextKeyService: IContextKeyService | undefined;
	private _onDidChange = new Emitter<ITreeItem>();
	public readonly onDidChange = this._onDidChange.event;

	constructor(
		private id: string,
		@IMenuService private readonly menuService: IMenuService
	) {
		super();
	}

	/**
	 * Caller is now responsible for disposing of the menu!
	 */
	getResourceActions(element: ITreeItem): { menu?: IMenu; actions: IAction[] } {
		const actions = this.getActions(MenuId.ViewItemContext, element, true);
		return { menu: actions.menu, actions: actions.primary };
	}

	getResourceContextActions(element: ITreeItem): IAction[] {
		return this.getActions(MenuId.ViewItemContext, element).secondary;
	}

	public setContextKeyService(service: IContextKeyService) {
		this.contextKeyService = service;
	}

	private getActions(menuId: MenuId, element: ITreeItem, listen: boolean = false): { menu?: IMenu; primary: IAction[]; secondary: IAction[] } {
		if (!this.contextKeyService) {
			return { primary: [], secondary: [] };
		}

		const contextKeyService = this.contextKeyService.createOverlay([
			['view', this.id],
			['viewItem', element.contextValue]
		]);

		const menu = this.menuService.createMenu(menuId, contextKeyService);
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary, menu };
		createAndFillInContextMenuActions(menu, { shouldForwardArgs: true }, result, 'inline');
		if (listen) {
			this._register(menu.onDidChange(() => this._onDidChange.fire(element)));
		} else {
			menu.dispose();
		}
		return result;
	}

	override dispose() {
		this.contextKeyService = undefined;
		super.dispose();
	}
}

export class CustomTreeView extends AbstractTreeView {

	private activated: boolean = false;

	constructor(
		id: string,
		title: string,
		private readonly extensionId: string,
		@IThemeService themeService: IThemeService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICommandService commandService: ICommandService,
		@IConfigurationService configurationService: IConfigurationService,
		@IProgressService progressService: IProgressService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService notificationService: INotificationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHoverService hoverService: IHoverService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IActivityService activityService: IActivityService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService logService: ILogService,
	) {
		super(id, title, themeService, instantiationService, commandService, configurationService, progressService, contextMenuService, keybindingService, notificationService, viewDescriptorService, hoverService, contextKeyService, activityService, logService);
	}

	protected activate() {
		if (!this.activated) {
			type ExtensionViewTelemetry = {
				extensionId: TelemetryTrustedValue<string>;
				id: string;
			};
			type ExtensionViewTelemetryMeta = {
				extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Id of the extension' };
				id: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Id of the view' };
				owner: 'digitarald';
				comment: 'Helps to gain insights on what extension contributed views are most popular';
			};
			this.telemetryService.publicLog2<ExtensionViewTelemetry, ExtensionViewTelemetryMeta>('Extension:ViewActivate', {
				extensionId: new TelemetryTrustedValue(this.extensionId),
				id: this.id,
			});
			this.createTree();
			this.progressService.withProgress({ location: this.id }, () => this.extensionService.activateByEvent(`onView:${this.id}`))
				.then(() => timeout(2000))
				.then(() => {
					this.updateMessage();
				});
			this.activated = true;
		}
	}
}

export class TreeView extends AbstractTreeView {

	private activated: boolean = false;

	protected activate() {
		if (!this.activated) {
			this.createTree();
			this.activated = true;
		}
	}
}

interface TreeDragSourceInfo {
	id: string;
	itemHandles: string[];
}

export class CustomTreeViewDragAndDrop implements ITreeDragAndDrop<ITreeItem> {
	private readonly treeMimeType: string;
	private readonly treeItemsTransfer = LocalSelectionTransfer.getInstance<DraggedTreeItemsIdentifier>();
	private dragCancellationToken: CancellationTokenSource | undefined;

	constructor(
		private readonly treeId: string,
		@ILabelService private readonly labelService: ILabelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITreeViewsDnDService private readonly treeViewsDragAndDropService: ITreeViewsDnDService,
		@ILogService private readonly logService: ILogService) {
		this.treeMimeType = `application/vnd.code.tree.${treeId.toLowerCase()}`;
	}

	private dndController: ITreeViewDragAndDropController | undefined;
	set controller(controller: ITreeViewDragAndDropController | undefined) {
		this.dndController = controller;
	}

	private handleDragAndLog(dndController: ITreeViewDragAndDropController, itemHandles: string[], uuid: string, dragCancellationToken: CancellationToken): Promise<VSDataTransfer | undefined> {
		return dndController.handleDrag(itemHandles, uuid, dragCancellationToken).then(additionalDataTransfer => {
			if (additionalDataTransfer) {
				const unlistedTypes: string[] = [];
				for (const item of additionalDataTransfer) {
					if ((item[0] !== this.treeMimeType) && (dndController.dragMimeTypes.findIndex(value => value === item[0]) < 0)) {
						unlistedTypes.push(item[0]);
					}
				}
				if (unlistedTypes.length) {
					this.logService.warn(`Drag and drop controller for tree ${this.treeId} adds the following data transfer types but does not declare them in dragMimeTypes: ${unlistedTypes.join(', ')}`);
				}
			}
			return additionalDataTransfer;
		});
	}

	private addExtensionProvidedTransferTypes(originalEvent: DragEvent, itemHandles: string[]) {
		if (!originalEvent.dataTransfer || !this.dndController) {
			return;
		}
		const uuid = generateUuid();

		this.dragCancellationToken = new CancellationTokenSource();
		this.treeViewsDragAndDropService.addDragOperationTransfer(uuid, this.handleDragAndLog(this.dndController, itemHandles, uuid, this.dragCancellationToken.token));
		this.treeItemsTransfer.setData([new DraggedTreeItemsIdentifier(uuid)], DraggedTreeItemsIdentifier.prototype);
		originalEvent.dataTransfer.clearData(Mimes.text);
		if (this.dndController.dragMimeTypes.find((element) => element === Mimes.uriList)) {
			// Add the type that the editor knows
			originalEvent.dataTransfer?.setData(DataTransfers.RESOURCES, '');
		}
		this.dndController.dragMimeTypes.forEach(supportedType => {
			originalEvent.dataTransfer?.setData(supportedType, '');
		});
	}

	private addResourceInfoToTransfer(originalEvent: DragEvent, resources: URI[]) {
		if (resources.length && originalEvent.dataTransfer) {
			// Apply some datatransfer types to allow for dragging the element outside of the application
			this.instantiationService.invokeFunction(accessor => fillEditorsDragData(accessor, resources, originalEvent));

			// The only custom data transfer we set from the explorer is a file transfer
			// to be able to DND between multiple code file explorers across windows
			const fileResources = resources.filter(s => s.scheme === Schemas.file).map(r => r.fsPath);
			if (fileResources.length) {
				originalEvent.dataTransfer.setData(CodeDataTransfers.FILES, JSON.stringify(fileResources));
			}
		}
	}

	onDragStart(data: IDragAndDropData, originalEvent: DragEvent): void {
		if (originalEvent.dataTransfer) {
			const treeItemsData = (data as ElementsDragAndDropData<ITreeItem, ITreeItem[]>).getData();
			const resources: URI[] = [];
			const sourceInfo: TreeDragSourceInfo = {
				id: this.treeId,
				itemHandles: []
			};
			treeItemsData.forEach(item => {
				sourceInfo.itemHandles.push(item.handle);
				if (item.resourceUri) {
					resources.push(URI.revive(item.resourceUri));
				}
			});
			this.addResourceInfoToTransfer(originalEvent, resources);
			this.addExtensionProvidedTransferTypes(originalEvent, sourceInfo.itemHandles);
			originalEvent.dataTransfer.setData(this.treeMimeType,
				JSON.stringify(sourceInfo));
		}
	}

	private debugLog(types: Set<string>) {
		if (types.size) {
			this.logService.debug(`TreeView dragged mime types: ${Array.from(types).join(', ')}`);
		} else {
			this.logService.debug(`TreeView dragged with no supported mime types.`);
		}
	}

	onDragOver(data: IDragAndDropData, targetElement: ITreeItem, targetIndex: number, originalEvent: DragEvent): boolean | ITreeDragOverReaction {
		const dataTransfer = toExternalVSDataTransfer(originalEvent.dataTransfer!);

		const types = new Set<string>(Array.from(dataTransfer, x => x[0]));

		if (originalEvent.dataTransfer) {
			// Also add uri-list if we have any files. At this stage we can't actually access the file itself though.
			for (const item of originalEvent.dataTransfer.items) {
				if (item.kind === 'file' || item.type === DataTransfers.RESOURCES.toLowerCase()) {
					types.add(Mimes.uriList);
					break;
				}
			}
		}

		this.debugLog(types);

		const dndController = this.dndController;
		if (!dndController || !originalEvent.dataTransfer || (dndController.dropMimeTypes.length === 0)) {
			return false;
		}
		const dragContainersSupportedType = Array.from(types).some((value, index) => {
			if (value === this.treeMimeType) {
				return true;
			} else {
				return dndController.dropMimeTypes.indexOf(value) >= 0;
			}
		});
		if (dragContainersSupportedType) {
			return { accept: true, bubble: TreeDragOverBubble.Down, autoExpand: true };
		}
		return false;
	}

	getDragURI(element: ITreeItem): string | null {
		if (!this.dndController) {
			return null;
		}
		return element.resourceUri ? URI.revive(element.resourceUri).toString() : element.handle;
	}

	getDragLabel?(elements: ITreeItem[]): string | undefined {
		if (!this.dndController) {
			return undefined;
		}
		if (elements.length > 1) {
			return String(elements.length);
		}
		const element = elements[0];
		return element.label ? element.label.label : (element.resourceUri ? this.labelService.getUriLabel(URI.revive(element.resourceUri)) : undefined);
	}

	async drop(data: IDragAndDropData, targetNode: ITreeItem | undefined, targetIndex: number | undefined, originalEvent: DragEvent): Promise<void> {
		const dndController = this.dndController;
		if (!originalEvent.dataTransfer || !dndController) {
			return;
		}

		let treeSourceInfo: TreeDragSourceInfo | undefined;
		let willDropUuid: string | undefined;
		if (this.treeItemsTransfer.hasData(DraggedTreeItemsIdentifier.prototype)) {
			willDropUuid = this.treeItemsTransfer.getData(DraggedTreeItemsIdentifier.prototype)![0].identifier;
		}

		const originalDataTransfer = toExternalVSDataTransfer(originalEvent.dataTransfer, true);

		const outDataTransfer = new VSDataTransfer();
		for (const [type, item] of originalDataTransfer) {
			if (type === this.treeMimeType || dndController.dropMimeTypes.includes(type) || (item.asFile() && dndController.dropMimeTypes.includes(DataTransfers.FILES.toLowerCase()))) {
				outDataTransfer.append(type, item);
				if (type === this.treeMimeType) {
					try {
						treeSourceInfo = JSON.parse(await item.asString());
					} catch {
						// noop
					}
				}
			}
		}

		const additionalDataTransfer = await this.treeViewsDragAndDropService.removeDragOperationTransfer(willDropUuid);
		if (additionalDataTransfer) {
			for (const [type, item] of additionalDataTransfer) {
				outDataTransfer.append(type, item);
			}
		}
		return dndController.handleDrop(outDataTransfer, targetNode, CancellationToken.None, willDropUuid, treeSourceInfo?.id, treeSourceInfo?.itemHandles);
	}

	onDragEnd(originalEvent: DragEvent): void {
		// Check if the drag was cancelled.
		if (originalEvent.dataTransfer?.dropEffect === 'none') {
			this.dragCancellationToken?.cancel();
		}
	}
}
