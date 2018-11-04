/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/views';
import { Event, Emitter } from 'vs/base/common/event';
import { IDisposable, dispose, Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';
import { IAction, IActionItem, ActionRunner, Action } from 'vs/base/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { ContextAwareMenuItemActionItem, fillInActionBarActions, fillInContextMenuActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IViewsService, ITreeViewer, ITreeItem, TreeItemCollapsibleState, ITreeViewDataProvider, TreeViewItemHandleArg, ICustomViewDescriptor, ViewsRegistry, ViewContainer, ITreeItemLabel } from 'vs/workbench/common/views';
import { IViewletViewOptions, FileIconThemableWorkbenchTree } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IProgressService2 } from 'vs/platform/progress/common/progress';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import * as DOM from 'vs/base/browser/dom';
import { IDataSource, ITree, IRenderer, ContextMenuEvent } from 'vs/base/parts/tree/browser/tree';
import { ResourceLabel } from 'vs/workbench/browser/labels';
import { ActionBar, IActionItemProvider, ActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { URI } from 'vs/base/common/uri';
import { basename } from 'vs/base/common/paths';
import { LIGHT, FileThemeIcon, FolderThemeIcon, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { FileKind } from 'vs/platform/files/common/files';
import { WorkbenchTreeController } from 'vs/platform/list/browser/listService';
import { ViewletPanel, IViewletPanelOptions } from 'vs/workbench/browser/parts/views/panelViewlet';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { localize } from 'vs/nls';
import { timeout } from 'vs/base/common/async';
import { CollapseAllAction } from 'vs/base/parts/tree/browser/treeDefaults';
import { editorFindMatchHighlight, editorFindMatchHighlightBorder } from 'vs/platform/theme/common/colorRegistry';

export class CustomTreeViewPanel extends ViewletPanel {

	private treeViewer: ITreeViewer;

	constructor(
		options: IViewletViewOptions,
		@INotificationService private notificationService: INotificationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IViewsService viewsService: IViewsService,
	) {
		super({ ...(options as IViewletPanelOptions), ariaHeaderLabel: options.title }, keybindingService, contextMenuService, configurationService);
		const { treeViewer } = (<ICustomViewDescriptor>ViewsRegistry.getView(options.id));
		this.treeViewer = treeViewer;
		this.treeViewer.onDidChangeActions(() => this.updateActions(), this, this.disposables);
		this.disposables.push(toDisposable(() => this.treeViewer.setVisibility(false)));
		this.updateTreeVisibility();
	}

	setVisible(visible: boolean): void {
		super.setVisible(visible);
		this.updateTreeVisibility();
	}

	focus(): void {
		super.focus();
		this.treeViewer.focus();
	}

	renderBody(container: HTMLElement): void {
		this.treeViewer.show(container);
	}

	setExpanded(expanded: boolean): void {
		this.treeViewer.setVisibility(this.isVisible() && expanded);
		super.setExpanded(expanded);
	}

	layoutBody(size: number): void {
		this.treeViewer.layout(size);
	}

	getActions(): IAction[] {
		return [...this.treeViewer.getPrimaryActions()];
	}

	getSecondaryActions(): IAction[] {
		return [...this.treeViewer.getSecondaryActions()];
	}

	getActionItem(action: IAction): IActionItem {
		return action instanceof MenuItemAction ? new ContextAwareMenuItemActionItem(action, this.keybindingService, this.notificationService, this.contextMenuService) : undefined;
	}

	getOptimalWidth(): number {
		return this.treeViewer.getOptimalWidth();
	}

	private updateTreeVisibility(): void {
		this.treeViewer.setVisibility(this.isVisible() && this.isExpanded());
	}

	dispose(): void {
		dispose(this.disposables);
		super.dispose();
	}
}

class TitleMenus implements IDisposable {

	private disposables: IDisposable[] = [];
	private titleDisposable: IDisposable = Disposable.None;
	private titleActions: IAction[] = [];
	private titleSecondaryActions: IAction[] = [];

	private _onDidChangeTitle = new Emitter<void>();
	get onDidChangeTitle(): Event<void> { return this._onDidChangeTitle.event; }

	constructor(
		id: string,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IMenuService private menuService: IMenuService,
	) {
		if (this.titleDisposable) {
			this.titleDisposable.dispose();
			this.titleDisposable = Disposable.None;
		}

		const _contextKeyService = this.contextKeyService.createScoped();
		_contextKeyService.createKey('view', id);

		const titleMenu = this.menuService.createMenu(MenuId.ViewTitle, _contextKeyService);
		const updateActions = () => {
			this.titleActions = [];
			this.titleSecondaryActions = [];
			fillInActionBarActions(titleMenu, undefined, { primary: this.titleActions, secondary: this.titleSecondaryActions });
			this._onDidChangeTitle.fire();
		};

		const listener = titleMenu.onDidChange(updateActions);
		updateActions();

		this.titleDisposable = toDisposable(() => {
			listener.dispose();
			titleMenu.dispose();
			_contextKeyService.dispose();
			this.titleActions = [];
			this.titleSecondaryActions = [];
		});
	}

	getTitleActions(): IAction[] {
		return this.titleActions;
	}

	getTitleSecondaryActions(): IAction[] {
		return this.titleSecondaryActions;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

class Root implements ITreeItem {
	label = { label: 'root' };
	handle = '0';
	parentHandle = null;
	collapsibleState = TreeItemCollapsibleState.Expanded;
	children = void 0;
}

const noDataProviderMessage = localize('no-dataprovider', "There is no data provider registered that can provide view data.");

export class CustomTreeViewer extends Disposable implements ITreeViewer {

	private isVisible: boolean = false;
	private activated: boolean = false;
	private _hasIconForParentNode = false;
	private _hasIconForLeafNode = false;
	private _showCollapseAllAction = false;

	private domNode: HTMLElement;
	private treeContainer: HTMLElement;
	private message: HTMLDivElement;
	private tree: FileIconThemableWorkbenchTree;
	private root: ITreeItem;
	private elementsToRefresh: ITreeItem[] = [];
	private menus: TitleMenus;

	private _dataProvider: ITreeViewDataProvider;

	private _onDidExpandItem: Emitter<ITreeItem> = this._register(new Emitter<ITreeItem>());
	readonly onDidExpandItem: Event<ITreeItem> = this._onDidExpandItem.event;

	private _onDidCollapseItem: Emitter<ITreeItem> = this._register(new Emitter<ITreeItem>());
	readonly onDidCollapseItem: Event<ITreeItem> = this._onDidCollapseItem.event;

	private _onDidChangeSelection: Emitter<ITreeItem[]> = this._register(new Emitter<ITreeItem[]>());
	readonly onDidChangeSelection: Event<ITreeItem[]> = this._onDidChangeSelection.event;

	private _onDidChangeVisibility: Emitter<boolean> = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility.event;

	private _onDidChangeActions: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeActions: Event<void> = this._onDidChangeActions.event;

	constructor(
		private id: string,
		private container: ViewContainer,
		@IExtensionService private extensionService: IExtensionService,
		@IWorkbenchThemeService private themeService: IWorkbenchThemeService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ICommandService private commandService: ICommandService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IProgressService2 private progressService: IProgressService2
	) {
		super();
		this.root = new Root();
		this.menus = this._register(this.instantiationService.createInstance(TitleMenus, this.id));
		this._register(this.menus.onDidChangeTitle(() => this._onDidChangeActions.fire()));
		this._register(this.themeService.onDidFileIconThemeChange(() => this.doRefresh([this.root]) /** soft refresh **/));
		this._register(this.themeService.onThemeChange(() => this.doRefresh([this.root]) /** soft refresh **/));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('explorer.decorations')) {
				this.doRefresh([this.root]); /** soft refresh **/
			}
		}));

		this.create();
	}

	get dataProvider(): ITreeViewDataProvider {
		return this._dataProvider;
	}

	set dataProvider(dataProvider: ITreeViewDataProvider) {
		if (dataProvider) {
			this._dataProvider = new class implements ITreeViewDataProvider {
				getChildren(node?: ITreeItem): TPromise<ITreeItem[]> {
					if (node && node.children) {
						return Promise.resolve(node.children);
					}
					const promise = node instanceof Root ? dataProvider.getChildren() : dataProvider.getChildren(node);
					return promise.then(children => {
						node.children = children;
						return children;
					});
				}
			};
			this.hideMessage();
			this.refresh();
		} else {
			this._dataProvider = null;
			this.showMessage(noDataProviderMessage);
		}
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
			const collapseAllAction = new Action('vs.tree.collapse', localize('collapse', "Collapse"), 'monaco-tree-action collapse-all', true, () => this.tree ? new CollapseAllAction(this.tree, true).run() : Promise.resolve());
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

			if (this.isVisible) {
				this.tree.onVisible();
			} else {
				this.tree.onHidden();
			}

			if (this.isVisible && this.elementsToRefresh.length) {
				this.doRefresh(this.elementsToRefresh);
				this.elementsToRefresh = [];
			}
		}

		this._onDidChangeVisibility.fire(this.isVisible);
	}

	focus(): void {
		if (this.tree) {
			// Make sure the current selected element is revealed
			const selectedElement = this.tree.getSelection()[0];
			if (selectedElement) {
				this.tree.reveal(selectedElement, 0.5);
			}

			// Pass Focus to Viewer
			this.tree.domFocus();
		}
	}

	show(container: HTMLElement): void {
		if (!this.tree) {
			this.createTree();
		}
		DOM.append(container, this.domNode);
	}

	private create() {
		this.domNode = DOM.$('.tree-explorer-viewlet-tree-view.message');
		this.message = DOM.append(this.domNode, DOM.$('.customview-message'));
		this.message.innerText = noDataProviderMessage;
		this.treeContainer = DOM.append(this.domNode, DOM.$('.customview-tree'));
	}

	private createTree() {
		const actionItemProvider = (action: IAction) => action instanceof MenuItemAction ? this.instantiationService.createInstance(ContextAwareMenuItemActionItem, action) : undefined;
		const menus = this.instantiationService.createInstance(TreeMenus, this.id);
		const dataSource = this.instantiationService.createInstance(TreeDataSource, this, this.container);
		const renderer = this.instantiationService.createInstance(TreeRenderer, this.id, menus, actionItemProvider);
		const controller = this.instantiationService.createInstance(TreeController, this.id, menus);
		this.tree = this.instantiationService.createInstance(FileIconThemableWorkbenchTree, this.treeContainer, { dataSource, renderer, controller }, {});
		this.tree.contextKeyService.createKey<boolean>(this.id, true);
		this._register(this.tree);
		this._register(this.tree.onDidChangeSelection(e => this.onSelection(e)));
		this._register(this.tree.onDidExpandItem(e => this._onDidExpandItem.fire(e.item.getElement())));
		this._register(this.tree.onDidCollapseItem(e => this._onDidCollapseItem.fire(e.item.getElement())));
		this._register(this.tree.onDidChangeSelection(e => this._onDidChangeSelection.fire(e.selection)));
		this.tree.setInput(this.root);
	}

	private showMessage(message: string): void {
		DOM.addClass(this.domNode, 'message');
		this.message.innerText = message;
	}

	private hideMessage(): void {
		DOM.removeClass(this.domNode, 'message');
	}

	layout(size: number) {
		this.domNode.style.height = size + 'px';
		if (this.tree) {
			this.tree.layout(size);
		}
	}

	getOptimalWidth(): number {
		if (this.tree) {
			const parentNode = this.tree.getHTMLElement();
			const childNodes = ([] as Element[]).slice.call(parentNode.querySelectorAll('.outline-item-label > a'));
			return DOM.getLargestChildWidth(parentNode, childNodes);
		}
		return 0;
	}

	refresh(elements?: ITreeItem[]): TPromise<void> {
		if (this.dataProvider && this.tree) {
			elements = elements || [this.root];
			for (const element of elements) {
				element.children = null; // reset children
			}
			if (this.isVisible) {
				return this.doRefresh(elements);
			} else {
				this.elementsToRefresh.push(...elements);
			}
		}
		return Promise.resolve(null);
	}

	expand(itemOrItems: ITreeItem | ITreeItem[]): TPromise<void> {
		itemOrItems = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
		return this.tree.expandAll(itemOrItems);
	}

	setSelection(items: ITreeItem[]): void {
		this.tree.setSelection(items, { source: 'api' });
	}

	setFocus(item: ITreeItem): void {
		this.focus();
		this.tree.setFocus(item);
	}

	reveal(item: ITreeItem): TPromise<void> {
		return this.tree.reveal(item);
	}

	private activate() {
		this.hideMessage();
		if (!this.activated) {
			this.progressService.withProgress({ location: this.container.id }, () => this.extensionService.activateByEvent(`onView:${this.id}`))
				.then(() => timeout(2000))
				.then(() => {
					if (!this.dataProvider) {
						this.showMessage(noDataProviderMessage);
					}
				});
			this.activated = true;
		}
	}

	private doRefresh(elements: ITreeItem[]): TPromise<void> {
		if (this.tree) {
			return Promise.all(elements.map(e => this.tree.refresh(e))).then(() => null);
		}
		return Promise.resolve(null);
	}

	private onSelection({ payload }: any): void {
		if (payload && (!!payload.didClickOnTwistie || payload.source === 'api')) {
			return;
		}
		const selection: ITreeItem = this.tree.getSelection()[0];
		if (selection) {
			if (selection.command) {
				const originalEvent: KeyboardEvent | MouseEvent = payload && payload.originalEvent;
				const isMouseEvent = payload && payload.origin === 'mouse';
				const isDoubleClick = isMouseEvent && originalEvent && originalEvent.detail === 2;

				if (!isMouseEvent || this.tree.openOnSingleClick || isDoubleClick) {
					this.commandService.executeCommand(selection.command.id, ...(selection.command.arguments || []));
				}
			}
		}
	}
}

