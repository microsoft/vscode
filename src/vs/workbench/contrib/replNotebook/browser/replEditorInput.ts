/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReference } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IFileService } from 'vs/platform/files/common/files';
import { ILabelService } from 'vs/platform/label/common/label';
import { IInteractiveHistoryService } from 'vs/workbench/contrib/interactive/browser/interactiveHistoryService';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';
import { INotebookEditorModelResolverService } from 'vs/workbench/contrib/notebook/common/notebookEditorModelResolverService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { ICustomEditorLabelService } from 'vs/workbench/services/editor/common/customEditorLabelService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';

export class ReplEditorInput extends NotebookEditorInput {
	static override ID: string = 'workbench.editorinputs.replEditorInput';

	private _inputModelRef: IReference<IResolvedTextEditorModel> | undefined;

	constructor(
		resource: URI,
		@INotebookService _notebookService: INotebookService,
		@INotebookEditorModelResolverService _notebookModelResolverService: INotebookEditorModelResolverService,
		@IFileDialogService _fileDialogService: IFileDialogService,
		@ILabelService labelService: ILabelService,
		@IFileService fileService: IFileService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService,
		@IExtensionService extensionService: IExtensionService,
		@IEditorService editorService: IEditorService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@ICustomEditorLabelService customEditorLabelService: ICustomEditorLabelService,
		@IInteractiveHistoryService public readonly historyService: IInteractiveHistoryService,
		@ITextModelService private readonly _textModelService: ITextModelService
	) {
		super(resource, undefined, 'repl', {}, _notebookService, _notebookModelResolverService, _fileDialogService, labelService, fileService, filesConfigurationService, extensionService, editorService, textResourceConfigurationService, customEditorLabelService);
	}

	async resolveInput(notebook: NotebookTextModel) {
		if (this._inputModelRef) {
			return this._inputModelRef.object.textEditorModel;
		}

		// return BaseCellViewModel.resolveTextModel
		const lastCell = notebook.cells[notebook.cells.length - 1];
		this._inputModelRef = await this._textModelService.createModelReference(lastCell.uri);
		return this._inputModelRef.object.textEditorModel;
	}
}
