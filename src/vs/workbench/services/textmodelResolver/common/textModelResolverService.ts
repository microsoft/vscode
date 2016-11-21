/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IModel } from 'vs/editor/common/editorCommon';
import { IDisposable, toDisposable, IReference, ReferenceCollection, ImmortalReference } from 'vs/base/common/lifecycle';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ResourceEditorModel } from 'vs/workbench/common/editor/resourceEditorModel';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import network = require('vs/base/common/network');
import { ITextModelResolverService, ITextModelContentProvider, ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { UntitledEditorInput } from 'vs/workbench/common/editor/untitledEditorInput';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';

class ResourceModelCollection extends ReferenceCollection<URI, TPromise<ITextEditorModel>> {

	private providers: { [scheme: string]: ITextModelContentProvider[] } = Object.create(null);

	constructor(
		@ITextFileService private textFileService: ITextFileService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IModelService private modelService: IModelService
	) {
		super();
	}

	getKey(uri: URI): string {
		return uri.toString();
	}

	create(key: string): TPromise<ITextEditorModel> {
		const resource = URI.parse(key);

		return this.resolveTextModelContent(this.modelService, key)
			.then(() => this.instantiationService.createInstance(ResourceEditorModel, resource));
	}

	destroy(modelPromise: TPromise<ITextEditorModel>): void {
		modelPromise.done(model => model.dispose());
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

	private resolveTextModelContent(modelService: IModelService, key: string): TPromise<IModel> {
		const resource = URI.parse(key);
		const model = modelService.getModel(resource);

		if (model) {
			// TODO@Joao this should never happen
			return TPromise.as(model);
		}

		// TODO@Joao just take the first one for now
		const provider = (this.providers[resource.scheme] || [])[0];

		if (!provider) {
			return TPromise.wrapError(`No model with uri '${resource}' nor a resolver for the scheme '${resource.scheme}'.`);
		}

		return provider.provideTextContent(resource);
	}
}

export class TextModelResolverService implements ITextModelResolverService {

	_serviceBrand: any;
	private resourceModelCollection: ResourceModelCollection;

	constructor(
		@ITextFileService private textFileService: ITextFileService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IModelService private modelService: IModelService
	) {
		this.resourceModelCollection = instantiationService.createInstance(ResourceModelCollection);
	}

	getModelReference(resource: URI): IReference<TPromise<ITextEditorModel>> {
		// File Schema: use text file service
		if (resource.scheme === network.Schemas.file) {
			// TODO ImmortalReference is a hack
			return new ImmortalReference(this.textFileService.models.loadOrCreate(resource));
		}

		// Untitled Schema: go through cached input
		if (resource.scheme === UntitledEditorInput.SCHEMA) {
			// TODO ImmortalReference is a hack
			return new ImmortalReference(this.untitledEditorService.createOrGet(resource).resolve());
		}

		return this.resourceModelCollection.acquire(resource);
	}

	registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): IDisposable {
		return this.resourceModelCollection.registerTextModelContentProvider(scheme, provider);
	}
}