class TreeDataSource implements IDataSource {

	constructor(
		private treeView: ITreeViewer,
		private container: ViewContainer,
		@IProgressService2 private progressService: IProgressService2
	) {
	}

	getId(tree: ITree, node: ITreeItem): string {
		return node.handle;
	}

	hasChildren(tree: ITree, node: ITreeItem): boolean {
		return this.treeView.dataProvider && node.collapsibleState !== TreeItemCollapsibleState.None;
	}

	getChildren(tree: ITree, node: ITreeItem): TPromise<any[]> {
		if (this.treeView.dataProvider) {
			return this.progressService.withProgress({ location: this.container.id }, () => this.treeView.dataProvider.getChildren(node));
		}
		return Promise.resolve([]);
	}

	shouldAutoexpand(tree: ITree, node: ITreeItem): boolean {
		return node.collapsibleState === TreeItemCollapsibleState.Expanded;
	}

	getParent(tree: ITree, node: any): TPromise<any> {
		return Promise.resolve(null);
	}
}

interface ITreeExplorerTemplateData {
	resourceLabel: ResourceLabel;
	icon: HTMLElement;
	actionBar: ActionBar;
	aligner: Aligner;
}

// todo@joh,sandy make this proper and contributable from extensions
registerThemingParticipant((theme, collector) => {

	const findMatchHighlightColor = theme.getColor(editorFindMatchHighlight);
	if (findMatchHighlightColor) {
		collector.addRule(`.file-icon-themable-tree .monaco-tree-row .content .monaco-highlighted-label .highlight { color: unset !important; background-color: ${findMatchHighlightColor}; }`);
	}
	const findMatchHighlightColorBorder = theme.getColor(editorFindMatchHighlightBorder);
	if (findMatchHighlightColorBorder) {
		collector.addRule(`.file-icon-themable-tree .monaco-tree-row .content .monaco-highlighted-label .highlight { color: unset !important; border: 1px dotted ${findMatchHighlightColorBorder}; box-sizing: border-box; }`);
	}
});

