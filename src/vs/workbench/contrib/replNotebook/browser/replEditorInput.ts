/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { EditorInputCapabilities } from '../../../common/editor.js';
import { IInteractiveHistoryService } from '../../interactive/browser/interactiveHistoryService.js';
import { NotebookTextModel } from '../../notebook/common/model/notebookTextModel.js';
import { CellEditType, CellKind, NotebookSetting } from '../../notebook/common/notebookCommon.js';
import { ICompositeNotebookEditorInput, NotebookEditorInput } from '../../notebook/common/notebookEditorInput.js';
import { INotebookEditorModelResolverService } from '../../notebook/common/notebookEditorModelResolverService.js';
import { INotebookService } from '../../notebook/common/notebookService.js';
import { ICustomEditorLabelService } from '../../../services/editor/common/customEditorLabelService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';

const replTabIcon = registerIcon('repl-editor-label-icon', Codicon.debugLineByLine, localize('replEditorLabelIcon', 'Icon of the REPL editor label.'));

export class ReplEditorInput extends NotebookEditorInput implements ICompositeNotebookEditorInput {
	static override ID: string = 'workbench.editorinputs.replEditorInput';

	private inputModelRef: IReference<IResolvedTextEditorModel> | undefined;
	private isScratchpad: boolean;
	private label: string;
	private isDisposing = false;

	constructor(
		resource: URI,
		label: string | undefined,
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
		this.isScratchpad = resource.scheme === 'untitled' && configurationService.getValue<boolean>(NotebookSetting.InteractiveWindowPromptToSave) !== true;
		this.label = label ?? this.createEditorLabel(resource);
	}

	override getIcon(): ThemeIcon | undefined {
		return replTabIcon;
	}

	private createEditorLabel(resource: URI | undefined): string {
		if (!resource) {
			return 'REPL';
		}

		if (resource.scheme === 'untitled') {
			const match = new RegExp('Untitled-(\\d+)\.').exec(resource.path);
			if (match?.length === 2) {
				return `REPL - ${match[1]}`;
			}
		}

		const filename = resource.path.split('/').pop();
		return filename ? `REPL - ${filename}` : 'REPL';
	}

	override get typeId(): string {
		return ReplEditorInput.ID;
	}

	override get editorId(): string | undefined {
		return 'repl';
	}

	override getName() {
		return this.label;
	}

	get editorInputs() {
		return [this];
	}

	override get capabilities() {
		const capabilities = super.capabilities;
		const scratchPad = this.isScratchpad ? EditorInputCapabilities.Scratchpad : 0;

		return capabilities
			| EditorInputCapabilities.Readonly
			| scratchPad;
	}

	override async resolve() {
		const model = await super.resolve();
		if (model) {
			this.ensureInputBoxCell(model.notebook);
		}

		return model;
	}

	private ensureInputBoxCell(notebook: NotebookTextModel) {
		const lastCell = notebook.cells[notebook.cells.length - 1];

		if (!lastCell || lastCell.cellKind === CellKind.Markup || lastCell.outputs.length > 0 || lastCell.internalMetadata.executionOrder !== undefined) {
			notebook.applyEdits([
				{
					editType: CellEditType.Replace,
					index: notebook.cells.length,
					count: 0,
					cells: [
						{
							cellKind: CellKind.Code,
							language: 'python',
							mime: undefined,
							outputs: [],
							source: ''
						}
					]
				}
			], true, undefined, () => undefined, undefined, false);
		}
	}

	async resolveInput(notebook: NotebookTextModel) {
		if (this.inputModelRef) {
			return this.inputModelRef.object.textEditorModel;
		}
		const lastCell = notebook.cells[notebook.cells.length - 1];
		if (!lastCell) {
			throw new Error('The REPL editor requires at least one cell for the input box.');
		}

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
