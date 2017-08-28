/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/views';
import Event, { Emitter } from 'vs/base/common/event';
import { IDisposable, dispose, empty as EmptyDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';
import * as DOM from 'vs/base/browser/dom';
import { Builder, $ } from 'vs/base/browser/builder';
import { IAction, IActionItem, ActionRunner } from 'vs/base/common/actions';
import { IMessageService } from 'vs/platform/message/common/message';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IListService } from 'vs/platform/list/browser/listService';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { ClickBehavior, DefaultController } from 'vs/base/parts/tree/browser/treeDefaults';
import { IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { attachListStyler } from 'vs/platform/theme/common/styler';
import { IThemeService, LIGHT } from 'vs/platform/theme/common/themeService';
import { createActionItem, fillInActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { ITree, IDataSource, IRenderer, ContextMenuEvent } from 'vs/base/parts/tree/browser/tree';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { ViewsRegistry } from 'vs/workbench/parts/views/browser/viewsRegistry';
import { ITreeViewDataProvider, ITreeItem, TreeItemCollapsibleState, TreeViewItemHandleArg } from 'vs/workbench/parts/views/common/views';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { CollapsibleState, ViewSizing } from 'vs/base/browser/ui/splitview/splitview';
import { CollapsibleView, IViewletViewOptions, IViewOptions } from 'vs/workbench/parts/views/browser/views';
import { ICommandService } from 'vs/platform/commands/common/commands';

export class TreeView extends CollapsibleView {

	private menus: Menus;
	private viewFocusContext: IContextKey<boolean>;
	private activated: boolean = false;
	private treeInputPromise: TPromise<void>;

	private dataProviderElementChangeListener: IDisposable;
	private disposables: IDisposable[] = [];

	constructor(
		initialSize: number,
		private options: IViewletViewOptions,
		@IMessageService private messageService: IMessageService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IListService private listService: IListService,
		@IThemeService private themeService: IThemeService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IExtensionService private extensionService: IExtensionService,
		@ICommandService private commandService: ICommandService
	) {
		super(initialSize, { ...(options as IViewOptions), ariaHeaderLabel: options.name, sizing: ViewSizing.Flexible, collapsed: options.collapsed === void 0 ? true : options.collapsed }, keybindingService, contextMenuService);
		this.menus = this.instantiationService.createInstance(Menus, this.id);
		this.viewFocusContext = this.contextKeyService.createKey<boolean>(this.id, void 0);
		this.menus.onDidChangeTitle(() => this.updateActions(), this, this.disposables);
		this.themeService.onThemeChange(() => this.tree.refresh() /* soft refresh */, this, this.disposables);
		if (!options.collapsed) {
			this.activate();
		}
	}

	public renderHeader(container: HTMLElement): void {
		const titleDiv = $('div.title').appendTo(container);
		$('span').text(this.options.name).appendTo(titleDiv);
		super.renderHeader(container);
	}

	public renderBody(container: HTMLElement): void {
		this.treeContainer = super.renderViewTree(container);
		DOM.addClass(this.treeContainer, 'tree-explorer-viewlet-tree-view');

		this.tree = this.createViewer($(this.treeContainer));
		this.setInput();
	}

	protected changeState(state: CollapsibleState): void {
		super.changeState(state);
		if (state === CollapsibleState.EXPANDED) {
			this.activate();
		}
	}

	private activate() {
		if (!this.activated && this.extensionService) {
			this.extensionService.activateByEvent(`onView:${this.id}`);
			this.activated = true;
			this.setInput();
		}
	}

	public createViewer(container: Builder): ITree {
		const dataSource = this.instantiationService.createInstance(TreeDataSource, this.id);
		const renderer = this.instantiationService.createInstance(TreeRenderer);
		const controller = this.instantiationService.createInstance(TreeController, this.id, this.menus);
		const tree = new Tree(container.getHTMLElement(), {
			dataSource,
			renderer,
			controller
		}, {
				keyboardSupport: false
			});

		this.toDispose.push(attachListStyler(tree, this.themeService));
		this.toDispose.push(this.listService.register(tree, [this.viewFocusContext]));
		tree.addListener('selection', (event: any) => this.onSelection());
		return tree;
	}

	getActions(): IAction[] {
		return [...this.menus.getTitleActions()];
	}

	getSecondaryActions(): IAction[] {
		return this.menus.getTitleSecondaryActions();
	}

	getActionItem(action: IAction): IActionItem {
		return createActionItem(action, this.keybindingService, this.messageService);
	}

	public setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible);
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

	private onSelection(): void {
		const selection: ITreeItem = this.tree.getSelection()[0];
		if (selection) {
			if (selection.command) {
				this.commandService.executeCommand(selection.command.id, ...(selection.command.arguments || []));
			}
		}
	}

	private refresh(elements: ITreeItem[]): void {
		elements = elements ? elements : [this.tree.getInput()];
		for (const element of elements) {
			element.children = null;
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
	handle = -1;
	collapsibleState = TreeItemCollapsibleState.Expanded;
}

class TreeDataSource implements IDataSource {

	constructor(
		private id: string,
		@IProgressService private progressService: IProgressService
	) {
	}

	public getId(tree: ITree, node: ITreeItem): string {
		return '' + node.handle;
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
		return TPromise.as(null);
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
	icon: Builder;
	label: Builder;
}

class TreeRenderer implements IRenderer {

	private static ITEM_HEIGHT = 22;
	private static TREE_TEMPLATE_ID = 'treeExplorer';

	constructor( @IThemeService private themeService: IThemeService) {
	}

	public getHeight(tree: ITree, element: any): number {
		return TreeRenderer.ITEM_HEIGHT;
	}

	public getTemplateId(tree: ITree, element: any): string {
		return TreeRenderer.TREE_TEMPLATE_ID;
	}

	public renderTemplate(tree: ITree, templateId: string, container: HTMLElement): ITreeExplorerTemplateData {
		const el = $(container);
		const item = $('.custom-view-tree-node-item');
		item.appendTo(el);

		const icon = $('.custom-view-tree-node-item-icon').appendTo(item);
		const label = $('.custom-view-tree-node-item-label').appendTo(item);
		const link = $('a.label').appendTo(label);

		return { label: link, icon };
	}

	public renderElement(tree: ITree, node: ITreeItem, templateId: string, templateData: ITreeExplorerTemplateData): void {
		templateData.label.text(node.label).title(node.label);

		const theme = this.themeService.getTheme();
		const icon = theme.type === LIGHT ? node.icon : node.iconDark;

		if (icon) {
			templateData.icon.getHTMLElement().style.backgroundImage = `url('${icon}')`;
			DOM.addClass(templateData.icon.getHTMLElement(), 'custom-view-tree-node-item-icon');
		} else {
			templateData.icon.getHTMLElement().style.backgroundImage = '';
			DOM.removeClass(templateData.icon.getHTMLElement(), 'custom-view-tree-node-item-icon');
		}
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: ITreeExplorerTemplateData): void {
	}
}

class TreeController extends DefaultController {

	constructor(
		private treeViewId: string,
		private menus: Menus,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IKeybindingService private _keybindingService: IKeybindingService
	) {
		super({ clickBehavior: ClickBehavior.ON_MOUSE_UP /* do not change to not break DND */, keyboardSupport: false });
	}

	public onContextMenu(tree: ITree, node: ITreeItem, event: ContextMenuEvent): boolean {
		event.preventDefault();
		event.stopPropagation();

		tree.setFocus(node);
		const actions = this.menus.getResourceContextActions(node);
		if (!actions.length) {
			return true;
		}
		const anchor = { x: event.posx + 1, y: event.posy };
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
		@IMenuService private menuService: IMenuService
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
			fillInActions(titleMenu, null, { primary: this.titleActions, secondary: this.titleSecondaryActions });
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

	getResourceContextActions(element: ITreeItem): IAction[] {
		return this.getActions(MenuId.ViewItemContext, { key: 'viewItem', value: element.contextValue }).secondary;
	}

	private getActions(menuId: MenuId, context: { key: string, value: string }): { primary: IAction[]; secondary: IAction[]; } {
		const contextKeyService = this.contextKeyService.createScoped();
		contextKeyService.createKey('view', this.id);
		contextKeyService.createKey(context.key, context.value);

		const menu = this.menuService.createMenu(menuId, contextKeyService);
		const primary = [];
		const secondary = [];
		const result = { primary, secondary };
		fillInActions(menu, { shouldForwardArgs: true }, result);

		menu.dispose();
		contextKeyService.dispose();

		return result;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}