class TreeRenderer implements IRenderer {

	private static readonly ITEM_HEIGHT = 22;
	private static readonly TREE_TEMPLATE_ID = 'treeExplorer';

	constructor(
		private treeViewId: string,
		private menus: TreeMenus,
		private actionItemProvider: IActionItemProvider,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchThemeService private themeService: IWorkbenchThemeService,
		@IConfigurationService private configurationService: IConfigurationService,
	) {
	}

	getHeight(tree: ITree, element: any): number {
		return TreeRenderer.ITEM_HEIGHT;
	}

	getTemplateId(tree: ITree, element: any): string {
		return TreeRenderer.TREE_TEMPLATE_ID;
	}

	renderTemplate(tree: ITree, templateId: string, container: HTMLElement): ITreeExplorerTemplateData {
		DOM.addClass(container, 'custom-view-tree-node-item');

		const icon = DOM.append(container, DOM.$('.custom-view-tree-node-item-icon'));
		const resourceLabel = this.instantiationService.createInstance(ResourceLabel, container, { supportHighlights: true, donotSupportOcticons: true });
		DOM.addClass(resourceLabel.element, 'custom-view-tree-node-item-resourceLabel');
		const actionsContainer = DOM.append(resourceLabel.element, DOM.$('.actions'));
		const actionBar = new ActionBar(actionsContainer, {
			actionItemProvider: this.actionItemProvider,
			actionRunner: new MultipleSelectionActionRunner(() => tree.getSelection())
		});

		return { resourceLabel, icon, actionBar, aligner: new Aligner(container, tree, this.themeService) };
	}

