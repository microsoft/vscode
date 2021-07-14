/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as paths from 'vs/base/common/path';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorInput, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';
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

	constructor(
		resource: URI,
		inputResource: URI,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		const input = NotebookEditorInput.create(instantiationService, resource, 'interactive', {});
		super(undefined, undefined, input, input);
		this._notebookEditorInput = input;
		this._register(this._notebookEditorInput);
		this._inputResource = inputResource;
		this._inputResolver = null;
		this._editorModelReference = null;
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
		super.dispose();
	}
}
