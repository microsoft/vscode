/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IRevertOptions, ISaveOptions, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';
import { Emitter, Event } from 'vs/base/common/event';
import { ICellDto2, INotebookEditorModel, INotebookLoadOptions, IResolvedNotebookEditorModel, NotebookCellsChangeType, NotebookData, NotebookDocumentBackupData } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { INotebookContentProvider, INotebookSerializer, INotebookService, SimpleNotebookProviderInfo } from 'vs/workbench/contrib/notebook/common/notebookService';
import { URI } from 'vs/base/common/uri';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { IWorkingCopy, IWorkingCopyBackup, WorkingCopyCapabilities, NO_TYPE_ID, IWorkingCopyIdentifier, IWorkingCopySaveEvent } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IResolvedWorkingCopyBackup, IWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';
import { Schemas } from 'vs/base/common/network';
import { IFileService, FileChangeType, FileSystemProviderCapabilities, IFileStatWithPartialMetadata } from 'vs/platform/files/common/files';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService } from 'vs/platform/log/common/log';
import { TaskSequentializer } from 'vs/base/common/async';
import { bufferToReadable, bufferToStream, streamToBuffer, VSBuffer, VSBufferReadableStream } from 'vs/base/common/buffer';
import { assertType } from 'vs/base/common/types';
import { IUntitledTextEditorService } from 'vs/workbench/services/untitled/common/untitledTextEditorService';
import { StoredFileWorkingCopyState, IStoredFileWorkingCopy, IStoredFileWorkingCopyModel, IStoredFileWorkingCopyModelContentChangedEvent, IStoredFileWorkingCopyModelFactory, IStoredFileWorkingCopySaveEvent } from 'vs/workbench/services/workingCopy/common/storedFileWorkingCopy';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { CancellationError } from 'vs/base/common/errors';
import { filter } from 'vs/base/common/objects';
import { IFileWorkingCopyManager } from 'vs/workbench/services/workingCopy/common/fileWorkingCopyManager';
import { IUntitledFileWorkingCopy, IUntitledFileWorkingCopyModel, IUntitledFileWorkingCopyModelContentChangedEvent, IUntitledFileWorkingCopyModelFactory } from 'vs/workbench/services/workingCopy/common/untitledFileWorkingCopy';

//#region --- complex content provider

export class ComplexNotebookEditorModel extends EditorModel implements INotebookEditorModel {

	private readonly _onDidSave = this._register(new Emitter<IWorkingCopySaveEvent>());
	private readonly _onDidChangeDirty = this._register(new Emitter<void>());
	private readonly _onDidChangeContent = this._register(new Emitter<void>());

	readonly onDidSave = this._onDidSave.event;
	readonly onDidChangeDirty = this._onDidChangeDirty.event;
	readonly onDidChangeOrphaned = Event.None;
	readonly onDidChangeReadonly = Event.None;

	private _lastResolvedFileStat?: IFileStatWithPartialMetadata;

	private readonly _name: string;
	private readonly _workingCopyIdentifier: IWorkingCopyIdentifier;
	private readonly _saveSequentializer = new TaskSequentializer();

	private _dirty: boolean = false;

