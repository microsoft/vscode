/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/views';
import Event, { Emitter } from 'vs/base/common/event';
import { IDisposable, dispose, empty as EmptyDisposable, toDisposable, Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';
import * as DOM from 'vs/base/browser/dom';
import { Builder, $ } from 'vs/base/browser/builder';
import { IAction, IActionItem, ActionRunner } from 'vs/base/common/actions';
import { IMessageService } from 'vs/platform/message/common/message';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IThemeService, LIGHT } from 'vs/platform/theme/common/themeService';
import { fillInActions, ContextAwareMenuItemActionItem } from 'vs/platform/actions/browser/menuItemActionItem';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { ITree, IDataSource, IRenderer, ContextMenuEvent } from 'vs/base/parts/tree/browser/tree';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ActionItem, ActionBar, IActionItemProvider } from 'vs/base/browser/ui/actionbar/actionbar';
import { ViewsRegistry, TreeItemCollapsibleState, ITreeItem, ITreeViewDataProvider, TreeViewItemHandleArg } from 'vs/workbench/common/views';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IViewletViewOptions, IViewOptions, TreeViewsViewletPanel, FileIconThemableWorkbenchTree } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { WorkbenchTree, WorkbenchTreeController } from 'vs/platform/list/browser/listService';
import { ResourceLabel } from 'vs/workbench/browser/labels';
import URI from 'vs/base/common/uri';
import { basename } from 'vs/base/common/paths';
import { FileKind } from 'vs/platform/files/common/files';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export class TreeView extends TreeViewsViewletPanel {

	private menus: Menus;
	private activated: boolean = false;
	private treeContainer: HTMLElement;
	private treeInputPromise: TPromise<void>;

	private dataProviderElementChangeListener: IDisposable;
	private elementsToRefresh: ITreeItem[] = [];

	constructor(
		options: IViewletViewOptions,
		@IMessageService private messageService: IMessageService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService themeService: IWorkbenchThemeService,
		@IExtensionService private extensionService: IExtensionService,
		@ICommandService private commandService: ICommandService
	) {
		super({ ...(options as IViewOptions), ariaHeaderLabel: options.name }, keybindingService, contextMenuService);
		this.menus = this.instantiationService.createInstance(Menus, this.id);
		this.menus.onDidChangeTitle(() => this.updateActions(), this, this.disposables);
		themeService.onThemeChange(() => this.tree.refresh() /* soft refresh */, this, this.disposables);
		if (options.expanded) {
			this.activate();
		}
	}

	renderBody(container: HTMLElement): void {
		this.treeContainer = DOM.append(container, DOM.$('.tree-explorer-viewlet-tree-view'));
		this.tree = this.createViewer($(this.treeContainer));
		this.setInput();
	}

	setExpanded(expanded: boolean): void {
		super.setExpanded(expanded);

		if (expanded) {
			this.activate();
		}
	}

	layoutBody(size: number): void {
		if (this.treeContainer) {
			this.treeContainer.style.height = size + 'px';
		}
		super.layoutBody(size);
	}

	private activate() {
		if (!this.activated && this.extensionService) {
			this.extensionService.activateByEvent(`onView:${this.id}`);
			this.activated = true;
			this.setInput();
		}
	}

	public createViewer(container: Builder): WorkbenchTree {
		const actionItemProvider = (action: IAction) => this.getActionItem(action);
		const dataSource = this.instantiationService.createInstance(TreeDataSource, this.id);
		const renderer = this.instantiationService.createInstance(TreeRenderer, this.id, this.menus, actionItemProvider);
		const controller = this.instantiationService.createInstance(TreeController, this.id, this.menus);
		const tree = this.instantiationService.createInstance(FileIconThemableWorkbenchTree,
			container.getHTMLElement(),
			{ dataSource, renderer, controller },
			{}
		);

		tree.contextKeyService.createKey<boolean>(this.id, true);
		this.disposables.push(tree.onDidChangeSelection(e => this.onSelection(e)));

		return tree;
	}

	getActions(): IAction[] {
		return [...this.menus.getTitleActions()];
	}

	getSecondaryActions(): IAction[] {
		return this.menus.getTitleSecondaryActions();
	}

	getActionItem(action: IAction): IActionItem {
		if (!(action instanceof MenuItemAction)) {
			return undefined;
		}
		return new ContextAwareMenuItemActionItem(action, this.keybindingService, this.messageService, this.contextMenuService);
	}

	private setInput(): TPromise<void> {
		if (this.tree) {
			if (!this.treeInputPromise) {
				if (this.listenToDataProvider()) {
					this.treeInputPromise = this.tree.setInput(new Root());
				} else {
					this.treeInputPromise = new TPromise<void>((c, e) => {
						this.disposables.push(ViewsRegistry.onTreeViewDataProviderRegistered(id => {
							if (this.id === id) {
								if (this.listenToDataProvider()) {
									this.tree.setInput(new Root()).then(() => c(null));
								}
							}
						}));
					});
				}
			}
			return this.treeInputPromise;
		}
		return TPromise.as(null);
	}

	private listenToDataProvider(): boolean {
		let dataProvider = ViewsRegistry.getTreeViewDataProvider(this.id);
		if (dataProvider) {
			if (this.dataProviderElementChangeListener) {
				this.dataProviderElementChangeListener.dispose();
			}
			this.dataProviderElementChangeListener = dataProvider.onDidChange(element => this.refresh(element));
			const disposable = dataProvider.onDispose(() => {
				this.dataProviderElementChangeListener.dispose();
				this.tree.setInput(new Root());
				disposable.dispose();
			});
			return true;
		}
		return false;
	}

	public getOptimalWidth(): number {
		const parentNode = this.tree.getHTMLElement();
		const childNodes = [].slice.call(parentNode.querySelectorAll('.outline-item-label > a'));

		return DOM.getLargestChildWidth(parentNode, childNodes);
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

	protected updateTreeVisibility(tree: WorkbenchTree, isVisible: boolean): void {
		super.updateTreeVisibility(tree, isVisible);
		if (isVisible && this.elementsToRefresh.length) {
			this.doRefresh(this.elementsToRefresh);
			this.elementsToRefresh = [];
		}
	}

	private refresh(elements: ITreeItem[]): void {
		if (!elements) {
			const root: ITreeItem = this.tree.getInput();
			root.children = null; // reset children
			elements = [root];
		}
		if (this.isVisible() && this.isExpanded()) {
			this.doRefresh(elements);
		} else {
			this.elementsToRefresh.push(...elements);
		}
	}

	private doRefresh(elements: ITreeItem[]): void {
		for (const element of elements) {
			this.tree.refresh(element);
		}
	}

	dispose(): void {
		dispose(this.disposables);
		if (this.dataProviderElementChangeListener) {
			this.dataProviderElementChangeListener.dispose();
		}
		dispose(this.disposables);
		super.dispose();
	}
}

class Root implements ITreeItem {
	label = 'root';
	handle = '0';
	parentHandle = null;
	collapsibleState = TreeItemCollapsibleState.Expanded;
}

class TreeDataSource implements IDataSource {

	constructor(
		private id: string,
		@IProgressService private progressService: IProgressService
	) {
	}

	public getId(tree: ITree, node: ITreeItem): string {
		return node.handle;
	}

	public hasChildren(tree: ITree, node: ITreeItem): boolean {
		if (!this.getDataProvider()) {
			return false;
		}
		return node.collapsibleState === TreeItemCollapsibleState.Collapsed || node.collapsibleState === TreeItemCollapsibleState.Expanded;
	}

	public getChildren(tree: ITree, node: ITreeItem): TPromise<any[]> {
		if (node.children) {
			return TPromise.as(node.children);
		}

		const dataProvider = this.getDataProvider();
		if (dataProvider) {
			const promise = node instanceof Root ? dataProvider.getElements() : dataProvider.getChildren(node);
			this.progressService.showWhile(promise, 100);
			return promise.then(children => {
				node.children = children;
				return children;
			});
		}

		return TPromise.as([]);
	}

	public shouldAutoexpand(tree: ITree, node: ITreeItem): boolean {
		return node.collapsibleState === TreeItemCollapsibleState.Expanded;
	}

	public getParent(tree: ITree, node: any): TPromise<any> {
		return TPromise.as(null);
	}

	private getDataProvider(): ITreeViewDataProvider {
		return ViewsRegistry.getTreeViewDataProvider(this.id);
	}
}

interface ITreeExplorerTemplateData {
	label: HTMLElement;
	resourceLabel: ResourceLabel;
	icon: HTMLElement;
	actionBar: ActionBar;
	aligner: Aligner;
}

class TreeRenderer implements IRenderer {

	private static readonly ITEM_HEIGHT = 22;
	private static readonly TREE_TEMPLATE_ID = 'treeExplorer';

	constructor(
		private treeViewId: string,
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
		const el = DOM.append(container, DOM.$('.custom-view-tree-node-item'));

		const icon = DOM.append(el, DOM.$('.custom-view-tree-node-item-icon'));
		const label = DOM.append(el, DOM.$('.custom-view-tree-node-item-label'));
		const resourceLabel = this.instantiationService.createInstance(ResourceLabel, el, {});
		const actionsContainer = DOM.append(el, DOM.$('.actions'));
		const actionBar = new ActionBar(actionsContainer, {
			actionItemProvider: this.actionItemProvider,
			actionRunner: new MultipleSelectionActionRunner(() => tree.getSelection())
		});

		return { label, resourceLabel, icon, actionBar, aligner: new Aligner(container, tree, this.themeService) };
	}

	public renderElement(tree: ITree, node: ITreeItem, templateId: string, templateData: ITreeExplorerTemplateData): void {
		const resource = node.resourceUri ? URI.revive(node.resourceUri) : null;
		const name = node.label || basename(resource.path);
		const icon = this.themeService.getTheme().type === LIGHT ? node.icon : node.iconDark;

		// reset
		templateData.resourceLabel.clear();
		templateData.actionBar.clear();
		templateData.label.textContent = '';
		DOM.removeClass(templateData.label, 'custom-view-tree-node-item-label');
		DOM.removeClass(templateData.resourceLabel.element, 'custom-view-tree-node-item-resourceLabel');
		DOM.removeClass(templateData.icon, 'custom-view-tree-node-item-icon');

		if (resource && !icon) {
			templateData.resourceLabel.setLabel({ name, resource }, { fileKind: node.collapsibleState === TreeItemCollapsibleState.Collapsed || node.collapsibleState === TreeItemCollapsibleState.Expanded ? FileKind.FOLDER : FileKind.FILE });
			DOM.addClass(templateData.resourceLabel.element, 'custom-view-tree-node-item-resourceLabel');
		} else {
			templateData.label.textContent = name;
			DOM.addClass(templateData.label, 'custom-view-tree-node-item-label');
			templateData.icon.style.backgroundImage = `url('${icon}')`;
			if (icon) {
				DOM.addClass(templateData.icon, 'custom-view-tree-node-item-icon');
			}
		}

		templateData.actionBar.context = (<TreeViewItemHandleArg>{ $treeViewId: this.treeViewId, $treeItemHandle: node.handle });
		templateData.actionBar.push(this.menus.getResourceActions(node), { icon: true, label: false });

		templateData.aligner.align(node);
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: ITreeExplorerTemplateData): void {
		templateData.resourceLabel.dispose();
		templateData.aligner.dispose();
	}
}

class Aligner extends Disposable {

	private node: ITreeItem;

	constructor(
		private container: HTMLElement,
		private tree: ITree,
		private themeService: IWorkbenchThemeService
	) {
		super();
		this._register(this.themeService.onDidFileIconThemeChange(() => this.alignByTheme()));
	}

	align(treeItem: ITreeItem): void {
		this.node = treeItem;
		this.alignByTheme();
	}

	private alignByTheme(): void {
		if (this.node) {
			DOM.toggleClass(this.container, 'align-with-twisty', this.hasToAlignWithTwisty());
		}
	}

	private hasToAlignWithTwisty(): boolean {
		if (this.hasParentHasIcon()) {
			return false;
		}

		const fileIconTheme = this.themeService.getFileIconTheme();
		if (!(fileIconTheme.hasFileIcons && !fileIconTheme.hasFolderIcons)) {
			return false;
		}
		if (this.node.collapsibleState !== TreeItemCollapsibleState.None) {
			return false;
		}
		const icon = this.themeService.getTheme().type === LIGHT ? this.node.icon : this.node.iconDark;
		const hasIcon = !!icon || !!this.node.resourceUri;
		if (!hasIcon) {
			return false;
		}

		const siblingsWithChildren = this.getSiblings().filter(s => s.collapsibleState !== TreeItemCollapsibleState.None);
		for (const s of siblingsWithChildren) {
			const icon = this.themeService.getTheme().type === LIGHT ? s.icon : s.iconDark;
			if (icon) {
				return false;
			}
		}

		return true;
	}

	private getSiblings(): ITreeItem[] {
		const parent: ITreeItem = this.tree.getNavigator(this.node).parent() || this.tree.getInput();
		return parent.children;
	}

	private hasParentHasIcon(): boolean {
		const parent = this.tree.getNavigator(this.node).parent() || this.tree.getInput();
		const icon = this.themeService.getTheme().type === LIGHT ? parent.icon : parent.iconDark;
		if (icon) {
			return true;
		}
		if (parent.resourceUri) {
			const fileIconTheme = this.themeService.getFileIconTheme();
			if (fileIconTheme.hasFileIcons && fileIconTheme.hasFolderIcons) {
				return true;
			}
		}
		return false;
	}
}

class TreeController extends WorkbenchTreeController {

	constructor(
		private treeViewId: string,
		private menus: Menus,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IKeybindingService private _keybindingService: IKeybindingService,
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

class Menus implements IDisposable {

	private disposables: IDisposable[] = [];
	private titleDisposable: IDisposable = EmptyDisposable;
	private titleActions: IAction[] = [];
	private titleSecondaryActions: IAction[] = [];

	private _onDidChangeTitle = new Emitter<void>();
	get onDidChangeTitle(): Event<void> { return this._onDidChangeTitle.event; }

	constructor(
		private id: string,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IMenuService private menuService: IMenuService,
		@IContextMenuService private contextMenuService: IContextMenuService
	) {
		if (this.titleDisposable) {
			this.titleDisposable.dispose();
			this.titleDisposable = EmptyDisposable;
		}

		const _contextKeyService = this.contextKeyService.createScoped();
		_contextKeyService.createKey('view', id);

		const titleMenu = this.menuService.createMenu(MenuId.ViewTitle, _contextKeyService);
		const updateActions = () => {
			this.titleActions = [];
			this.titleSecondaryActions = [];
			fillInActions(titleMenu, null, { primary: this.titleActions, secondary: this.titleSecondaryActions }, this.contextMenuService);
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

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