	renderElement(tree: ITree, node: ITreeItem, templateId: string, templateData: ITreeExplorerTemplateData): void {
		const resource = node.resourceUri ? URI.revive(node.resourceUri) : null;
		const treeItemLabel: ITreeItemLabel = node.label ? node.label : resource ? { label: basename(resource.path) } : void 0;
		const label = treeItemLabel ? treeItemLabel.label : void 0;
		const matches = treeItemLabel && treeItemLabel.highlights ? treeItemLabel.highlights.map(([start, end]) => ({ start, end })) : void 0;
		const icon = this.themeService.getTheme().type === LIGHT ? node.icon : node.iconDark;
		const iconUrl = icon ? URI.revive(icon) : null;
		const title = node.tooltip ? node.tooltip : resource ? void 0 : label;

		// reset
		templateData.resourceLabel.clear();
		templateData.actionBar.clear();

		if (resource || node.themeIcon) {
			const fileDecorations = this.configurationService.getValue<{ colors: boolean, badges: boolean }>('explorer.decorations');
			templateData.resourceLabel.setLabel({ name: label, resource: resource ? resource : URI.parse('missing:_icon_resource') }, { fileKind: this.getFileKind(node), title, hideIcon: !!iconUrl, fileDecorations, extraClasses: ['custom-view-tree-node-item-resourceLabel'], matches });
		} else {
			templateData.resourceLabel.setLabel({ name: label }, { title, hideIcon: true, extraClasses: ['custom-view-tree-node-item-resourceLabel'], matches });
		}

		templateData.icon.style.backgroundImage = iconUrl ? `url('${iconUrl.toString(true)}')` : '';
		DOM.toggleClass(templateData.icon, 'custom-view-tree-node-item-icon', !!iconUrl);
		templateData.actionBar.context = (<TreeViewItemHandleArg>{ $treeViewId: this.treeViewId, $treeItemHandle: node.handle });
		templateData.actionBar.push(this.menus.getResourceActions(node), { icon: true, label: false });

		templateData.aligner.treeItem = node;
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

	disposeTemplate(tree: ITree, templateId: string, templateData: ITreeExplorerTemplateData): void {
		templateData.resourceLabel.dispose();
		templateData.actionBar.dispose();
		templateData.aligner.dispose();
	}
}

class Aligner extends Disposable {

