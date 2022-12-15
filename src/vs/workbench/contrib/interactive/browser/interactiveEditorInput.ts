/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { Event } from 'vs/base/common/event';
import { IReference } from 'vs/base/common/lifecycle';
import * as paths from 'vs/base/common/path';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IUntypedEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IInteractiveDocumentService } from 'vs/workbench/contrib/interactive/browser/interactiveDocumentService';
import { IInteractiveHistoryService } from 'vs/workbench/contrib/interactive/browser/interactiveHistoryService';
import { NotebookCellTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellTextModel';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellKind, ICellDto2, IOutputDto, IResolvedNotebookEditorModel, NotebookCellCollapseState, NotebookCellInternalMetadata, NotebookCellMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ICompositeNotebookEditorInput, NotebookEditorInput } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';

export class InteractiveEditorInput extends EditorInput implements ICompositeNotebookEditorInput {
	static create(instantiationService: IInstantiationService, resource: URI, inputResource: URI, title?: string) {
		return instantiationService.createInstance(InteractiveEditorInput, resource, inputResource, title);
	}

	static readonly ID: string = 'workbench.input.interactive';

	public override get editorId(): string {
		return InteractiveEditorInput.ID;
	}

	override get typeId(): string {
		return InteractiveEditorInput.ID;
	}

	private _initTitle?: string;

	private _notebookEditorInput: NotebookEditorInput;
	get notebookEditorInput() {
		return this._notebookEditorInput;
	}

	get editorInputs() {
		return [this._notebookEditorInput];
	}

	private _resource: URI;

	override get resource(): URI {
		return this._resource;
	}

	private _inputResource: URI;

	get inputResource() {
		return this._inputResource;
	}
	private _inputResolver: Promise<IResolvedNotebookEditorModel | null> | null;
	private _editorModelReference: IResolvedNotebookEditorModel | null;

	private _inputModelRef: IReference<IResolvedTextEditorModel> | null;

	get primary(): EditorInput {
		return this._notebookEditorInput;
	}
	private _textModelService: ITextModelService;
	private _interactiveDocumentService: IInteractiveDocumentService;
	private _historyService: IInteractiveHistoryService;


	constructor(
		resource: URI,
		inputResource: URI,
		title: string | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITextModelService textModelService: ITextModelService,

		@IInteractiveDocumentService interactiveDocumentService: IInteractiveDocumentService,
		@IInteractiveHistoryService historyService: IInteractiveHistoryService
	) {
		const input = NotebookEditorInput.create(instantiationService, resource, 'interactive', {});
		super();
		this._notebookEditorInput = input;
		this._register(this._notebookEditorInput);
		this._initTitle = title;
		this._resource = resource;
		this._inputResource = inputResource;
		this._inputResolver = null;
		this._editorModelReference = null;
		this._inputModelRef = null;
		this._textModelService = textModelService;
		this._interactiveDocumentService = interactiveDocumentService;
		this._historyService = historyService;

		this._registerListeners();
	}

	private _registerListeners(): void {
		const oncePrimaryDisposed = Event.once(this.primary.onWillDispose);
		this._register(oncePrimaryDisposed(() => {
			if (!this.isDisposed()) {
				this.dispose();
			}
		}));

		// Re-emit some events from the primary side to the outside
		this._register(this.primary.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
		this._register(this.primary.onDidChangeLabel(() => this._onDidChangeLabel.fire()));

		// Re-emit some events from both sides to the outside
		this._register(this.primary.onDidChangeCapabilities(() => this._onDidChangeCapabilities.fire()));
	}

	override isDirty() {
		return false;
	}

	private async _resolveEditorModel() {
		if (!this._editorModelReference) {
			this._editorModelReference = await this._notebookEditorInput.resolve();
		}

		return this._editorModelReference;
	}

	override async resolve(): Promise<IResolvedNotebookEditorModel | null> {
		if (this._editorModelReference) {
			return this._editorModelReference;
		}

		if (this._inputResolver) {
			return this._inputResolver;
		}

		this._inputResolver = this._resolveEditorModel().then(editorModel => {
			if (this._data) {
				editorModel?.notebook.reset(this._data.notebookData.cells.map((cell: ISerializedCell) => deserializeCell(cell)), this._data.notebookData.metadata, this._data.notebookData.transientOptions);
			}

			return editorModel;
		});

		return this._inputResolver;
	}

	async resolveInput(language: string) {
		if (this._inputModelRef) {
			return this._inputModelRef.object.textEditorModel;
		}

		this._interactiveDocumentService.willCreateInteractiveDocument(this.resource!, this.inputResource, language);
		this._inputModelRef = await this._textModelService.createModelReference(this.inputResource);

		if (this._data && this._data.inputData) {
			this._inputModelRef.object.textEditorModel.setValue(this._data.inputData.value);
		}

		return this._inputModelRef.object.textEditorModel;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(otherInput)) {
			return true;
		}
		if (otherInput instanceof InteractiveEditorInput) {
			return isEqual(this.resource, otherInput.resource) && isEqual(this.inputResource, otherInput.inputResource);
		}
		return false;
	}

	override getName() {
		if (this._initTitle) {
			return this._initTitle;
		}

		const p = this.primary.resource!.path;
		const basename = paths.basename(p);

		return basename.substr(0, basename.length - paths.extname(p).length);
	}

	getSerialization(): { notebookData: any | undefined; inputData: any | undefined } {
		return {
			notebookData: this._serializeNotebook(this._editorModelReference?.notebook),
			inputData: this._inputModelRef ? {
				value: this._inputModelRef.object.textEditorModel.getValue(),
				language: this._inputModelRef.object.textEditorModel.getLanguageId()
			} : undefined
		};
	}

	private _data: { notebookData: any | undefined; inputData: any | undefined } | undefined;

	async restoreSerialization(data: { notebookData: any | undefined; inputData: any | undefined } | undefined) {
		this._data = data;
	}

	private _serializeNotebook(notebook?: NotebookTextModel) {
		if (!notebook) {
			return undefined;
		}

		const cells = notebook.cells.map(cell => serializeCell(cell));

		return {
			cells: cells,
			metadata: notebook.metadata,
			transientOptions: notebook.transientOptions
		};
	}


	override dispose() {
		// we support closing the interactive window without prompt, so the editor model should not be dirty
		this._editorModelReference?.revert({ soft: true });

		this._notebookEditorInput?.dispose();
		this._editorModelReference?.dispose();
		this._editorModelReference = null;
		this._interactiveDocumentService.willRemoveInteractiveDocument(this.resource!, this.inputResource);
		this._inputModelRef?.dispose();
		this._inputModelRef = null;
		super.dispose();
	}

	get historyService() {
		return this._historyService;
	}
}

/**
 * Serialization of interactive notebook.
 * This is not placed in notebook land as regular notebooks are handled by file service directly.
 */

interface ISerializedOutputItem {
	readonly mime: string;
	readonly data: number[];
}

interface ISerializedCellOutput {
	outputs: ISerializedOutputItem[];
	metadata?: Record<string, any>;
	outputId: string;
}

export interface ISerializedCell {
	source: string;
	language: string;
	mime: string | undefined;
	cellKind: CellKind;
	outputs: ISerializedCellOutput[];
	metadata?: NotebookCellMetadata;
	internalMetadata?: NotebookCellInternalMetadata;
	collapseState?: NotebookCellCollapseState;
}

function serializeCell(cell: NotebookCellTextModel): ISerializedCell {
	return {
		cellKind: cell.cellKind,
		language: cell.language,
		metadata: cell.metadata,
		mime: cell.mime,
		outputs: cell.outputs.map(output => serializeCellOutput(output)),
		source: cell.getValue()
	};
}

function deserializeCell(cell: ISerializedCell): ICellDto2 {
	return {
		cellKind: cell.cellKind,
		source: cell.source,
		language: cell.language,
		metadata: cell.metadata,
		mime: cell.mime,
		outputs: cell.outputs.map((output) => deserializeCellOutput(output))
	};
}

function serializeCellOutput(output: IOutputDto): ISerializedCellOutput {
	return {
		outputId: output.outputId,
		outputs: output.outputs.map(ot => ({
			mime: ot.mime,
			data: ot.data.buffer ? Array.from(ot.data.buffer) : []
		})),
		metadata: output.metadata
	};
}

function deserializeCellOutput(output: ISerializedCellOutput): IOutputDto {
	return {
		outputId: output.outputId,
		outputs: output.outputs.map(ot => ({
			mime: ot.mime,
			data: VSBuffer.fromByteArray(ot.data)
		})),
		metadata: output.metadata
	};
}