	constructor(
		readonly resource: URI,
		readonly viewType: string,
		private readonly _contentProvider: INotebookContentProvider,
		@INotebookService private readonly _notebookService: INotebookService,
		@IWorkingCopyService private readonly _workingCopyService: IWorkingCopyService,
		@IWorkingCopyBackupService private readonly _workingCopyBackupService: IWorkingCopyBackupService,
		@IFileService private readonly _fileService: IFileService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ILogService private readonly _logService: ILogService,
		@IUntitledTextEditorService private readonly untitledTextEditorService: IUntitledTextEditorService,
		@ILabelService labelService: ILabelService,
	) {
		super();

		this._name = labelService.getUriBasenameLabel(resource);

		const that = this;
		this._workingCopyIdentifier = {
			// TODO@jrieken TODO@rebornix consider to enable a `typeId` that is
			// specific for custom editors. Using a distinct `typeId` allows the
			// working copy to have any resource (including file based resources)
			// even if other working copies exist with the same resource.
			//
			// IMPORTANT: changing the `typeId` has an impact on backups for this
			// working copy. Any value that is not the empty string will be used
			// as seed to the backup. Only change the `typeId` if you have implemented
			// a fallback solution to resolve any existing backups that do not have
			// this seed.
			typeId: NO_TYPE_ID,
			resource: URI.from({ scheme: Schemas.vscodeNotebook, path: resource.toString() })
		};
		const workingCopyAdapter = new class implements IWorkingCopy {
			readonly typeId = that._workingCopyIdentifier.typeId;
			readonly resource = that._workingCopyIdentifier.resource;
			get name() { return that._name; }
			readonly capabilities = that._isUntitled() ? WorkingCopyCapabilities.Untitled : WorkingCopyCapabilities.None;
			readonly onDidChangeDirty = that.onDidChangeDirty;
			readonly onDidChangeContent = that._onDidChangeContent.event;
			readonly onDidSave = that.onDidSave;
			isDirty(): boolean { return that.isDirty(); }
			backup(token: CancellationToken): Promise<IWorkingCopyBackup> { return that.backup(token); }
			save(): Promise<boolean> { return that.save(); }
			revert(options?: IRevertOptions): Promise<void> { return that.revert(options); }
		};

		this._register(this._workingCopyService.registerWorkingCopy(workingCopyAdapter));
		this._register(this._fileService.onDidFilesChange(async e => {
			if (this.isDirty() || !this.isResolved() || this._saveSequentializer.hasPending()) {
				// skip when dirty, unresolved, or when saving
				return;
			}
			if (!e.affects(this.resource, FileChangeType.UPDATED)) {
				// no my file
				return;
			}
			const stats = await this._resolveStats(this.resource);
			if (stats && this._lastResolvedFileStat && stats.etag !== this._lastResolvedFileStat.etag) {
				this._logService.debug('[notebook editor model] trigger load after file event');
				this.load({ forceReadFromFile: true });
			}
		}));
	}

	override isResolved(): this is IResolvedNotebookEditorModel {
		return this.notebook !== undefined;
	}

	isDirty(): boolean {
		return this._dirty;
	}

	isReadonly(): boolean {
		if (this._fileService.hasCapability(this.resource, FileSystemProviderCapabilities.Readonly)) {
			return true;
		} else {
			return false;
		}
	}

	isOrphaned(): boolean {
		return false;
	}

	hasAssociatedFilePath(): boolean {
		return false;
	}

	private _isUntitled(): boolean {
		return this.resource.scheme === Schemas.untitled;
	}

	get notebook(): NotebookTextModel | undefined {
		const candidate = this._notebookService.getNotebookTextModel(this.resource);
		return candidate && candidate.viewType === this.viewType ? candidate : undefined;
	}

	setDirty(newState: boolean) {
		if (this._dirty !== newState) {
			this._dirty = newState;
			this._onDidChangeDirty.fire();
		}
	}

	async backup(token: CancellationToken): Promise<IWorkingCopyBackup> {

		if (!this.isResolved()) {
			return {};
		}

		const backup = await this._contentProvider.backup(this.resource, token);
		if (token.isCancellationRequested) {
			return {};
		}
		const stats = await this._resolveStats(this.resource);

		if (backup instanceof VSBuffer) {
			return {
				content: bufferToReadable(backup)
			};
		} else {
			return {
				meta: {
					mtime: stats?.mtime ?? Date.now(),
					viewType: this.notebook.viewType,
					backupId: backup
				}
			};
		}

	}

	async revert(options?: IRevertOptions | undefined): Promise<void> {
		if (options?.soft) {
			this.setDirty(false);
			return;
		}

		await this.load({ forceReadFromFile: true });
		const newStats = await this._resolveStats(this.resource);
		this._lastResolvedFileStat = newStats;

		this.setDirty(false);
		this._onDidChangeDirty.fire();
	}

