/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReference } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IResolvedNotebookEditorModel } from '../../common/notebookCommon.js';


export class NotebookOutputEditorInput extends EditorInput {
	static readonly ID: string = 'workbench.input.notebookOutputEditorInput';

	private notebookRef: IReference<IResolvedNotebookEditorModel>;

	getNotebookRef(): IReference<IResolvedNotebookEditorModel> {
		return this.notebookRef;
	}

	private _notebookViewType: string;
	get notebookViewType(): string {
		return this._notebookViewType;
	}

	private _notebookUri: URI;
	get notebookUri(): URI {
		return this._notebookUri;
	}

	private _outputDataUri: URI; // has outputId, cellId
	get outputDataUri(): URI {
		return this._outputDataUri;
	}

	constructor(
		notebookRef: IReference<IResolvedNotebookEditorModel>,
		outputDataUri: URI,
	) {
		super();
		this.notebookRef = notebookRef;

		this._notebookViewType = notebookRef.object.viewType;
		this._notebookUri = notebookRef.object.resource;
		this._outputDataUri = outputDataUri;
	}

	override get typeId(): string {
		return NotebookOutputEditorInput.ID;
	}

	override get resource(): URI | undefined {
		return undefined;
	}

	override dispose(): void {
		this.notebookRef.dispose();
		super.dispose();
	}

}
