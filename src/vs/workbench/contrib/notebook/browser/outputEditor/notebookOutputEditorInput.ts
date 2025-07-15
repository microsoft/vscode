/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../../nls.js';
import { IDisposable, IReference } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { EditorInputCapabilities } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IResolvedNotebookEditorModel } from '../../common/notebookCommon.js';
import { INotebookEditorModelResolverService } from '../../common/notebookEditorModelResolverService.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { NotebookCellTextModel } from '../../common/model/notebookCellTextModel.js';


class ResolvedNotebookOutputEditorInputModel implements IDisposable {
	constructor(
		readonly resolvedNotebookEditorModel: IResolvedNotebookEditorModel,
		readonly notebookUri: URI,
		readonly cell: NotebookCellTextModel,
		readonly outputId: string,
	) { }

	dispose(): void {
		this.resolvedNotebookEditorModel.dispose();
	}
}

// TODO @Yoyokrazy -- future feat. for viewing static outputs -- encode mime + data
// export class NotebookOutputViewerInput extends EditorInput {
// 	static readonly ID: string = 'workbench.input.notebookOutputViewerInput';
// }

export class NotebookOutputEditorInput extends EditorInput {
	static readonly ID: string = 'workbench.input.notebookOutputEditorInput';

	private _notebookRef: IReference<IResolvedNotebookEditorModel> | undefined;
	private readonly _notebookUri: URI;

	readonly cellIndex: number;

	public cellUri: URI | undefined;

	readonly outputIndex: number;
	private outputId: string | undefined;

	constructor(
		notebookUri: URI,
		cellIndex: number,
		outputId: string | undefined,
		outputIndex: number,
		@INotebookEditorModelResolverService private readonly notebookEditorModelResolverService: INotebookEditorModelResolverService,
	) {
		super();
		this._notebookUri = notebookUri;

		this.cellUri = undefined;
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

		const cell = this._notebookRef.object.notebook.cells[this.cellIndex];
		if (!cell) {
			throw new Error('Cell not found');
		}

		this.cellUri = cell.uri;

		const resolvedOutputId = cell.outputs[this.outputIndex]?.outputId;
		if (!resolvedOutputId) {
			throw new Error('Output not found');
		}

		if (!this.outputId) {
			this.outputId = resolvedOutputId;
		}

		return new ResolvedNotebookOutputEditorInputModel(
			this._notebookRef.object,
			this._notebookUri,
			cell,
			resolvedOutputId,
		);
	}

	public getSerializedData(): { notebookUri: URI; cellIndex: number; outputIndex: number } | undefined {
		// need to translate from uris -> current indexes
		// uris aren't deterministic across reloads, so indices are best option

		if (!this._notebookRef) {
			return;
		}

		const cellIndex = this._notebookRef.object.notebook.cells.findIndex(c => isEqual(c.uri, this.cellUri));
		const cell = this._notebookRef.object.notebook.cells[cellIndex];
		if (!cell) {
			return;
		}

		const outputIndex = cell.outputs.findIndex(o => o.outputId === this.outputId);
		if (outputIndex === -1) {
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
