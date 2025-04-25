/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../../nls.js';
import { Event } from '../../../../../base/common/event.js';
import { IDisposable, IReference } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { EditorInputCapabilities } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IResolvedNotebookEditorModel } from '../../common/notebookCommon.js';
import { INotebookEditorModelResolverService } from '../../common/notebookEditorModelResolverService.js';
import { NotebookEditorWidget } from '../notebookEditorWidget.js';
import { INotebookEditorService } from '../services/notebookEditorService.js';


class ResolvedNotebookOutputEditorInputModel implements IDisposable {
	constructor(
		readonly notebookRef: IReference<IResolvedNotebookEditorModel>,
		readonly notebookUri: URI,
		readonly cellId: string,
		readonly outputId: string,
	) { }

	dispose(): void {
		this.notebookRef.dispose();
	}
}

// export class NotebookOutputViewerInput extends EditorInput { // for viewing static outputs, encode mime + data
// 	static readonly ID: string = 'workbench.input.notebookOutputViewerInput';
// }

export class NotebookOutputEditorInput extends EditorInput { // for viewing dynamic outputs w execution refreshing
	static readonly ID: string = 'workbench.input.notebookOutputEditorInput';

	private _notebookRef: IReference<IResolvedNotebookEditorModel> | undefined;
	private readonly _notebookUri: URI;

	readonly cellIndex: number;

	public cellId: string | undefined;

	readonly outputIndex: number;
	private outputId: string | undefined;

	constructor(
		notebookUri: URI,
		cellId: string | undefined,
		cellIndex: number,
		outputId: string | undefined,
		outputIndex: number,
		@INotebookEditorService private readonly notebookEditorService: INotebookEditorService,
		@INotebookEditorModelResolverService private readonly notebookEditorModelResolverService: INotebookEditorModelResolverService,
	) {
		super();
		this._notebookUri = notebookUri;

		this.cellId = cellId;
		this.cellIndex = cellIndex;

		this.outputId = outputId;
		this.outputIndex = outputIndex;
	}

	override get typeId(): string {
		return NotebookOutputEditorInput.ID;
	}

	override async resolve(): Promise<ResolvedNotebookOutputEditorInputModel> {
		if (!this._notebookRef) {
			this._notebookRef = await this.notebookEditorModelResolverService.resolve(this._notebookUri);
		}

		const notebookEditor = this.notebookEditorService.retrieveExistingWidgetFromURI(this._notebookUri)?.value;
		if (!notebookEditor) {
			throw new Error('Notebook editor not found');
		}

		if (!notebookEditor.viewModel) {
			// Wait for the viewModel to be attached before proceeding if it hasn't attached
			await getEditorViewModelAttachedPromise(notebookEditor);
		}

		const cell = notebookEditor.cellAt(this.cellIndex);
		if (!cell) {
			throw new Error('Cell not found');
		}
		if (!this.cellId) {
			this.cellId = cell.id;
		}

		const oId = this._notebookRef.object.notebook.cells.find(c => c.handle === cell.handle)?.outputs[this.outputIndex];
		if (!oId) {
			throw new Error('Output not found');
		}
		if (!this.outputId) {
			this.outputId = oId.outputId;
		}

		return new ResolvedNotebookOutputEditorInputModel(
			this._notebookRef,
			this._notebookUri,
			this.cellId,
			this.outputId,
		);
	}

	public getSerializedData(): { notebookUri: URI; cellIndex: number; outputIndex: number } | undefined {
		// need to translate from ids -> current indexes
		// ids aren't deterministic across reloads, so indexes are best option

		const notebookEditor = this.notebookEditorService.retrieveExistingWidgetFromURI(this._notebookUri)?.value;
		if (!notebookEditor) {
			return;
		}

		const cellIndex = notebookEditor.viewModel?.viewCells.findIndex(c => c.id === this.cellId);
		if (cellIndex === undefined || cellIndex === -1) {
			return;
		}

		const outputIndex = notebookEditor.cellAt(cellIndex)?.outputsViewModels.findIndex(o => o.model.outputId === this.outputId);
		if (outputIndex === undefined || outputIndex === -1) {
			return;
		}

		return {
			notebookUri: this._notebookUri,
			cellIndex: cellIndex,
			outputIndex: outputIndex,
		};
	}

	override getName(): string {
		return nls.localize('notebookOutputEditorInput', "Notebook Output Preview");
	}

	override get editorId(): string {
		return 'notebookOutputEditor';
	}

	override get resource(): URI | undefined {
		return;
	}

	override get capabilities() {
		return EditorInputCapabilities.Readonly;
	}

	override dispose(): void {
		super.dispose();
	}
}

function getEditorViewModelAttachedPromise(editor: NotebookEditorWidget) {
	return new Promise<void>((resolve, reject) => {
		Event.once(editor.onDidAttachViewModel)(() => editor.viewModel ? resolve() : reject());
	});
}
