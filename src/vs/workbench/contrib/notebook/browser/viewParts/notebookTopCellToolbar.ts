/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IAction } from 'vs/base/common/actions';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenu, IMenuService, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotebookActionContext } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CodiconActionViewItem } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellActionView';

export class ListTopCellToolbar extends Disposable {
	private topCellToolbar: HTMLElement;
	private menu: IMenu;
	private toolbar: ToolBar;
	private readonly _modelDisposables = this._register(new DisposableStore());
	constructor(
		protected readonly notebookEditor: INotebookEditorDelegate,

		contextKeyService: IContextKeyService,
		insertionIndicatorContainer: HTMLElement,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IContextMenuService protected readonly contextMenuService: IContextMenuService,
		@IMenuService protected readonly menuService: IMenuService
	) {
		super();

		this.topCellToolbar = DOM.append(insertionIndicatorContainer, DOM.$('.cell-list-top-cell-toolbar-container'));

		this.toolbar = this._register(new ToolBar(this.topCellToolbar, this.contextMenuService, {
			actionViewItemProvider: action => {
				if (action instanceof MenuItemAction) {
					const item = this.instantiationService.createInstance(CodiconActionViewItem, action, undefined);
					return item;
				}

				return undefined;
			}
		}));
		this.toolbar.context = <INotebookActionContext>{
			notebookEditor
		};

		this.menu = this._register(this.menuService.createMenu(this.notebookEditor.creationOptions.menuIds.cellTopInsertToolbar, contextKeyService));
		this._register(this.menu.onDidChange(() => {
			this.updateActions();
		}));
		this.updateActions();

		// update toolbar container css based on cell list length
		this._register(this.notebookEditor.onDidChangeModel(() => {
			this._modelDisposables.clear();

			if (this.notebookEditor.hasModel()) {
				this._modelDisposables.add(this.notebookEditor.onDidChangeViewCells(() => {
					this.updateClass();
				}));

				this.updateClass();
			}
		}));

		this.updateClass();
	}

	private updateActions() {
		const actions = this.getCellToolbarActions(this.menu, false);
		this.toolbar.setActions(actions.primary, actions.secondary);
	}

	private updateClass() {
		if (this.notebookEditor.hasModel() && this.notebookEditor.getLength() === 0) {
			this.topCellToolbar.classList.add('emptyNotebook');
		} else {
			this.topCellToolbar.classList.remove('emptyNotebook');
		}
	}

	private getCellToolbarActions(menu: IMenu, alwaysFillSecondaryActions: boolean): { primary: IAction[]; secondary: IAction[] } {
		type NewType = IAction;

		const primary: NewType[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };

		createAndFillInActionBarActions(menu, { shouldForwardArgs: true }, result, g => /^inline/.test(g));

		return result;
	}
}
