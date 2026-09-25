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
import { createActionViewItem, getActionBarActions, MenuEntryActionViewItem, PrimaryAndSecondaryActions } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenu, IMenuService, MenuId, MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { INotebookCellActionContext } from '../../controller/coreActions.js';
import { ICellViewModel, INotebookEditorDelegate } from '../../notebookBrowser.js';
import { CodiconActionViewItem } from './cellActionView.js';
import { CellOverlayPart } from '../cellPart.js';
import { registerCellToolbarStickyScroll } from './cellToolbarStickyScroll.js';
import { WorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { createInstantHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegateFactory.js';

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

		this.setupChangeListeners(toolbar, model);

		this._view = {
			toolbar
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
	}

	private setupChangeListeners(toolbar: ToolBar, model: CellTitleToolbarModel): void {
		// #103926
		let dropdownIsVisible = false;
		let deferredUpdate: (() => void) | undefined;

		this.updateActions(toolbar, model);
		const onMenuChanged = () => {
			if (dropdownIsVisible) {
				model.actions = getCellToolbarActions(model.titleMenu);
				model.deleteActions = getCellToolbarActions(model.deleteMenu);
				deferredUpdate = () => this.updateActions(toolbar, model);
				return;
			}

			model.actions = getCellToolbarActions(model.titleMenu);
			model.deleteActions = getCellToolbarActions(model.deleteMenu);
			this.updateActions(toolbar, model);
		};
		this._register(model.titleMenu.onDidChange(onMenuChanged));
		this._register(model.deleteMenu.onDidChange(onMenuChanged));
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

	private updateActions(toolbar: ToolBar, model: CellTitleToolbarModel) {
		const hadFocus = DOM.isAncestorOfActiveElement(toolbar.getElement());
		// Combine the main title actions and delete actions into a single toolbar
		// so that arrow-key navigation reaches all items (including Delete Cell).
		// Delete actions are appended at the end to preserve the original visual order.
		const primary = model.actions.primary.concat(model.deleteActions.primary);
		const secondary = model.actions.secondary.concat(model.deleteActions.secondary);
		toolbar.setActions(primary, secondary);
		if (hadFocus) {
			this._notebookEditor.focus();
		}

		if (primary.length || secondary.length) {
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
