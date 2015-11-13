/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {Registry} from 'vs/platform/platform';
import {isBinaryMime} from 'vs/base/common/mime';
import objects = require('vs/base/common/objects');
import {IEditorRegistry, Extensions} from 'vs/workbench/browser/parts/editor/baseEditor';
import {EditorModel, EditorInput} from 'vs/workbench/common/editor';
import {TextResourceEditorModel, BinaryResourceEditorModel} from 'vs/workbench/browser/parts/editor/resourceEditorModel';
import URI from 'vs/base/common/uri';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';

const TEXT_EDITOR_ID = 'workbench.editors.stringEditor';
const BINARY_EDITOR_ID = 'workbench.editors.binaryResourceEditor';

/**
 * A read-only editor input whos contents are just a mime and url to display either in a text editor or in a binary viewer. The
 * decision of using a binary or text editor is made by checking the provided mime type for common textual and binary mime types
 * (image, audio, video, application/octet-stream).
 */
export class ResourceEditorInput extends EditorInput {

	public static ID: string = 'workbench.editors.resourceEditorInput';

	private name: string;
	private description: string;
	private url: string;
	private mime: string;
	private method: string;
	private headers: any;
	private isMimeEnforced: boolean;
	private singleton: boolean;
	private cachedModel: EditorModel;

	constructor(
		name: string,
		description: string,
		url: string,
		mime: string,
		method: string,
		headers: any,
		singleton: boolean,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();

		this.name = name;
		this.description = description;
		this.url = url;
		this.mime = mime;
		this.method = method;
		this.headers = headers;
		this.singleton = singleton;
	}

	public getId(): string {
		return ResourceEditorInput.ID;
	}

	public getName(): string {
		return this.name;
	}

	public getDescription(): string {
		return this.description;
	}

	public getUrl(): string {
		return this.url;
	}

	public getMethod(): string {
		return this.method;
	}

	public getHeaders(): any {
		return this.headers;
	}

	public getMime(): string {
		return this.mime;
	}

	/**
	 * Will cause this editor input and the associated model to use the mime that was given in to the constructor and will
	 * ignore any mime that is returned from downloading the resource from the net. This is useful to enforce a certain mime
	 * to be used for this resource even though it might be served differently.
	 */
	public setMimeEnforced(): void {
		this.isMimeEnforced = true;
	}

	protected getResource(): URI {
		// Subclasses can implement to associate a resource URL with the input
		return null;
	}

	public getPreferredEditorId(candidates: string[]): string {

		// Find the right editor for the given isBinary/isText state
		let isBinary = isBinaryMime(this.mime);

		return !isBinary ? TEXT_EDITOR_ID : BINARY_EDITOR_ID;
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
			modelPromise = this.createModel().load();
		}

		return modelPromise.then((resolvedModel: EditorModel) => {
			this.cachedModel = resolvedModel;

			return this.cachedModel;
		});
	}

	private createModel(): EditorModel {
		let descriptor = (<IEditorRegistry>Registry.as(Extensions.Editors)).getEditor(this);
		if (!descriptor) {
			throw new Error('Unable to find an editor in the registry for this input.');
		}

		// Binary model if editor is binary editor
		let model: EditorModel;
		if (descriptor.getId() === BINARY_EDITOR_ID) {
			model = new BinaryResourceEditorModel(this.name, this.url);
		}

		// Otherwise use text model
		else {
			model = this.instantiationService.createInstance(TextResourceEditorModel, this.url, this.mime, this.method, this.headers, this.getResource());
			if (this.isMimeEnforced) {
				(<TextResourceEditorModel>model).setMimeEnforced();
			}
		}

		return model;
	}

	public matches(otherInput: any): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput instanceof ResourceEditorInput) {
			let otherResourceEditorInput = <ResourceEditorInput>otherInput;

			// If both inputs are singletons, check on the mime for equalness
			if (otherResourceEditorInput.singleton && this.singleton && otherResourceEditorInput.mime === this.mime) {
				return true;
			}

			// Otherwise compare by properties
			return otherResourceEditorInput.url === this.url &&
				otherResourceEditorInput.mime === this.mime &&
				otherResourceEditorInput.name === this.name &&
				otherResourceEditorInput.description === this.description &&
				otherResourceEditorInput.method === this.method &&
				objects.equals(otherResourceEditorInput.headers, this.headers);
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