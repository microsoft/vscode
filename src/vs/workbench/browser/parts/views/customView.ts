/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/views';
import { Event, Emitter } from 'vs/base/common/event';
import { IDisposable, Disposable, toDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IAction, IActionViewItem, ActionRunner, Action } from 'vs/base/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { ContextAwareMenuEntryActionViewItem, createAndFillInActionBarActions, createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ITreeView, ITreeItem, TreeItemCollapsibleState, ITreeViewDataProvider, TreeViewItemHandleArg, ITreeViewDescriptor, IViewsRegistry, ViewContainer, ITreeItemLabel, Extensions } from 'vs/workbench/common/views';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import * as DOM from 'vs/base/browser/dom';
import { ResourceLabels, IResourceLabel } from 'vs/workbench/browser/labels';
import { ActionBar, IActionViewItemProvider, ActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { URI } from 'vs/base/common/uri';
import { dirname, basename } from 'vs/base/common/resources';
import { LIGHT, FileThemeIcon, FolderThemeIcon, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { FileKind } from 'vs/platform/files/common/files';
import { WorkbenchAsyncDataTree, TreeResourceNavigator2 } from 'vs/platform/list/browser/listService';
import { ViewletPanel, IViewletPanelOptions } from 'vs/workbench/browser/parts/views/panelViewlet';
import { localize } from 'vs/nls';
import { timeout } from 'vs/base/common/async';
import { editorFindMatchHighlight, editorFindMatchHighlightBorder, textLinkForeground, textCodeBlockBackground, focusBorder } from 'vs/platform/theme/common/colorRegistry';
import { isString } from 'vs/base/common/types';
import { ILabelService } from 'vs/platform/label/common/label';
import { Registry } from 'vs/platform/registry/common/platform';
import { IListVirtualDelegate, IIdentityProvider } from 'vs/base/browser/ui/list/list';
import { ITreeRenderer, ITreeNode, IAsyncDataSource, ITreeContextMenuEvent } from 'vs/base/browser/ui/tree/tree';
import { FuzzyScore, createMatches } from 'vs/base/common/filters';
import { CollapseAllAction } from 'vs/base/browser/ui/tree/treeDefaults';
import { isFalsyOrWhitespace } from 'vs/base/common/strings';

export class CustomTreeViewPanel extends ViewletPanel {

	private treeView: ITreeView;

	constructor(
		options: IViewletViewOptions,
		@INotificationService private readonly notificationService: INotificationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super({ ...(options as IViewletPanelOptions), ariaHeaderLabel: options.title }, keybindingService, contextMenuService, configurationService, contextKeyService);
		const { treeView } = (<ITreeViewDescriptor>Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).getView(options.id));
		this.treeView = treeView;
		this._register(this.treeView.onDidChangeActions(() => this.updateActions(), this));
		this._register(toDisposable(() => this.treeView.setVisibility(false)));
		this._register(this.onDidChangeBodyVisibility(() => this.updateTreeVisibility()));
		this.updateTreeVisibility();
	}

	focus(): void {
		super.focus();
		this.treeView.focus();
	}

	renderBody(container: HTMLElement): void {
		if (this.treeView instanceof CustomTreeView) {
			this.treeView.show(container);
		}
	}

	layoutBody(height: number, width: number): void {
		this.treeView.layout(height, width);
	}

	getActions(): IAction[] {
		return [...this.treeView.getPrimaryActions()];
	}

	getSecondaryActions(): IAction[] {
		return [...this.treeView.getSecondaryActions()];
	}

	getActionViewItem(action: IAction): IActionViewItem | undefined {
		return action instanceof MenuItemAction ? new ContextAwareMenuEntryActionViewItem(action, this.keybindingService, this.notificationService, this.contextMenuService) : undefined;
	}

	getOptimalWidth(): number {
		return this.treeView.getOptimalWidth();
	}

	private updateTreeVisibility(): void {
		this.treeView.setVisibility(this.isBodyVisible());
	}
}

class TitleMenus extends Disposable {

	private titleActions: IAction[] = [];
	private readonly titleActionsDisposable = this._register(new MutableDisposable());
	private titleSecondaryActions: IAction[] = [];

	private _onDidChangeTitle = this._register(new Emitter<void>());
	readonly onDidChangeTitle: Event<void> = this._onDidChangeTitle.event;

	constructor(
		id: string,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService,
	) {
		super();

		const scopedContextKeyService = this._register(this.contextKeyService.createScoped());
		scopedContextKeyService.createKey('view', id);

		const titleMenu = this._register(this.menuService.createMenu(MenuId.ViewTitle, scopedContextKeyService));
		const updateActions = () => {
			this.titleActions = [];
			this.titleSecondaryActions = [];
			this.titleActionsDisposable.value = createAndFillInActionBarActions(titleMenu, undefined, { primary: this.titleActions, secondary: this.titleSecondaryActions });
			this._onDidChangeTitle.fire();
		};

		this._register(titleMenu.onDidChange(updateActions));
		updateActions();

		this._register(toDisposable(() => {
			this.titleActions = [];
			this.titleSecondaryActions = [];
		}));
	}

	getTitleActions(): IAction[] {
		return this.titleActions;
	}

	getTitleSecondaryActions(): IAction[] {
		return this.titleSecondaryActions;
	}
}

class Root implements ITreeItem {
	label = { label: 'root' };
	handle = '0';
	parentHandle: string | undefined = undefined;
	collapsibleState = TreeItemCollapsibleState.Expanded;
	children: ITreeItem[] | undefined = undefined;
}

const noDataProviderMessage = localize('no-dataprovider', "There is no data provider registered that can provide view data.");

export class CustomTreeView extends Disposable implements ITreeView {

	private isVisible: boolean = false;
	private activated: boolean = false;
	private _hasIconForParentNode = false;
	private _hasIconForLeafNode = false;
	private _showCollapseAllAction = false;

	private focused: boolean = false;
	private domNode!: HTMLElement;
	private treeContainer!: HTMLElement;
	private _messageValue: string | undefined;
	private _canSelectMany: boolean = false;
	private messageElement!: HTMLDivElement;
	private tree: WorkbenchAsyncDataTree<ITreeItem, ITreeItem, FuzzyScore> | undefined;
	private treeLabels: ResourceLabels | undefined;

	private root: ITreeItem;
	private elementsToRefresh: ITreeItem[] = [];
	private menus: TitleMenus;

	private readonly _onDidExpandItem: Emitter<ITreeItem> = this._register(new Emitter<ITreeItem>());
	readonly onDidExpandItem: Event<ITreeItem> = this._onDidExpandItem.event;

	private readonly _onDidCollapseItem: Emitter<ITreeItem> = this._register(new Emitter<ITreeItem>());
	readonly onDidCollapseItem: Event<ITreeItem> = this._onDidCollapseItem.event;

	private _onDidChangeSelection: Emitter<ITreeItem[]> = this._register(new Emitter<ITreeItem[]>());
	readonly onDidChangeSelection: Event<ITreeItem[]> = this._onDidChangeSelection.event;

	private readonly _onDidChangeVisibility: Emitter<boolean> = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility.event;

	private readonly _onDidChangeActions: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeActions: Event<void> = this._onDidChangeActions.event;

	constructor(
		private id: string,
		private title: string,
		private viewContainer: ViewContainer,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IProgressService private readonly progressService: IProgressService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IKeybindingService private readonly keybindingService: IKeybindingService
	) {
		super();
		this.root = new Root();
		this.menus = this._register(instantiationService.createInstance(TitleMenus, this.id));
		this._register(this.menus.onDidChangeTitle(() => this._onDidChangeActions.fire()));
		this._register(this.themeService.onDidFileIconThemeChange(() => this.doRefresh([this.root]) /** soft refresh **/));
		this._register(this.themeService.onThemeChange(() => this.doRefresh([this.root]) /** soft refresh **/));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('explorer.decorations')) {
				this.doRefresh([this.root]); /** soft refresh **/
			}
		}));
		this._register(Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).onDidChangeContainer(({ views, from, to }) => {
			if (from === this.viewContainer && views.some(v => v.id === this.id)) {
				this.viewContainer = to;
			}
		}));
		this.create();
	}

	private _dataProvider: ITreeViewDataProvider | undefined;
	get dataProvider(): ITreeViewDataProvider | undefined {
		return this._dataProvider;
	}

	set dataProvider(dataProvider: ITreeViewDataProvider | undefined) {
		if (dataProvider) {
			this._dataProvider = new class implements ITreeViewDataProvider {
				async getChildren(node: ITreeItem): Promise<ITreeItem[]> {
					if (node && node.children) {
						return Promise.resolve(node.children);
					}
					const children = await (node instanceof Root ? dataProvider.getChildren() : dataProvider.getChildren(node));
					node.children = children;
					return children;
				}
			};
			this.updateMessage();
			this.refresh();
		} else {
			this._dataProvider = undefined;
			this.updateMessage();
		}
	}

	private _message: string | undefined;
	get message(): string | undefined {
		return this._message;
	}

	set message(message: string | undefined) {
		this._message = message;
		this.updateMessage();
	}

	get canSelectMany(): boolean {
		return this._canSelectMany;
	}

	set canSelectMany(canSelectMany: boolean) {
		this._canSelectMany = canSelectMany;
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

	get showCollapseAllAction(): boolean {
		return this._showCollapseAllAction;
	}

	set showCollapseAllAction(showCollapseAllAction: boolean) {
		if (this._showCollapseAllAction !== !!showCollapseAllAction) {
			this._showCollapseAllAction = !!showCollapseAllAction;
			this._onDidChangeActions.fire();
		}
	}

	getPrimaryActions(): IAction[] {
		if (this.showCollapseAllAction) {
			const collapseAllAction = new Action('vs.tree.collapse', localize('collapseAll', "Collapse All"), 'monaco-tree-action collapse-all', true, () => this.tree ? new CollapseAllAction<ITreeItem, ITreeItem, FuzzyScore>(this.tree, true).run() : Promise.resolve());
			return [...this.menus.getTitleActions(), collapseAllAction];
		} else {
			return this.menus.getTitleActions();
		}
	}

	getSecondaryActions(): IAction[] {
		return this.menus.getTitleSecondaryActions();
	}

	setVisibility(isVisible: boolean): void {
		isVisible = !!isVisible;
		if (this.isVisible === isVisible) {
			return;
		}

		this.isVisible = isVisible;
		if (this.isVisible) {
			this.activate();
		}

		if (this.tree) {
			if (this.isVisible) {
				DOM.show(this.tree.getHTMLElement());
			} else {
				DOM.hide(this.tree.getHTMLElement()); // make sure the tree goes out of the tabindex world by hiding it
			}

			if (this.isVisible && this.elementsToRefresh.length) {
				this.doRefresh(this.elementsToRefresh);
				this.elementsToRefresh = [];
			}
		}

		this._onDidChangeVisibility.fire(this.isVisible);
	}

	focus(reveal: boolean = true): void {
		if (this.tree && this.root.children && this.root.children.length > 0) {
			// Make sure the current selected element is revealed
			const selectedElement = this.tree.getSelection()[0];
			if (selectedElement && reveal) {
				this.tree.reveal(selectedElement, 0.5);
			}

			// Pass Focus to Viewer
			this.tree.domFocus();
		} else {
			this.domNode.focus();
		}
	}

	show(container: HTMLElement): void {
		DOM.append(container, this.domNode);
	}

	private create() {
		this.domNode = DOM.$('.tree-explorer-viewlet-tree-view');
		this.messageElement = DOM.append(this.domNode, DOM.$('.message'));
		this.treeContainer = DOM.append(this.domNode, DOM.$('.customview-tree'));
		DOM.addClass(this.treeContainer, 'file-icon-themable-tree');
		DOM.addClass(this.treeContainer, 'show-file-icons');
		const focusTracker = this._register(DOM.trackFocus(this.domNode));
		this._register(focusTracker.onDidFocus(() => this.focused = true));
		this._register(focusTracker.onDidBlur(() => this.focused = false));
	}

	private createTree() {
		const actionViewItemProvider = (action: IAction) => action instanceof MenuItemAction ? this.instantiationService.createInstance(ContextAwareMenuEntryActionViewItem, action) : undefined;
		const treeMenus = this._register(this.instantiationService.createInstance(TreeMenus, this.id));
		this.treeLabels = this._register(this.instantiationService.createInstance(ResourceLabels, this));
		const dataSource = this.instantiationService.createInstance(TreeDataSource, this, <T>(task: Promise<T>) => this.progressService.withProgress({ location: this.viewContainer.id }, () => task));
		const aligner = new Aligner(this.themeService);
		const renderer = this.instantiationService.createInstance(TreeRenderer, this.id, treeMenus, this.treeLabels, actionViewItemProvider, aligner);

		this.tree = this._register(this.instantiationService.createInstance(WorkbenchAsyncDataTree, this.treeContainer, new CustomTreeDelegate(), [renderer],
			dataSource, {
				identityProvider: new CustomViewIdentityProvider(),
				accessibilityProvider: {
					getAriaLabel(element: ITreeItem): string {
						return element.label ? element.label.label : '';
					}
				},
				ariaLabel: this.title,
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: (item: ITreeItem) => {
						return item.label ? item.label.label : (item.resourceUri ? basename(URI.revive(item.resourceUri)) : undefined);
					}
				},
				expandOnlyOnTwistieClick: (e: ITreeItem) => !!e.command,
				collapseByDefault: (e: ITreeItem): boolean => {
					return e.collapsibleState !== TreeItemCollapsibleState.Expanded;
				},
				multipleSelectionSupport: this.canSelectMany,
			}) as WorkbenchAsyncDataTree<ITreeItem, ITreeItem, FuzzyScore>);
		aligner.tree = this.tree;
		const actionRunner = new MultipleSelectionActionRunner(() => this.tree!.getSelection());
		renderer.actionRunner = actionRunner;

		this.tree.contextKeyService.createKey<boolean>(this.id, true);
		this._register(this.tree.onContextMenu(e => this.onContextMenu(treeMenus, e, actionRunner)));
		this._register(this.tree.onDidChangeSelection(e => this._onDidChangeSelection.fire(e.elements)));
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

		const customTreeNavigator = new TreeResourceNavigator2(this.tree, { openOnFocus: false, openOnSelection: false });
		this._register(customTreeNavigator);
		this._register(customTreeNavigator.onDidOpenResource(e => {
			if (!e.browserEvent) {
				return;
			}
			const selection = this.tree!.getSelection();
			if ((selection.length === 1) && selection[0].command) {
				this.commandService.executeCommand(selection[0].command.id, ...(selection[0].command.arguments || []));
			}
		}));
	}

	private onContextMenu(treeMenus: TreeMenus, treeEvent: ITreeContextMenuEvent<ITreeItem>, actionRunner: MultipleSelectionActionRunner): void {
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

	private updateMessage(): void {
		if (this._message) {
			this.showMessage(this._message);
		} else if (!this.dataProvider) {
			this.showMessage(noDataProviderMessage);
		} else {
			this.hideMessage();
		}
		this.updateContentAreas();
	}

	private showMessage(message: string): void {
		DOM.removeClass(this.messageElement, 'hide');
		if (this._messageValue !== message) {
			this.resetMessageElement();
			this._messageValue = message;
			if (!isFalsyOrWhitespace(this._message)) {
				this.messageElement.textContent = this._messageValue;
			}
			this.layout(this._height, this._width);
		}
	}

	private hideMessage(): void {
		this.resetMessageElement();
		DOM.addClass(this.messageElement, 'hide');
		this.layout(this._height, this._width);
	}

	private resetMessageElement(): void {
		DOM.clearNode(this.messageElement);
	}

	private _height: number = 0;
	private _width: number = 0;
	layout(height: number, width: number) {
		if (height && width) {
			this._height = height;
			this._width = width;
			const treeHeight = height - DOM.getTotalHeight(this.messageElement);
			this.treeContainer.style.height = treeHeight + 'px';
			if (this.tree) {
				this.tree.layout(treeHeight, width);
			}
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

	refresh(elements?: ITreeItem[]): Promise<void> {
		if (this.dataProvider && this.tree) {
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
		return Promise.resolve(undefined);
	}

	async expand(itemOrItems: ITreeItem | ITreeItem[]): Promise<void> {
		const tree = this.tree;
		if (tree) {
			itemOrItems = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
			await Promise.all(itemOrItems.map(element => {
				return tree.expand(element, false);
			}));
		}
		return Promise.resolve(undefined);
	}

	setSelection(items: ITreeItem[]): void {
		if (this.tree) {
			this.tree.setSelection(items);
		}
	}

	setFocus(item: ITreeItem): void {
		if (this.tree) {
			this.focus();
			this.tree.setFocus([item]);
		}
	}

	reveal(item: ITreeItem): Promise<void> {
		if (this.tree) {
			return Promise.resolve(this.tree.reveal(item));
		}
		return Promise.resolve();
	}

	private activate() {
		if (!this.activated) {
			this.createTree();
			this.progressService.withProgress({ location: this.viewContainer.id }, () => this.extensionService.activateByEvent(`onView:${this.id}`))
				.then(() => timeout(2000))
				.then(() => {
					this.updateMessage();
				});
			this.activated = true;
		}
	}

	private refreshing: boolean = false;
	private async doRefresh(elements: ITreeItem[]): Promise<void> {
		const tree = this.tree;
		if (tree) {
			this.refreshing = true;
			const parents: Set<ITreeItem> = new Set<ITreeItem>();
			elements.forEach(element => {
				if (element !== this.root) {
					const parent = tree.getParentElement(element);
					parents.add(parent);
				} else {
					parents.add(element);
				}
			});
			await Promise.all(Array.from(parents.values()).map(element => tree.updateChildren(element, true)));
			this.refreshing = false;
			this.updateContentAreas();
			if (this.focused) {
				this.focus(false);
			}
		}
	}

	private updateContentAreas(): void {
		const isTreeEmpty = !this.root.children || this.root.children.length === 0;
		// Hide tree container only when there is a message and tree is empty and not refreshing
		if (this._messageValue && isTreeEmpty && !this.refreshing) {
			DOM.addClass(this.treeContainer, 'hide');
			this.domNode.setAttribute('tabindex', '0');
		} else {
			DOM.removeClass(this.treeContainer, 'hide');
			this.domNode.removeAttribute('tabindex');
		}
	}
}

class CustomViewIdentityProvider implements IIdentityProvider<ITreeItem> {
	getId(element: ITreeItem): { toString(): string; } {
		return element.handle;
	}
}

class CustomTreeDelegate implements IListVirtualDelegate<ITreeItem> {

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

	getChildren(element: ITreeItem): ITreeItem[] | Promise<ITreeItem[]> {
		if (this.treeView.dataProvider) {
			return this.withProgress(this.treeView.dataProvider.getChildren(element));
		}
		return Promise.resolve([]);
	}
}

// todo@joh,sandy make this proper and contributable from extensions
registerThemingParticipant((theme, collector) => {

	const findMatchHighlightColor = theme.getColor(editorFindMatchHighlight);
	if (findMatchHighlightColor) {
		collector.addRule(`.file-icon-themable-tree .monaco-list-row .content .monaco-highlighted-label .highlight { color: unset !important; background-color: ${findMatchHighlightColor}; }`);
		collector.addRule(`.monaco-tl-contents .monaco-highlighted-label .highlight { color: unset !important; background-color: ${findMatchHighlightColor}; }`);
	}
	const findMatchHighlightColorBorder = theme.getColor(editorFindMatchHighlightBorder);
	if (findMatchHighlightColorBorder) {
		collector.addRule(`.file-icon-themable-tree .monaco-list-row .content .monaco-highlighted-label .highlight { color: unset !important; border: 1px dotted ${findMatchHighlightColorBorder}; box-sizing: border-box; }`);
		collector.addRule(`.monaco-tl-contents .monaco-highlighted-label .highlight { color: unset !important; border: 1px dotted ${findMatchHighlightColorBorder}; box-sizing: border-box; }`);
	}
	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.tree-explorer-viewlet-tree-view > .message a { color: ${link}; }`);
	}
	const focusBorderColor = theme.getColor(focusBorder);
	if (focusBorderColor) {
		collector.addRule(`.tree-explorer-viewlet-tree-view > .message a:focus { outline: 1px solid ${focusBorderColor}; outline-offset: -1px; }`);
	}
	const codeBackground = theme.getColor(textCodeBlockBackground);
	if (codeBackground) {
		collector.addRule(`.tree-explorer-viewlet-tree-view > .message code { background-color: ${codeBackground}; }`);
	}
});

interface ITreeExplorerTemplateData {
	elementDisposable: IDisposable;
	container: HTMLElement;
	resourceLabel: IResourceLabel;
	icon: HTMLElement;
	actionBar: ActionBar;
}

class TreeRenderer extends Disposable implements ITreeRenderer<ITreeItem, FuzzyScore, ITreeExplorerTemplateData> {
	static readonly ITEM_HEIGHT = 22;
	static readonly TREE_TEMPLATE_ID = 'treeExplorer';

	private _actionRunner: MultipleSelectionActionRunner | undefined;

	constructor(
		private treeViewId: string,
		private menus: TreeMenus,
		private labels: ResourceLabels,
		private actionViewItemProvider: IActionViewItemProvider,
		private aligner: Aligner,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILabelService private readonly labelService: ILabelService
	) {
		super();
	}

	get templateId(): string {
		return TreeRenderer.TREE_TEMPLATE_ID;
	}

	set actionRunner(actionRunner: MultipleSelectionActionRunner) {
		this._actionRunner = actionRunner;
	}

	renderTemplate(container: HTMLElement): ITreeExplorerTemplateData {
		DOM.addClass(container, 'custom-view-tree-node-item');

		const icon = DOM.append(container, DOM.$('.custom-view-tree-node-item-icon'));

		const resourceLabel = this.labels.create(container, { supportHighlights: true });
		const actionsContainer = DOM.append(resourceLabel.element, DOM.$('.actions'));
		const actionBar = new ActionBar(actionsContainer, {
			actionViewItemProvider: this.actionViewItemProvider
		});

		return { resourceLabel, icon, actionBar, container, elementDisposable: Disposable.None };
	}

	renderElement(element: ITreeNode<ITreeItem, FuzzyScore>, index: number, templateData: ITreeExplorerTemplateData): void {
		templateData.elementDisposable.dispose();
		const node = element.element;
		const resource = node.resourceUri ? URI.revive(node.resourceUri) : null;
		const treeItemLabel: ITreeItemLabel | undefined = node.label ? node.label : resource ? { label: basename(resource) } : undefined;
		const description = isString(node.description) ? node.description : resource && node.description === true ? this.labelService.getUriLabel(dirname(resource), { relative: true }) : undefined;
		const label = treeItemLabel ? treeItemLabel.label : undefined;
		const icon = this.themeService.getTheme().type === LIGHT ? node.icon : node.iconDark;
		const iconUrl = icon ? URI.revive(icon) : null;
		const title = node.tooltip ? node.tooltip : resource ? undefined : label;

		// reset
		templateData.actionBar.clear();

		if (resource || node.themeIcon) {
			const fileDecorations = this.configurationService.getValue<{ colors: boolean, badges: boolean }>('explorer.decorations');
			templateData.resourceLabel.setResource({ name: label, description, resource: resource ? resource : URI.parse('missing:_icon_resource') }, { fileKind: this.getFileKind(node), title, hideIcon: !!iconUrl, fileDecorations, extraClasses: ['custom-view-tree-node-item-resourceLabel'], matches: createMatches(element.filterData) });
		} else {
			templateData.resourceLabel.setResource({ name: label, description }, { title, hideIcon: true, extraClasses: ['custom-view-tree-node-item-resourceLabel'], matches: createMatches(element.filterData) });
		}

		templateData.icon.style.backgroundImage = iconUrl ? DOM.asCSSUrl(iconUrl) : '';
		DOM.toggleClass(templateData.icon, 'custom-view-tree-node-item-icon', !!iconUrl);
		templateData.actionBar.context = <TreeViewItemHandleArg>{ $treeViewId: this.treeViewId, $treeItemHandle: node.handle };
		templateData.actionBar.push(this.menus.getResourceActions(node), { icon: true, label: false });
		if (this._actionRunner) {
			templateData.actionBar.actionRunner = this._actionRunner;
		}
		this.setAlignment(templateData.container, node);
		templateData.elementDisposable = (this.themeService.onDidFileIconThemeChange(() => this.setAlignment(templateData.container, node)));
	}

	private setAlignment(container: HTMLElement, treeItem: ITreeItem) {
		DOM.toggleClass(container.parentElement!, 'align-icon-with-twisty', this.aligner.alignIconWithTwisty(treeItem));
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

	disposeElement(resource: ITreeNode<ITreeItem, FuzzyScore>, index: number, templateData: ITreeExplorerTemplateData): void {
		templateData.elementDisposable.dispose();
	}

	disposeTemplate(templateData: ITreeExplorerTemplateData): void {
		templateData.resourceLabel.dispose();
		templateData.actionBar.dispose();
		templateData.elementDisposable.dispose();
	}
}

class Aligner extends Disposable {
	private _tree: WorkbenchAsyncDataTree<ITreeItem, ITreeItem, FuzzyScore> | undefined;

	constructor(private themeService: IWorkbenchThemeService) {
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
				return false;
			}
			return !!parent.children && parent.children.every(c => c.collapsibleState === TreeItemCollapsibleState.None || !this.hasIcon(c));
		} else {
			return false;
		}
	}

	private hasIcon(node: ITreeItem): boolean {
		const icon = this.themeService.getTheme().type === LIGHT ? node.icon : node.iconDark;
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

	constructor(private getSelectedResources: (() => ITreeItem[])) {
		super();
	}

	runAction(action: IAction, context: TreeViewItemHandleArg): Promise<any> {
		const selection = this.getSelectedResources();
		let selectionHandleArgs: TreeViewItemHandleArg[] | undefined = undefined;
		if (selection.length > 1) {
			selectionHandleArgs = [];
			selection.forEach(selected => {
				if (selected.handle !== context.$treeItemHandle) {
					selectionHandleArgs!.push({ $treeViewId: context.$treeViewId, $treeItemHandle: selected.handle });
				}
			});
		}

		return action.run(...[context, selectionHandleArgs]);
	}
}

class TreeMenus extends Disposable implements IDisposable {

	constructor(
		private id: string,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService
	) {
		super();
	}

	getResourceActions(element: ITreeItem): IAction[] {
		return this.getActions(MenuId.ViewItemContext, { key: 'viewItem', value: element.contextValue }).primary;
	}

	getResourceContextActions(element: ITreeItem): IAction[] {
		return this.getActions(MenuId.ViewItemContext, { key: 'viewItem', value: element.contextValue }).secondary;
	}

	private getActions(menuId: MenuId, context: { key: string, value?: string }): { primary: IAction[]; secondary: IAction[]; } {
		const contextKeyService = this.contextKeyService.createScoped();
		contextKeyService.createKey('view', this.id);
		contextKeyService.createKey(context.key, context.value);

		const menu = this.menuService.createMenu(menuId, contextKeyService);
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };
		createAndFillInContextMenuActions(menu, { shouldForwardArgs: true }, result, this.contextMenuService, g => /^inline/.test(g));

		menu.dispose();
		contextKeyService.dispose();

		return result;
	}
}

