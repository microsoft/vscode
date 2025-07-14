/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { IMenuService, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotebookActionContext } from '../controller/coreActions.js';
import { INotebookEditorDelegate } from '../notebookBrowser.js';
import { NotebookOptions } from '../notebookOptions.js';
import { CodiconActionViewItem } from '../view/cellParts/cellActionView.js';

export class ListTopCellToolbar extends Disposable {
	private readonly topCellToolbarContainer: HTMLElement;
	private topCellToolbar: HTMLElement;
	private readonly viewZone: MutableDisposable<DisposableStore> = this._register(new MutableDisposable());
	private readonly _modelDisposables = this._register(new DisposableStore());
	constructor(
		protected readonly notebookEditor: INotebookEditorDelegate,
		private readonly notebookOptions: NotebookOptions,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IContextMenuService protected readonly contextMenuService: IContextMenuService,
		@IMenuService protected readonly menuService: IMenuService
	) {
		super();

		this.topCellToolbarContainer = DOM.$('div');
		this.topCellToolbar = DOM.$('.cell-list-top-cell-toolbar-container');
		this.topCellToolbarContainer.appendChild(this.topCellToolbar);

		this._register(this.notebookEditor.onDidAttachViewModel(() => {
			this.updateTopToolbar();
		}));

		this._register(this.notebookOptions.onDidChangeOptions(e => {
			if (e.insertToolbarAlignment || e.insertToolbarPosition || e.cellToolbarLocation) {
				this.updateTopToolbar();
			}
		}));
	}

	private updateTopToolbar() {
		const layoutInfo = this.notebookOptions.getLayoutConfiguration();
		this.viewZone.value = new DisposableStore();

		if (layoutInfo.insertToolbarPosition === 'hidden' || layoutInfo.insertToolbarPosition === 'notebookToolbar') {
			const height = this.notebookOptions.computeTopInsertToolbarHeight(this.notebookEditor.textModel?.viewType);

			if (height !== 0) {
				// reserve whitespace to avoid overlap with cell toolbar
				this.notebookEditor.changeViewZones(accessor => {
					const id = accessor.addZone({
						afterModelPosition: 0,
						heightInPx: height,
						domNode: DOM.$('div')
					});
					accessor.layoutZone(id);
					this.viewZone.value?.add({
						dispose: () => {
							if (!this.notebookEditor.isDisposed) {
								this.notebookEditor.changeViewZones(accessor => {
									accessor.removeZone(id);
								});
							}
						}
					});
				});
			}
			return;
		}


		this.notebookEditor.changeViewZones(accessor => {
			const height = this.notebookOptions.computeTopInsertToolbarHeight(this.notebookEditor.textModel?.viewType);
			const id = accessor.addZone({
				afterModelPosition: 0,
				heightInPx: height,
				domNode: this.topCellToolbarContainer
			});
			accessor.layoutZone(id);

			this.viewZone.value?.add({
				dispose: () => {
					if (!this.notebookEditor.isDisposed) {
						this.notebookEditor.changeViewZones(accessor => {
							accessor.removeZone(id);
						});
					}
				}
			});

			DOM.clearNode(this.topCellToolbar);

			const toolbar = this.instantiationService.createInstance(MenuWorkbenchToolBar, this.topCellToolbar, this.notebookEditor.creationOptions.menuIds.cellTopInsertToolbar, {
				actionViewItemProvider: (action, options) => {
					if (action instanceof MenuItemAction) {
						const item = this.instantiationService.createInstance(CodiconActionViewItem, action, { hoverDelegate: options.hoverDelegate });
						return item;
					}

					return undefined;
				},
				menuOptions: {
					shouldForwardArgs: true
				},
				toolbarOptions: {
					primaryGroup: (g: string) => /^inline/.test(g),
				},
				hiddenItemStrategy: HiddenItemStrategy.Ignore,
			});

			if (this.notebookEditor.hasModel()) {
				toolbar.context = {
					notebookEditor: this.notebookEditor
				} satisfies INotebookActionContext;
			}

			this.viewZone.value?.add(toolbar);

			// update toolbar container css based on cell list length
			this.viewZone.value?.add(this.notebookEditor.onDidChangeModel(() => {
				this._modelDisposables.clear();

				if (this.notebookEditor.hasModel()) {
					this._modelDisposables.add(this.notebookEditor.onDidChangeViewCells(() => {
						this.updateClass();
					}));

					this.updateClass();
				}
			}));

			this.updateClass();
		});
	}

	private updateClass() {
		if (this.notebookEditor.hasModel() && this.notebookEditor.getLength() === 0) {
			this.topCellToolbar.classList.add('emptyNotebook');
		} else {
			this.topCellToolbar.classList.remove('emptyNotebook');
		}
	}
}
