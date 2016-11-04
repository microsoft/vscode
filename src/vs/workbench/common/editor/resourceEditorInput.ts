/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { EditorModel, EditorInput } from 'vs/workbench/common/editor';
import { ResourceEditorModel } from 'vs/workbench/common/editor/resourceEditorModel';
import URI from 'vs/base/common/uri';
import { ITextModelResolverService } from 'vs/workbench/services/textmodelResolver/common/textModelResolverService';

/**
 * A read-only text editor input whos contents are made of the provided resource that points to an existing
 * code editor model.
 */
export class ResourceEditorInput extends EditorInput {

	public static ID: string = 'workbench.editors.resourceEditorInput';

	protected cachedModel: ResourceEditorModel;
	protected resource: URI;

	private name: string;
	private description: string;

	constructor(
		name: string,
		description: string,
		resource: URI,
		@ITextModelResolverService private textModelResolverService: ITextModelResolverService
	) {
		super();

		this.name = name;
		this.description = description;
		this.resource = resource;
	}

	public getTypeId(): string {
		return ResourceEditorInput.ID;
	}

	public getName(): string {
		return this.name;
	}

	public setName(name: string): void {
		if (this.name !== name) {
			this.name = name;
			this._onDidChangeLabel.fire();
		}
	}

	public getDescription(): string {
		return this.description;
	}

	public setDescription(description: string): void {
		if (this.description !== description) {
			this.description = description;
			this._onDidChangeLabel.fire();
		}
	}

	public resolve(refresh?: boolean): TPromise<EditorModel> {

		// Use Cached Model
		if (this.cachedModel) {
			return TPromise.as<EditorModel>(this.cachedModel);
		}

		// Otherwise Create Model and handle dispose event
		return this.textModelResolverService.resolve(this.resource).then((model: ResourceEditorModel) => {
			this.cachedModel = model;

			const unbind = model.onDispose(() => {
				this.cachedModel = null; // make sure we do not dispose model again
				unbind.dispose();
				this.dispose();
			});

			return this.cachedModel;
		});
	}

	public matches(otherInput: any): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput instanceof ResourceEditorInput) {
			let otherResourceEditorInput = <ResourceEditorInput>otherInput;

			// Compare by properties
			return otherResourceEditorInput.resource.toString() === this.resource.toString();
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