	async load(options?: INotebookLoadOptions): Promise<IResolvedNotebookEditorModel> {
		if (options?.forceReadFromFile) {
			this._logService.debug('[notebook editor model] load from provider (forceRead)', this.resource.toString());
			this._loadFromProvider(undefined);
			assertType(this.isResolved());
			return this;
		}

		if (this.isResolved()) {
			return this;
		}

		let backup: IResolvedWorkingCopyBackup<NotebookDocumentBackupData> | undefined = undefined;

		try {
			backup = await this._workingCopyBackupService.resolve<NotebookDocumentBackupData>(this._workingCopyIdentifier);
		} catch (_e) { }

		if (this.isResolved()) {
			return this; // Make sure meanwhile someone else did not succeed in loading
		}

		this._logService.debug('[notebook editor model] load from provider', this.resource.toString());
		await this._loadFromProvider(backup);
		assertType(this.isResolved());
		return this;
	}

	/**
	 * @description Uses the textmodel resolver service to acquire the untitled file's content
	 * @param resource The resource that is the untitled file
	 * @returns The bytes
	 */
	private async getUntitledDocumentData(resource: URI): Promise<VSBuffer | undefined> {
		// If it's an untitled file we must populate the untitledDocumentData
		const untitledString = this.untitledTextEditorService.getValue(resource);
		const untitledDocumentData = untitledString ? VSBuffer.fromString(untitledString) : undefined;
		return untitledDocumentData;
	}

	private async _loadFromProvider(backup: IResolvedWorkingCopyBackup<NotebookDocumentBackupData> | undefined): Promise<void> {

		const untitledData = await this.getUntitledDocumentData(this.resource);
		// If we're loading untitled file data we should ensure the model is dirty
		if (untitledData) {
			this._onDidChangeDirty.fire();
		}
		const data = await this._contentProvider.open(this.resource,
			backup?.meta?.backupId ?? (
				backup?.value
					? await streamToBuffer(backup?.value)
					: undefined
			),
			untitledData, CancellationToken.None
		);

		this._lastResolvedFileStat = await this._resolveStats(this.resource);

		if (this.isDisposed()) {
			return;
		}

		if (!this.notebook) {
			this._logService.debug('[notebook editor model] loading NEW notebook', this.resource.toString());
			// FRESH there is no notebook yet and we are now creating it

			// UGLY
			// There might be another notebook for the URI which was created from a different
			// source (different viewType). In that case we simply dispose the
			// existing/conflicting model and proceed with a new notebook
			const conflictingNotebook = this._notebookService.getNotebookTextModel(this.resource);
			if (conflictingNotebook) {
				this._logService.warn('DISPOSING conflicting notebook with same URI but different view type', this.resource.toString(), this.viewType);
				conflictingNotebook.dispose();
			}


			// this creates and caches a new notebook model so that notebookService.getNotebookTextModel(...)
			// will return this one model
			const notebook = this._notebookService.createNotebookTextModel(this.viewType, this.resource, data.data, data.transientOptions);
			this._register(notebook);
			this._register(notebook.onDidChangeContent(e => {
				let triggerDirty = false;
				for (let i = 0; i < e.rawEvents.length; i++) {
					if (e.rawEvents[i].kind !== NotebookCellsChangeType.Initialize) {
						this._onDidChangeContent.fire();
						triggerDirty = triggerDirty || !e.rawEvents[i].transient;
					}
				}
				if (triggerDirty) {
					this.setDirty(true);
				}
			}));

		} else {
			// UPDATE exitsing notebook with data that we have just fetched
			this._logService.debug('[notebook editor model] loading onto EXISTING notebook', this.resource.toString());
			this.notebook.reset(data.data.cells, data.data.metadata, data.transientOptions);
		}

		if (backup) {
			this.setDirty(true);
		} else {
			this.setDirty(false);
		}
	}

