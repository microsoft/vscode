/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {EditorModel, EditorInput} from 'vs/workbench/common/editor';
import {ResourceEditorModel} from 'vs/workbench/common/editor/resourceEditorModel';
import {IModel} from 'vs/editor/common/editorCommon';
import URI from 'vs/base/common/uri';
import {EventType} from 'vs/base/common/events';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IDisposable} from 'vs/base/common/lifecycle';

/**
 *
 */
export interface IResourceEditorContentProvider {
	provideTextContent(resource: URI): TPromise<string>;
	// onDidChange
}

/**
 * A read-only text editor input whos contents are made of the provided resource that points to an existing
 * code editor model.
 */
export class ResourceEditorInput extends EditorInput {

	// --- registry logic
	// todo@joh,ben this should maybe be a service that is in charge of loading/resolving a uri from a scheme

	private static loadingModels: { [uri: string]: TPromise<IModel> } = Object.create(null);
	private static registry: { [scheme: string]: IResourceEditorContentProvider } = Object.create(null);

	public static registerResourceContentProvider(scheme: string, provider: IResourceEditorContentProvider): IDisposable {
		ResourceEditorInput.registry[scheme] = provider;
		return { dispose() { delete ResourceEditorInput.registry[scheme] } };
	}

	private static getOrCreateModel(modelService: IModelService, modeService: IModeService, resource: URI): TPromise<IModel> {
		const model = modelService.getModel(resource);
		if (model) {
			return TPromise.as(model);
		}

		let loadingModel = ResourceEditorInput.loadingModels[resource.toString()];
		if (!loadingModel) {

			// make sure we have a provider this scheme
			// the resource uses
			const provider = ResourceEditorInput.registry[resource.scheme];
			if (!provider) {
				return TPromise.wrapError(`No model with uri '${resource}' nor a resolver for the scheme '${resource.scheme}'.`);
			}

			// load the model-content from the provider and cache
			// the loading such that we don't create the same model
			// twice
			ResourceEditorInput.loadingModels[resource.toString()] = loadingModel = new TPromise<IModel>((resolve, reject) => {

				provider.provideTextContent(resource).then(value => {
					const firstLineText = value.substr(0, 1 + value.search(/\r?\n/));
					const mode = modeService.getOrCreateModeByFilenameOrFirstLine(resource.fsPath, firstLineText);
					return modelService.createModel(value, mode, resource);
				}).then(resolve, reject);

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
		@IModeService protected modeService: IModeService,
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
		return ResourceEditorInput.getOrCreateModel(this.modelService, this.modeService, this.resource).then(() => {
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