	private _treeItem: ITreeItem;

	constructor(
		private container: HTMLElement,
		private tree: ITree,
		private themeService: IWorkbenchThemeService
	) {
		super();
		this._register(this.themeService.onDidFileIconThemeChange(() => this.render()));
	}

	set treeItem(treeItem: ITreeItem) {
		this._treeItem = treeItem;
		this.render();
	}

	private render(): void {
		if (this._treeItem) {
			DOM.toggleClass(this.container, 'align-icon-with-twisty', this.hasToAlignIconWithTwisty());
		}
	}

	private hasToAlignIconWithTwisty(): boolean {
		if (this._treeItem.collapsibleState !== TreeItemCollapsibleState.None) {
			return false;
		}
		if (!this.hasIcon(this._treeItem)) {
			return false;

		}
		const parent: ITreeItem = this.tree.getNavigator(this._treeItem).parent() || this.tree.getInput();
		if (this.hasIcon(parent)) {
			return false;
		}
		return parent.children && parent.children.every(c => c.collapsibleState === TreeItemCollapsibleState.None || !this.hasIcon(c));
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

class TreeController extends WorkbenchTreeController {

	constructor(
		private treeViewId: string,
		private menus: TreeMenus,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super({}, configurationService);
	}

	protected shouldToggleExpansion(element: ITreeItem, event: IMouseEvent, origin: string): boolean {
		return element.command ? this.isClickOnTwistie(event) : super.shouldToggleExpansion(element, event, origin);
	}

	onContextMenu(tree: ITree, node: ITreeItem, event: ContextMenuEvent): boolean {
		event.preventDefault();
		event.stopPropagation();

		tree.setFocus(node);
		const actions = this.menus.getResourceContextActions(node);
		if (!actions.length) {
			return true;
		}
		const anchor = { x: event.posx, y: event.posy };
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,

			getActions: () => {
				return Promise.resolve(actions);
			},

			getActionItem: (action) => {
				const keybinding = this._keybindingService.lookupKeybinding(action.id);
				if (keybinding) {
					return new ActionItem(action, action, { label: true, keybinding: keybinding.getLabel() });
				}
				return null;
			},

			onHide: (wasCancelled?: boolean) => {
				if (wasCancelled) {
					tree.domFocus();
				}
			},

			getActionsContext: () => (<TreeViewItemHandleArg>{ $treeViewId: this.treeViewId, $treeItemHandle: node.handle }),

			actionRunner: new MultipleSelectionActionRunner(() => tree.getSelection())
		});

		return true;
	}
}

class MultipleSelectionActionRunner extends ActionRunner {

