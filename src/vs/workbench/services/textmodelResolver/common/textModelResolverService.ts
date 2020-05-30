/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITextModel } from 'vs/editor/common/model';
import { IDisposable, toDisposable, IReference, ReferenceCollection, Disposable } from 'vs/base/common/lifecycle';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ResourceEditorModel } from 'vs/workbench/common/editor/resourceEditorModel';
import { ITextFileService, TextFileLoadReason } from 'vs/workbench/services/textfile/common/textfiles';
import * as network from 'vs/base/common/network';
import { ITextModelService, ITextModelContentProvider, ITextEditorModel, IResolvedTextEditorModel } from 'vs/editor/common/services/resolverService';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { IFileService } from 'vs/platform/files/common/files';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IUndoRedoService } from 'vs/platform/undoRedo/common/undoRedo';
import { ModelUndoRedoParticipant } from 'vs/editor/common/services/modelUndoRedoParticipant';

class ResourceModelCollection extends ReferenceCollection<Promise<ITextEditorModel>> {

	private readonly providers: { [scheme: string]: ITextModelContentProvider[] } = Object.create(null);
	private readonly modelsToDispose = new Set<string>();

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IFileService private readonly fileService: IFileService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IModelService private readonly modelService: IModelService
	) {
		super();
	}

	async createReferencedObject(key: string, skipActivateProvider?: boolean): Promise<ITextEditorModel> {

		// Untrack as being disposed
		this.modelsToDispose.delete(key);

		// inMemory Schema: go through model service cache
		const resource = URI.parse(key);
		if (resource.scheme === network.Schemas.inMemory) {
			const cachedModel = this.modelService.getModel(resource);
			if (!cachedModel) {
				throw new Error(`Unable to resolve inMemory resource ${key}`);
			}

			return this.instantiationService.createInstance(ResourceEditorModel, resource);
		}

		// Untitled Schema: go through untitled text service
		if (resource.scheme === network.Schemas.untitled) {
			return this.textFileService.untitled.resolve({ untitledResource: resource });
		}

		// File or remote file: go through text file service
		if (this.fileService.canHandleResource(resource)) {
			return this.textFileService.files.resolve(resource, { reason: TextFileLoadReason.REFERENCE });
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

		throw new Error(`Unable to resolve resource ${key}`);
	}

	destroyReferencedObject(key: string, modelPromise: Promise<ITextEditorModel>): void {

		// Track as being disposed
		this.modelsToDispose.add(key);

		modelPromise.then(model => {
			if (!this.modelsToDispose.has(key)) {
				return; // return if model has been aquired again meanwhile
			}

			const resource = URI.parse(key);
			if (resource.scheme === network.Schemas.untitled || resource.scheme === network.Schemas.inMemory) {
				// untitled and inMemory are bound to a different lifecycle
			} else if (model instanceof TextFileEditorModel) {
				this.textFileService.files.disposeModel(model);
			} else {
				model.dispose();
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

		if (resource.query || resource.fragment) {
			type TextModelResolverUri = {
				query: boolean;
				fragment: boolean;
			};
			type TextModelResolverUriMeta = {
				query: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
				fragment: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
			};
			this.telemetryService.publicLog2<TextModelResolverUri, TextModelResolverUriMeta>('textmodelresolveruri', {
				query: Boolean(resource.query),
				fragment: Boolean(resource.fragment)
			});
		}

		for (const provider of providers) {
			const value = await provider.provideTextContent(resource);
			if (value) {
				return value;
			}
		}

		throw new Error(`Unable to resolve text model content for resource ${key}`);
	}
}

export class TextModelResolverService extends Disposable implements ITextModelService {

	_serviceBrand: undefined;

	private readonly resourceModelCollection = this.instantiationService.createInstance(ResourceModelCollection);

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFileService private readonly fileService: IFileService,
		@IUndoRedoService private readonly undoRedoService: IUndoRedoService,
		@IModelService private readonly modelService: IModelService
	) {
		super();
		this._register(new ModelUndoRedoParticipant(this.modelService, this, this.undoRedoService));
	}

	async createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
		const ref = this.resourceModelCollection.acquire(resource.toString());

		try {
			const model = await ref.object;

			return {
				object: model as IResolvedTextEditorModel,
				dispose: () => ref.dispose()
			};
		} catch (error) {
			ref.dispose();

			throw error;
		}
	}

	registerTextModelContentProvider(scheme: string, provider: ITextModelContentProvider): IDisposable {
		return this.resourceModelCollection.registerTextModelContentProvider(scheme, provider);
	}

	canHandleResource(resource: URI): boolean {
		if (this.fileService.canHandleResource(resource) || resource.scheme === network.Schemas.untitled || resource.scheme === network.Schemas.inMemory) {
			return true; // we handle file://, untitled:// and inMemory:// automatically
		}

		return this.resourceModelCollection.hasTextModelContentProvider(resource.scheme);
	}
}

registerSingleton(ITextModelService, TextModelResolverService, true);
