/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { Action, IAction } from 'vs/base/common/actions';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { MarshalledId } from 'vs/base/common/marshallingIds';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { localize } from 'vs/nls';
import { DropdownWithPrimaryActionViewItem } from 'vs/platform/actions/browser/dropdownWithPrimaryActionViewItem';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenu, IMenuService, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContext } from 'vs/platform/contextkey/common/contextkeys';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { INotebookCellActionContext } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { ICellViewModel, INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellPart } from 'vs/workbench/contrib/notebook/browser/view/cellPart';
import { registerStickyScroll } from 'vs/workbench/contrib/notebook/browser/view/cellParts/stickyScroll';
import { NOTEBOOK_CELL_EXECUTION_STATE, NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_TYPE, NOTEBOOK_EDITOR_FOCUSED } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';

export class RunToolbar extends CellPart {
	private toolbar!: ToolBar;

	constructor(
		readonly notebookEditor: INotebookEditorDelegate,
		readonly contextKeyService: IContextKeyService,
		readonly cellContainer: HTMLElement,
		readonly runButtonContainer: HTMLElement,
		@IMenuService readonly menuService: IMenuService,
		@IKeybindingService readonly keybindingService: IKeybindingService,
		@IContextMenuService readonly contextMenuService: IContextMenuService,
		@IInstantiationService readonly instantiationService: IInstantiationService,
	) {
		super();

		const menu = this._register(menuService.createMenu(this.notebookEditor.creationOptions.menuIds.cellExecutePrimary!, contextKeyService));
		this.createRunCellToolbar(runButtonContainer, cellContainer, contextKeyService);
		const updateActions = () => {
			const actions = this.getCellToolbarActions(menu);
			const primary = actions.primary[0]; // Only allow one primary action
			this.toolbar.setActions(primary ? [primary] : []);
		};
		updateActions();
		this._register(menu.onDidChange(updateActions));
		this._register(this.notebookEditor.notebookOptions.onDidChangeOptions(updateActions));
	}

	override didRenderCell(element: ICellViewModel): void {
		this.cellDisposables.add(registerStickyScroll(this.notebookEditor, element, this.runButtonContainer));

		this.toolbar.context = <INotebookCellActionContext>{
			ui: true,
			cell: element,
			notebookEditor: this.notebookEditor,
			$mid: MarshalledId.NotebookCellActionContext
		};
	}

	getCellToolbarActions(menu: IMenu): { primary: IAction[]; secondary: IAction[] } {
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };

		createAndFillInActionBarActions(menu, { shouldForwardArgs: true }, result, g => /^inline/.test(g));

		return result;
	}

	private createRunCellToolbar(container: HTMLElement, cellContainer: HTMLElement, contextKeyService: IContextKeyService) {
		const actionViewItemDisposables = this._register(new DisposableStore());
		const dropdownAction = this._register(new Action('notebook.moreRunActions', localize('notebook.moreRunActionsLabel', "More..."), 'codicon-chevron-down', true));

		const keybindingProvider = (action: IAction) => this.keybindingService.lookupKeybinding(action.id, executionContextKeyService);
		const executionContextKeyService = this._register(getCodeCellExecutionContextKeyService(contextKeyService));
		this.toolbar = this._register(new ToolBar(container, this.contextMenuService, {
			getKeyBinding: keybindingProvider,
			actionViewItemProvider: _action => {
				actionViewItemDisposables.clear();

				const primaryMenu = actionViewItemDisposables.add(this.menuService.createMenu(this.notebookEditor.creationOptions.menuIds.cellExecutePrimary!, contextKeyService));
				const primary = this.getCellToolbarActions(primaryMenu).primary[0];
				if (!(primary instanceof MenuItemAction)) {
					return undefined;
				}

				const menu = actionViewItemDisposables.add(this.menuService.createMenu(this.notebookEditor.creationOptions.menuIds.cellExecuteToolbar, contextKeyService));
				const secondary = this.getCellToolbarActions(menu).secondary;
				if (!secondary.length) {
					return undefined;
				}

				const item = this.instantiationService.createInstance(DropdownWithPrimaryActionViewItem,
					primary,
					dropdownAction,
					secondary,
					'notebook-cell-run-toolbar',
					this.contextMenuService,
					{
						getKeyBinding: keybindingProvider
					});
				actionViewItemDisposables.add(item.onDidChangeDropdownVisibility(visible => {
					cellContainer.classList.toggle('cell-run-toolbar-dropdown-active', visible);
				}));

				return item;
			},
			renderDropdownAsChildElement: true
		}));
	}
}

export function getCodeCellExecutionContextKeyService(contextKeyService: IContextKeyService): IContextKeyService {
	// Create a fake ContextKeyService, and look up the keybindings within this context.
	const executionContextKeyService = contextKeyService.createScoped(document.createElement('div'));
	InputFocusedContext.bindTo(executionContextKeyService).set(true);
	EditorContextKeys.editorTextFocus.bindTo(executionContextKeyService).set(true);
	EditorContextKeys.focus.bindTo(executionContextKeyService).set(true);
	EditorContextKeys.textInputFocus.bindTo(executionContextKeyService).set(true);
	NOTEBOOK_CELL_EXECUTION_STATE.bindTo(executionContextKeyService).set('idle');
	NOTEBOOK_CELL_LIST_FOCUSED.bindTo(executionContextKeyService).set(true);
	NOTEBOOK_EDITOR_FOCUSED.bindTo(executionContextKeyService).set(true);
	NOTEBOOK_CELL_TYPE.bindTo(executionContextKeyService).set('code');

	return executionContextKeyService;
}
