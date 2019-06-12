/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { first } from 'vs/base/common/async';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITextModel } from 'vs/editor/common/model';
import { IDisposable, toDisposable, IReference, ReferenceCollection, ImmortalReference } from 'vs/base/common/lifecycle';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ResourceEditorModel } from 'vs/workbench/common/editor/resourceEditorModel';
import { ITextFileService, LoadReason } from 'vs/workbench/services/textfile/common/textfiles';
import * as network from 'vs/base/common/network';
import { ITextModelService, ITextModelContentProvider, ITextEditorModel, IResolvedTextEditorModel } from 'vs/editor/common/services/resolverService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { IFileService } from 'vs/platform/files/common/files';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

class ResourceModelCollection extends ReferenceCollection<Promise<ITextEditorModel>> {

	private providers: { [scheme: string]: ITextModelContentProvider[] } = Object.create(null);
	private modelsToDispose = new Set<string>();

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IFileService private readonly fileService: IFileService
	) {
		super();
	}

	async createReferencedObject(key: string, skipActivateProvider?: boolean): Promise<ITextEditorModel> {
		this.modelsToDispose.delete(key);

		const resource = URI.parse(key);

		// File or remote file provider already known
		if (this.fileService.canHandleResource(resource)) {
			return this.textFileService.models.loadOrCreate(resource, { reason: LoadReason.REFERENCE });
		}

		// Virtual documents
		if (this.providers[resource.scheme]) {
			await this.resolveTextModelContent(key);

			return this.instantiationService.createInstance(ResourceEditorModel, resource);
		}

		// Either unknown schema, or not yet registered, try to activate
		if (!skipActivateProvider) {
			await this.fileService.activateProvider(resource.scheme);

			return this.createReferencedObject(key, true);
		}

		throw new Error('resource is not available');
	}

	destroyReferencedObject(key: string, modelPromise: Promise<ITextEditorModel>): void {
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

	hasTextModelContentProvider(scheme: string): boolean {
		return this.providers[scheme] !== undefined;
	}

	private async resolveTextModelContent(key: string): Promise<ITextModel> {
		const resource = URI.parse(key);
		const providers = this.providers[resource.scheme] || [];
		const factories = providers.map(p => () => Promise.resolve(p.provideTextContent(resource)));

		const model = await first(factories);
		if (!model) {
			throw new Error('resource is not available');
		}

		return model;
	}
}

export class TextModelResolverService implements ITextModelService {

	_serviceBrand: any;

	private resourceModelCollection: ResourceModelCollection;

	constructor(
		@IUntitledEditorService private readonly untitledEditorService: IUntitledEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService
	) {
		this.resourceModelCollection = instantiationService.createInstance(ResourceModelCollection);
	}

	createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
		return this.doCreateModelReference(resource);
	}

	private async doCreateModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {

		// Untitled Schema: go through cached input
		if (resource.scheme === network.Schemas.untitled) {
			const model = await this.untitledEditorService.loadOrCreate({ resource });

			return new ImmortalReference(model as IResolvedTextEditorModel);
		}

		// InMemory Schema: go through model service cache
		if (resource.scheme === network.Schemas.inMemory) {
			const cachedModel = this.modelService.getModel(resource);

			if (!cachedModel) {
				throw new Error('Cant resolve inmemory resource');
			}

			return new ImmortalReference(this.instantiationService.createInstance(ResourceEditorModel, resource) as IResolvedTextEditorModel);
		}

		const ref = this.resourceModelCollection.acquire(resource.toString());

		try {
			const model = await ref.object;

			return { object: model as IResolvedTextEditorModel, dispose: () => ref.dispose() };
		} catch (error) {
			ref.dispose();

			throw error;
		}
	}

	registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): IDisposable {
		return this.resourceModelCollection.registerTextModelContentProvider(scheme, provider);
	}

	hasTextModelContentProvider(scheme: string): boolean {
		return this.resourceModelCollection.hasTextModelContentProvider(scheme);
	}
}

registerSingleton(ITextModelService, TextModelResolverService, true);