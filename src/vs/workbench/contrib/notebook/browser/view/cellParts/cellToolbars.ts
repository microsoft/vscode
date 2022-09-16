/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IAction } from 'vs/base/common/actions';
import { disposableTimeout } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { MarshalledId } from 'vs/base/common/marshallingIds';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { createActionViewItem, createAndFillInActionBarActions, MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenu, IMenuService, MenuId, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotebookCellActionContext } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { ICellViewModel, INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CodiconActionViewItem } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellActionView';
import { CellPart } from 'vs/workbench/contrib/notebook/browser/view/cellPart';
import { registerStickyScroll } from 'vs/workbench/contrib/notebook/browser/view/cellParts/stickyScroll';
import { HiddenItemStrategy, MenuWorkbenchToolBar, WorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';

export class BetweenCellToolbar extends CellPart {
	private _betweenCellToolbar!: MenuWorkbenchToolBar;

	constructor(
		private readonly _notebookEditor: INotebookEditorDelegate,
		_titleToolbarContainer: HTMLElement,
		private readonly _bottomCellToolbarContainer: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._betweenCellToolbar = this._register(instantiationService.createInstance(MenuWorkbenchToolBar, this._bottomCellToolbarContainer, this._notebookEditor.creationOptions.menuIds.cellInsertToolbar, {
			actionViewItemProvider: action => {
				if (action instanceof MenuItemAction) {
					if (this._notebookEditor.notebookOptions.getLayoutConfiguration().insertToolbarAlignment === 'center') {
						return instantiationService.createInstance(CodiconActionViewItem, action, undefined);
					} else {
						return instantiationService.createInstance(MenuEntryActionViewItem, action, undefined);
					}
				}

				return undefined;
			},
			toolbarOptions: {
				primaryGroup: g => /^inline/.test(g),
			},
			menuOptions: {
				shouldForwardArgs: true
			}
		}));
	}

	updateContext(context: INotebookCellActionContext) {
		this._betweenCellToolbar.context = context;
	}

	override didRenderCell(element: ICellViewModel): void {
		this._betweenCellToolbar.context = <INotebookCellActionContext>{
			ui: true,
			cell: element,
			notebookEditor: this._notebookEditor,
			$mid: MarshalledId.NotebookCellActionContext
		};
	}

	override updateInternalLayoutNow(element: ICellViewModel) {
		const bottomToolbarOffset = element.layoutInfo.bottomToolbarOffset;
		this._bottomCellToolbarContainer.style.transform = `translateY(${bottomToolbarOffset}px)`;
	}
}


export interface ICssClassDelegate {
	toggle: (className: string, force?: boolean) => void;
}

export class CellTitleToolbarPart extends CellPart {
	private _toolbar: WorkbenchToolBar;
	private _titleMenu: IMenu;
	private _deleteToolbar: WorkbenchToolBar;
	private _deleteMenu: IMenu;
	private readonly _onDidUpdateActions: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidUpdateActions: Event<void> = this._onDidUpdateActions.event;

	get hasActions(): boolean {
		return this._toolbar.getItemsLength() + this._deleteToolbar.getItemsLength() > 0;
	}

	constructor(
		private readonly toolbarContainer: HTMLElement,
		private readonly _rootClassDelegate: ICssClassDelegate,
		toolbarId: MenuId,
		deleteToolbarId: MenuId,
		private readonly _notebookEditor: INotebookEditorDelegate,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._toolbar = instantiationService.invokeFunction(accessor => createToolbar(accessor, toolbarContainer));
		this._titleMenu = this._register(menuService.createMenu(toolbarId, contextKeyService));

		this._deleteToolbar = this._register(instantiationService.invokeFunction(accessor => createToolbar(accessor, toolbarContainer, 'cell-delete-toolbar', HiddenItemStrategy.Ignore)));
		this._deleteMenu = this._register(menuService.createMenu(deleteToolbarId, contextKeyService));
		if (!this._notebookEditor.creationOptions.isReadOnly) {
			const deleteActions = getCellToolbarActions(this._deleteMenu);
			this._deleteToolbar.setActions(deleteActions.primary, deleteActions.secondary);
		}

		this.setupChangeListeners(this._toolbar, this._titleMenu);
		this.setupChangeListeners(this._deleteToolbar, this._deleteMenu);
	}

	override didRenderCell(element: ICellViewModel): void {
		this.cellDisposables.add(registerStickyScroll(this._notebookEditor, element, this.toolbarContainer, { extraOffset: 4, min: -14 }));

		this.updateContext(<INotebookCellActionContext>{
			ui: true,
			cell: element,
			notebookEditor: this._notebookEditor,
			$mid: MarshalledId.NotebookCellActionContext
		});
	}

	private updateContext(toolbarContext: INotebookCellActionContext) {
		this._toolbar.context = toolbarContext;
		this._deleteToolbar.context = toolbarContext;
	}

	private setupChangeListeners(toolbar: ToolBar, menu: IMenu): void {
		// #103926
		let dropdownIsVisible = false;
		let deferredUpdate: (() => void) | undefined;

		this.updateActions(toolbar, menu);
		this._register(menu.onDidChange(() => {
			if (dropdownIsVisible) {
				deferredUpdate = () => this.updateActions(toolbar, menu);
				return;
			}

			this.updateActions(toolbar, menu);
		}));
		this._rootClassDelegate.toggle('cell-toolbar-dropdown-active', false);
		this._register(toolbar.onDidChangeDropdownVisibility(visible => {
			dropdownIsVisible = visible;
			this._rootClassDelegate.toggle('cell-toolbar-dropdown-active', visible);

			if (deferredUpdate && !visible) {
				this._register(disposableTimeout(() => {
					deferredUpdate?.();
				}));

				deferredUpdate = undefined;
			}
		}));
	}

	private updateActions(toolbar: ToolBar, menu: IMenu) {

		const actions = getCellToolbarActions(menu);

		const hadFocus = DOM.isAncestor(document.activeElement, toolbar.getElement());
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

function getCellToolbarActions(menu: IMenu): { primary: IAction[]; secondary: IAction[] } {
	const primary: IAction[] = [];
	const secondary: IAction[] = [];
	const result = { primary, secondary };

	createAndFillInActionBarActions(menu, { shouldForwardArgs: true }, result, g => /^inline/.test(g));

	return result;
}

function createToolbar(accessor: ServicesAccessor, container: HTMLElement, elementClass?: string, hiddenItemStrategy?: HiddenItemStrategy): WorkbenchToolBar {
	const instantiationService = accessor.get(IInstantiationService);

	const toolbar = instantiationService.createInstance(WorkbenchToolBar, container, {
		actionViewItemProvider: action => {
			return createActionViewItem(instantiationService, action);
		},
		renderDropdownAsChildElement: true,
		hiddenItemStrategy
	});

	if (elementClass) {
		toolbar.getElement().classList.add(elementClass);
	}

	return toolbar;
}
