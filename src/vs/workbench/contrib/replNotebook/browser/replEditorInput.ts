/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReference } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IFileService } from 'vs/platform/files/common/files';
import { ILabelService } from 'vs/platform/label/common/label';
import { EditorInputCapabilities } from 'vs/workbench/common/editor';
import { IInteractiveHistoryService } from 'vs/workbench/contrib/interactive/browser/interactiveHistoryService';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';
import { INotebookEditorModelResolverService } from 'vs/workbench/contrib/notebook/common/notebookEditorModelResolverService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { ICustomEditorLabelService } from 'vs/workbench/services/editor/common/customEditorLabelService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';

export class ReplEditorInput extends NotebookEditorInput {
	static override ID: string = 'workbench.editorinputs.replEditorInput';

	private inputModelRef: IReference<IResolvedTextEditorModel> | undefined;
	private isScratchpad: boolean;
	private isDisposing = false;

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
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(resource, undefined, 'jupyter-notebook', {}, _notebookService, _notebookModelResolverService, _fileDialogService, labelService, fileService, filesConfigurationService, extensionService, editorService, textResourceConfigurationService, customEditorLabelService);
		this.isScratchpad = configurationService.getValue<boolean>(NotebookSetting.InteractiveWindowPromptToSave) !== true;
	}

	override get typeId(): string {
		return ReplEditorInput.ID;
	}

	override getName() {
		return 'REPL';
	}

	override get capabilities() {
		const capabilities = super.capabilities;
		const scratchPad = this.isScratchpad ? EditorInputCapabilities.Scratchpad : 0;

		return capabilities
			| EditorInputCapabilities.Readonly
			| scratchPad;
	}

	async resolveInput(notebook: NotebookTextModel) {
		if (this.inputModelRef) {
			return this.inputModelRef.object.textEditorModel;
		}

		const lastCell = notebook.cells[notebook.cells.length - 1];
		this.inputModelRef = await this._textModelService.createModelReference(lastCell.uri);
		return this.inputModelRef.object.textEditorModel;
	}

	override dispose() {
		if (!this.isDisposing) {
			this.isDisposing = true;
			this.editorModelReference?.object.revert({ soft: true });
			this.inputModelRef?.dispose();
			super.dispose();
		}
	}
}
