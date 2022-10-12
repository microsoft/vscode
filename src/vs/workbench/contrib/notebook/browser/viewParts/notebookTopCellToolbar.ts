/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { IMenuService, MenuItemAction } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotebookActionContext } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CodiconActionViewItem } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellActionView';

export class ListTopCellToolbar extends Disposable {
	private topCellToolbar: HTMLElement;
	private toolbar: MenuWorkbenchToolBar;
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

		this.toolbar = this._register(instantiationService.createInstance(MenuWorkbenchToolBar, this.topCellToolbar, this.notebookEditor.creationOptions.menuIds.cellTopInsertToolbar, {
			actionViewItemProvider: action => {
				if (action instanceof MenuItemAction) {
					const item = this.instantiationService.createInstance(CodiconActionViewItem, action, undefined);
					return item;
				}

				return undefined;
			},
			menuOptions: {
				shouldForwardArgs: true
			},
			toolbarOptions: {
				primaryGroup: g => /^inline/.test(g),
			},
			hiddenItemStrategy: HiddenItemStrategy.Ignore,
		}));

		this.toolbar.context = <INotebookActionContext>{
			notebookEditor
		};

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

	private updateClass() {
		if (this.notebookEditor.hasModel() && this.notebookEditor.getLength() === 0) {
			this.topCellToolbar.classList.add('emptyNotebook');
		} else {
			this.topCellToolbar.classList.remove('emptyNotebook');
		}
	}
}
