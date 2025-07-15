/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import { ToolBar } from '../../../../../../base/browser/ui/toolbar/toolbar.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { disposableTimeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { MarshalledId } from '../../../../../../base/common/marshallingIds.js';
import { ServicesAccessor } from '../../../../../../editor/browser/editorExtensions.js';
import { createActionViewItem, getActionBarActions, MenuEntryActionViewItem, PrimaryAndSecondaryActions } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenu, IMenuService, MenuId, MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { INotebookCellActionContext } from '../../controller/coreActions.js';
import { ICellViewModel, INotebookEditorDelegate } from '../../notebookBrowser.js';
import { CodiconActionViewItem } from './cellActionView.js';
import { CellOverlayPart } from '../cellPart.js';
import { registerCellToolbarStickyScroll } from './cellToolbarStickyScroll.js';
import { WorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { createInstantHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegate.js';

export class BetweenCellToolbar extends CellOverlayPart {
	private _betweenCellToolbar: ToolBar | undefined;

	constructor(
		private readonly _notebookEditor: INotebookEditorDelegate,
		_titleToolbarContainer: HTMLElement,
		private readonly _bottomCellToolbarContainer: HTMLElement,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService
	) {
		super();
	}

	private _initialize(): ToolBar {
		if (this._betweenCellToolbar) {
			return this._betweenCellToolbar;
		}

		const betweenCellToolbar = this._register(new ToolBar(this._bottomCellToolbarContainer, this.contextMenuService, {
			actionViewItemProvider: (action, options) => {
				if (action instanceof MenuItemAction) {
					if (this._notebookEditor.notebookOptions.getDisplayOptions().insertToolbarAlignment === 'center') {
						return this.instantiationService.createInstance(CodiconActionViewItem, action, { hoverDelegate: options.hoverDelegate });
					} else {
						return this.instantiationService.createInstance(MenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate });
					}
				}

				return undefined;
			}
		}));

		this._betweenCellToolbar = betweenCellToolbar;
		const menu = this._register(this.menuService.createMenu(this._notebookEditor.creationOptions.menuIds.cellInsertToolbar, this.contextKeyService));
		const updateActions = () => {
			const actions = getCellToolbarActions(menu);
			betweenCellToolbar.setActions(actions.primary, actions.secondary);
		};

		this._register(menu.onDidChange(() => updateActions()));
		this._register(this._notebookEditor.notebookOptions.onDidChangeOptions((e) => {
			if (e.insertToolbarAlignment) {
				updateActions();
			}
		}));

		updateActions();

		return betweenCellToolbar;
	}

	override didRenderCell(element: ICellViewModel): void {
		const betweenCellToolbar = this._initialize();
		if (this._notebookEditor.hasModel()) {
			betweenCellToolbar.context = {
				ui: true,
				cell: element,
				notebookEditor: this._notebookEditor,
				source: 'insertToolbar',
				$mid: MarshalledId.NotebookCellActionContext
			} satisfies (INotebookCellActionContext & { source?: string; $mid: number });
		}
		this.updateInternalLayoutNow(element);
	}

	override updateInternalLayoutNow(element: ICellViewModel) {
		const bottomToolbarOffset = element.layoutInfo.bottomToolbarOffset;
		this._bottomCellToolbarContainer.style.transform = `translateY(${bottomToolbarOffset}px)`;
	}
}


export interface ICssClassDelegate {
	toggle: (className: string, force?: boolean) => void;
}

interface CellTitleToolbarModel {
	titleMenu: IMenu;
	actions: { primary: IAction[]; secondary: IAction[] };
	deleteMenu: IMenu;
	deleteActions: { primary: IAction[]; secondary: IAction[] };
}

interface CellTitleToolbarView {
	toolbar: ToolBar;
	deleteToolbar: ToolBar;
}

export class CellTitleToolbarPart extends CellOverlayPart {
	private _model: CellTitleToolbarModel | undefined;
	private _view: CellTitleToolbarView | undefined;
	private readonly _onDidUpdateActions: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidUpdateActions: Event<void> = this._onDidUpdateActions.event;

	get hasActions(): boolean {
		if (!this._model) {
			return false;
		}

		return this._model.actions.primary.length
			+ this._model.actions.secondary.length
			+ this._model.deleteActions.primary.length
			+ this._model.deleteActions.secondary.length
			> 0;
	}

	constructor(
		private readonly toolbarContainer: HTMLElement,
		private readonly _rootClassDelegate: ICssClassDelegate,
		private readonly toolbarId: MenuId,
		private readonly deleteToolbarId: MenuId,
		private readonly _notebookEditor: INotebookEditorDelegate,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	private _initializeModel(): CellTitleToolbarModel {
		if (this._model) {
			return this._model;
		}

		const titleMenu = this._register(this.menuService.createMenu(this.toolbarId, this.contextKeyService));
		const deleteMenu = this._register(this.menuService.createMenu(this.deleteToolbarId, this.contextKeyService));
		const actions = getCellToolbarActions(titleMenu);
		const deleteActions = getCellToolbarActions(deleteMenu);

		this._model = {
			titleMenu,
			actions,
			deleteMenu,
			deleteActions
		};

		return this._model;
	}

	private _initialize(model: CellTitleToolbarModel, element: ICellViewModel): CellTitleToolbarView {
		if (this._view) {
			return this._view;
		}
		const hoverDelegate = this._register(createInstantHoverDelegate());
		const toolbar = this._register(this.instantiationService.createInstance(WorkbenchToolBar, this.toolbarContainer, {
			actionViewItemProvider: (action, options) => {
				return createActionViewItem(this.instantiationService, action, options);
			},
			renderDropdownAsChildElement: true,
			hoverDelegate
		}));

		const deleteToolbar = this._register(this.instantiationService.invokeFunction(accessor => createDeleteToolbar(accessor, this.toolbarContainer, hoverDelegate, 'cell-delete-toolbar')));
		if (model.deleteActions.primary.length !== 0 || model.deleteActions.secondary.length !== 0) {
			deleteToolbar.setActions(model.deleteActions.primary, model.deleteActions.secondary);
		}

		this.setupChangeListeners(toolbar, model.titleMenu, model.actions);
		this.setupChangeListeners(deleteToolbar, model.deleteMenu, model.deleteActions);

		this._view = {
			toolbar,
			deleteToolbar
		};

		return this._view;
	}

	override prepareRenderCell(element: ICellViewModel): void {
		this._initializeModel();
	}

	override didRenderCell(element: ICellViewModel): void {
		const model = this._initializeModel();
		const view = this._initialize(model, element);
		this.cellDisposables.add(registerCellToolbarStickyScroll(this._notebookEditor, element, this.toolbarContainer, { extraOffset: 4, min: -14 }));

		if (this._notebookEditor.hasModel()) {
			const toolbarContext: INotebookCellActionContext & { source?: string; $mid: number } = {
				ui: true,
				cell: element,
				notebookEditor: this._notebookEditor,
				source: 'cellToolbar',
				$mid: MarshalledId.NotebookCellActionContext
			};

			this.updateContext(view, toolbarContext);
		}
	}

	private updateContext(view: CellTitleToolbarView, toolbarContext: INotebookCellActionContext) {
		view.toolbar.context = toolbarContext;
		view.deleteToolbar.context = toolbarContext;
	}

	private setupChangeListeners(toolbar: ToolBar, menu: IMenu, initActions: { primary: IAction[]; secondary: IAction[] }): void {
		// #103926
		let dropdownIsVisible = false;
		let deferredUpdate: (() => void) | undefined;

		this.updateActions(toolbar, initActions);
		this._register(menu.onDidChange(() => {
			if (dropdownIsVisible) {
				const actions = getCellToolbarActions(menu);
				deferredUpdate = () => this.updateActions(toolbar, actions);
				return;
			}

			const actions = getCellToolbarActions(menu);
			this.updateActions(toolbar, actions);
		}));
		this._rootClassDelegate.toggle('cell-toolbar-dropdown-active', false);
		this._register(toolbar.onDidChangeDropdownVisibility(visible => {
			dropdownIsVisible = visible;
			this._rootClassDelegate.toggle('cell-toolbar-dropdown-active', visible);

			if (deferredUpdate && !visible) {
				disposableTimeout(() => {
					deferredUpdate?.();
				}, 0, this._store);

				deferredUpdate = undefined;
			}
		}));
	}

	private updateActions(toolbar: ToolBar, actions: { primary: IAction[]; secondary: IAction[] }) {
		const hadFocus = DOM.isAncestorOfActiveElement(toolbar.getElement());
		toolbar.setActions(actions.primary, actions.secondary);
		if (hadFocus) {
			this._notebookEditor.focus();
		}

		if (actions.primary.length || actions.secondary.length) {
			this._rootClassDelegate.toggle('cell-has-toolbar-actions', true);
			this._onDidUpdateActions.fire();
		} else {
			this._rootClassDelegate.toggle('cell-has-toolbar-actions', false);
			this._onDidUpdateActions.fire();
		}
	}
}

function getCellToolbarActions(menu: IMenu): PrimaryAndSecondaryActions {
	return getActionBarActions(menu.getActions({ shouldForwardArgs: true }), g => /^inline/.test(g));
}

function createDeleteToolbar(accessor: ServicesAccessor, container: HTMLElement, hoverDelegate: IHoverDelegate, elementClass?: string): ToolBar {
	const contextMenuService = accessor.get(IContextMenuService);
	const keybindingService = accessor.get(IKeybindingService);
	const instantiationService = accessor.get(IInstantiationService);
	const toolbar = new ToolBar(container, contextMenuService, {
		getKeyBinding: action => keybindingService.lookupKeybinding(action.id),
		actionViewItemProvider: (action, options) => {
			return createActionViewItem(instantiationService, action, options);
		},
		renderDropdownAsChildElement: true,
		hoverDelegate
	});

	if (elementClass) {
		toolbar.getElement().classList.add(elementClass);
	}

	return toolbar;
}
