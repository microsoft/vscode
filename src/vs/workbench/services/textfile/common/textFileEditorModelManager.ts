/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Event, Emitter } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { dispose, IDisposable, Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ITextFileEditorModel, ITextFileEditorModelManager, ITextFileEditorModelResolveOrCreateOptions, ITextFileResolveEvent, ITextFileSaveEvent, ITextFileSaveParticipant } from 'vs/workbench/services/textfile/common/textfiles';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ResourceMap } from 'vs/base/common/map';
import { IFileService, FileChangesEvent, FileOperation, FileChangeType, IFileSystemProviderRegistrationEvent, IFileSystemProviderCapabilitiesChangeEvent } from 'vs/platform/files/common/files';
import { Promises, ResourceQueue } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { TextFileSaveParticipant } from 'vs/workbench/services/textfile/common/textFileSaveParticipant';
import { CancellationToken } from 'vs/base/common/cancellation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IStoredFileWorkingCopySaveParticipantContext, IWorkingCopyFileService, WorkingCopyFileEvent } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { ITextSnapshot } from 'vs/editor/common/model';
import { extname, joinPath } from 'vs/base/common/resources';
import { createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { PLAINTEXT_EXTENSION, PLAINTEXT_LANGUAGE_ID } from 'vs/editor/common/languages/modesRegistry';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IProgress, IProgressStep } from 'vs/platform/progress/common/progress';

export class TextFileEditorModelManager extends Disposable implements ITextFileEditorModelManager {

	private readonly _onDidCreate = this._register(new Emitter<TextFileEditorModel>({ leakWarningThreshold: 500 /* increased for users with hundreds of inputs opened */ }));
	readonly onDidCreate = this._onDidCreate.event;

	private readonly _onDidResolve = this._register(new Emitter<ITextFileResolveEvent>());
	readonly onDidResolve = this._onDidResolve.event;

	private readonly _onDidRemove = this._register(new Emitter<URI>());
	readonly onDidRemove = this._onDidRemove.event;

	private readonly _onDidChangeDirty = this._register(new Emitter<TextFileEditorModel>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private readonly _onDidChangeReadonly = this._register(new Emitter<TextFileEditorModel>());
	readonly onDidChangeReadonly = this._onDidChangeReadonly.event;

	private readonly _onDidChangeOrphaned = this._register(new Emitter<TextFileEditorModel>());
	readonly onDidChangeOrphaned = this._onDidChangeOrphaned.event;

	private readonly _onDidSaveError = this._register(new Emitter<TextFileEditorModel>());
	readonly onDidSaveError = this._onDidSaveError.event;

	private readonly _onDidSave = this._register(new Emitter<ITextFileSaveEvent>());
	readonly onDidSave = this._onDidSave.event;

	private readonly _onDidRevert = this._register(new Emitter<TextFileEditorModel>());
	readonly onDidRevert = this._onDidRevert.event;

	private readonly _onDidChangeEncoding = this._register(new Emitter<TextFileEditorModel>());
	readonly onDidChangeEncoding = this._onDidChangeEncoding.event;

	private readonly mapResourceToModel = new ResourceMap<TextFileEditorModel>();
	private readonly mapResourceToModelListeners = new ResourceMap<IDisposable>();
	private readonly mapResourceToDisposeListener = new ResourceMap<IDisposable>();
	private readonly mapResourceToPendingModelResolvers = new ResourceMap<Promise<void>>();

	private readonly modelResolveQueue = this._register(new ResourceQueue());

	saveErrorHandler = (() => {
		const notificationService = this.notificationService;

		return {
			onSaveError(error: Error, model: ITextFileEditorModel): void {
				notificationService.error(localize({ key: 'genericSaveError', comment: ['{0} is the resource that failed to save and {1} the error message'] }, "Failed to save '{0}': {1}", model.name, toErrorMessage(error, false)));
			}
		};
	})();

	get models(): TextFileEditorModel[] {
		return [...this.mapResourceToModel.values()];
	}

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFileService private readonly fileService: IFileService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkingCopyFileService private readonly workingCopyFileService: IWorkingCopyFileService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Update models from file change events
		this._register(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));

