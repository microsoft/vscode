/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as paths from 'vs/base/common/path';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorInput, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';
import { IInteractiveDocumentService } from 'vs/workbench/contrib/interactive/browser/interactiveDocumentService';
import { IResolvedNotebookEditorModel } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ICompositeNotebookEditorInput, NotebookEditorInput } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';

export class InteractiveEditorInput extends SideBySideEditorInput implements ICompositeNotebookEditorInput {
	static create(instantiationService: IInstantiationService, resource: URI, inputResource: URI) {
		return instantiationService.createInstance(InteractiveEditorInput, resource, inputResource);
	}

	static override readonly ID: string = 'workbench.input.interactive';

	override get typeId(): string {
		return InteractiveEditorInput.ID;
	}

	private _notebookEditorInput: NotebookEditorInput;
	get notebookEditorInput() {
		return this._notebookEditorInput;
	}

	get editorInputs() {
		return [this._notebookEditorInput];
	}

	override get resource() {
		return this.primary.resource;
	}

	private _inputResource: URI;

	get inputResource() {
		return this._inputResource;
	}
	private _inputResolver: Promise<IResolvedNotebookEditorModel | null> | null;
	private _editorModelReference: IResolvedNotebookEditorModel | null;

	private _inputModel: ITextModel | null;

	get inputModel() {
		return this._inputModel;
	}

	private _modelService: IModelService;
	private _interactiveDocumentService: IInteractiveDocumentService;


	constructor(
		resource: URI,
		inputResource: URI,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModelService modelService: IModelService,
		@IInteractiveDocumentService interactiveDocumentService: IInteractiveDocumentService
	) {
		const input = NotebookEditorInput.create(instantiationService, resource, 'interactive', {});
		super(undefined, undefined, input, input);
		this._notebookEditorInput = input;
		this._register(this._notebookEditorInput);
		this._inputResource = inputResource;
		this._inputResolver = null;
		this._editorModelReference = null;
		this._inputModel = null;
		this._modelService = modelService;
		this._interactiveDocumentService = interactiveDocumentService;
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

		this._inputResolver = this._resolveEditorModel();
		return this._inputResolver;
	}

	resolveInput(language: string) {
		if (this._inputModel) {
			return this._inputModel;
		}

		this._interactiveDocumentService.willCreateInteractiveDocument(this.resource!, this.inputResource, language);
		this._inputModel = this._modelService.createModel('', null, this.inputResource, false);
		return this._inputModel;
	}

	override matches(otherInput: IEditorInput | IUntypedEditorInput): boolean {
		if (super.matches(otherInput)) {
			return true;
		}
		if (otherInput instanceof InteractiveEditorInput) {
			return isEqual(this.resource, otherInput.resource);
		}
		return false;
	}

	override getName() {
		const p = this.primary.resource!.path;
		const basename = paths.basename(p);

		return basename.substr(0, basename.length - paths.extname(p).length);
	}

	override dispose() {
		// we support closing the interactive window without prompt, so the editor model should not be dirty
		this._editorModelReference?.revert({ soft: true });

		this._notebookEditorInput?.dispose();
		this._editorModelReference?.dispose();
		this._editorModelReference = null;
		this._interactiveDocumentService.willRemoveInteractiveDocument(this.resource!, this.inputResource);
		this._inputModel?.dispose();
		this._inputModel = null;
		super.dispose();
	}
}
