/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { createDecorator, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IModel } from 'vs/editor/common/editorCommon';
import { ITextEditorModel } from 'vs/platform/editor/common/editor';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IModelService } from 'vs/editor/common/services/modelService';
import { sequence } from 'vs/base/common/async';
import { ResourceEditorModel } from 'vs/workbench/common/editor/resourceEditorModel';

export const ITextModelResolverService = createDecorator<ITextModelResolverService>('textModelResolverService');

export interface ITextModelResolverService {
	_serviceBrand: any;

	resolve(resource: URI): TPromise<ITextEditorModel>;

	registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): IDisposable;
}

export interface ITextModelContentProvider {

	provideTextContent(resource: URI): TPromise<IModel>;
}

export class TextModelResolverService implements ITextModelResolverService {

	public _serviceBrand: any;

	private loadingTextModels: { [uri: string]: TPromise<IModel> } = Object.create(null);
	private contentProviderRegistry: { [scheme: string]: ITextModelContentProvider[] } = Object.create(null);

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IModelService private modelService: IModelService
	) {
	}

	public resolve(resource: URI): TPromise<ITextEditorModel> {
		return this.resolveTextModelContent(this.modelService, resource).then(() => this.instantiationService.createInstance(ResourceEditorModel, resource));
	}

	public registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): IDisposable {
		let array = this.contentProviderRegistry[scheme];
		if (!array) {
			array = [provider];
			this.contentProviderRegistry[scheme] = array;
		} else {
			array.unshift(provider);
		}

		const registry = this.contentProviderRegistry;
		return {
			dispose() {
				const array = registry[scheme];
				const idx = array.indexOf(provider);
				if (idx >= 0) {
					array.splice(idx, 1);
					if (array.length === 0) {
						delete registry[scheme];
					}
				}
			}
		};
	}

	private resolveTextModelContent(modelService: IModelService, resource: URI): TPromise<IModel> {
		const model = modelService.getModel(resource);
		if (model) {
			return TPromise.as(model);
		}

		let loadingTextModel = this.loadingTextModels[resource.toString()];
		if (!loadingTextModel) {

			// make sure we have a provider this scheme
			// the resource uses
			const contentProviders = this.contentProviderRegistry[resource.scheme];
			if (!contentProviders) {
				return TPromise.wrapError(`No model with uri '${resource}' nor a resolver for the scheme '${resource.scheme}'.`);
			}

			// load the model-content from the provider and cache
			// the loading such that we don't create the same model
			// twice
			this.loadingTextModels[resource.toString()] = loadingTextModel = new TPromise<IModel>((resolve, reject) => {
				let result: IModel;
				let lastError: any;

				sequence(contentProviders.map(provider => {
					return () => {
						if (!result) {
							const contentPromise = provider.provideTextContent(resource);
							if (!contentPromise) {
								return TPromise.wrapError<any>(`No resolver for the scheme '${resource.scheme}' found.`);
							}

							return contentPromise.then(value => {
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

			}, function () {
				// no cancellation when caching promises
			});

			// remove the cached promise 'cos the model is now known to the model service (see above)
			loadingTextModel.then(() => delete this.loadingTextModels[resource.toString()], () => delete this.loadingTextModels[resource.toString()]);
		}

		return loadingTextModel;
	}
}