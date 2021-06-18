/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as paths from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { AbstractResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { IResolvedNotebookEditorModel } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ICompositeNotebookEditorInput, NotebookEditorInput } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';

export class InteractiveEditorInput extends AbstractResourceEditorInput implements ICompositeNotebookEditorInput {
	typeId: string = 'workbench.input.interactive';

	private _notebookEditorInput: NotebookEditorInput;
	get notebookEditorInput() {
		return this._notebookEditorInput;
	}

	get editorInputs() {
		return [this._notebookEditorInput];
	}

	private _inputResource: URI;

	get inputResource() {
		return this._inputResource;
	}
	constructor(
		resource: URI,
		preferredResource: URI | undefined,
		inputResource: URI,
		@ILabelService labelService: ILabelService,
		@IFileService fileService: IFileService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(resource, preferredResource, labelService, fileService);
		// do something similar to untitled file
		this._notebookEditorInput = NotebookEditorInput.create(instantiationService, resource, 'interactive', {});
		this._register(this._notebookEditorInput);
		this._inputResource = inputResource;
	}

	override async resolve(): Promise<IResolvedNotebookEditorModel | null> {
		return this._notebookEditorInput.resolve();
	}

	override getName() {
		const p = this.resource.path;
		const basename = paths.basename(p);

		return basename.substr(0, basename.length - paths.extname(p).length);
	}
}
