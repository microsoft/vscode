/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { PLAINTEXT_MODE_ID } from 'vs/editor/common/modes/modesRegistry';
import { EditorModel, EditorInput } from 'vs/workbench/common/editor';
import { StringEditorModel } from 'vs/workbench/common/editor/stringEditorModel';
import URI from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

/**
 * A read-only text editor input whos contents are made of the provided value and mode ID.
 */
export class StringEditorInput extends EditorInput {

	public static ID = 'workbench.editors.stringEditorInput';

	protected cachedModel: StringEditorModel;

	protected value: string;

	private name: string;
	private description: string;
	private modeId: string;
	private singleton: boolean;

	constructor(
		name: string,
		description: string,
		value: string,
		modeId: string,
		singleton: boolean,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();

		this.name = name;
		this.description = description;
		this.value = value;
		this.modeId = modeId || PLAINTEXT_MODE_ID;
		this.singleton = singleton;
	}

	protected getResource(): URI {
		return null; // Subclasses can implement to associate a resource with the input
	}

	public getTypeId(): string {
		return StringEditorInput.ID;
	}

	public getName(): string {
		return this.name;
	}

	public getDescription(): string {
		return this.description;
	}

	public getValue(): string {
		return this.value;
	}

	/**
	 * Sets the textual value of this input and will also update the underlying model if this input is resolved.
	 */
	public setValue(value: string): void {
		this.value = value;
		if (this.cachedModel) {
			this.cachedModel.setValue(value);
		}
	}

	public resolve(refresh?: boolean): TPromise<EditorModel> {

		// Use Cached Model
		if (this.cachedModel) {
			return TPromise.as<EditorModel>(this.cachedModel);
		}

		//Otherwise Create Model and Load
		let model = this.instantiationService.createInstance(StringEditorModel, this.value, this.modeId, this.getResource());
		return model.load().then((resolvedModel: StringEditorModel) => {
			this.cachedModel = resolvedModel;

			return this.cachedModel;
		});
	}

	public matches(otherInput: any): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput instanceof StringEditorInput) {
			let otherStringEditorInput = <StringEditorInput>otherInput;

			// If both inputs are singletons, check on the modeId for equalness
			if (otherStringEditorInput.singleton && this.singleton && otherStringEditorInput.modeId === this.modeId) {
				return true;
			}

			// If we have resource URIs, use those to compare
			const resource = this.getResource();
			const otherResource = otherStringEditorInput.getResource();
			if (resource && otherResource) {
				return resource.toString() === otherResource.toString();
			}

			// Otherwise compare by properties
			return otherStringEditorInput.value === this.value &&
				otherStringEditorInput.modeId === this.modeId &&
				otherStringEditorInput.description === this.description &&
				otherStringEditorInput.name === this.name;
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