		// File system provider changes
		this._register(this.fileService.onDidChangeFileSystemProviderCapabilities(e => this.onDidChangeFileSystemProviderCapabilities(e)));
		this._register(this.fileService.onDidChangeFileSystemProviderRegistrations(e => this.onDidChangeFileSystemProviderRegistrations(e)));

		// Working copy operations
		this._register(this.workingCopyFileService.onWillRunWorkingCopyFileOperation(e => this.onWillRunWorkingCopyFileOperation(e)));
		this._register(this.workingCopyFileService.onDidFailWorkingCopyFileOperation(e => this.onDidFailWorkingCopyFileOperation(e)));
		this._register(this.workingCopyFileService.onDidRunWorkingCopyFileOperation(e => this.onDidRunWorkingCopyFileOperation(e)));
	}

	private onDidFilesChange(e: FileChangesEvent): void {
		for (const model of this.models) {
			if (model.isDirty()) {
				continue; // never reload dirty models
			}

			// Trigger a model resolve for any update or add event that impacts
			// the model. We also consider the added event because it could
			// be that a file was added and updated right after.
			if (e.contains(model.resource, FileChangeType.UPDATED, FileChangeType.ADDED)) {
				this.queueModelReload(model);
			}
		}
	}

	private onDidChangeFileSystemProviderCapabilities(e: IFileSystemProviderCapabilitiesChangeEvent): void {

		// Resolve models again for file systems that changed
		// capabilities to fetch latest metadata (e.g. readonly)
		// into all models.
		this.queueModelReloads(e.scheme);
	}

	private onDidChangeFileSystemProviderRegistrations(e: IFileSystemProviderRegistrationEvent): void {
		if (!e.added) {
			return; // only if added
		}

		// Resolve models again for file systems that registered
		// to account for capability changes: extensions may
		// unregister and register the same provider with different
		// capabilities, so we want to ensure to fetch latest
		// metadata (e.g. readonly) into all models.
		this.queueModelReloads(e.scheme);
	}

	private queueModelReloads(scheme: string): void {
		for (const model of this.models) {
			if (model.isDirty()) {
				continue; // never reload dirty models
			}

			if (scheme === model.resource.scheme) {
				this.queueModelReload(model);
			}
		}
	}

	private queueModelReload(model: TextFileEditorModel): void {

		// Resolve model to update (use a queue to prevent accumulation of resolves
		// when the resolve actually takes long. At most we only want the queue
		// to have a size of 2 (1 running resolve and 1 queued resolve).
		const queueSize = this.modelResolveQueue.queueSize(model.resource);
		if (queueSize <= 1) {
			this.modelResolveQueue.queueFor(model.resource, async () => {
				try {
					await this.reload(model);
				} catch (error) {
					onUnexpectedError(error);
				}
			});
		}
	}

	private readonly mapCorrelationIdToModelsToRestore = new Map<number, { source: URI; target: URI; snapshot?: ITextSnapshot; languageId?: string; encoding?: string }[]>();

	private onWillRunWorkingCopyFileOperation(e: WorkingCopyFileEvent): void {

		// Move / Copy: remember models to restore after the operation
		if (e.operation === FileOperation.MOVE || e.operation === FileOperation.COPY) {
			const modelsToRestore: { source: URI; target: URI; snapshot?: ITextSnapshot; languageId?: string; encoding?: string }[] = [];

			for (const { source, target } of e.files) {
				if (source) {
					if (this.uriIdentityService.extUri.isEqual(source, target)) {
						continue; // ignore if resources are considered equal
					}

					// find all models that related to source (can be many if resource is a folder)
					const sourceModels: TextFileEditorModel[] = [];
					for (const model of this.models) {
						if (this.uriIdentityService.extUri.isEqualOrParent(model.resource, source)) {
							sourceModels.push(model);
						}
					}

					// remember each source model to resolve again after move is done
					// with optional content to restore if it was dirty
					for (const sourceModel of sourceModels) {
						const sourceModelResource = sourceModel.resource;

						// If the source is the actual model, just use target as new resource
						let targetModelResource: URI;
						if (this.uriIdentityService.extUri.isEqual(sourceModelResource, source)) {
							targetModelResource = target;
						}

						// Otherwise a parent folder of the source is being moved, so we need
						// to compute the target resource based on that
						else {
							targetModelResource = joinPath(target, sourceModelResource.path.substr(source.path.length + 1));
						}

						modelsToRestore.push({
							source: sourceModelResource,
							target: targetModelResource,
							languageId: sourceModel.getLanguageId(),
							encoding: sourceModel.getEncoding(),
							snapshot: sourceModel.isDirty() ? sourceModel.createSnapshot() : undefined
						});
					}
				}
			}

			this.mapCorrelationIdToModelsToRestore.set(e.correlationId, modelsToRestore);
		}
	}

	private onDidFailWorkingCopyFileOperation(e: WorkingCopyFileEvent): void {

		// Move / Copy: restore dirty flag on models to restore that were dirty
		if ((e.operation === FileOperation.MOVE || e.operation === FileOperation.COPY)) {
			const modelsToRestore = this.mapCorrelationIdToModelsToRestore.get(e.correlationId);
			if (modelsToRestore) {
				this.mapCorrelationIdToModelsToRestore.delete(e.correlationId);

				modelsToRestore.forEach(model => {
					// snapshot presence means this model used to be dirty and so we restore that
					// flag. we do NOT have to restore the content because the model was only soft
					// reverted and did not loose its original dirty contents.
					if (model.snapshot) {
						this.get(model.source)?.setDirty(true);
					}
				});
			}
		}
	}

	private onDidRunWorkingCopyFileOperation(e: WorkingCopyFileEvent): void {
		switch (e.operation) {

			// Create: Revert existing models
			case FileOperation.CREATE:
				e.waitUntil((async () => {
					for (const { target } of e.files) {
						const model = this.get(target);
						if (model && !model.isDisposed()) {
							await model.revert();
						}
					}
				})());
				break;

			// Move/Copy: restore models that were resolved before the operation took place
			case FileOperation.MOVE:
			case FileOperation.COPY:
				e.waitUntil((async () => {
					const modelsToRestore = this.mapCorrelationIdToModelsToRestore.get(e.correlationId);
					if (modelsToRestore) {
						this.mapCorrelationIdToModelsToRestore.delete(e.correlationId);

						await Promises.settled(modelsToRestore.map(async modelToRestore => {

							// From this moment on, only operate on the canonical resource
							// to fix a potential data loss issue:
							// https://github.com/microsoft/vscode/issues/211374
							const target = this.uriIdentityService.asCanonicalUri(modelToRestore.target);

							// restore the model at the target. if we have previous dirty content, we pass it
							// over to be used, otherwise we force a reload from disk. this is important
							// because we know the file has changed on disk after the move and the model might
							// have still existed with the previous state. this ensures that the model is not
							// tracking a stale state.
							const restoredModel = await this.resolve(target, {
								reload: { async: false }, // enforce a reload
								contents: modelToRestore.snapshot ? createTextBufferFactoryFromSnapshot(modelToRestore.snapshot) : undefined,
								encoding: modelToRestore.encoding
							});

							// restore previous language only if the language is now unspecified and it was specified
							// but not when the file was explicitly stored with the plain text extension
							// (https://github.com/microsoft/vscode/issues/125795)
							if (
								modelToRestore.languageId &&
								modelToRestore.languageId !== PLAINTEXT_LANGUAGE_ID &&
								restoredModel.getLanguageId() === PLAINTEXT_LANGUAGE_ID &&
								extname(target) !== PLAINTEXT_EXTENSION
							) {
								restoredModel.updateTextEditorModel(undefined, modelToRestore.languageId);
							}
						}));
					}
				})());
				break;
		}
	}

	get(resource: URI): TextFileEditorModel | undefined {
		return this.mapResourceToModel.get(resource);
	}

	private has(resource: URI): boolean {
		return this.mapResourceToModel.has(resource);
	}

	private async reload(model: TextFileEditorModel): Promise<void> {

		// Await a pending model resolve first before proceeding
		// to ensure that we never resolve a model more than once
		// in parallel.
		await this.joinPendingResolves(model.resource);

		if (model.isDirty() || model.isDisposed() || !this.has(model.resource)) {
			return; // the model possibly got dirty or disposed, so return early then
		}

		// Trigger reload
		await this.doResolve(model, { reload: { async: false } });
	}

	async resolve(resource: URI, options?: ITextFileEditorModelResolveOrCreateOptions): Promise<TextFileEditorModel> {

		// Await a pending model resolve first before proceeding
		// to ensure that we never resolve a model more than once
		// in parallel.
		const pendingResolve = this.joinPendingResolves(resource);
		if (pendingResolve) {
			await pendingResolve;
		}

		// Trigger resolve
		return this.doResolve(resource, options);
	}

	private async doResolve(resourceOrModel: URI | TextFileEditorModel, options?: ITextFileEditorModelResolveOrCreateOptions): Promise<TextFileEditorModel> {
		let model: TextFileEditorModel | undefined;
		let resource: URI;
		if (URI.isUri(resourceOrModel)) {
			resource = resourceOrModel;
			model = this.get(resource);
		} else {
			resource = resourceOrModel.resource;
			model = resourceOrModel;
		}

		let modelResolve: Promise<void>;
		let didCreateModel = false;

		// Model exists
		if (model) {

			// Always reload if contents are provided
			if (options?.contents) {
				modelResolve = model.resolve(options);
			}

			// Reload async or sync based on options
			else if (options?.reload) {

				// async reload: trigger a reload but return immediately
				if (options.reload.async) {
					modelResolve = Promise.resolve();
					(async () => {
						try {
							await model.resolve(options);
						} catch (error) {
							onUnexpectedError(error);
						}
					})();
				}

				// sync reload: do not return until model reloaded
				else {
					modelResolve = model.resolve(options);
				}
			}

			// Do not reload
			else {
				modelResolve = Promise.resolve();
			}
		}

		// Model does not exist
		else {
			didCreateModel = true;

			const newModel = model = this.instantiationService.createInstance(TextFileEditorModel, resource, options ? options.encoding : undefined, options ? options.languageId : undefined);
			modelResolve = model.resolve(options);

			this.registerModel(newModel);
		}

		// Store pending resolves to avoid race conditions
		this.mapResourceToPendingModelResolvers.set(resource, modelResolve);

		// Make known to manager (if not already known)
		this.add(resource, model);

		// Emit some events if we created the model
		if (didCreateModel) {
			this._onDidCreate.fire(model);

			// If the model is dirty right from the beginning,
			// make sure to emit this as an event
			if (model.isDirty()) {
				this._onDidChangeDirty.fire(model);
			}
		}

		try {
			await modelResolve;
		} catch (error) {

			// Automatically dispose the model if we created it
			// because we cannot dispose a model we do not own
			// https://github.com/microsoft/vscode/issues/138850
			if (didCreateModel) {
				model.dispose();
			}

			throw error;
		} finally {

			// Remove from pending resolves
			this.mapResourceToPendingModelResolvers.delete(resource);
		}

		// Apply language if provided
		if (options?.languageId) {
			model.setLanguageId(options.languageId);
		}

		// Model can be dirty if a backup was restored, so we make sure to
		// have this event delivered if we created the model here
		if (didCreateModel && model.isDirty()) {
			this._onDidChangeDirty.fire(model);
		}

		return model;
	}

	private joinPendingResolves(resource: URI): Promise<void> | undefined {
		const pendingModelResolve = this.mapResourceToPendingModelResolvers.get(resource);
		if (!pendingModelResolve) {
			return;
		}

		return this.doJoinPendingResolves(resource);
	}

	private async doJoinPendingResolves(resource: URI): Promise<void> {

		// While we have pending model resolves, ensure
		// to await the last one finishing before returning.
		// This prevents a race when multiple clients await
		// the pending resolve and then all trigger the resolve
		// at the same time.
		let currentModelCopyResolve: Promise<void> | undefined;
		while (this.mapResourceToPendingModelResolvers.has(resource)) {
			const nextPendingModelResolve = this.mapResourceToPendingModelResolvers.get(resource);
			if (nextPendingModelResolve === currentModelCopyResolve) {
				return; // already awaited on - return
			}

			currentModelCopyResolve = nextPendingModelResolve;
			try {
				await nextPendingModelResolve;
			} catch (error) {
				// ignore any error here, it will bubble to the original requestor
			}
		}
	}

	private registerModel(model: TextFileEditorModel): void {

		// Install model listeners
		const modelListeners = new DisposableStore();
		modelListeners.add(model.onDidResolve(reason => this._onDidResolve.fire({ model, reason })));
		modelListeners.add(model.onDidChangeDirty(() => this._onDidChangeDirty.fire(model)));
		modelListeners.add(model.onDidChangeReadonly(() => this._onDidChangeReadonly.fire(model)));
		modelListeners.add(model.onDidChangeOrphaned(() => this._onDidChangeOrphaned.fire(model)));
		modelListeners.add(model.onDidSaveError(() => this._onDidSaveError.fire(model)));
		modelListeners.add(model.onDidSave(e => this._onDidSave.fire({ model, ...e })));
		modelListeners.add(model.onDidRevert(() => this._onDidRevert.fire(model)));
		modelListeners.add(model.onDidChangeEncoding(() => this._onDidChangeEncoding.fire(model)));

		// Keep for disposal
		this.mapResourceToModelListeners.set(model.resource, modelListeners);
	}

	add(resource: URI, model: TextFileEditorModel): void {
		const knownModel = this.mapResourceToModel.get(resource);
		if (knownModel === model) {
			return; // already cached
		}

		// dispose any previously stored dispose listener for this resource
		const disposeListener = this.mapResourceToDisposeListener.get(resource);
		disposeListener?.dispose();

		// store in cache but remove when model gets disposed
		this.mapResourceToModel.set(resource, model);
		this.mapResourceToDisposeListener.set(resource, model.onWillDispose(() => this.remove(resource)));
	}

	remove(resource: URI): void {
		const removed = this.mapResourceToModel.delete(resource);

		const disposeListener = this.mapResourceToDisposeListener.get(resource);
		if (disposeListener) {
			dispose(disposeListener);
			this.mapResourceToDisposeListener.delete(resource);
		}

		const modelListener = this.mapResourceToModelListeners.get(resource);
		if (modelListener) {
			dispose(modelListener);
			this.mapResourceToModelListeners.delete(resource);
		}

		if (removed) {
			this._onDidRemove.fire(resource);
		}
	}

	//#region Save participants

	private readonly saveParticipants = this._register(this.instantiationService.createInstance(TextFileSaveParticipant));

	addSaveParticipant(participant: ITextFileSaveParticipant): IDisposable {
		return this.saveParticipants.addSaveParticipant(participant);
	}

	runSaveParticipants(model: ITextFileEditorModel, context: IStoredFileWorkingCopySaveParticipantContext, progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> {
		return this.saveParticipants.participate(model, context, progress, token);
	}

	//#endregion

	canDispose(model: TextFileEditorModel): true | Promise<true> {

		// quick return if model already disposed or not dirty and not resolving
		if (
			model.isDisposed() ||
			(!this.mapResourceToPendingModelResolvers.has(model.resource) && !model.isDirty())
		) {
			return true;
		}

		// promise based return in all other cases
		return this.doCanDispose(model);
	}

	private async doCanDispose(model: TextFileEditorModel): Promise<true> {

		// Await any pending resolves first before proceeding
		const pendingResolve = this.joinPendingResolves(model.resource);
		if (pendingResolve) {
			await pendingResolve;

			return this.canDispose(model);
		}

		// dirty model: we do not allow to dispose dirty models to prevent
		// data loss cases. dirty models can only be disposed when they are
		// either saved or reverted
		if (model.isDirty()) {
			await Event.toPromise(model.onDidChangeDirty);

			return this.canDispose(model);
		}

		return true;
	}

	override dispose(): void {
		super.dispose();

		// model caches
		this.mapResourceToModel.clear();
		this.mapResourceToPendingModelResolvers.clear();

		// dispose the dispose listeners
		dispose(this.mapResourceToDisposeListener.values());
		this.mapResourceToDisposeListener.clear();

		// dispose the model change listeners
		dispose(this.mapResourceToModelListeners.values());
		this.mapResourceToModelListeners.clear();
	}
}
