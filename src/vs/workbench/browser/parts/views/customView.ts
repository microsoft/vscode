/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/views';
import Event, { Emitter } from 'vs/base/common/event';
import * as errors from 'vs/base/common/errors';
import { IDisposable, dispose, empty as EmptyDisposable, toDisposable, Disposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';
import * as DOM from 'vs/base/browser/dom';
import { $ } from 'vs/base/browser/builder';
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
import { TreeItemCollapsibleState, ITreeItem, TreeViewItemHandleArg, ITreeItemViewer, ICustomViewsService, ITreeViewDataProvider, ViewsRegistry, ICustomViewDescriptor } from 'vs/workbench/common/views';
import { IViewletViewOptions, IViewOptions, FileIconThemableWorkbenchTree, ViewsViewletPanel } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { WorkbenchTree, WorkbenchTreeController } from 'vs/platform/list/browser/listService';
import { ResourceLabel } from 'vs/workbench/browser/labels';
import URI from 'vs/base/common/uri';
import { basename } from 'vs/base/common/paths';
import { FileKind } from 'vs/platform/files/common/files';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';

export class CustomViewsService implements ICustomViewsService {

	_serviceBrand: any;

	private viewers: Map<string, ITreeItemViewer> = new Map<string, ITreeItemViewer>();

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService
	) {
	}

	getTreeItemViewer(id: string): ITreeItemViewer {
		let viewer = this.viewers.get(id);
		if (!viewer) {
			viewer = this.createViewer(id);
			if (viewer) {
				this.viewers.set(id, viewer);
			}
		}
		return viewer;
	}

	registerTreeViewDataProvider(id: string, dataProvider: ITreeViewDataProvider): void {
		const treeViewer = this.getTreeItemViewer(id);
		if (treeViewer) {
			treeViewer.dataProvider = dataProvider;
			dataProvider.onDispose(() => treeViewer.dataProvider = null);
		}
	}

	private createViewer(id: string): ITreeItemViewer {
		const viewDeescriptor = <ICustomViewDescriptor>ViewsRegistry.getView(id);
		if (viewDeescriptor && viewDeescriptor.treeItemView) {
			return this.instantiationService.createInstance(TreeItemViewer, id);
		}
		return null;
	}
}

export class TreeItemViewer extends Disposable implements ITreeItemViewer {

	private isVisible: boolean = false;
	private activated: boolean = false;

	private tree: ITree;
	private treeInputPromise: TPromise<void>;
	private elementsToRefresh: ITreeItem[] = [];

	private _dataProvider: ITreeViewDataProvider;
	private dataProviderElementChangeListener: IDisposable;

	constructor(
		private id: string,
		@IExtensionService private extensionService: IExtensionService
	) {
		super();
	}

	get dataProvider(): ITreeViewDataProvider {
		return this._dataProvider;
	}

	set dataProvider(dataProvider: ITreeViewDataProvider) {
		this._dataProvider = dataProvider;
		if (this.dataProviderElementChangeListener) {
			this.dataProviderElementChangeListener.dispose();
		}
		if (this.dataProvider) {
			this.dataProviderElementChangeListener = this._register(this.dataProvider.onDidChange(element => this.refresh(element)));
			this.refresh(null);
		}
	}

	refresh(elements: ITreeItem[]): TPromise<void> {
		if (this.tree) {
			if (!elements) {
				const root: ITreeItem = this.tree.getInput();
				root.children = null; // reset children
				elements = [root];
			}
			if (this.isVisible) {
				return this.doRefresh(elements);
			} else {
				this.elementsToRefresh.push(...elements);
			}
		}
		return TPromise.as(null);
	}

	setTree(tree: ITree): void {
		this.tree = tree;
		this.setInput();
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

	layout(size: number) {
		if (this.tree) {
			this.tree.layout(size);
		}
	}

	private activate() {
		if (!this.activated) {
			this.extensionService.activateByEvent(`onView:${this.id}`);
			this.activated = true;
			this.setInput();
		}
	}

	private setInput(): TPromise<void> {
		if (this.tree) {
			if (!this.treeInputPromise) {
				this.treeInputPromise = this.tree.setInput(new Root());
			}
			return this.treeInputPromise;
		}
		return TPromise.as(null);
	}

	private doRefresh(elements: ITreeItem[]): TPromise<void> {
		return TPromise.join(elements.map(e => this.tree.refresh(e))) as TPromise;
	}
}

export class CustomTreeViewPanel extends ViewsViewletPanel {