	private async _assertStat(): Promise<'overwrite' | 'revert' | 'none'> {
		this._logService.debug('[notebook editor model] start assert stat');
		const stats = await this._resolveStats(this.resource);
		if (this._lastResolvedFileStat && stats && stats.mtime > this._lastResolvedFileStat.mtime) {
			this._logService.debug(`[notebook editor model] noteboook file on disk is newer:\nLastResolvedStat: ${this._lastResolvedFileStat ? JSON.stringify(this._lastResolvedFileStat) : undefined}.\nCurrent stat: ${JSON.stringify(stats)}`);
			this._lastResolvedFileStat = stats;
			return new Promise<'overwrite' | 'revert' | 'none'>(resolve => {
				const handle = this._notificationService.prompt(
					Severity.Info,
					nls.localize('notebook.staleSaveError', "The contents of the file has changed on disk. Would you like to open the updated version or overwrite the file with your changes?"),
					[{
						label: nls.localize('notebook.staleSaveError.revert', "Revert"),
						run: () => {
							resolve('revert');
						}
					}, {
						label: nls.localize('notebook.staleSaveError.overwrite.', "Overwrite"),
						run: () => {
							resolve('overwrite');
						}
					}],
					{ sticky: true }
				);

				Event.once(handle.onDidClose)(() => {
					resolve('none');
				});
			});
		} else if (!this._lastResolvedFileStat && stats) {
			// finally get a stats
			this._lastResolvedFileStat = stats;
		}

		return 'overwrite';
	}

	async save(): Promise<boolean> {

		if (!this.isResolved()) {
			return false;
		}

		const versionId = this.notebook.versionId;
		this._logService.debug(`[notebook editor model] save(${versionId}) - enter with versionId ${versionId}`, this.resource.toString(true));

		if (this._saveSequentializer.hasPending(versionId)) {
			this._logService.debug(`[notebook editor model] save(${versionId}) - exit - found a pending save for versionId ${versionId}`, this.resource.toString(true));
			return this._saveSequentializer.pending.then(() => {
				return true;
			});
		}

		if (this._saveSequentializer.hasPending()) {
			return this._saveSequentializer.setNext(async () => {
				await this.save();
			}).then(() => {
				return true;
			});
		}

		return this._saveSequentializer.setPending(versionId, (async () => {
			const result = await this._assertStat();
			if (result === 'none') {
				return;
			}
			if (result === 'revert') {
				await this.revert();
				return;
			}
			if (!this.isResolved()) {
				return;
			}
			const success = false;
			this._logService.debug(`[notebook editor model] save(${versionId}) - document saved saved, start updating file stats`, this.resource.toString(true), success);
			this._lastResolvedFileStat = await this._resolveStats(this.resource);
			if (success) {
				this.setDirty(false);
				this._onDidSave.fire({});
			}
		})()).then(() => {
			return true;
		});
	}

	async saveAs(targetResource: URI): Promise<IUntypedEditorInput | undefined> {

		if (!this.isResolved()) {
			return undefined;
		}

		this._logService.debug(`[notebook editor model] saveAs - enter`, this.resource.toString(true));
		const result = await this._assertStat();

		if (result === 'none') {
			return undefined;
		}

		if (result === 'revert') {
			await this.revert();
			return undefined;
		}

		const success = false;
		this._logService.debug(`[notebook editor model] saveAs - document saved, start updating file stats`, this.resource.toString(true), success);
		this._lastResolvedFileStat = await this._resolveStats(this.resource);
		if (!success) {
			return undefined;
		}
		this.setDirty(false);
		this._onDidSave.fire({});
		return { resource: targetResource };
	}

	private async _resolveStats(resource: URI) {
		if (resource.scheme === Schemas.untitled) {
			return undefined;
		}

		try {
			this._logService.debug(`[notebook editor model] _resolveStats`, this.resource.toString(true));
			const newStats = await this._fileService.stat(this.resource);
			this._logService.debug(`[notebook editor model] _resolveStats - latest file stats: ${JSON.stringify(newStats)}`, this.resource.toString(true));
			return newStats;
		} catch (e) {
			return undefined;
		}
	}
}

//#endregion

//#region --- simple content provider

export class SimpleNotebookEditorModel extends EditorModel implements INotebookEditorModel {

	private readonly _onDidChangeDirty = this._register(new Emitter<void>());
	private readonly _onDidSave = this._register(new Emitter<IStoredFileWorkingCopySaveEvent>());
	private readonly _onDidChangeOrphaned = this._register(new Emitter<void>());
	private readonly _onDidChangeReadonly = this._register(new Emitter<void>());

	readonly onDidChangeDirty: Event<void> = this._onDidChangeDirty.event;
	readonly onDidSave: Event<IStoredFileWorkingCopySaveEvent> = this._onDidSave.event;
	readonly onDidChangeOrphaned: Event<void> = this._onDidChangeOrphaned.event;
	readonly onDidChangeReadonly: Event<void> = this._onDidChangeReadonly.event;