	constructor(private getSelectedResources: () => any[]) {
		super();
	}

	runAction(action: IAction, context: any): TPromise<any> {
		if (action instanceof MenuItemAction) {
			const selection = this.getSelectedResources();
			const filteredSelection = selection.filter(s => s !== context);

			if (selection.length === filteredSelection.length || selection.length === 1) {
				return action.run(context);
			}

			return action.run(context, ...filteredSelection);
		}

		return super.runAction(action, context);
	}
}

class TreeMenus extends Disposable implements IDisposable {

	constructor(
		private id: string,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IMenuService private menuService: IMenuService,
		@IContextMenuService private contextMenuService: IContextMenuService
	) {
		super();
	}

	getResourceActions(element: ITreeItem): IAction[] {
		return this.getActions(MenuId.ViewItemContext, { key: 'viewItem', value: element.contextValue }).primary;
	}

	getResourceContextActions(element: ITreeItem): IAction[] {
		return this.getActions(MenuId.ViewItemContext, { key: 'viewItem', value: element.contextValue }).secondary;
	}

	private getActions(menuId: MenuId, context: { key: string, value: string }): { primary: IAction[]; secondary: IAction[]; } {
		const contextKeyService = this.contextKeyService.createScoped();
		contextKeyService.createKey('view', this.id);
		contextKeyService.createKey(context.key, context.value);

		const menu = this.menuService.createMenu(menuId, contextKeyService);
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };
		fillInContextMenuActions(menu, { shouldForwardArgs: true }, result, this.contextMenuService, g => /^inline/.test(g));

		menu.dispose();
		contextKeyService.dispose();

		return result;
	}
}
