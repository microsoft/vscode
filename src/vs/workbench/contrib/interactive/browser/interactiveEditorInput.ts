/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReference } from 'vs/base/common/lifecycle';
import * as paths from 'vs/base/common/path';
import { isEqual } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorInput } from 'vs/workbench/common/editor';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';
import { IResolvedNotebookEditorModel } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ICompositeNotebookEditorInput, NotebookEditorInput } from 'vs/workbench/contrib/notebook/common/notebookEditorInput';
import { INotebookEditorModelResolverService } from 'vs/workbench/contrib/notebook/common/notebookEditorModelResolverService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { IResourceEditorInputType } from 'vs/workbench/services/editor/common/editorService';

interface InteractiveEditorInputOptions {
	startFresh?: boolean;
}

export class InteractiveEditorInput extends SideBySideEditorInput implements ICompositeNotebookEditorInput {
	static create(instantiationService: IInstantiationService, resource: URI, inputResource: URI, options?: InteractiveEditorInputOptions) {
		return instantiationService.createInstance(InteractiveEditorInput, resource, inputResource, options ?? {});
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

	private _inputResource: URI;

	get inputResource() {
		return this._inputResource;
	}

	private readonly _options: InteractiveEditorInputOptions;
	private _inputResolver: Promise<IResolvedNotebookEditorModel | null> | null;
	private _editorModelReference: IReference<IResolvedNotebookEditorModel> | null;
	private readonly _notebookService: INotebookService;
	private readonly _notebookModelResolverService: INotebookEditorModelResolverService;
	constructor(
		resource: URI,
		inputResource: URI,
		options: InteractiveEditorInputOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@INotebookService notebookService: INotebookService,
		@INotebookEditorModelResolverService notebookModelResolverService: INotebookEditorModelResolverService,
	) {
		const input = NotebookEditorInput.create(instantiationService, resource, 'interactive', {});
		super(undefined, undefined, input, input);
		this._notebookEditorInput = input;
		this._options = options;
		this._register(this._notebookEditorInput);
		this._inputResource = inputResource;
		this._inputResolver = null;
		this._editorModelReference = null;
		this._notebookService = notebookService;
		this._notebookModelResolverService = notebookModelResolverService;
	}

	override isDirty() {
		return false;
	}

	private async _resolve() {
		if (!await this._notebookService.canResolve('interactive')) {
			return null;
		}

		if (!this._editorModelReference) {
			this._editorModelReference = await this._notebookModelResolverService.resolve(this.primary.resource!, 'interactive');
			if (this.isDisposed()) {
				this._editorModelReference.dispose();
				this._editorModelReference = null;
				return null;
			}
		} else {
			await this._editorModelReference.object.load();
		}

		if (!this._editorModelReference.object.notebook) {
			await this._editorModelReference.object.load();
		}

		return this._editorModelReference.object;
	}

	override async resolve(): Promise<IResolvedNotebookEditorModel | null> {
		if (this._inputResolver) {
			return this._inputResolver;
		}

		this._inputResolver = this._resolve();
		return this._inputResolver;
	}


	override matches(otherInput: IEditorInput | IResourceEditorInputType): boolean {
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
		this._editorModelReference?.dispose();
		this._editorModelReference = null;
		super.dispose();
	}
}
