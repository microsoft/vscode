/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {MIME_TEXT} from 'vs/base/common/mime';
import {EditorModel, EditorInput} from 'vs/workbench/common/editor';
import {ReadOnlyEditorModel} from 'vs/workbench/browser/parts/editor/readOnlyEditorModel';
import URI from 'vs/base/common/uri';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IModelService} from 'vs/editor/common/services/modelService';

/**
 * A read-only text editor input whos contents are made of the provided resource that points to an existing
 * code editor model.
 */
export class ReadOnlyEditorInput extends EditorInput {

	public static ID = 'workbench.editors.readOnlyEditorInput';

	protected cachedModel: ReadOnlyEditorModel;

	private name: string;
	private description: string;
	private resource: URI;

	constructor(
		name: string,
		description: string,
		resource: URI,
		@IModelService private modelService: IModelService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();

		this.name = name;
		this.description = description;
		this.resource = resource;
	}

	public getId(): string {
		return ReadOnlyEditorInput.ID;
	}

	public getName(): string {
		return this.name;
	}

	public getDescription(): string {
		return this.description;
	}

	public resolve(refresh?: boolean): TPromise<EditorModel> {

		// We need the resource to point to an existing model
		if (!this.modelService.getModel(this.resource)) {
			return TPromise.wrapError(new Error(`Document with resource ${this.resource.toString()} does not exist`));
		}

		// Use Cached Model
		if (this.cachedModel) {
			return TPromise.as<EditorModel>(this.cachedModel);
		}

		//Otherwise Create Model and Load
		let model = this.instantiationService.createInstance(ReadOnlyEditorModel, this.resource);
		return model.load().then((resolvedModel: ReadOnlyEditorModel) => {
			this.cachedModel = resolvedModel;

			return this.cachedModel;
		});
	}

	public matches(otherInput: any): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput instanceof ReadOnlyEditorInput) {
			let otherReadOnlyEditorInput = <ReadOnlyEditorInput>otherInput;

			// Compare by properties
			return otherReadOnlyEditorInput.resource.toString() === this.resource.toString();
		}

		return false;
	}

	public dispose(): void {
		if (this.cachedModel) {
			this.cachedModel.dispose();
			this.cachedModel = null;
		}

		super.dispose();
	}
}