	private _workingCopy?: IStoredFileWorkingCopy<NotebookFileWorkingCopyModel> | IUntitledFileWorkingCopy<NotebookFileWorkingCopyModel>;
	private readonly _workingCopyListeners = this._register(new DisposableStore());

	constructor(
		readonly resource: URI,
		private readonly _hasAssociatedFilePath: boolean,
		readonly viewType: string,
		private readonly _workingCopyManager: IFileWorkingCopyManager<NotebookFileWorkingCopyModel, NotebookFileWorkingCopyModel>,
		@IFileService private readonly _fileService: IFileService
	) {
		super();
	}

	override dispose(): void {
		this._workingCopy?.dispose();
		super.dispose();
	}

	get notebook(): NotebookTextModel | undefined {
		return this._workingCopy?.model?.notebookModel;
	}

	override isResolved(): this is IResolvedNotebookEditorModel {
		return Boolean(this._workingCopy);
	}

	isDirty(): boolean {
		return this._workingCopy?.isDirty() ?? false;
	}

	isOrphaned(): boolean {
		return SimpleNotebookEditorModel._isStoredFileWorkingCopy(this._workingCopy) && this._workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN);
	}

	hasAssociatedFilePath(): boolean {
		return !SimpleNotebookEditorModel._isStoredFileWorkingCopy(this._workingCopy) && !!this._workingCopy?.hasAssociatedFilePath;
	}

	isReadonly(): boolean {
		if (SimpleNotebookEditorModel._isStoredFileWorkingCopy(this._workingCopy)) {
			return this._workingCopy.isReadonly();
		} else if (this._fileService.hasCapability(this.resource, FileSystemProviderCapabilities.Readonly)) {
			return true;
		} else {
			return false;
		}
	}

	revert(options?: IRevertOptions): Promise<void> {
		assertType(this.isResolved());
		return this._workingCopy!.revert(options);
	}

	save(options?: ISaveOptions): Promise<boolean> {
		assertType(this.isResolved());
		return this._workingCopy!.save(options);
	}

	async load(options?: INotebookLoadOptions): Promise<IResolvedNotebookEditorModel> {

		if (!this._workingCopy) {
			if (this.resource.scheme === Schemas.untitled) {
				if (this._hasAssociatedFilePath) {
					this._workingCopy = await this._workingCopyManager.resolve({ associatedResource: this.resource });
				} else {
					this._workingCopy = await this._workingCopyManager.resolve({ untitledResource: this.resource });
				}
			} else {
				this._workingCopy = await this._workingCopyManager.resolve(this.resource, options?.forceReadFromFile ? { reload: { async: false, force: true } } : undefined);
				this._workingCopyListeners.add(this._workingCopy.onDidSave(e => this._onDidSave.fire(e)));
				this._workingCopyListeners.add(this._workingCopy.onDidChangeOrphaned(() => this._onDidChangeOrphaned.fire()));
				this._workingCopyListeners.add(this._workingCopy.onDidChangeReadonly(() => this._onDidChangeReadonly.fire()));
			}
			this._workingCopy.onDidChangeDirty(() => this._onDidChangeDirty.fire(), undefined, this._workingCopyListeners);

			this._workingCopyListeners.add(this._workingCopy.onWillDispose(() => {
				this._workingCopyListeners.clear();
				this._workingCopy?.model?.dispose();
			}));
		} else {
			await this._workingCopyManager.resolve(this.resource, {
				reload: {
					async: !options?.forceReadFromFile,
					force: options?.forceReadFromFile
				}
			});
		}

		assertType(this.isResolved());
		return this;
	}

	async saveAs(target: URI): Promise<IUntypedEditorInput | undefined> {
		const newWorkingCopy = await this._workingCopyManager.saveAs(this.resource, target);
		if (!newWorkingCopy) {
			return undefined;
		}
		// this is a little hacky because we leave the new working copy alone. BUT
		// the newly created editor input will pick it up and claim ownership of it.
		return { resource: newWorkingCopy.resource };
	}

	private static _isStoredFileWorkingCopy(candidate?: IStoredFileWorkingCopy<NotebookFileWorkingCopyModel> | IUntitledFileWorkingCopy<NotebookFileWorkingCopyModel>): candidate is IStoredFileWorkingCopy<NotebookFileWorkingCopyModel> {
		const isUntitled = candidate && candidate.capabilities & WorkingCopyCapabilities.Untitled;

		return !isUntitled;
	}
}

