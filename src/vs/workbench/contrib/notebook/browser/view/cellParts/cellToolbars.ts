/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IAction } from 'vs/base/common/actions';
import { disposableTimeout } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { createActionViewItem, createAndFillInActionBarActions, MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenu, IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotebookCellActionContext } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { DeleteCellAction } from 'vs/workbench/contrib/notebook/browser/controller/editActions';
import { ICellViewModel, INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CodiconActionViewItem } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellActionView';
import { CellPart } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellPart';

export class BetweenCellToolbar extends CellPart {
	private _betweenCellToolbar!: ToolBar;

	constructor(
		private readonly _notebookEditor: INotebookEditorDelegate,
		_titleToolbarContainer: HTMLElement,
		private readonly _bottomCellToolbarContainer: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService
	) {
		super();

		this._betweenCellToolbar = this._register(new ToolBar(this._bottomCellToolbarContainer, contextMenuService, {
			actionViewItemProvider: action => {
				if (action instanceof MenuItemAction) {
					if (this._notebookEditor.notebookOptions.getLayoutConfiguration().insertToolbarAlignment === 'center') {
						return instantiationService.createInstance(CodiconActionViewItem, action);
					} else {
						return instantiationService.createInstance(MenuEntryActionViewItem, action, undefined);
					}
				}

				return undefined;
			}
		}));

		const menu = this._register(menuService.createMenu(this._notebookEditor.creationOptions.menuIds.cellInsertToolbar, contextKeyService));
		const updateActions = () => {
			const actions = getCellToolbarActions(menu);
			this._betweenCellToolbar.setActions(actions.primary, actions.secondary);
		};

		this._register(menu.onDidChange(() => updateActions()));
		this._register(this._notebookEditor.notebookOptions.onDidChangeOptions((e) => {
			if (e.insertToolbarAlignment) {
				updateActions();
			}
		}));
		updateActions();
	}

	updateContext(context: INotebookCellActionContext) {
		this._betweenCellToolbar.context = context;
	}

	prepareRender(): void {
		// nothing to read
	}

	updateLayout(element: ICellViewModel) {
		const bottomToolbarOffset = element.layoutInfo.bottomToolbarOffset;
		this._bottomCellToolbarContainer.style.transform = `translateY(${bottomToolbarOffset}px)`;
	}
}


export interface ICssClassDelegate {
	toggle: (className: string, force?: boolean) => void;
}

export class CellTitleToolbarPart extends Disposable {
	private _toolbar: ToolBar;
	private _deleteToolbar: ToolBar;
	private _titleMenu: IMenu;
	private _actionsDisposables = this._register(new DisposableStore());

	private _hasActions = false;
	private readonly _onDidUpdateActions: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidUpdateActions: Event<void> = this._onDidUpdateActions.event;

	get hasActions(): boolean {
		return this._hasActions;
	}

	constructor(
		toolbarContainer: HTMLElement,
		private readonly _rootClassDelegate: ICssClassDelegate,
		toolbarId: MenuId,
		private readonly _notebookEditor: INotebookEditorDelegate,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._toolbar = instantiationService.invokeFunction(accessor => createToolbar(accessor, toolbarContainer));
		this._titleMenu = this._register(menuService.createMenu(toolbarId, contextKeyService));

		this._deleteToolbar = this._register(instantiationService.invokeFunction(accessor => createToolbar(accessor, toolbarContainer, 'cell-delete-toolbar')));
		if (!this._notebookEditor.creationOptions.isReadOnly) {
			this._deleteToolbar.setActions([instantiationService.createInstance(DeleteCellAction)]);
		}

		this.setupChangeListeners();
	}

	updateContext(toolbarContext: INotebookCellActionContext) {
		this._toolbar.context = toolbarContext;
		this._deleteToolbar.context = toolbarContext;
	}

	private setupChangeListeners(): void {
		// #103926
		let dropdownIsVisible = false;
		let deferredUpdate: (() => void) | undefined;

		this.updateActions();
		this._register(this._titleMenu.onDidChange(() => {
			if (dropdownIsVisible) {
				deferredUpdate = () => this.updateActions();
				return;
			}

			this.updateActions();
		}));
		this._rootClassDelegate.toggle('cell-toolbar-dropdown-active', false);
		this._register(this._toolbar.onDidChangeDropdownVisibility(visible => {
			dropdownIsVisible = visible;
			this._rootClassDelegate.toggle('cell-toolbar-dropdown-active', visible);

			if (deferredUpdate && !visible) {
				this._register(disposableTimeout(() => {
					if (deferredUpdate) {
						deferredUpdate();
					}
				}));

				deferredUpdate = undefined;
			}
		}));
	}

	private updateActions() {
		this._actionsDisposables.clear();
		const actions = getCellToolbarActions(this._titleMenu);
		this._actionsDisposables.add(actions.disposable);

		const hadFocus = DOM.isAncestor(document.activeElement, this._toolbar.getElement());
		this._toolbar.setActions(actions.primary, actions.secondary);
		if (hadFocus) {
			this._notebookEditor.focus();
		}

		if (actions.primary.length || actions.secondary.length) {
			this._rootClassDelegate.toggle('cell-has-toolbar-actions', true);
			this._hasActions = true;
			this._onDidUpdateActions.fire();
		} else {
			this._rootClassDelegate.toggle('cell-has-toolbar-actions', false);
			this._hasActions = false;
			this._onDidUpdateActions.fire();
		}
	}
}

function getCellToolbarActions(menu: IMenu): { primary: IAction[], secondary: IAction[]; disposable: IDisposable; } {
	const primary: IAction[] = [];
	const secondary: IAction[] = [];
	const result = { primary, secondary };

	const disposable = createAndFillInActionBarActions(menu, { shouldForwardArgs: true }, result, g => /^inline/.test(g));

	return {
		...result,
		disposable
	};
}

function createToolbar(accessor: ServicesAccessor, container: HTMLElement, elementClass?: string): ToolBar {
	const contextMenuService = accessor.get(IContextMenuService);
	const keybindingService = accessor.get(IKeybindingService);
	const instantiationService = accessor.get(IInstantiationService);
	const toolbar = new ToolBar(container, contextMenuService, {
		getKeyBinding: action => keybindingService.lookupKeybinding(action.id),
		actionViewItemProvider: action => {
			return createActionViewItem(instantiationService, action);
		},
		renderDropdownAsChildElement: true
	});

	if (elementClass) {
		toolbar.getElement().classList.add(elementClass);
	}

	return toolbar;
}
