/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { first } from 'vs/base/common/async';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IModel } from 'vs/editor/common/editorCommon';
import { IDisposable, toDisposable, IReference, ReferenceCollection, ImmortalReference } from 'vs/base/common/lifecycle';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ResourceEditorModel } from 'vs/workbench/common/editor/resourceEditorModel';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import network = require('vs/base/common/network');
import { ITextModelService, ITextModelContentProvider, ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { IUntitledEditorService, UNTITLED_SCHEMA } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';

class ResourceModelCollection extends ReferenceCollection<TPromise<ITextEditorModel>> {

	private providers: { [scheme: string]: ITextModelContentProvider[] } = Object.create(null);

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@ITextFileService private textFileService: ITextFileService
	) {
		super();
	}

	public createReferencedObject(key: string): TPromise<ITextEditorModel> {
		const resource = URI.parse(key);

		if (resource.scheme === network.Schemas.file) {
			return this.textFileService.models.loadOrCreate(resource);
		}
		if (!this.providers[resource.scheme]) {
			// TODO@remote
			return this.textFileService.models.loadOrCreate(resource);
		}
		return this.resolveTextModelContent(key).then(() => this.instantiationService.createInstance(ResourceEditorModel, resource));
	}

	public destroyReferencedObject(modelPromise: TPromise<ITextEditorModel>): void {
		modelPromise.done(model => {
			if (model instanceof TextFileEditorModel) {
				this.textFileService.models.disposeModel(model);
			} else {
				model.dispose();
			}
		});
	}

	public registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): IDisposable {
		const registry = this.providers;
		const providers = registry[scheme] || (registry[scheme] = []);

		providers.unshift(provider);

		return toDisposable(() => {
			const array = registry[scheme];

			if (!array) {
				return;
			}

			const index = array.indexOf(provider);

			if (index === -1) {
				return;
			}

			array.splice(index, 1);

			if (array.length === 0) {
				delete registry[scheme];
			}
		});
	}

	private resolveTextModelContent(key: string): TPromise<IModel> {
		const resource = URI.parse(key);
		const providers = this.providers[resource.scheme] || [];
		const factories = providers.map(p => () => p.provideTextContent(resource));

		return first(factories).then(model => {
			if (!model) {
				console.error(`Unable to open '${resource}' resource is not available.`); // TODO PII
				return TPromise.wrapError<IModel>(new Error('resource is not available'));
			}

			return model;
		});
	}
}

export class TextModelResolverService implements ITextModelService {

	_serviceBrand: any;

	private resourceModelCollection: ResourceModelCollection;

	constructor(
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IModelService private modelService: IModelService
	) {
		this.resourceModelCollection = instantiationService.createInstance(ResourceModelCollection);
	}

	public createModelReference(resource: URI): TPromise<IReference<ITextEditorModel>> {
		return this._createModelReference(resource);
	}

	private _createModelReference(resource: URI): TPromise<IReference<ITextEditorModel>> {

		// Untitled Schema: go through cached input
		// TODO ImmortalReference is a hack
		if (resource.scheme === UNTITLED_SCHEMA) {
			return this.untitledEditorService.loadOrCreate({ resource }).then(model => new ImmortalReference(model));
		}

		// InMemory Schema: go through model service cache
		// TODO ImmortalReference is a hack
		if (resource.scheme === 'inmemory') {
			const cachedModel = this.modelService.getModel(resource);

			if (!cachedModel) {
				return TPromise.wrapError<IReference<ITextEditorModel>>(new Error('Cant resolve inmemory resource'));
			}

			return TPromise.as(new ImmortalReference(this.instantiationService.createInstance(ResourceEditorModel, resource)));
		}

		const ref = this.resourceModelCollection.acquire(resource.toString());

		return ref.object.then(
			model => ({ object: model, dispose: () => ref.dispose() }),
			err => {
				ref.dispose();

				return TPromise.wrapError<IReference<ITextEditorModel>>(err);
			}
		);
	}

	public registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): IDisposable {
		return this.resourceModelCollection.registerTextModelContentProvider(scheme, provider);
	}
}
