/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {EditorModel, EditorInput} from 'vs/workbench/common/editor';
import {Registry} from 'vs/platform/platform';
import {IEditorRegistry, Extensions} from 'vs/workbench/browser/parts/editor/baseEditor';

/**
 * An editor input to use with the IFrameEditor. The resolved IFrameEditorModel can either provide
 * a URL or HTML content to show inside the IFrameEditor.
 */
export abstract class IFrameEditorInput extends EditorInput {

	public static ID: string = 'workbench.editors.iFrameEditorInput';

	private name: string;
	private description: string;
	private url: string;
	private cachedModel: EditorModel;

	constructor(name: string, description: string, url: string) {
		super();

		this.name = name;
		this.description = description;
		this.url = url;
	}

	public getId(): string {
		return IFrameEditorInput.ID;
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
			let descriptor = (<IEditorRegistry>Registry.as(Extensions.Editors)).getEditor(this);
			if (!descriptor) {
				throw new Error('Unable to find an editor in the registry for this input.');
			}

			let model = this.createModel();
			modelPromise = model.load();
		}

		return modelPromise.then((resolvedModel: EditorModel) => {
			this.cachedModel = resolvedModel;

			return this.cachedModel;
		});
	}

	/**
	 * Subclasses can override this method to provide their own implementation.
	 */
	protected abstract createModel(): EditorModel;

	public matches(otherInput: any): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput instanceof IFrameEditorInput) {
			let otherIFrameEditorInput = <IFrameEditorInput>otherInput;

			// Otherwise compare by properties
			return otherIFrameEditorInput.url === this.url &&
				otherIFrameEditorInput.name === this.name &&
				otherIFrameEditorInput.description === this.description;
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