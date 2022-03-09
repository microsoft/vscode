/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Disposable, DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { CATEGORIES } from 'vs/workbench/common/actions';
import { getNotebookEditorFromEditorPane, ICellViewModel, ICommonCellViewModelLayoutChangeInfo, INotebookEditor, INotebookEditorContribution } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { registerNotebookContribution } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ReloadWindowAction } from 'vs/workbench/browser/actions/windowActions';

export class TroubleshootController extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.troubleshoot';

	private readonly _localStore = this._register(new DisposableStore());
	private _cellStateListeners: IDisposable[] = [];
	private _logging: boolean = false;

	constructor(private readonly _notebookEditor: INotebookEditor) {
		super();

		this._register(this._notebookEditor.onDidChangeModel(() => {
			this._localStore.clear();
			this._cellStateListeners.forEach(listener => listener.dispose());

			if (!this._notebookEditor.hasModel()) {
				return;
			}

			this._updateListener();
		}));

		this._updateListener();
	}

	toggleLogging(): void {
		this._logging = !this._logging;
	}

	private _log(cell: ICellViewModel, e: any) {
		if (this._logging) {
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
			e.splices.reverse().forEach(splice => {
				const [start, deleted, newCells] = splice;
				const deletedCells = this._cellStateListeners.splice(start, deleted, ...newCells.map(cell => {
					return cell.onDidChangeLayout((e: ICommonCellViewModelLayoutChangeInfo) => {
						this._log(cell, e);
					});
				}));

				dispose(deletedCells);
			});
		}));
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
			title: 'Toggle Notebook Layout Troubleshoot',
			category: CATEGORIES.Developer,
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
		controller?.toggleLogging();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'notebook.inspectLayout',
			title: 'Inspect Notebook Layout',
			category: CATEGORIES.Developer,
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
			title: 'Clear Notebook Editor Cache',
			category: CATEGORIES.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notebookService = accessor.get(INotebookService);
		notebookService.clearEditorCache();
	}
});

registerAction2(class DedicatedExtensionHostAction extends Action2 {
	constructor() {
		super({
			id: 'notebook.experiment.runInDedicatedExtensionHost',
			title: localize('notebook.experiment.runInDedicatedExtensionHost', 'Run Notebook Extensions In Dedicated Extension Host'),
			f1: true,
			category: CATEGORIES.Developer
		});
	}

	async run(accessor: ServicesAccessor) {
		const service = accessor.get(IConfigurationService);
		const commandService = accessor.get(ICommandService);
		await service.updateValue('extensions.experimental.dedicatedNotebookProcess', true);
		await commandService.executeCommand(ReloadWindowAction.ID);
	}
});
