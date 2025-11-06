/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { MenuWorkbenchToolBar, HiddenItemStrategy } from '../../../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { CellEditState, INotebookEditor } from '../../../../notebook/browser/notebookBrowser.js';
import { NotebookTextModel } from '../../../../notebook/common/model/notebookTextModel.js';
import { CellKind } from '../../../../notebook/common/notebookCommon.js';
import { IModifiedFileEntryChangeHunk } from '../../../common/chatEditingService.js';
import { AcceptHunkAction, RejectHunkAction } from '../chatEditingEditorActions.js';
import { ICellDiffInfo } from './notebookCellChanges.js';


export class OverlayToolbarDecorator extends Disposable {

	private _timeout: Timeout | undefined = undefined;
	private readonly overlayDisposables = this._register(new DisposableStore());

	constructor(
		private readonly notebookEditor: INotebookEditor,
		private readonly notebookModel: NotebookTextModel,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAccessibilitySignalService private readonly accessibilitySignalService: IAccessibilitySignalService,
	) {
		super();
	}

	decorate(changes: ICellDiffInfo[]) {
		if (this._timeout !== undefined) {
			clearTimeout(this._timeout);
		}
		this._timeout = setTimeout(() => {
			this._timeout = undefined;
			this.createMarkdownPreviewToolbars(changes);
		}, 100);
	}

	private createMarkdownPreviewToolbars(changes: ICellDiffInfo[]) {
		this.overlayDisposables.clear();

		const accessibilitySignalService = this.accessibilitySignalService;
		const editor = this.notebookEditor;
		for (const change of changes) {
			const cellViewModel = this.getCellViewModel(change);

			if (!cellViewModel || cellViewModel.cellKind !== CellKind.Markup) {
				continue;
			}
			const toolbarContainer = document.createElement('div');

			let overlayId: string | undefined = undefined;
			editor.changeCellOverlays((accessor) => {
				toolbarContainer.style.right = '44px';
				overlayId = accessor.addOverlay({
					cell: cellViewModel,
					domNode: toolbarContainer,
				});
			});

			const removeOverlay = () => {
				editor.changeCellOverlays(accessor => {
					if (overlayId) {
						accessor.removeOverlay(overlayId);
					}
				});
			};

			this.overlayDisposables.add({ dispose: removeOverlay });

			const toolbar = document.createElement('div');
			toolbarContainer.appendChild(toolbar);
			toolbar.className = 'chat-diff-change-content-widget';
			toolbar.classList.add('hover'); // Show by default
			toolbar.style.position = 'relative';
			toolbar.style.top = '18px';
			toolbar.style.zIndex = '10';
			toolbar.style.display = cellViewModel.getEditState() === CellEditState.Editing ? 'none' : 'block';

			this.overlayDisposables.add(cellViewModel.onDidChangeState((e) => {
				if (e.editStateChanged) {
					if (cellViewModel.getEditState() === CellEditState.Editing) {
						toolbar.style.display = 'none';
					} else {
						toolbar.style.display = 'block';
					}
				}
			}));

			const scopedInstaService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.notebookEditor.scopedContextKeyService])));
			const toolbarWidget = scopedInstaService.createInstance(MenuWorkbenchToolBar, toolbar, MenuId.ChatEditingEditorHunk, {
				telemetrySource: 'chatEditingNotebookHunk',
				hiddenItemStrategy: HiddenItemStrategy.NoHide,
				toolbarOptions: { primaryGroup: () => true },
				menuOptions: {
					renderShortTitle: true,
					arg: {
						async accept() {
							accessibilitySignalService.playSignal(AccessibilitySignal.editsKept, { allowManyInParallel: true });
							removeOverlay();
							toolbarWidget.dispose();
							for (const singleChange of change.diff.get().changes) {
								await change.keep(singleChange);
							}
							return true;
						},
						async reject() {
							accessibilitySignalService.playSignal(AccessibilitySignal.editsUndone, { allowManyInParallel: true });
							removeOverlay();
							toolbarWidget.dispose();
							for (const singleChange of change.diff.get().changes) {
								await change.undo(singleChange);
							}
							return true;
						}
					} satisfies IModifiedFileEntryChangeHunk,
				},
				actionViewItemProvider: (action, options) => {
					if (action.id === AcceptHunkAction.ID || action.id === RejectHunkAction.ID) {
						return new class extends ActionViewItem {
							constructor() {
								super(undefined, action, { ...options, keybindingNotRenderedWithLabel: true, icon: false, label: true });
							}
						};
					}
					return undefined;
				}
			});

			this.overlayDisposables.add(toolbarWidget);
		}
	}

	private getCellViewModel(change: ICellDiffInfo) {
		if (change.type === 'delete' || change.modifiedCellIndex === undefined) {
			return undefined;
		}
		const cell = this.notebookModel.cells[change.modifiedCellIndex];
		const cellViewModel = this.notebookEditor.getViewModel()?.viewCells.find(c => c.handle === cell.handle);
		return cellViewModel;
	}

	override dispose(): void {
		super.dispose();
		if (this._timeout !== undefined) {
			clearTimeout(this._timeout);
		}
	}

}
