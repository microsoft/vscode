/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Event, { Emitter } from 'vs/base/common/event';
import { IDisposable, Disposable, dispose, empty as EmptyDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IViewletView, CollapsibleViewletView } from 'vs/workbench/browser/viewlet';
import { IExplorerViewsService, IExplorerViewDataProvider, IExplorerView } from 'vs/workbench/parts/explorers/common/explorer';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';
import * as DOM from 'vs/base/browser/dom';
import { Builder, $ } from 'vs/base/browser/builder';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IAction, IActionRunner, IActionItem, ActionRunner } from 'vs/base/common/actions';
import { IMessageService } from 'vs/platform/message/common/message';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IListService } from 'vs/platform/list/browser/listService';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { ClickBehavior, DefaultController } from 'vs/base/parts/tree/browser/treeDefaults';
import { IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { attachListStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { createActionItem, fillInActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { ITree, IDataSource, IRenderer, ContextMenuEvent } from 'vs/base/parts/tree/browser/tree';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';
import { ActionItem } from 'vs/base/browser/ui/actionbar/actionbar';

export interface IViewInstantiator {
	instantiate(actionRunner: IActionRunner, viewletSetings: any, instantiationService: IInstantiationService): IViewletView;
}

export class ExplorerViewsService implements IExplorerViewsService {

	public _serviceBrand: any;

	private explorerViews: Map<string, IExplorerView<any>> = new Map<string, IExplorerView<any>>();

	private _onViewCreated: Emitter<IExplorerView<any>> = new Emitter<IExplorerView<any>>();
	public readonly onViewCreated: Event<IExplorerView<any>> = this._onViewCreated.event;

	private _onDataProviderRegistered: Emitter<IExplorerView<any>> = new Emitter<IExplorerView<any>>();
	public readonly onDataProviderRegistered: Event<IExplorerView<any>> = this._onDataProviderRegistered.event;

	createView(id: string, name: string, dataProvider: IExplorerViewDataProvider<any>): IExplorerView<any> {
		const view = new ExplorerView(id, name, dataProvider);
		this.explorerViews.set(id, view);
		this._onViewCreated.fire(view);
		return view;
	}

	public getViews(): IExplorerView<any>[] {
		const views = [];
		this.explorerViews.forEach(view => {
			views.push(view);
		});
		return views;
	}
}

class ExplorerView<T> extends Disposable implements IExplorerView<T>, IViewInstantiator {

	private view: TreeExplorerView;

	constructor(private id: string, private name: string, private dataProvider: IExplorerViewDataProvider<T>) {
		super();
	}

	refresh(element: T): void {
		if (this.view) {
			this.view.refresh(element);
		}
	}

	instantiate(actionRunner: IActionRunner, viewletSettings: any, instantiationService: IInstantiationService): IViewletView {
		if (!this.view) {
			this.view = instantiationService.createInstance(TreeExplorerView, this.id, this.name, this.dataProvider, actionRunner);
		}
		return this.view;
	}
}

class TreeExplorerView extends CollapsibleViewletView {

	private menus: Menus;
	private viewFocusContext: IContextKey<boolean>;

	constructor(
		private id: string,
		private name: string,
		private dataProvider: IExplorerViewDataProvider<any>,
		actionRunner: IActionRunner,
		@IMessageService messageService: IMessageService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IListService private listService: IListService,
		@IThemeService private themeService: IThemeService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IExplorerViewsService private explorerViewsService: IExplorerViewsService
	) {
		super(actionRunner, false, name, messageService, keybindingService, contextMenuService);
		this.menus = this.instantiationService.createInstance(Menus, this.id, this.dataProvider);
		this.viewFocusContext = this.contextKeyService.createKey<boolean>(this.id, void 0);
	}

	public renderHeader(container: HTMLElement): void {
		const titleDiv = $('div.title').appendTo(container);
		$('span').text(this.name).appendTo(titleDiv);
		super.renderHeader(container);
	}

	public renderBody(container: HTMLElement): void {
		this.treeContainer = super.renderViewTree(container);
		DOM.addClass(this.treeContainer, 'tree-explorer-viewlet-tree-view');

		this.tree = this.createViewer($(this.treeContainer));
	}

	public createViewer(container: Builder): ITree {
		const dataSource = this.instantiationService.createInstance(TreeDataSource, this.dataProvider);
		const renderer = this.instantiationService.createInstance(TreeRenderer, this.dataProvider);
		const controller = this.instantiationService.createInstance(TreeController, this.menus);
		const tree = new Tree(container.getHTMLElement(), {
			dataSource,
			renderer,
			controller
		}, {
				keyboardSupport: false
			});

		this.toDispose.push(attachListStyler(tree, this.themeService));
		this.toDispose.push(this.listService.register(tree, [this.viewFocusContext]));
		tree.addListener('selection', (event: any) => {
			const selection = tree.getSelection()[0];
			if (selection) {
				this.dataProvider.select(selection);
			}
		});
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

	public create(): TPromise<void> {
		return this.updateInput();
	}

	public setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible);
	}

	public updateInput(): TPromise<void> {
		return this.dataProvider.provideRoot()
			.then(root => this.tree.setInput(root));
	}

	public getOptimalWidth(): number {
		const parentNode = this.tree.getHTMLElement();
		const childNodes = [].slice.call(parentNode.querySelectorAll('.outline-item-label > a'));

		return DOM.getLargestChildWidth(parentNode, childNodes);
	}

	refresh(element: any) {
		this.tree.refresh(element);
	}
}

class TreeDataSource implements IDataSource {

	constructor(
		private dataProvider: IExplorerViewDataProvider<any>,
		@IProgressService private progressService: IProgressService,
		@IExplorerViewsService private explorerViewsService: IExplorerViewsService
	) {
	}

	public getId(tree: ITree, node: any): string {
		return this.dataProvider.getId(node);
	}

	public hasChildren(tree: ITree, node: any): boolean {
		return this.dataProvider.hasChildren(node);
	}

	public getChildren(tree: ITree, node: any): TPromise<any[]> {
		const promise = this.dataProvider.resolveChildren(node);

		this.progressService.showWhile(promise, 800);

		return promise;
	}

	public getParent(tree: ITree, node: any): TPromise<any> {
		return TPromise.as(null);
	}
}

interface ITreeExplorerTemplateData {
	label: Builder;
}

class TreeRenderer implements IRenderer {

	private static ITEM_HEIGHT = 22;
	private static TREE_TEMPLATE_ID = 'treeExplorer';

	constructor(
		private dataProvider: IExplorerViewDataProvider<any>,
		@IExplorerViewsService private explorerViewsService: IExplorerViewsService
	) {
	}

	public getHeight(tree: ITree, element: any): number {
		return TreeRenderer.ITEM_HEIGHT;
	}

	public getTemplateId(tree: ITree, element: any): string {
		return TreeRenderer.TREE_TEMPLATE_ID;
	}

	public renderTemplate(tree: ITree, templateId: string, container: HTMLElement): ITreeExplorerTemplateData {
		const el = $(container);
		const item = $('.custom-viewlet-tree-node-item');
		item.appendTo(el);

		const label = $('.custom-viewlet-tree-node-item-label').appendTo(item);
		const link = $('a.plain').appendTo(label);

		return { label: link };
	}

	public renderElement(tree: ITree, node: any, templateId: string, templateData: ITreeExplorerTemplateData): void {
		const label = this.dataProvider.getLabel(node);
		templateData.label.text(label).title(label);
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: ITreeExplorerTemplateData): void {
	}
}

class TreeController extends DefaultController {

	constructor(
		private menus: Menus,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IKeybindingService private _keybindingService: IKeybindingService
	) {
		super({ clickBehavior: ClickBehavior.ON_MOUSE_UP /* do not change to not break DND */, keyboardSupport: false });
	}

	public onContextMenu(tree: ITree, node: any, event: ContextMenuEvent): boolean {
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
				const keybinding = this._keybindingFor(action);
				if (keybinding) {
					return new ActionItem(action, action, { label: true, keybinding: keybinding.getLabel() });
				}
				return null;
			},

			getKeyBinding: (action): ResolvedKeybinding => {
				return this._keybindingFor(action);
			},

			onHide: (wasCancelled?: boolean) => {
				if (wasCancelled) {
					tree.DOMFocus();
				}
			},

			getActionsContext: () => node,

			actionRunner: new MultipleSelectionActionRunner(() => tree.getSelection())
		});

		return true;
	}

	private _keybindingFor(action: IAction): ResolvedKeybinding {
		return this._keybindingService.lookupKeybinding(action.id);
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
		private viewId: string,
		private dataProvider: IExplorerViewDataProvider<any>,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IMenuService private menuService: IMenuService,
		@IExplorerViewsService private explorerViewsService: IExplorerViewsService
	) {
		if (this.titleDisposable) {
			this.titleDisposable.dispose();
			this.titleDisposable = EmptyDisposable;
		}

		const _contextKeyService = this.contextKeyService.createScoped();
		contextKeyService.createKey('view', viewId);

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

	getResourceContextActions(element: any): IAction[] {
		return this.getActions(MenuId.ViewResource, { key: 'resource', value: this.dataProvider.getContextKey(element) }).secondary;
	}

	private getActions(menuId: MenuId, context: { key: string, value: string }): { primary: IAction[]; secondary: IAction[]; } {
		const contextKeyService = this.contextKeyService.createScoped();
		contextKeyService.createKey('view', this.viewId);
		contextKeyService.createKey(context.key, context.value);

		const menu = this.menuService.createMenu(menuId, contextKeyService);
		const primary = [];
		const secondary = [];
		const result = { primary, secondary };
		fillInActions(menu, { shouldForwardArgs: true }, result, g => g === 'inline');

		menu.dispose();
		contextKeyService.dispose();

		return result;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
