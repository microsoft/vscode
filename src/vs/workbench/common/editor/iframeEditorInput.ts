/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {EditorModel, EditorInput} from 'vs/workbench/common/editor';
import URI from 'vs/base/common/uri';

/**
 * An editor input to use with the IFrameEditor.
 */
export abstract class IFrameEditorInput extends EditorInput {

	public static ID: string = 'workbench.editors.iFrameEditorInput';

	private resource: URI;
	private name: string;
	private description: string;
	private cachedModel: EditorModel;

	constructor(resource: URI, name: string, description: string) {
		super();

		this.resource = resource;
		this.name = name;
		this.description = description;
	}

	public getId(): string {
		return IFrameEditorInput.ID;
	}

	public getResource(): URI {
		return this.resource;
	}

	public getName(): string {
		return this.name;
	}

	public getDescription(): string {
		return this.description;
	}

	public resolve(refresh?: boolean): TPromise<EditorModel> {
		let modelPromise: TPromise<EditorModel>;

		// Use Cached Model
		if (this.cachedModel && !refresh) {
			modelPromise = TPromise.as<EditorModel>(this.cachedModel);
		}

		// Refresh Cached Model
		else if (this.cachedModel && refresh) {
			modelPromise = this.cachedModel.load();
		}

		// Create Model and Load
		else {
			let model = this.createModel();
			modelPromise = model.load();
		}

		return modelPromise.then((resolvedModel: EditorModel) => {
			this.cachedModel = resolvedModel;

			return this.cachedModel;
		});
	}

	/**
	 * Subclasses override this method to provide their own implementation.
	 */
	protected abstract createModel(): EditorModel;

	/**
	 * Subclasses override this method to create a new input from a given resource.
	 */
	public abstract createNew(resource: URI): IFrameEditorInput;

	public matches(otherInput: any): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput instanceof IFrameEditorInput) {
			let otherIFrameEditorInput = <IFrameEditorInput>otherInput;

			// Otherwise compare by properties
			return otherIFrameEditorInput.resource.toString() === this.resource.toString();
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