	private menus: Menus;
	private treeContainer: HTMLElement;
	private tree: WorkbenchTree;
	private treeViewer: TreeItemViewer;

	constructor(
		options: IViewletViewOptions,
		@IMessageService private messageService: IMessageService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService private themeService: IWorkbenchThemeService,
		@ICommandService private commandService: ICommandService,
		@IConfigurationService configurationService: IConfigurationService,
		@ICustomViewsService customViewsService: ICustomViewsService,
	) {
		super({ ...(options as IViewOptions), ariaHeaderLabel: options.name }, keybindingService, contextMenuService, configurationService);
		this.menus = this.instantiationService.createInstance(Menus, this.id);
		this.menus.onDidChangeTitle(() => this.updateActions(), this, this.disposables);
		this.treeViewer = <TreeItemViewer>customViewsService.getTreeItemViewer(this.id);
		this.disposables.push(this.treeViewer);
		this.updateTreeVisibility();
	}

	setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible).then(() => this.updateTreeVisibility());
	}

	focus(): void {
		super.focus();
		this.treeViewer.focus();
	}

	renderBody(container: HTMLElement): void {
		this.treeContainer = DOM.append(container, DOM.$('.tree-explorer-viewlet-tree-view'));
		const actionItemProvider = (action: IAction) => this.getActionItem(action);
		const dataSource = this.instantiationService.createInstance(TreeDataSource, this.treeViewer);
		const renderer = this.instantiationService.createInstance(TreeRenderer, this.id, this.menus, actionItemProvider);
		const controller = this.instantiationService.createInstance(TreeController, this.id, this.menus);
		this.tree = this.instantiationService.createInstance(FileIconThemableWorkbenchTree,
			this.treeContainer,
			{ dataSource, renderer, controller },
			{}
		);

		this.tree.contextKeyService.createKey<boolean>(this.id, true);
		this.disposables.push(this.tree);
		this.disposables.push(this.tree.onDidChangeSelection(e => this.onSelection(e, this.tree)));
		this.themeService.onThemeChange(() => this.tree.refresh() /* soft refresh */, this, this.disposables);

		this.treeViewer.setTree(this.tree);
	}

	setExpanded(expanded: boolean): void {
		this.treeViewer.setVisibility(this.isVisible() && expanded);
		super.setExpanded(expanded);
	}

	layoutBody(size: number): void {
		if (this.treeContainer) {
			this.treeContainer.style.height = size + 'px';
		}
		this.treeViewer.layout(size);
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

	getOptimalWidth(): number {
		if (this.tree) {
			const parentNode = this.tree.getHTMLElement();
			const childNodes = [].slice.call(parentNode.querySelectorAll('.outline-item-label > a'));
			return DOM.getLargestChildWidth(parentNode, childNodes);
		}
		return super.getOptimalWidth();
	}

	private updateTreeVisibility(): void {
		this.treeViewer.setVisibility(this.isVisible() && this.isExpanded());
	}

	private onSelection({ payload }: any, tree: WorkbenchTree): void {
		const selection: ITreeItem = tree.getSelection()[0];
		if (selection) {
			if (selection.command) {
				const originalEvent: KeyboardEvent | MouseEvent = payload && payload.originalEvent;
				const isMouseEvent = payload && payload.origin === 'mouse';
				const isDoubleClick = isMouseEvent && originalEvent && originalEvent.detail === 2;

				if (!isMouseEvent || tree.openOnSingleClick || isDoubleClick) {
					this.commandService.executeCommand(selection.command.id, ...(selection.command.arguments || []));
				}
			}
		}
	}

	dispose(): void {
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
		private treeItemViewer: ITreeItemViewer,
		@IProgressService private progressService: IProgressService
	) {
	}

	public getId(tree: ITree, node: ITreeItem): string {
		return node.handle;
	}

	public hasChildren(tree: ITree, node: ITreeItem): boolean {
		if (!this.treeItemViewer.dataProvider) {
			return false;
		}
		return node.collapsibleState === TreeItemCollapsibleState.Collapsed || node.collapsibleState === TreeItemCollapsibleState.Expanded;
	}

	public getChildren(tree: ITree, node: ITreeItem): TPromise<any[]> {
		if (node.children) {
			return TPromise.as(node.children);
		}

		if (this.treeItemViewer.dataProvider) {
			const promise = node instanceof Root ? this.treeItemViewer.dataProvider.getElements() : this.treeItemViewer.dataProvider.getChildren(node);
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
