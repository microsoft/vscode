/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/views';
import Event, { Emitter } from 'vs/base/common/event';
import * as errors from 'vs/base/common/errors';
import { IDisposable, Disposable, dispose } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';
import * as DOM from 'vs/base/browser/dom';
import { $ } from 'vs/base/browser/builder';
import { LIGHT, FileThemeIcon, FolderThemeIcon } from 'vs/platform/theme/common/themeService';
import { ITree, IDataSource, IRenderer, ContextMenuEvent } from 'vs/base/parts/tree/browser/tree';
import { TreeItemCollapsibleState, ITreeItem, ITreeViewer, ICustomViewsService, ITreeViewDataProvider, ViewsRegistry, IViewDescriptor, TreeViewItemHandleArg, ICustomViewDescriptor, IViewsViewlet } from 'vs/workbench/common/views';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IProgressService2, ProgressLocation } from 'vs/platform/progress/common/progress';
import { ResourceLabel } from 'vs/workbench/browser/labels';
import { ActionBar, IActionItemProvider, ActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import URI from 'vs/base/common/uri';
import { basename } from 'vs/base/common/paths';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { WorkbenchTreeController } from 'vs/platform/list/browser/listService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IAction, ActionRunner } from 'vs/base/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { fillInActions, ContextAwareMenuItemActionItem } from 'vs/platform/actions/browser/menuItemActionItem';
import { FileKind } from 'vs/platform/files/common/files';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { FileIconThemableWorkbenchTree } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';

export class CustomViewsService extends Disposable implements ICustomViewsService {

	_serviceBrand: any;

	private viewers: Map<string, CustomTreeViewer> = new Map<string, CustomTreeViewer>();

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IViewletService private viewletService: IViewletService
	) {
		super();
		this.createViewers(ViewsRegistry.getAllViews());
		this._register(ViewsRegistry.onViewsRegistered(viewDescriptors => this.createViewers(viewDescriptors)));
		this._register(ViewsRegistry.onViewsDeregistered(viewDescriptors => this.removeViewers(viewDescriptors)));
	}

	getTreeViewer(id: string): ITreeViewer {
		return this.viewers.get(id);
	}

	openView(id: string, focus: boolean): TPromise<void> {
		const viewDescriptor = ViewsRegistry.getView(id);
		if (viewDescriptor) {
			return this.viewletService.openViewlet(viewDescriptor.id)
				.then((viewlet: IViewsViewlet) => {
					if (viewlet && viewlet.openView) {
						viewlet.openView(id, focus);
					}
				});
		}
		return TPromise.as(null);
	}

	private createViewers(viewDescriptors: IViewDescriptor[]): void {
		for (const viewDescriptor of viewDescriptors) {
			if ((<ICustomViewDescriptor>viewDescriptor).treeView) {
				this.viewers.set(viewDescriptor.id, this.instantiationService.createInstance(CustomTreeViewer, viewDescriptor.id));
			}
		}
	}

	private removeViewers(viewDescriptors: IViewDescriptor[]): void {
		for (const { id } of viewDescriptors) {
			const viewer = this.getTreeViewer(id);
			if (viewer) {
				viewer.dispose();
				this.viewers.delete(id);
			}
		}
	}
}

class Root implements ITreeItem {
	label = 'root';
	handle = '0';
	parentHandle = null;
	collapsibleState = TreeItemCollapsibleState.Expanded;
	children = void 0;
}

class CustomTreeViewer extends Disposable implements ITreeViewer {

	private isVisible: boolean = false;
	private activated: boolean = false;
	private _hasIconForParentNode = false;
	private _hasIconForLeafNode = false;

	private _onDidIconsChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidIconsChange: Event<void> = this._onDidIconsChange.event;

	private treeContainer: HTMLElement;
	private tree: FileIconThemableWorkbenchTree;
	private root: ITreeItem;
	private elementsToRefresh: ITreeItem[] = [];
	private refreshing = 0;