export class NotebookFileWorkingCopyModel extends Disposable implements IStoredFileWorkingCopyModel, IUntitledFileWorkingCopyModel {

	private readonly _onDidChangeContent = this._register(new Emitter<IStoredFileWorkingCopyModelContentChangedEvent & IUntitledFileWorkingCopyModelContentChangedEvent>());
	readonly onDidChangeContent = this._onDidChangeContent.event;

	readonly onWillDispose: Event<void>;

	constructor(
		private readonly _notebookModel: NotebookTextModel,
		private readonly _notebookSerializer: INotebookSerializer
	) {
		super();

		this.onWillDispose = _notebookModel.onWillDispose.bind(_notebookModel);

		this._register(_notebookModel.onDidChangeContent(e => {
			for (const rawEvent of e.rawEvents) {
				if (rawEvent.kind === NotebookCellsChangeType.Initialize) {
					continue;
				}
				if (rawEvent.transient) {
					continue;
				}
				this._onDidChangeContent.fire({
					isRedoing: false, //todo@rebornix forward this information from notebook model
					isUndoing: false,
					isInitial: false, //_notebookModel.cells.length === 0 // todo@jrieken non transient metadata?
				});
				break;
			}
		}));
	}

	override dispose(): void {
		this._notebookModel.dispose();
		super.dispose();
	}

	get notebookModel() {
		return this._notebookModel;
	}

	async snapshot(token: CancellationToken): Promise<VSBufferReadableStream> {

		const data: NotebookData = {
			metadata: filter(this._notebookModel.metadata, key => !this._notebookSerializer.options.transientDocumentMetadata[key]),
			cells: [],
		};

		for (const cell of this._notebookModel.cells) {
			const cellData: ICellDto2 = {
				cellKind: cell.cellKind,
				language: cell.language,
				mime: cell.mime,
				source: cell.getValue(),
				outputs: [],
				internalMetadata: cell.internalMetadata
			};

			cellData.outputs = !this._notebookSerializer.options.transientOutputs ? cell.outputs : [];
			cellData.metadata = filter(cell.metadata, key => !this._notebookSerializer.options.transientCellMetadata[key]);

			data.cells.push(cellData);
		}

		const bytes = await this._notebookSerializer.notebookToData(data);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		return bufferToStream(bytes);
	}

	async update(stream: VSBufferReadableStream, token: CancellationToken): Promise<void> {

		const bytes = await streamToBuffer(stream);
		const data = await this._notebookSerializer.dataToNotebook(bytes);

		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		this._notebookModel.reset(data.cells, data.metadata, this._notebookSerializer.options);
	}

	get versionId() {
		return this._notebookModel.alternativeVersionId;
	}

	pushStackElement(): void {
		this._notebookModel.pushStackElement('save', undefined, undefined);
	}
}

export class NotebookFileWorkingCopyModelFactory implements IStoredFileWorkingCopyModelFactory<NotebookFileWorkingCopyModel>, IUntitledFileWorkingCopyModelFactory<NotebookFileWorkingCopyModel>{

	constructor(
		private readonly _viewType: string,
		@INotebookService private readonly _notebookService: INotebookService,
	) { }

	async createModel(resource: URI, stream: VSBufferReadableStream, token: CancellationToken): Promise<NotebookFileWorkingCopyModel> {

		const info = await this._notebookService.withNotebookDataProvider(this._viewType);
		if (!(info instanceof SimpleNotebookProviderInfo)) {
			throw new Error('CANNOT open file notebook with this provider');
		}

		const bytes = await streamToBuffer(stream);
		const data = await info.serializer.dataToNotebook(bytes);

		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		const notebookModel = this._notebookService.createNotebookTextModel(info.viewType, resource, data, info.serializer.options);
		return new NotebookFileWorkingCopyModel(notebookModel, info.serializer);
	}
}

//#endregion
