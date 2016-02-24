/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {sequence} from 'vs/base/common/async';
import {EditorModel, EditorInput} from 'vs/workbench/common/editor';
import {ResourceEditorModel} from 'vs/workbench/common/editor/resourceEditorModel';
import {IModel} from 'vs/editor/common/editorCommon';
import URI from 'vs/base/common/uri';
import {EventType} from 'vs/base/common/events';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IDisposable} from 'vs/base/common/lifecycle';

/**
 *
 */
export interface IResourceEditorContentProvider {
	provideTextContent(resource: URI): TPromise<IModel>;
}

/**
 * A read-only text editor input whos contents are made of the provided resource that points to an existing
 * code editor model.
 */
export class ResourceEditorInput extends EditorInput {

	// --- registry logic
	// todo@joh,ben this should maybe be a service that is in charge of loading/resolving a uri from a scheme

	private static loadingModels: { [uri: string]: TPromise<IModel> } = Object.create(null);
	private static registry: { [scheme: string]: IResourceEditorContentProvider[] } = Object.create(null);

	public static registerResourceContentProvider(scheme: string, provider: IResourceEditorContentProvider): IDisposable {
		let array = ResourceEditorInput.registry[scheme];
		if (!array) {
			array = [provider];
			ResourceEditorInput.registry[scheme] = array;
		} else {
			array.unshift(provider);
		}
		return {
			dispose() {
				let array = ResourceEditorInput.registry[scheme];
				let idx = array.indexOf(provider);
				if (idx >= 0) {
					array.splice(idx, 1);
					if (array.length === 0) {
						delete ResourceEditorInput.registry[scheme];
					}
				}
			}
		};
	}

	private static getOrCreateModel(modelService: IModelService, resource: URI): TPromise<IModel> {
		const model = modelService.getModel(resource);
		if (model) {
			return TPromise.as(model);
		}

		let loadingModel = ResourceEditorInput.loadingModels[resource.toString()];
		if (!loadingModel) {

			// make sure we have a provider this scheme
			// the resource uses
			const array = ResourceEditorInput.registry[resource.scheme];
			if (!array) {
				return TPromise.wrapError(`No model with uri '${resource}' nor a resolver for the scheme '${resource.scheme}'.`);
			}

			// load the model-content from the provider and cache
			// the loading such that we don't create the same model
			// twice
			ResourceEditorInput.loadingModels[resource.toString()] = loadingModel = new TPromise<IModel>((resolve, reject) => {

				let result: IModel;
				let lastError: any;

				sequence(array.map(provider => {
					return () => {
						if (!result) {
							return provider.provideTextContent(resource).then(value => {
								result = value;
							}, err => {
								lastError = err;
							});
						}
					};
				})).then(() => {
					if (!result && lastError) {
						reject(lastError);
					} else {
						resolve(result);
					}
				}, reject);

			}, function() {
				// no cancellation when caching promises
			});

			// remove the cached promise 'cos the model is now
			// known to the model service (see above)
			loadingModel.then(() => delete ResourceEditorInput.loadingModels[resource.toString()], () => delete ResourceEditorInput.loadingModels[resource.toString()]);
		}

		return loadingModel;
	}


	public static ID: string = 'workbench.editors.resourceEditorInput';

	protected cachedModel: ResourceEditorModel;
	protected resource: URI;

	private name: string;
	private description: string;

	constructor(
		name: string,
		description: string,
		resource: URI,
		@IModelService protected modelService: IModelService,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super();

		this.name = name;
		this.description = description;
		this.resource = resource;
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

	public resolve(refresh?: boolean): TPromise<EditorModel> {

		// Use Cached Model
		if (this.cachedModel) {
			return TPromise.as<EditorModel>(this.cachedModel);
		}

		// Otherwise Create Model and handle dispose event
		return ResourceEditorInput.getOrCreateModel(this.modelService, this.resource).then(() => {
			let model = this.instantiationService.createInstance(ResourceEditorModel, this.resource);
			const unbind = model.addListener(EventType.DISPOSE, () => {
				this.cachedModel = null; // make sure we do not dispose model again
				unbind();
				this.dispose();
			});

			// Load it
			return model.load().then((resolvedModel: ResourceEditorModel) => {
				this.cachedModel = resolvedModel;

				return this.cachedModel;
			});
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