	private _dataProvider: ITreeViewDataProvider;
	private dataProviderDisposables: IDisposable[] = [];

	constructor(
		private id: string,
		@IExtensionService private extensionService: IExtensionService,
		@IWorkbenchThemeService private themeService: IWorkbenchThemeService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ICommandService private commandService: ICommandService
	) {
		super();
		this.root = new Root();
		this._register(this.themeService.onDidFileIconThemeChange(() => this.doRefresh([this.root]) /** soft refresh **/));
		this._register(this.themeService.onThemeChange(() => this.doRefresh([this.root]) /** soft refresh **/));
	}

	get dataProvider(): ITreeViewDataProvider {
		return this._dataProvider;
	}

	set dataProvider(dataProvider: ITreeViewDataProvider) {
		dispose(this.dataProviderDisposables);
		if (dataProvider) {
			const customTreeView: CustomTreeViewer = this;
			this._dataProvider = new class implements ITreeViewDataProvider {
				onDidChange = dataProvider.onDidChange;
				onDispose = dataProvider.onDispose;
				getChildren(node?: ITreeItem): TPromise<ITreeItem[]> {
					if (node.children) {
						return TPromise.as(node.children);
					}
					const promise = node instanceof Root ? dataProvider.getChildren() : dataProvider.getChildren(node);
					return promise.then(children => {
						node.children = children;
						if (!customTreeView.refreshing) {
							customTreeView.updateIconsAvailability(node);
						}
						return children;
					});
				}
			};
			this._register(dataProvider.onDidChange(elements => this.refresh(elements), this, this.dataProviderDisposables));
			this._register(dataProvider.onDispose(() => this.dataProvider = null, this, this.dataProviderDisposables));
		} else {
			this._dataProvider = null;
		}
		this.refresh();
	}

	get hasIconForParentNode(): boolean {
		return this._hasIconForParentNode;
	}

	get hasIconForLeafNode(): boolean {
		return this._hasIconForLeafNode;
	}

