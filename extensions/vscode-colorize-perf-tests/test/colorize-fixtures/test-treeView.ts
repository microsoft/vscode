/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DataTransfers, IDragAndDropData } from '../../../../base/browser/dnd.js';
import * as DOM from '../../../../base/browser/dom.js';
import * as cssJs from '../../../../base/browser/cssValue.js';
import { renderMarkdownAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { ActionBar, IActionViewItemProvider } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate.js';
import { IIdentityProvider, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { ElementsDragAndDropData, ListViewTargetSector } from '../../../../base/browser/ui/list/listView.js';
import { IAsyncDataSource, ITreeContextMenuEvent, ITreeDragAndDrop, ITreeDragOverReaction, ITreeNode, ITreeRenderer, TreeDragOverBubble } from '../../../../base/browser/ui/tree/tree.js';
import { CollapseAllAction } from '../../../../base/browser/ui/tree/treeDefaults.js';
import { ActionRunner, IAction, Separator } from '../../../../base/common/actions.js';
import { timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { createMatches, FuzzyScore } from '../../../../base/common/filters.js';
import { IMarkdownString, isMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Mimes } from '../../../../base/common/mime.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename, dirname } from '../../../../base/common/resources.js';
import { isFalsyOrWhitespace } from '../../../../base/common/strings.js';
import { isString } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import './media/views.css';
import { VSDataTransfer } from '../../../../base/common/dataTransfer.js';
import { localize } from '../../../../nls.js';
import { createActionViewItem, getContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, IMenuService, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKey, IContextKeyChangeEvent, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ColorScheme } from '../../../../platform/theme/common/theme.js';
import { FileThemeIcon, FolderThemeIcon, IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { fillEditorsDragData } from '../../dnd.js';
import { IResourceLabel, ResourceLabels } from '../../labels.js';
import { API_OPEN_DIFF_EDITOR_COMMAND_ID, API_OPEN_EDITOR_COMMAND_ID } from '../editor/editorCommands.js';
import { getLocationBasedViewColors, IViewPaneOptions, ViewPane } from './viewPane.js';
import { IViewletViewOptions } from './viewsViewlet.js';
import { Extensions, ITreeItem, ITreeItemLabel, ITreeView, ITreeViewDataProvider, ITreeViewDescriptor, ITreeViewDragAndDropController, IViewBadge, IViewDescriptorService, IViewsRegistry, ResolvableTreeItem, TreeCommand, TreeItemCollapsibleState, TreeViewItemHandleArg, TreeViewPaneHandleArg, ViewContainer, ViewContainerLocation } from '../../../common/views.js';
import { IActivityService, NumberBadge } from '../../../services/activity/common/activity.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IHoverService, WorkbenchHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { CodeDataTransfers, LocalSelectionTransfer } from '../../../../platform/dnd/browser/dnd.js';
import { toExternalVSDataTransfer } from '../../../../editor/browser/dnd.js';
import { CheckboxStateHandler, TreeItemCheckbox } from './checkbox.js';
import { setTimeout0 } from '../../../../base/common/platform.js';
import { AriaRole } from '../../../../base/browser/ui/aria/aria.js';
import { TelemetryTrustedValue } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { ITreeViewsDnDService } from '../../../../editor/common/services/treeViewsDndService.js';
import { DraggedTreeItemsIdentifier } from '../../../../editor/common/services/treeViewsDnd.js';
import { IMarkdownRenderResult, MarkdownRenderer } from '../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import type { IManagedHoverTooltipMarkdownString } from '../../../../base/browser/ui/hover/hover.js';
import { parseLinkedText } from '../../../../base/common/linkedText.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IAccessibleViewInformationService } from '../../../services/accessibility/common/accessibleViewInformationService.js';
import { Command } from '../../../../editor/common/languages.js';

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
		@INotificationService notificationService: INotificationService,
		@IHoverService hoverService: IHoverService,
		@IAccessibleViewInformationService accessibleViewService: IAccessibleViewInformationService,
	) {
		super({ ...(options as IViewPaneOptions), titleMenuId: MenuId.ViewTitle, donotForwardArgs: false }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService, accessibleViewService);
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
		return ((this.treeView.dataProvider === undefined) || !!this.treeView.dataProvider.isTreeEmpty) && ((this.treeView.message === undefined) || (this.treeView.message === ''));
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

function commandPreconditions(commandId: string): ContextKeyExpression | undefined {
	const command = CommandsRegistry.getCommand(commandId);
	if (command) {
		const commandAction = MenuRegistry.getCommand(command.id);
		return commandAction && commandAction.precondition;
	}
	return undefined;
}

function isTreeCommandEnabled(treeCommand: TreeCommand | Command, contextKeyService: IContextKeyService): boolean {
	const commandId: string = (treeCommand as TreeCommand).originalId ? (treeCommand as TreeCommand).originalId! : treeCommand.id;
	const precondition = commandPreconditions(commandId);
	if (precondition) {
		return contextKeyService.contextMatchesRules(precondition);
	}

	return true;
}

interface RenderedMessage { element: HTMLElement; disposables: DisposableStore }

function isRenderedMessageValue(messageValue: string | RenderedMessage | undefined): messageValue is RenderedMessage {
	return !!messageValue && typeof messageValue !== 'string' && 'element' in messageValue && 'disposables' in messageValue;
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
	private _messageValue: string | { element: HTMLElement; disposables: DisposableStore } | undefined;
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
		@ILogService private readonly logService: ILogService,
		@IOpenerService private readonly openerService: IOpenerService
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

		// Remember when adding to this method that it isn't called until the view is visible, meaning that
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
				this.tree?.updateOptions({ overrideStyles: getLocationBasedViewColors(this.viewLocation).listOverrideStyles });
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
			if (this.visible) {
				this.activate();
			}
			const self = this;
			this._dataProvider = new class implements ITreeViewDataProvider {
				private _isEmpty: boolean = true;
				private _onDidChangeEmpty: Emitter<void> = new Emitter();
				public onDidChangeEmpty: Event<void> = this._onDidChangeEmpty.event;

				get isTreeEmpty(): boolean {
					return this._isEmpty;
				}

				async getChildren(element?: ITreeItem): Promise<ITreeItem[] | undefined> {
					const batches = await this.getChildrenBatch(element ? [element] : undefined);
					return batches?.[0];
				}

				private updateEmptyState(nodes: ITreeItem[], childrenGroups: ITreeItem[][]): void {
					if ((nodes.length === 1) && (nodes[0] instanceof Root)) {
						const oldEmpty = this._isEmpty;
						this._isEmpty = (childrenGroups.length === 0) || (childrenGroups[0].length === 0);
						if (oldEmpty !== this._isEmpty) {
							this._onDidChangeEmpty.fire();
						}
					}
				}

				private findCheckboxesUpdated(nodes: ITreeItem[], childrenGroups: ITreeItem[][]): ITreeItem[] {
					if (childrenGroups.length === 0) {
						return [];
					}
					const checkboxesUpdated: ITreeItem[] = [];

					for (let i = 0; i < nodes.length; i++) {
						const node = nodes[i];
						const children = childrenGroups[i];
						for (const child of children) {
							child.parent = node;
							if (!self.manuallyManageCheckboxes && (node?.checkbox?.isChecked === true) && (child.checkbox?.isChecked === false)) {
								child.checkbox.isChecked = true;
								checkboxesUpdated.push(child);
							}
						}
					}
					return checkboxesUpdated;
				}

				async getChildrenBatch(nodes?: ITreeItem[]): Promise<ITreeItem[][]> {
					let childrenGroups: ITreeItem[][];
					let checkboxesUpdated: ITreeItem[] = [];
					if (nodes && nodes.every((node): node is Required<ITreeItem & { children: ITreeItem[] }> => !!node.children)) {
						childrenGroups = nodes.map(node => node.children);
					} else {
						nodes = nodes ?? [self.root];
						const batchedChildren = await (nodes.length === 1 && nodes[0] instanceof Root ? doGetChildrenOrBatch(dataProvider, undefined) : doGetChildrenOrBatch(dataProvider, nodes));
						for (let i = 0; i < nodes.length; i++) {
							const node = nodes[i];
							node.children = batchedChildren ? batchedChildren[i] : undefined;
						}
						childrenGroups = batchedChildren ?? [];
						checkboxesUpdated = this.findCheckboxesUpdated(nodes, childrenGroups);
					}

					this.updateEmptyState(nodes, childrenGroups);

					if (checkboxesUpdated.length > 0) {
						self._onDidChangeCheckboxState.fire(checkboxesUpdated);
					}
					return childrenGroups;
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
			this.treeDisposables.clear();
			this.activated = false;
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
	private readonly _activity = this._register(new MutableDisposable<IDisposable>());

	get badge(): IViewBadge | undefined {
		return this._badge;
	}

	set badge(badge: IViewBadge | undefined) {

		if (this._badge?.value === badge?.value &&
			this._badge?.tooltip === badge?.tooltip) {
			return;
		}

		this._badge = badge;
		if (badge) {
			const activity = {
				badge: new NumberBadge(badge.value, () => badge.tooltip),
				priority: 50
			};
			this._activity.value = this.activityService.showViewActivity(this.id, activity);
		} else {
			this._activity.clear();
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
			this.collapseAllContextKey = new RawContextKey<boolean>(`treeView.${this.id}.enableCollapseAll`, startingValue, localize('treeView.enableCollapseAll', "Whether the tree view with id {0} enables collapse all.", this.id));
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

	protected activated: boolean = false;
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

	private readonly treeDisposables: DisposableStore = this._register(new DisposableStore());
	protected createTree() {
		this.treeDisposables.clear();
		const actionViewItemProvider = createActionViewItem.bind(undefined, this.instantiationService);
		const treeMenus = this.treeDisposables.add(this.instantiationService.createInstance(TreeMenus, this.id));
		this.treeLabels = this.treeDisposables.add(this.instantiationService.createInstance(ResourceLabels, this));
		const dataSource = this.instantiationService.createInstance(TreeDataSource, this, <T>(task: Promise<T>) => this.progressService.withProgress({ location: this.id }, () => task));
		const aligner = this.treeDisposables.add(new Aligner(this.themeService));
		const checkboxStateHandler = this.treeDisposables.add(new CheckboxStateHandler());
		const renderer = this.treeDisposables.add(this.instantiationService.createInstance(TreeRenderer, this.id, treeMenus, this.treeLabels, actionViewItemProvider, aligner, checkboxStateHandler, () => this.manuallyManageCheckboxes));
		this.treeDisposables.add(renderer.onDidChangeCheckboxState(e => this._onDidChangeCheckboxState.fire(e)));

		const widgetAriaLabel = this._title;

		this.tree = this.treeDisposables.add(this.instantiationService.createInstance(Tree, this.id, this.treeContainer!, new TreeViewDelegate(), [renderer],
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
			overrideStyles: getLocationBasedViewColors(this.viewLocation).listOverrideStyles
		}) as WorkbenchAsyncDataTree<ITreeItem, ITreeItem, FuzzyScore>);

		this.treeDisposables.add(renderer.onDidChangeMenuContext(e => e.forEach(e => this.tree?.rerender(e))));

		this.treeDisposables.add(this.tree);
		treeMenus.setContextKeyService(this.tree.contextKeyService);
		aligner.tree = this.tree;
		const actionRunner = this.treeDisposables.add(new MultipleSelectionActionRunner(this.notificationService, () => this.tree!.getSelection()));
		renderer.actionRunner = actionRunner;

		this.tree.contextKeyService.createKey<boolean>(this.id, true);
		const customTreeKey = RawCustomTreeViewContextKey.bindTo(this.tree.contextKeyService);
		customTreeKey.set(true);
		this.treeDisposables.add(this.tree.onContextMenu(e => this.onContextMenu(treeMenus, e, actionRunner)));

		this.treeDisposables.add(this.tree.onDidChangeSelection(e => {
			this.lastSelection = e.elements;
			this.lastActive = this.tree?.getFocus()[0] ?? this.lastActive;
			this._onDidChangeSelectionAndFocus.fire({ selection: this.lastSelection, focus: this.lastActive });
		}));
		this.treeDisposables.add(this.tree.onDidChangeFocus(e => {
			if (e.elements.length && (e.elements[0] !== this.lastActive)) {
				this.lastActive = e.elements[0];
				this.lastSelection = this.tree?.getSelection() ?? this.lastSelection;
				this._onDidChangeSelectionAndFocus.fire({ selection: this.lastSelection, focus: this.lastActive });
			}
		}));
		this.treeDisposables.add(this.tree.onDidChangeCollapseState(e => {
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

		this.treeDisposables.add(this.tree.onDidOpen(async (e) => {
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

		this.treeDisposables.add(treeMenus.onDidChange((changed) => {
			if (this.tree?.hasNode(changed)) {
				this.tree?.rerender(changed);
			}
		}));
	}

	private async resolveCommand(element: ITreeItem | undefined): Promise<TreeCommand | undefined> {
		let command = element?.command;
		if (element && !command) {
			if ((element instanceof ResolvableTreeItem) && element.hasResolve) {
				await element.resolve(CancellationToken.None);
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
		let selected = this.canSelectMany ? this.getSelection() : [];
		if (!selected.find(item => item.handle === node.handle)) {
			selected = [node];
		}

		const actions = treeMenus.getResourceContextActions(selected);
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

			getActionsContext: () => ({ $treeViewId: this.id, $treeItemHandle: node.handle } satisfies TreeViewItemHandleArg),

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

	private processMessage(message: IMarkdownString, disposables: DisposableStore): HTMLElement {
		const lines = message.value.split('\n');
		const result: (IMarkdownRenderResult | HTMLElement)[] = [];
		let hasFoundButton = false;
		for (const line of lines) {
			const linkedText = parseLinkedText(line);

			if (linkedText.nodes.length === 1 && typeof linkedText.nodes[0] !== 'string') {
				const node = linkedText.nodes[0];
				const buttonContainer = document.createElement('div');
				buttonContainer.classList.add('button-container');
				const button = new Button(buttonContainer, { title: node.title, secondary: hasFoundButton, supportIcons: true, ...defaultButtonStyles });
				button.label = node.label;
				button.onDidClick(_ => {
					this.openerService.open(node.href, { allowCommands: true });
				}, null, disposables);

				const href = URI.parse(node.href);
				if (href.scheme === Schemas.command) {
					const preConditions = commandPreconditions(href.path);
					if (preConditions) {
						button.enabled = this.contextKeyService.contextMatchesRules(preConditions);
						disposables.add(this.contextKeyService.onDidChangeContext(e => {
							if (e.affectsSome(new Set(preConditions.keys()))) {
								button.enabled = this.contextKeyService.contextMatchesRules(preConditions);
							}
						}));
					}
				}

				disposables.add(button);
				hasFoundButton = true;
				result.push(buttonContainer);
			} else {
				hasFoundButton = false;
				const rendered = this.markdownRenderer!.render(new MarkdownString(line, { isTrusted: message.isTrusted, supportThemeIcons: message.supportThemeIcons, supportHtml: message.supportHtml }));
				result.push(rendered.element);
				disposables.add(rendered);
			}
		}

		const container = document.createElement('div');
		container.classList.add('rendered-message');
		for (const child of result) {
			if (DOM.isHTMLElement(child)) {
				container.appendChild(child);
			} else {
				container.appendChild(child.element);
			}
		}
		return container;
	}

	private showMessage(message: string | IMarkdownString): void {
		if (isRenderedMessageValue(this._messageValue)) {
			this._messageValue.disposables.dispose();
		}
		if (isMarkdownString(message) && !this.markdownRenderer) {
			this.markdownRenderer = this.instantiationService.createInstance(MarkdownRenderer, {});
		}
		if (isMarkdownString(message)) {
			const disposables = new DisposableStore();
			const renderedMessage = this.processMessage(message, disposables);
			this._messageValue = { element: renderedMessage, disposables };
		} else {
			this._messageValue = message;
		}
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

	private updateCheckboxes(elements: readonly ITreeItem[]): ITreeItem[] {
		return setCascadingCheckboxUpdates(elements);
	}

	async refresh(elements?: readonly ITreeItem[], checkboxes?: readonly ITreeItem[]): Promise<void> {
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
				const affectedElements = this.updateCheckboxes(checkboxes ?? []);
				return this.doRefresh(elements.concat(affectedElements));
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
			} else if (this.tree.getFocus().length === 0) {
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

async function doGetChildrenOrBatch(dataProvider: ITreeViewDataProvider, nodes: ITreeItem[] | undefined): Promise<ITreeItem[][] | undefined> {
	if (dataProvider.getChildrenBatch) {
		return dataProvider.getChildrenBatch(nodes);
	} else {
		if (nodes) {
			return Promise.all(nodes.map(node => dataProvider.getChildren(node).then(children => children ?? [])));
		} else {
			return [await dataProvider.getChildren()].filter(children => children !== undefined);
		}
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

	private batch: ITreeItem[] | undefined;
	private batchPromise: Promise<ITreeItem[][] | undefined> | undefined;
	async getChildren(element: ITreeItem): Promise<ITreeItem[]> {
		const dataProvider = this.treeView.dataProvider;
		if (!dataProvider) {
			return [];
		}
		if (this.batch === undefined) {
			this.batch = [element];
			this.batchPromise = undefined;
		} else {
			this.batch.push(element);
		}
		const indexInBatch = this.batch.length - 1;
		return new Promise<ITreeItem[]>((resolve, reject) => {
			setTimeout(async () => {
				const batch = this.batch;
				this.batch = undefined;
				if (!this.batchPromise) {
					this.batchPromise = this.withProgress(doGetChildrenOrBatch(dataProvider, batch));
				}
				try {
					const result = await this.batchPromise;
					resolve((result && (indexInBatch < result.length)) ? result[indexInBatch] : []);
				} catch (e) {
					if (!(<string>e.message).startsWith('Bad progress location:')) {
						reject(e);
					}
				}
			}, 0);
		});
	}
}

interface ITreeExplorerTemplateData {
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

	private _onDidChangeMenuContext: Emitter<readonly ITreeItem[]> = this._register(new Emitter<readonly ITreeItem[]>());
	readonly onDidChangeMenuContext: Event<readonly ITreeItem[]> = this._onDidChangeMenuContext.event;

	private _actionRunner: MultipleSelectionActionRunner | undefined;
	private _hoverDelegate: IHoverDelegate;
	private _hasCheckbox: boolean = false;
	private _renderedElements = new Map<string, { original: ITreeNode<ITreeItem, FuzzyScore>; rendered: ITreeExplorerTemplateData }[]>(); // tree item handle to template data

	constructor(
		private treeViewId: string,
		private menus: TreeMenus,
		private labels: ResourceLabels,
		private actionViewItemProvider: IActionViewItemProvider,
		private aligner: Aligner,
		private checkboxStateHandler: CheckboxStateHandler,
		private readonly manuallyManageCheckboxes: () => boolean,
		@IThemeService private readonly themeService: IThemeService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILabelService private readonly labelService: ILabelService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IHoverService private readonly hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._hoverDelegate = this._register(instantiationService.createInstance(WorkbenchHoverDelegate, 'mouse', false, {}));
		this._register(this.themeService.onDidFileIconThemeChange(() => this.rerender()));
		this._register(this.themeService.onDidColorThemeChange(() => this.rerender()));
		this._register(checkboxStateHandler.onDidChangeCheckboxState(items => {
			this.updateCheckboxes(items);
		}));
		this._register(this.contextKeyService.onDidChangeContext(e => this.onDidChangeContext(e)));
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

		return { resourceLabel, icon, checkboxContainer, actionBar, container };
	}

	private getHover(label: string | undefined, resource: URI | null, node: ITreeItem): string | IManagedHoverTooltipMarkdownString | undefined {
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
			templateData.icon.style.backgroundImage = cssJs.asCSSUrl(iconUrl);
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

		templateData.actionBar.context = { $treeViewId: this.treeViewId, $treeItemHandle: node.handle } satisfies TreeViewItemHandleArg;

		const menuActions = this.menus.getResourceActions([node]);
		templateData.actionBar.push(menuActions, { icon: true, label: false });

		if (this._actionRunner) {
			templateData.actionBar.actionRunner = this._actionRunner;
		}
		this.setAlignment(templateData.container, node);

		// remember rendered element, an element can be rendered multiple times
		const renderedItems = this._renderedElements.get(element.element.handle) ?? [];
		this._renderedElements.set(element.element.handle, [...renderedItems, { original: element, rendered: templateData }]);
	}

	private rerender() {
		// As we add items to the map during this call we can't directly use the map in the for loop
		// but have to create a copy of the keys first
		const keys = new Set(this._renderedElements.keys());
		for (const key of keys) {
			const values = this._renderedElements.get(key) ?? [];
			for (const value of values) {
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
				const checkbox = new TreeItemCheckbox(templateData.checkboxContainer, this.checkboxStateHandler, this._hoverDelegate, this.hoverService);
				templateData.checkbox = checkbox;
			}
			templateData.checkbox.render(node);
		} else if (templateData.checkbox) {
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

	private onDidChangeContext(e: IContextKeyChangeEvent) {
		const items: ITreeItem[] = [];
		for (const [_, elements] of this._renderedElements) {
			for (const element of elements) {
				if (e.affectsSome(this.menus.getElementOverlayContexts(element.original.element)) || e.affectsSome(this.menus.getEntireMenuContexts())) {
					items.push(element.original.element);
				}
			}
		}
		if (items.length) {
			this._onDidChangeMenuContext.fire(items);
		}
	}

	private updateCheckboxes(items: ITreeItem[]) {
		let allItems: ITreeItem[] = [];

		if (!this.manuallyManageCheckboxes()) {
			allItems = setCascadingCheckboxUpdates(items);
		}

		allItems.forEach(item => {
			const renderedItems = this._renderedElements.get(item.handle);
			if (renderedItems) {
				renderedItems.forEach(renderedItems => renderedItems.rendered.checkbox?.render(item));
			}
		});
		this._onDidChangeCheckboxState.fire(allItems);
	}

	disposeElement(resource: ITreeNode<ITreeItem, FuzzyScore>, index: number, templateData: ITreeExplorerTemplateData): void {
		const itemRenders = this._renderedElements.get(resource.element.handle) ?? [];
		const renderedIndex = itemRenders.findIndex(renderedItem => templateData === renderedItem.rendered);

		if (itemRenders.length === 1) {
			this._renderedElements.delete(resource.element.handle);
		} else if (itemRenders.length > 0) {
			itemRenders.splice(renderedIndex, 1);
		}

		templateData.checkbox?.dispose();
		templateData.checkbox = undefined;
	}

	disposeTemplate(templateData: ITreeExplorerTemplateData): void {
		templateData.resourceLabel.dispose();
		templateData.actionBar.dispose();
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

		if (!actionInSelected && selectionHandleArgs) {
			selectionHandleArgs = undefined;
		}

		await action.run(context, selectionHandleArgs);
	}
}

class TreeMenus implements IDisposable {
	private contextKeyService: IContextKeyService | undefined;
	private _onDidChange = new Emitter<ITreeItem>();
	public readonly onDidChange = this._onDidChange.event;

	constructor(
		private id: string,
		@IMenuService private readonly menuService: IMenuService
	) { }

	/**
	 * Gets only the actions that apply to all of the given elements.
	 */
	getResourceActions(elements: ITreeItem[]): IAction[] {
		const actions = this.getActions(this.getMenuId(), elements);
		return actions.primary;
	}

	/**
	 * Gets only the actions that apply to all of the given elements.
	 */
	getResourceContextActions(elements: ITreeItem[]): IAction[] {
		return this.getActions(this.getMenuId(), elements).secondary;
	}

	public setContextKeyService(service: IContextKeyService) {
		this.contextKeyService = service;
	}

	private filterNonUniversalActions(groups: Map<string, IAction>[], newActions: IAction[]) {
		const newActionsSet: Set<string> = new Set(newActions.map(a => a.id));
		for (const group of groups) {
			const actions = group.keys();
			for (const action of actions) {
				if (!newActionsSet.has(action)) {
					group.delete(action);
				}
			}
		}
	}

	private buildMenu(groups: Map<string, IAction>[]): IAction[] {
		const result: IAction[] = [];
		for (const group of groups) {
			if (group.size > 0) {
				if (result.length) {
					result.push(new Separator());
				}
				result.push(...group.values());
			}
		}
		return result;
	}

	private createGroups(actions: IAction[]): Map<string, IAction>[] {
		const groups: Map<string, IAction>[] = [];
		let group: Map<string, IAction> = new Map();
		for (const action of actions) {
			if (action instanceof Separator) {
				groups.push(group);
				group = new Map();
			} else {
				group.set(action.id, action);
			}
		}
		groups.push(group);
		return groups;
	}

	public getElementOverlayContexts(element: ITreeItem): Map<string, any> {
		return new Map([
			['view', this.id],
			['viewItem', element.contextValue]
		]);
	}

	public getEntireMenuContexts(): ReadonlySet<string> {
		return this.menuService.getMenuContexts(this.getMenuId());
	}

	public getMenuId(): MenuId {
		return MenuId.ViewItemContext;
	}

	private getActions(menuId: MenuId, elements: ITreeItem[]): { primary: IAction[]; secondary: IAction[] } {
		if (!this.contextKeyService) {
			return { primary: [], secondary: [] };
		}

		let primaryGroups: Map<string, IAction>[] = [];
		let secondaryGroups: Map<string, IAction>[] = [];
		for (let i = 0; i < elements.length; i++) {
			const element = elements[i];
			const contextKeyService = this.contextKeyService.createOverlay(this.getElementOverlayContexts(element));

			const menuData = this.menuService.getMenuActions(menuId, contextKeyService, { shouldForwardArgs: true });

			const result = getContextMenuActions(menuData, 'inline');
			if (i === 0) {
				primaryGroups = this.createGroups(result.primary);
				secondaryGroups = this.createGroups(result.secondary);
			} else {
				this.filterNonUniversalActions(primaryGroups, result.primary);
				this.filterNonUniversalActions(secondaryGroups, result.secondary);
			}
		}

		return { primary: this.buildMenu(primaryGroups), secondary: this.buildMenu(secondaryGroups) };
	}

	dispose() {
		this.contextKeyService = undefined;
	}
}

export class CustomTreeView extends AbstractTreeView {

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
		@IOpenerService openerService: IOpenerService
	) {
		super(id, title, themeService, instantiationService, commandService, configurationService, progressService, contextMenuService, keybindingService, notificationService, viewDescriptorService, hoverService, contextKeyService, activityService, logService, openerService);
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

	onDragOver(data: IDragAndDropData, targetElement: ITreeItem, targetIndex: number, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): boolean | ITreeDragOverReaction {
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

	async drop(data: IDragAndDropData, targetNode: ITreeItem | undefined, targetIndex: number | undefined, targetSector: ListViewTargetSector | undefined, originalEvent: DragEvent): Promise<void> {
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

	dispose(): void { }
}

function setCascadingCheckboxUpdates(items: readonly ITreeItem[]) {
	const additionalItems: ITreeItem[] = [];

	for (const item of items) {
		if (item.checkbox !== undefined) {

			const checkChildren = (currentItem: ITreeItem) => {
				for (const child of (currentItem.children ?? [])) {
					if ((child.checkbox !== undefined) && (currentItem.checkbox !== undefined) && (child.checkbox.isChecked !== currentItem.checkbox.isChecked)) {
						child.checkbox.isChecked = currentItem.checkbox.isChecked;
						additionalItems.push(child);
						checkChildren(child);
					}
				}
			};
			checkChildren(item);

			const visitedParents: Set<ITreeItem> = new Set();
			const checkParents = (currentItem: ITreeItem) => {
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
			};
			checkParents(item);
		}
	}

	return items.concat(additionalItems);
}
