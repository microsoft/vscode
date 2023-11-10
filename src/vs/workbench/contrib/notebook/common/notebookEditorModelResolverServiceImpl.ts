/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { CellUri, IResolvedNotebookEditorModel, NotebookWorkingCopyTypeIdentifier } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookFileWorkingCopyModel, NotebookFileWorkingCopyModelFactory, SimpleNotebookEditorModel } from 'vs/workbench/contrib/notebook/common/notebookEditorModel';
import { combinedDisposable, DisposableStore, dispose, IDisposable, IReference, ReferenceCollection, toDisposable } from 'vs/base/common/lifecycle';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { ILogService } from 'vs/platform/log/common/log';
import { AsyncEmitter, Emitter, Event } from 'vs/base/common/event';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { INotebookConflictEvent, INotebookEditorModelResolverService, IUntitledNotebookResource } from 'vs/workbench/contrib/notebook/common/notebookEditorModelResolverService';
import { ResourceMap } from 'vs/base/common/map';
import { FileWorkingCopyManager, IFileWorkingCopyManager } from 'vs/workbench/services/workingCopy/common/fileWorkingCopyManager';
import { Schemas } from 'vs/base/common/network';
import { NotebookProviderInfo } from 'vs/workbench/contrib/notebook/common/notebookProvider';
import { assertIsDefined } from 'vs/base/common/types';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

class NotebookModelReferenceCollection extends ReferenceCollection<Promise<IResolvedNotebookEditorModel>> {

	private readonly _disposables = new DisposableStore();
	private readonly _workingCopyManagers = new Map<string, IFileWorkingCopyManager<NotebookFileWorkingCopyModel, NotebookFileWorkingCopyModel>>();
	private readonly _modelListener = new Map<IResolvedNotebookEditorModel, IDisposable>();

	private readonly _onDidSaveNotebook = new Emitter<URI>();
	readonly onDidSaveNotebook: Event<URI> = this._onDidSaveNotebook.event;

	private readonly _onDidChangeDirty = new Emitter<IResolvedNotebookEditorModel>();
	readonly onDidChangeDirty: Event<IResolvedNotebookEditorModel> = this._onDidChangeDirty.event;

	private readonly _dirtyStates = new ResourceMap<boolean>();

	private readonly modelsToDispose = new Set<string>();
	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@INotebookService private readonly _notebookService: INotebookService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
	}

	dispose(): void {
		this._disposables.dispose();
		this._onDidSaveNotebook.dispose();
		this._onDidChangeDirty.dispose();
		dispose(this._modelListener.values());
		dispose(this._workingCopyManagers.values());
	}

	isDirty(resource: URI): boolean {
		return this._dirtyStates.get(resource) ?? false;
	}

	protected async createReferencedObject(key: string, viewType: string, hasAssociatedFilePath: boolean): Promise<IResolvedNotebookEditorModel> {
		// Untrack as being disposed
		this.modelsToDispose.delete(key);

		const uri = URI.parse(key);

		const workingCopyTypeId = NotebookWorkingCopyTypeIdentifier.create(viewType);
		let workingCopyManager = this._workingCopyManagers.get(workingCopyTypeId);
		if (!workingCopyManager) {
			const factory = new NotebookFileWorkingCopyModelFactory(viewType, this._notebookService, this._configurationService);
			workingCopyManager = <IFileWorkingCopyManager<NotebookFileWorkingCopyModel, NotebookFileWorkingCopyModel>><any>this._instantiationService.createInstance(
				FileWorkingCopyManager,
				workingCopyTypeId,
				factory,
				factory,
			);
			this._workingCopyManagers.set(workingCopyTypeId, workingCopyManager);
		}
		const model = this._instantiationService.createInstance(SimpleNotebookEditorModel, uri, hasAssociatedFilePath, viewType, workingCopyManager);
		const result = await model.load();


		// Whenever a notebook model is dirty we automatically reference it so that
		// we can ensure that at least one reference exists. That guarantees that
		// a model with unsaved changes is never disposed.
		let onDirtyAutoReference: IReference<any> | undefined;

		this._modelListener.set(result, combinedDisposable(
			result.onDidSave(() => this._onDidSaveNotebook.fire(result.resource)),
			result.onDidChangeDirty(() => {
				const isDirty = result.isDirty();
				this._dirtyStates.set(result.resource, isDirty);

				// isDirty -> add reference
				// !isDirty -> free reference
				if (isDirty && !onDirtyAutoReference) {
					onDirtyAutoReference = this.acquire(key, viewType);
				} else if (onDirtyAutoReference) {
					onDirtyAutoReference.dispose();
					onDirtyAutoReference = undefined;
				}

				this._onDidChangeDirty.fire(result);
			}),
			toDisposable(() => onDirtyAutoReference?.dispose()),
		));
		return result;
	}

	protected destroyReferencedObject(key: string, object: Promise<IResolvedNotebookEditorModel>): void {
		this.modelsToDispose.add(key);

		(async () => {
			try {
				const model = await object;

				if (!this.modelsToDispose.has(key)) {
					// return if model has been acquired again meanwhile
					return;
				}

				if (model instanceof SimpleNotebookEditorModel) {
					await model.canDispose();
				}

				if (!this.modelsToDispose.has(key)) {
					// return if model has been acquired again meanwhile
					return;
				}

				// Finally we can dispose the model
				this._modelListener.get(model)?.dispose();
				this._modelListener.delete(model);
				model.dispose();
			} catch (err) {
				this._logService.error('FAILED to destory notebook', err);
			} finally {
				this.modelsToDispose.delete(key); // Untrack as being disposed
			}
		})();
	}
}

