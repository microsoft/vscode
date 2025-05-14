/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, dispose, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../../nls.js';
import { Categories } from '../../../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { getNotebookEditorFromEditorPane, ICellViewModel, ICommonCellViewModelLayoutChangeInfo, INotebookDeltaCellStatusBarItems, INotebookEditor, INotebookEditorContribution } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { NotebookEditorWidget } from '../../notebookEditorWidget.js';
import { CellStatusbarAlignment, INotebookCellStatusBarItem } from '../../../common/notebookCommon.js';
import { INotebookService } from '../../../common/notebookService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';

export class TroubleshootController extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.troubleshoot';

	private readonly _localStore = this._register(new DisposableStore());
	private _cellStateListeners: IDisposable[] = [];
	private _enabled: boolean = false;
	private _cellStatusItems: string[] = [];

	constructor(private readonly _notebookEditor: INotebookEditor) {
		super();

		this._register(this._notebookEditor.onDidChangeModel(() => {
			this._update();
		}));

		this._update();
	}

	toggle(): void {
		this._enabled = !this._enabled;
		this._update();
	}

	private _update() {
		this._localStore.clear();
		this._cellStateListeners.forEach(listener => listener.dispose());

		if (!this._notebookEditor.hasModel()) {
			return;
		}

		this._updateListener();
	}

	private _log(cell: ICellViewModel, e: any) {
		if (this._enabled) {
			const oldHeight = (this._notebookEditor as NotebookEditorWidget).getViewHeight(cell);
			console.log(`cell#${cell.handle}`, e, `${oldHeight} -> ${cell.layoutInfo.totalHeight}`);
		}
	}

	private _updateListener() {
		if (!this._notebookEditor.hasModel()) {
			return;
		}

		for (let i = 0; i < this._notebookEditor.getLength(); i++) {
			const cell = this._notebookEditor.cellAt(i);

			this._cellStateListeners.push(cell.onDidChangeLayout(e => {
				this._log(cell, e);
			}));
		}

		this._localStore.add(this._notebookEditor.onDidChangeViewCells(e => {
			[...e.splices].reverse().forEach(splice => {
				const [start, deleted, newCells] = splice;
				const deletedCells = this._cellStateListeners.splice(start, deleted, ...newCells.map(cell => {
					return cell.onDidChangeLayout((e: ICommonCellViewModelLayoutChangeInfo) => {
						this._log(cell, e);
					});
				}));

				dispose(deletedCells);
			});
		}));

		const vm = this._notebookEditor.getViewModel();
		let items: INotebookDeltaCellStatusBarItems[] = [];

		if (this._enabled) {
			items = this._getItemsForCells();
		}

		this._cellStatusItems = vm.deltaCellStatusBarItems(this._cellStatusItems, items);
	}

	private _getItemsForCells(): INotebookDeltaCellStatusBarItems[] {
		const items: INotebookDeltaCellStatusBarItems[] = [];
		for (let i = 0; i < this._notebookEditor.getLength(); i++) {
			items.push({
				handle: i,
				items: [
					{
						text: `index: ${i}`,
						alignment: CellStatusbarAlignment.Left,
						priority: Number.MAX_SAFE_INTEGER
					} satisfies INotebookCellStatusBarItem
				]
			});
		}

		return items;
	}

	override dispose() {
		dispose(this._cellStateListeners);
		super.dispose();
	}
}

registerNotebookContribution(TroubleshootController.id, TroubleshootController);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'notebook.toggleLayoutTroubleshoot',
			title: localize2('workbench.notebook.toggleLayoutTroubleshoot', "Toggle Layout Troubleshoot"),
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);

		if (!editor) {
			return;
		}

		const controller = editor.getContribution<TroubleshootController>(TroubleshootController.id);
		controller?.toggle();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'notebook.inspectLayout',
			title: localize2('workbench.notebook.inspectLayout', "Inspect Notebook Layout"),
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);

		if (!editor || !editor.hasModel()) {
			return;
		}

		for (let i = 0; i < editor.getLength(); i++) {
			const cell = editor.cellAt(i);
			console.log(`cell#${cell.handle}`, cell.layoutInfo);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'notebook.clearNotebookEdtitorTypeCache',
			title: localize2('workbench.notebook.clearNotebookEdtitorTypeCache', "Clear Notebook Editor Type Cache"),
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notebookService = accessor.get(INotebookService);
		notebookService.clearEditorCache();
	}
});
