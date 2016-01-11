/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {MIME_TEXT} from 'vs/base/common/mime';
import {EditorModel, EditorInput} from 'vs/workbench/common/editor';
import {StringEditorModel} from 'vs/workbench/common/editor/stringEditorModel';
import URI from 'vs/base/common/uri';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';

/**
 * A read-only text editor input whos contents are made of the provided value and mime type.
 */
export class StringEditorInput extends EditorInput {

	public static ID = 'workbench.editors.stringEditorInput';

	protected cachedModel: StringEditorModel;

	private name: string;
	private description: string;
	protected value: string;
	protected mime: string;
	private singleton: boolean;

	constructor(
		name: string,
		description: string,
		value: string,
		mime: string,
		singleton: boolean,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();

		this.name = name;
		this.description = description;
		this.value = value;
		this.mime = mime || MIME_TEXT;
		this.singleton = singleton;
	}

	protected getResource(): URI {
		// Subclasses can implement to associate a resource with the input
		return null;
	}

	public getId(): string {
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

	public getMime(): string {
		return this.mime;
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

	/**
	 * Clears the textual value of this input and will also update the underlying model if this input is resolved.
	 */
	public clearValue(): void {
		this.value = '';
		if (this.cachedModel) {
			this.cachedModel.clearValue();
		}
	}

	/**
	 * Appends to the textual value of this input and will also update the underlying model if this input is resolved.
	 */
	public append(value: string): void {
		this.value += value;
		if (this.cachedModel) {
			this.cachedModel.append(value);
		}
	}

	/**
	 * Removes all lines from the top if the line number exceeds the given line count. Returns the new value if lines got trimmed.
	 *
	 * Note: This method is a no-op if the input has not yet been resolved.
	 */
	public trim(linecount: number): string {
		if (this.cachedModel) {
			let newValue = this.cachedModel.trim(linecount);
			if (newValue !== null) {
				this.value = newValue;

				return this.value;
			}
		}

		return null;
	}

	public resolve(refresh?: boolean): TPromise<EditorModel> {

		// Use Cached Model
		if (this.cachedModel) {
			return TPromise.as<EditorModel>(this.cachedModel);
		}

		//Otherwise Create Model and Load
		let model = this.instantiationService.createInstance(StringEditorModel, this.value, this.mime, this.getResource());
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

			// If both inputs are singletons, check on the mime for equalness
			if (otherStringEditorInput.singleton && this.singleton && otherStringEditorInput.mime === this.mime) {
				return true;
			}

			// Otherwise compare by properties
			return otherStringEditorInput.value === this.value &&
				otherStringEditorInput.mime === this.mime &&
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