export class NotebookModelResolverServiceImpl implements INotebookEditorModelResolverService {

	readonly _serviceBrand: undefined;

	private readonly _data: NotebookModelReferenceCollection;

	readonly onDidSaveNotebook: Event<URI>;
	readonly onDidChangeDirty: Event<IResolvedNotebookEditorModel>;

	private readonly _onWillFailWithConflict = new AsyncEmitter<INotebookConflictEvent>();
	readonly onWillFailWithConflict = this._onWillFailWithConflict.event;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@INotebookService private readonly _notebookService: INotebookService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IUriIdentityService private readonly _uriIdentService: IUriIdentityService,
	) {
		this._data = instantiationService.createInstance(NotebookModelReferenceCollection);
		this.onDidSaveNotebook = this._data.onDidSaveNotebook;
		this.onDidChangeDirty = this._data.onDidChangeDirty;
	}

	dispose() {
		this._data.dispose();
	}

	isDirty(resource: URI): boolean {
		return this._data.isDirty(resource);
	}

	async resolve(resource: URI, viewType?: string): Promise<IReference<IResolvedNotebookEditorModel>>;
	async resolve(resource: IUntitledNotebookResource, viewType: string): Promise<IReference<IResolvedNotebookEditorModel>>;
	async resolve(arg0: URI | IUntitledNotebookResource, viewType?: string): Promise<IReference<IResolvedNotebookEditorModel>> {
		let resource: URI;
		let hasAssociatedFilePath = false;
		if (URI.isUri(arg0)) {
			resource = arg0;
		} else {
			if (!arg0.untitledResource) {
				const info = this._notebookService.getContributedNotebookType(assertIsDefined(viewType));
				if (!info) {
					throw new Error('UNKNOWN view type: ' + viewType);
				}

				const suffix = NotebookProviderInfo.possibleFileEnding(info.selectors) ?? '';
				for (let counter = 1; ; counter++) {
					const candidate = URI.from({ scheme: Schemas.untitled, path: `Untitled-${counter}${suffix}`, query: viewType });
					if (!this._notebookService.getNotebookTextModel(candidate)) {
						resource = candidate;
						break;
					}
				}
			} else if (arg0.untitledResource.scheme === Schemas.untitled) {
				resource = arg0.untitledResource;
			} else {
				resource = arg0.untitledResource.with({ scheme: Schemas.untitled });
				hasAssociatedFilePath = true;
			}
		}

		if (resource.scheme === CellUri.scheme) {
			throw new Error(`CANNOT open a cell-uri as notebook. Tried with ${resource.toString()}`);
		}

		resource = this._uriIdentService.asCanonicalUri(resource);

		const existingViewType = this._notebookService.getNotebookTextModel(resource)?.viewType;
		if (!viewType) {
			if (existingViewType) {
				viewType = existingViewType;
			} else {
				await this._extensionService.whenInstalledExtensionsRegistered();
				const providers = this._notebookService.getContributedNotebookTypes(resource);
				const exclusiveProvider = providers.find(provider => provider.exclusive);
				viewType = exclusiveProvider?.id || providers[0]?.id;
			}
		}

		if (!viewType) {
			throw new Error(`Missing viewType for '${resource}'`);
		}

		if (existingViewType && existingViewType !== viewType) {

			await this._onWillFailWithConflict.fireAsync({ resource, viewType }, CancellationToken.None);

			// check again, listener should have done cleanup
			const existingViewType2 = this._notebookService.getNotebookTextModel(resource)?.viewType;
			if (existingViewType2 && existingViewType2 !== viewType) {
				throw new Error(`A notebook with view type '${existingViewType2}' already exists for '${resource}', CANNOT create another notebook with view type ${viewType}`);
			}
		}

		const reference = this._data.acquire(resource.toString(), viewType, hasAssociatedFilePath);
		try {
			const model = await reference.object;
			return {
				object: model,
				dispose() { reference.dispose(); }
			};
		} catch (err) {
			reference.dispose();
			throw err;
		}
	}
}