	setVisibility(isVisible: boolean): void {
		if (this.isVisible === isVisible) {
			return;
		}

		this.isVisible = isVisible;
		if (this.isVisible) {
			this.activate();
		}

		if (this.tree) {
			if (this.isVisible) {
				$(this.tree.getHTMLElement()).show();
			} else {
				$(this.tree.getHTMLElement()).hide(); // make sure the tree goes out of the tabindex world by hiding it
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
	}

	focus(): void {
		if (this.tree) {
			// Make sure the current selected element is revealed
			const selectedElement = this.tree.getSelection()[0];
			if (selectedElement) {
				this.tree.reveal(selectedElement, 0.5).done(null, errors.onUnexpectedError);
			}

			// Pass Focus to Viewer
			this.tree.DOMFocus();
		}
	}

	show(container: HTMLElement): void {
		if (!this.tree) {
			this.createTree();
		}
		DOM.append(container, this.treeContainer);
	}

	private createTree() {
		this.treeContainer = DOM.$('.tree-explorer-viewlet-tree-view');
		const actionItemProvider = (action: IAction) => action instanceof MenuItemAction ? this.instantiationService.createInstance(ContextAwareMenuItemActionItem, action) : undefined;
		const menus = this.instantiationService.createInstance(Menus, this.id);
		const dataSource = this.instantiationService.createInstance(TreeDataSource, this);
		const renderer = this.instantiationService.createInstance(TreeRenderer, this.id, this, menus, actionItemProvider);
		const controller = this.instantiationService.createInstance(TreeController, this.id, menus);
		this.tree = this.instantiationService.createInstance(FileIconThemableWorkbenchTree, this.treeContainer, { dataSource, renderer, controller }, {});
		this.tree.contextKeyService.createKey<boolean>(this.id, true);
		this._register(this.tree);
		this._register(this.tree.onDidChangeSelection(e => this.onSelection(e)));
		this.tree.setInput(this.root);
	}

	layout(size: number) {
		if (this.tree) {
			this.treeContainer.style.height = size + 'px';
			this.tree.layout(size);
		}
	}

	getOptimalWidth(): number {
		if (this.tree) {
			const parentNode = this.tree.getHTMLElement();
			const childNodes = [].slice.call(parentNode.querySelectorAll('.outline-item-label > a'));
			return DOM.getLargestChildWidth(parentNode, childNodes);
		}
		return 0;
	}

	refresh(elements?: ITreeItem[]): TPromise<void> {
		if (this.tree) {
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
		return TPromise.as(null);
	}

	reveal(item: ITreeItem, parentChain: ITreeItem[], options?: { donotSelect?: boolean }): TPromise<void> {
		if (this.tree && this.isVisible) {
			options = options ? options : { donotSelect: false };
			const select = !options.donotSelect;
			var result = TPromise.as(null);
			parentChain.forEach((e) => {
				result = result.then(() => this.tree.expand(e));
			});
			return result.then(() => this.tree.reveal(item))
				.then(() => {
					if (select) {
						this.tree.setSelection([item]);
					}
				});
		}
		return TPromise.as(null);
	}

	private activate() {
		if (!this.activated) {
			this.extensionService.activateByEvent(`onView:${this.id}`);
			this.activated = true;
		}
	}

	private doRefresh(elements: ITreeItem[]): TPromise<void> {
		if (this.tree) {
			return TPromise.join(elements.map(e => {
				this.refreshing++;
				return this.tree.refresh(e).then(() => this.refreshing--, () => this.refreshing--);
			})).then(() => this.updateIconsAvailability(this.root));
		}
		return TPromise.as(null);
	}

	private updateIconsAvailability(parent: ITreeItem): void {
		if (this.activated && this.tree) {
			const initialResult = parent instanceof Root ? { hasIconForParentNode: false, hasIconForLeafNode: false } : { hasIconForParentNode: this.hasIconForParentNode, hasIconForLeafNode: this.hasIconForLeafNode };
			const { hasIconForParentNode, hasIconForLeafNode } = this.computeIconsAvailability(parent.children || [], initialResult);
			const changed = this.hasIconForParentNode !== hasIconForParentNode || this.hasIconForLeafNode !== hasIconForLeafNode;
			this._hasIconForParentNode = hasIconForParentNode;
			this._hasIconForLeafNode = hasIconForLeafNode;
			if (changed) {
				this._onDidIconsChange.fire();
			}
			DOM.toggleClass(this.treeContainer, 'custom-view-align-icons-and-twisties', this.hasIconForLeafNode && !this.hasIconForParentNode);
		}
	}

	private computeIconsAvailability(nodes: ITreeItem[], result: { hasIconForParentNode: boolean, hasIconForLeafNode: boolean }): { hasIconForParentNode: boolean, hasIconForLeafNode: boolean } {
		if (!result.hasIconForLeafNode || !result.hasIconForParentNode) {
			for (const node of nodes) {
				if (this.hasIcon(node)) {
					result.hasIconForParentNode = result.hasIconForParentNode || node.collapsibleState !== TreeItemCollapsibleState.None;
					result.hasIconForLeafNode = result.hasIconForLeafNode || node.collapsibleState === TreeItemCollapsibleState.None;
				}
				this.computeIconsAvailability(node.children || [], result);
				if (result.hasIconForLeafNode && result.hasIconForParentNode) {
					return result;
				}
			}
		}
		return result;
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

	private onSelection({ payload }: any): void {
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
		@IProgressService2 private progressService: IProgressService2
	) {
	}

	public getId(tree: ITree, node: ITreeItem): string {
		return node.handle;
	}

	public hasChildren(tree: ITree, node: ITreeItem): boolean {
		return this.treeView.dataProvider && node.collapsibleState !== TreeItemCollapsibleState.None;
	}

	public getChildren(tree: ITree, node: ITreeItem): TPromise<any[]> {
		if (this.treeView.dataProvider) {
			return this.progressService.withProgress({ location: ProgressLocation.Explorer }, () => this.treeView.dataProvider.getChildren(node));
		}
		return TPromise.as([]);
	}

	public shouldAutoexpand(tree: ITree, node: ITreeItem): boolean {
		return node.collapsibleState === TreeItemCollapsibleState.Expanded;
	}

	public getParent(tree: ITree, node: any): TPromise<any> {
		return TPromise.as(null);
	}
}

interface ITreeExplorerTemplateData {
	label: HTMLElement;
	resourceLabel: ResourceLabel;
	icon: TreeItemIcon;
	actionBar: ActionBar;
}

class TreeRenderer implements IRenderer {

	private static readonly ITEM_HEIGHT = 22;
	private static readonly TREE_TEMPLATE_ID = 'treeExplorer';

	constructor(
		private treeViewId: string,
		private treeViewer: ITreeViewer,
		private menus: Menus,
		private actionItemProvider: IActionItemProvider,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchThemeService private themeService: IWorkbenchThemeService
	) {
	}

	public getHeight(tree: ITree, element: any): number {
		return TreeRenderer.ITEM_HEIGHT;
	}

	public getTemplateId(tree: ITree, element: any): string {
		return TreeRenderer.TREE_TEMPLATE_ID;
	}

	public renderTemplate(tree: ITree, templateId: string, container: HTMLElement): ITreeExplorerTemplateData {
		DOM.addClass(container, 'custom-view-tree-node-item');

		const icon = this.instantiationService.createInstance(TreeItemIcon, container, this.treeViewer);
		const label = DOM.append(container, DOM.$('.custom-view-tree-node-item-label'));
		const resourceLabel = this.instantiationService.createInstance(ResourceLabel, container, {});
		const actionsContainer = DOM.append(container, DOM.$('.actions'));
		const actionBar = new ActionBar(actionsContainer, {
			actionItemProvider: this.actionItemProvider,
			actionRunner: new MultipleSelectionActionRunner(() => tree.getSelection())
		});

		return { label, resourceLabel, icon, actionBar };
	}

	public renderElement(tree: ITree, node: ITreeItem, templateId: string, templateData: ITreeExplorerTemplateData): void {
		const resource = node.resourceUri ? URI.revive(node.resourceUri) : null;
		const label = node.label ? node.label : resource ? basename(resource.path) : '';
		const icon = this.themeService.getTheme().type === LIGHT ? node.icon : node.iconDark;

		// reset
		templateData.resourceLabel.clear();
		templateData.actionBar.clear();
		templateData.label.textContent = '';
		DOM.removeClass(templateData.label, 'custom-view-tree-node-item-label');
		DOM.removeClass(templateData.resourceLabel.element, 'custom-view-tree-node-item-resourceLabel');

		if ((resource || node.themeIcon) && !icon) {
			const title = node.tooltip ? node.tooltip : resource ? void 0 : label;
			templateData.resourceLabel.setLabel({ name: label, resource: resource ? resource : URI.parse('_icon_resource') }, { fileKind: this.getFileKind(node), title });
			DOM.addClass(templateData.resourceLabel.element, 'custom-view-tree-node-item-resourceLabel');
		} else {
			templateData.label.textContent = label;
			DOM.addClass(templateData.label, 'custom-view-tree-node-item-label');
			templateData.label.title = typeof node.tooltip === 'string' ? node.tooltip : label;
		}

		templateData.icon.treeItem = node;
		templateData.actionBar.context = (<TreeViewItemHandleArg>{ $treeViewId: this.treeViewId, $treeItemHandle: node.handle });
		templateData.actionBar.push(this.menus.getResourceActions(node), { icon: true, label: false });
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

	public disposeTemplate(tree: ITree, templateId: string, templateData: ITreeExplorerTemplateData): void {
		templateData.resourceLabel.dispose();
		templateData.actionBar.dispose();
		templateData.icon.dispose();
	}
}

class TreeItemIcon extends Disposable {

	private _treeItem: ITreeItem;
	private iconElement: HTMLElement;

	constructor(
		container: HTMLElement,
		private treeViewer: CustomTreeViewer,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchThemeService private themeService: IWorkbenchThemeService
	) {
		super();
		this.iconElement = DOM.append(container, DOM.$('.custom-view-tree-node-item-icon'));
		this._register(this.treeViewer.onDidIconsChange(() => this.render()));
	}

	set treeItem(treeItem: ITreeItem) {
		this._treeItem = treeItem;
		this.render();
	}

	private render(): void {
		if (this._treeItem) {
			const fileIconTheme = this.themeService.getFileIconTheme();
			const contributedIcon = this.themeService.getTheme().type === LIGHT ? this._treeItem.icon : this._treeItem.iconDark;

			const hasContributedIcon = !!contributedIcon;
			const hasChildren = this._treeItem.collapsibleState !== TreeItemCollapsibleState.None;
			const hasThemeIcon = !!this._treeItem.resourceUri || !!this._treeItem.themeIcon;
			const isFolder = hasThemeIcon ? (this._treeItem.themeIcon ? this._treeItem.themeIcon.id === FolderThemeIcon.id : hasChildren) : false;
			const isFile = hasThemeIcon ? (this._treeItem.themeIcon ? this._treeItem.themeIcon.id === FileThemeIcon.id : !hasChildren) : false;
			const hasThemeFolderIcon = isFolder && fileIconTheme.hasFileIcons && fileIconTheme.hasFolderIcons;
			const hasThemeFileIcon = isFile && fileIconTheme.hasFileIcons;
			const hasIcon = hasContributedIcon || hasThemeFolderIcon || hasThemeFileIcon;
			const hasFolderPlaceHolderIcon = hasIcon ? false : isFolder && this.treeViewer.hasIconForParentNode;
			const hasFilePlaceHolderIcon = hasIcon ? false : isFile && this.treeViewer.hasIconForLeafNode;
			const hasContainerPlaceHolderIcon = hasIcon || hasFolderPlaceHolderIcon ? false : hasChildren && this.treeViewer.hasIconForParentNode;
			const hasLeafPlaceHolderIcon = hasIcon || hasFilePlaceHolderIcon ? false : !hasChildren && (this.treeViewer.hasIconForParentNode || this.treeViewer.hasIconForLeafNode);

			this.iconElement.style.backgroundImage = hasContributedIcon ? `url('${contributedIcon}')` : '';
			DOM.toggleClass(this.iconElement, 'folder-icon', hasFolderPlaceHolderIcon);
			DOM.toggleClass(this.iconElement, 'file-icon', hasFilePlaceHolderIcon);
			DOM.toggleClass(this.iconElement, 'placeholder-icon', hasContainerPlaceHolderIcon);
			DOM.toggleClass(this.iconElement, 'custom-view-tree-node-item-icon', hasContributedIcon || hasFolderPlaceHolderIcon || hasFilePlaceHolderIcon || hasContainerPlaceHolderIcon || hasLeafPlaceHolderIcon);
		}
	}
}

class TreeController extends WorkbenchTreeController {

	constructor(
		private treeViewId: string,
		private menus: Menus,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super({}, configurationService);
	}

	public onContextMenu(tree: ITree, node: ITreeItem, event: ContextMenuEvent): boolean {
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
				return TPromise.as(actions);
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
					tree.DOMFocus();
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

class Menus extends Disposable implements IDisposable {

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
		fillInActions(menu, { shouldForwardArgs: true }, result, this.contextMenuService, g => /^inline/.test(g));

		menu.dispose();
		contextKeyService.dispose();

		return result;
	}
}