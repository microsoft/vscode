/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { URI } from 'vs/base/common/uri';
import { first } from 'vs/base/common/async';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITextModel } from 'vs/editor/common/model';
import { IDisposable, toDisposable, IReference, ReferenceCollection, ImmortalReference } from 'vs/base/common/lifecycle';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ResourceEditorModel } from 'vs/workbench/common/editor/resourceEditorModel';
import { ITextFileService, LoadReason } from 'vs/workbench/services/textfile/common/textfiles';
import * as network from 'vs/base/common/network';
import { ITextModelService, ITextModelContentProvider, ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { IFileService } from 'vs/platform/files/common/files';

class ResourceModelCollection extends ReferenceCollection<TPromise<ITextEditorModel>> {

	private providers: { [scheme: string]: ITextModelContentProvider[] } = Object.create(null);
	private modelsToDispose = new Set<string>();

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@ITextFileService private textFileService: ITextFileService,
		@IFileService private fileService: IFileService
	) {
		super();
	}

	createReferencedObject(key: string, skipActivateProvider?: boolean): TPromise<ITextEditorModel> {
		this.modelsToDispose.delete(key);

		const resource = URI.parse(key);

		// File or remote file provider already known
		if (this.fileService.canHandleResource(resource)) {
			return this.textFileService.models.loadOrCreate(resource, { reason: LoadReason.REFERENCE });
		}

		// Virtual documents
		if (this.providers[resource.scheme]) {
			return this.resolveTextModelContent(key).then(() => this.instantiationService.createInstance(ResourceEditorModel, resource));
		}

		// Either unknown schema, or not yet registered, try to activate
		if (!skipActivateProvider) {
			return this.fileService.activateProvider(resource.scheme).then(() => this.createReferencedObject(key, true));
		}

		return TPromise.wrapError<ITextEditorModel>(new Error('resource is not available'));
	}

	destroyReferencedObject(key: string, modelPromise: TPromise<ITextEditorModel>): void {
		this.modelsToDispose.add(key);

		modelPromise.then(model => {
			if (this.modelsToDispose.has(key)) {
				if (model instanceof TextFileEditorModel) {
					this.textFileService.models.disposeModel(model);
				} else {
					model.dispose();
				}
			}
		}, err => {
			// ignore
		});
	}

	registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): IDisposable {
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

	private resolveTextModelContent(key: string): TPromise<ITextModel> {
		const resource = URI.parse(key);
		const providers = this.providers[resource.scheme] || [];
		const factories = providers.map(p => () => TPromise.wrap(p.provideTextContent(resource)));

		return first(factories).then(model => {
			if (!model) {
				return TPromise.wrapError<ITextModel>(new Error('resource is not available'));
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

	createModelReference(resource: URI): TPromise<IReference<ITextEditorModel>> {
		return this._createModelReference(resource);
	}

	private _createModelReference(resource: URI): TPromise<IReference<ITextEditorModel>> {

		// Untitled Schema: go through cached input
		if (resource.scheme === network.Schemas.untitled) {
			return this.untitledEditorService.loadOrCreate({ resource }).then(model => new ImmortalReference(model));
		}

		// InMemory Schema: go through model service cache
		if (resource.scheme === network.Schemas.inMemory) {
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

	registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): IDisposable {
		return this.resourceModelCollection.registerTextModelContentProvider(scheme, provider);
	}
}
