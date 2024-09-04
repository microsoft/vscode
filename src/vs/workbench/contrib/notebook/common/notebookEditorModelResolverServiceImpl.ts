/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../base/common/uri.js';
import { CellUri, IResolvedNotebookEditorModel, NotebookEditorModelCreationOptions, NotebookSetting, NotebookWorkingCopyTypeIdentifier } from './notebookCommon.js';
import { NotebookFileWorkingCopyModel, NotebookFileWorkingCopyModelFactory, SimpleNotebookEditorModel } from './notebookEditorModel.js';
import { combinedDisposable, DisposableStore, dispose, IDisposable, IReference, ReferenceCollection, toDisposable } from '../../../../base/common/lifecycle.js';
import { INotebookService } from './notebookService.js';
import { AsyncEmitter, Emitter, Event } from '../../../../base/common/event.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { INotebookConflictEvent, INotebookEditorModelResolverService, IUntitledNotebookResource } from './notebookEditorModelResolverService.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { FileWorkingCopyManager, IFileWorkingCopyManager } from '../../../services/workingCopy/common/fileWorkingCopyManager.js';
import { Schemas } from '../../../../base/common/network.js';
import { NotebookProviderInfo } from './notebookProvider.js';
import { assertIsDefined } from '../../../../base/common/types.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileReadLimits } from '../../../../platform/files/common/files.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { INotebookLoggingService } from './notebookLoggingService.js';

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
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@INotebookLoggingService private readonly _notebookLoggingService: INotebookLoggingService,
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

	protected async createReferencedObject(key: string, viewType: string, hasAssociatedFilePath: boolean, limits?: IFileReadLimits, isScratchpad?: boolean): Promise<IResolvedNotebookEditorModel> {
		// Untrack as being disposed
		this.modelsToDispose.delete(key);

		const uri = URI.parse(key);

		const workingCopyTypeId = NotebookWorkingCopyTypeIdentifier.create(viewType);
		let workingCopyManager = this._workingCopyManagers.get(workingCopyTypeId);
		if (!workingCopyManager) {
			const factory = new NotebookFileWorkingCopyModelFactory(viewType, this._notebookService, this._configurationService, this._telemetryService, this._notebookLoggingService);
			workingCopyManager = <IFileWorkingCopyManager<NotebookFileWorkingCopyModel, NotebookFileWorkingCopyModel>><any>this._instantiationService.createInstance(
				FileWorkingCopyManager,
				workingCopyTypeId,
				factory,
				factory,
			);
			this._workingCopyManagers.set(workingCopyTypeId, workingCopyManager);
		}

		const isScratchpadView = isScratchpad || (viewType === 'interactive' && this._configurationService.getValue<boolean>(NotebookSetting.InteractiveWindowPromptToSave) !== true);
		const model = this._instantiationService.createInstance(SimpleNotebookEditorModel, uri, hasAssociatedFilePath, viewType, workingCopyManager, isScratchpadView);
		const result = await model.load({ limits });


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
				this._notebookLoggingService.error('NotebookModelCollection', 'FAILED to destory notebook - ' + err);
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

	private createUntitledUri(notebookType: string) {
		const info = this._notebookService.getContributedNotebookType(assertIsDefined(notebookType));
		if (!info) {
			throw new Error('UNKNOWN notebook type: ' + notebookType);
		}

		const suffix = NotebookProviderInfo.possibleFileEnding(info.selectors) ?? '';
		for (let counter = 1; ; counter++) {
			const candidate = URI.from({ scheme: Schemas.untitled, path: `Untitled-${counter}${suffix}`, query: notebookType });
			if (!this._notebookService.getNotebookTextModel(candidate)) {
				return candidate;
			}
		}
	}

	private async validateResourceViewType(uri: URI | undefined, viewType: string | undefined) {
		if (!uri && !viewType) {
			throw new Error('Must provide at least one of resource or viewType');
		}

		if (uri?.scheme === CellUri.scheme) {
			throw new Error(`CANNOT open a cell-uri as notebook. Tried with ${uri.toString()}`);
		}

		const resource = this._uriIdentService.asCanonicalUri(uri ?? this.createUntitledUri(viewType!));

		const existingNotebook = this._notebookService.getNotebookTextModel(resource);
		if (!viewType) {
			if (existingNotebook) {
				viewType = existingNotebook.viewType;
			} else {
				await this._extensionService.whenInstalledExtensionsRegistered();
				const providers = this._notebookService.getContributedNotebookTypes(resource);
				viewType = providers.find(provider => provider.priority === 'exclusive')?.id ??
					providers.find(provider => provider.priority === 'default')?.id ??
					providers[0]?.id;
			}
		}

		if (!viewType) {
			throw new Error(`Missing viewType for '${resource}'`);
		}

		if (existingNotebook && existingNotebook.viewType !== viewType) {

			await this._onWillFailWithConflict.fireAsync({ resource: resource, viewType }, CancellationToken.None);

			// check again, listener should have done cleanup
			const existingViewType2 = this._notebookService.getNotebookTextModel(resource)?.viewType;
			if (existingViewType2 && existingViewType2 !== viewType) {
				throw new Error(`A notebook with view type '${existingViewType2}' already exists for '${resource}', CANNOT create another notebook with view type ${viewType}`);
			}
		}
		return { resource, viewType };
	}

	public async createUntitledNotebookTextModel(viewType: string) {
		const resource = this._uriIdentService.asCanonicalUri(this.createUntitledUri(viewType));

		return (await this._notebookService.createNotebookTextModel(viewType, resource));
	}

	async resolve(resource: URI, viewType?: string, options?: NotebookEditorModelCreationOptions): Promise<IReference<IResolvedNotebookEditorModel>>;
	async resolve(resource: IUntitledNotebookResource, viewType: string, options: NotebookEditorModelCreationOptions): Promise<IReference<IResolvedNotebookEditorModel>>;
	async resolve(arg0: URI | IUntitledNotebookResource, viewType?: string, options?: NotebookEditorModelCreationOptions): Promise<IReference<IResolvedNotebookEditorModel>> {
		let resource: URI | undefined;
		let hasAssociatedFilePath;
		if (URI.isUri(arg0)) {
			resource = arg0;
		} else if (arg0.untitledResource) {
			if (arg0.untitledResource.scheme === Schemas.untitled) {
				resource = arg0.untitledResource;
			} else {
				resource = arg0.untitledResource.with({ scheme: Schemas.untitled });
				hasAssociatedFilePath = true;
			}
		}

		const validated = await this.validateResourceViewType(resource, viewType);

		const reference = this._data.acquire(validated.resource.toString(), validated.viewType, hasAssociatedFilePath, options?.limits, options?.scratchpad);
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
