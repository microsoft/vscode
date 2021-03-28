/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { EditorModel, IRevertOptions, ISaveOptions } from 'vs/workbench/common/editor';
import { Emitter, Event } from 'vs/base/common/event';
import { CellEditType, CellKind, ICellEditOperation, INotebookEditorModel, INotebookLoadOptions, IResolvedNotebookEditorModel, NotebookCellsChangeType, NotebookDataDto, NotebookDocumentBackupData } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { IMainNotebookController, INotebookSerializer, INotebookService, SimpleNotebookProviderInfo } from 'vs/workbench/contrib/notebook/common/notebookService';
import { URI } from 'vs/base/common/uri';
import { IWorkingCopyService, IWorkingCopy, IWorkingCopyBackup, WorkingCopyCapabilities } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { Schemas } from 'vs/base/common/network';
import { IFileStatWithMetadata, IFileService, FileChangeType } from 'vs/platform/files/common/files';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { ILabelService } from 'vs/platform/label/common/label';
import { ILogService } from 'vs/platform/log/common/log';
import { TaskSequentializer } from 'vs/base/common/async';
import { bufferToStream, streamToBuffer, VSBuffer, VSBufferReadableStream } from 'vs/base/common/buffer';
import { assertType } from 'vs/base/common/types';
import { IUntitledTextEditorService } from 'vs/workbench/services/untitled/common/untitledTextEditorService';
import { IFileWorkingCopyModel, IFileWorkingCopyModelContentChangedEvent, IFileWorkingCopyModelFactory, IResolvedFileWorkingCopy } from 'vs/workbench/services/workingCopy/common/fileWorkingCopy';
import { IDisposable } from 'vs/base/common/lifecycle';
import { canceled } from 'vs/base/common/errors';

//#region --- complex content provider

export class ComplexNotebookEditorModel extends EditorModel implements INotebookEditorModel {

	private readonly _onDidSave = this._register(new Emitter<void>());
	private readonly _onDidChangeDirty = this._register(new Emitter<void>());
	private readonly _onDidChangeContent = this._register(new Emitter<void>());

	readonly onDidSave = this._onDidSave.event;
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private _lastResolvedFileStat?: IFileStatWithMetadata;

	private readonly _name: string;
	private readonly _workingCopyResource: URI;
	private readonly _saveSequentializer = new TaskSequentializer();

	private _dirty: boolean = false;

	constructor(
		readonly resource: URI,
		readonly viewType: string,
		private readonly _contentProvider: IMainNotebookController,
		@INotebookService private readonly _notebookService: INotebookService,
		@IWorkingCopyService private readonly _workingCopyService: IWorkingCopyService,
		@IBackupFileService private readonly _backupFileService: IBackupFileService,
		@IFileService private readonly _fileService: IFileService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ILogService private readonly _logService: ILogService,
		@IUntitledTextEditorService private readonly untitledTextEditorService: IUntitledTextEditorService,
		@ILabelService labelService: ILabelService,
	) {
		super();

		this._name = labelService.getUriBasenameLabel(resource);

		const that = this;
		this._workingCopyResource = resource.with({ scheme: Schemas.vscodeNotebook });
		const workingCopyAdapter = new class implements IWorkingCopy {
			readonly resource = that._workingCopyResource;
			get name() { return that._name; }
			readonly capabilities = that.isUntitled() ? WorkingCopyCapabilities.Untitled : WorkingCopyCapabilities.None;
			readonly onDidChangeDirty = that.onDidChangeDirty;
			readonly onDidChangeContent = that._onDidChangeContent.event;
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

	isResolved(): this is IResolvedNotebookEditorModel {
		return this.notebook !== undefined;
	}

	isDirty(): boolean {
		return this._dirty;
	}

	isUntitled(): boolean {
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

	async backup(token: CancellationToken): Promise<IWorkingCopyBackup<NotebookDocumentBackupData>> {

		if (!this.isResolved()) {
			return {};
		}

		const backupId = await this._contentProvider.backup(this.resource, token);
		if (token.isCancellationRequested) {
			return {};
		}
		const stats = await this._resolveStats(this.resource);

		return {
			meta: {
				mtime: stats?.mtime ?? Date.now(),
				viewType: this.notebook.viewType,
				backupId
			}
		};
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

		const backup = await this._backupFileService.resolve<NotebookDocumentBackupData>(this._workingCopyResource);

		if (this.isResolved()) {
			return this; // Make sure meanwhile someone else did not succeed in loading
		}

		this._logService.debug('[notebook editor model] load from provider', this.resource.toString());
		await this._loadFromProvider(backup?.meta?.backupId);
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
		let untitledDocumentData = untitledString ? VSBuffer.fromString(untitledString) : undefined;
		return untitledDocumentData;
	}

	private async _loadFromProvider(backupId: string | undefined): Promise<void> {

		const untitledData = await this.getUntitledDocumentData(this.resource);
		const data = await this._contentProvider.open(this.resource, backupId, untitledData, CancellationToken.None);

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

			// todo@jrieken@rebornix what about reload?
			if (this.resource.scheme === Schemas.untitled && data.data.cells.length === 0) {
				data.data.cells.push({
					cellKind: CellKind.Code,
					language: 'plaintext', //TODO@jrieken unsure what this is
					outputs: [],
					metadata: undefined,
					source: ''
				});
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
			this.notebook.metadata = data.data.metadata;
			this.notebook.transientOptions = data.transientOptions;
			const edits: ICellEditOperation[] = [{ editType: CellEditType.Replace, index: 0, count: this.notebook.cells.length, cells: data.data.cells }];
			this.notebook.applyEdits(edits, true, undefined, () => undefined, undefined);
		}

		if (backupId) {
			this._backupFileService.discardBackup(this._workingCopyResource);
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
			const success = await this._contentProvider.save(this.notebook.uri, CancellationToken.None);
			this._logService.debug(`[notebook editor model] save(${versionId}) - document saved saved, start updating file stats`, this.resource.toString(true), success);
			this._lastResolvedFileStat = await this._resolveStats(this.resource);
			if (success) {
				this.setDirty(false);
				this._onDidSave.fire();
			}
		})()).then(() => {
			return true;
		});
	}

	async saveAs(targetResource: URI): Promise<boolean> {

		if (!this.isResolved()) {
			return false;
		}

		this._logService.debug(`[notebook editor model] saveAs - enter`, this.resource.toString(true));
		const result = await this._assertStat();

		if (result === 'none') {
			return false;
		}

		if (result === 'revert') {
			await this.revert();
			return true;
		}

		const success = await this._contentProvider.saveAs(this.notebook.uri, targetResource, CancellationToken.None);
		this._logService.debug(`[notebook editor model] saveAs - document saved, start updating file stats`, this.resource.toString(true), success);
		this._lastResolvedFileStat = await this._resolveStats(this.resource);
		if (success) {
			this.setDirty(false);
			this._onDidSave.fire();
		}
		return true;
	}

	private async _resolveStats(resource: URI) {
		if (resource.scheme === Schemas.untitled) {
			return undefined;
		}

		try {
			this._logService.debug(`[notebook editor model] _resolveStats`, this.resource.toString(true));
			const newStats = await this._fileService.resolve(this.resource, { resolveMetadata: true });
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

	readonly onDidChangeDirty: Event<void>;
	readonly onDidSave: Event<void>;

	readonly resource: URI;
	readonly viewType: string;
	readonly notebook: NotebookTextModel;

	constructor(
		private readonly _workingCopy: IResolvedFileWorkingCopy<NotebookFileWorkingCopyModel>
	) {
		super();
		this.resource = _workingCopy.resource;
		this.viewType = _workingCopy.model.notebookModel.viewType;
		this.notebook = _workingCopy.model.notebookModel;

		this.onDidChangeDirty = Event.signal(_workingCopy.onDidChangeDirty);
		this.onDidSave = Event.signal(_workingCopy.onDidSave);
	}

	dispose(): void {
		this._workingCopy.dispose();
		super.dispose();
	}

	isDirty(): boolean {
		return this._workingCopy.isDirty();
	}

	revert(options?: IRevertOptions): Promise<void> {
		return this._workingCopy.revert(options);
	}

	save(options?: ISaveOptions): Promise<boolean> {
		return this._workingCopy.save(options);
	}

	isUntitled(): boolean {
		return this.resource.scheme === Schemas.untitled;
	}

	async load(options?: INotebookLoadOptions): Promise<IResolvedNotebookEditorModel> {
		await this._workingCopy.resolve(options);
		return this;
	}

	saveAs(target: URI): Promise<boolean> {
		throw new Error('Method not implemented.');
	}
}

export class NotebookFileWorkingCopyModel implements IFileWorkingCopyModel {

	private readonly _onDidChangeContent = new Emitter<IFileWorkingCopyModelContentChangedEvent>();
	private readonly _changeListener: IDisposable;

	readonly onDidChangeContent = this._onDidChangeContent.event;
	readonly onWillDispose: Event<void>;

	constructor(
		private readonly _notebookModel: NotebookTextModel,
		private readonly _notebookSerializer: INotebookSerializer
	) {
		this.onWillDispose = _notebookModel.onWillDispose.bind(_notebookModel);

		this._changeListener = _notebookModel.onDidChangeContent(e => {
			for (const rawEvent of e.rawEvents) {
				if (rawEvent.kind === NotebookCellsChangeType.Initialize) {
					continue;
				}
				if (rawEvent.transient) {
					continue;
				}
				//todo@jrieken,@rebornix forward this information from notebook model
				this._onDidChangeContent.fire({
					isRedoing: false,
					isUndoing: false
				});
				break;
			}
		});
	}

	dispose(): void {
		this._changeListener.dispose();
		this._onDidChangeContent.dispose();
		this._notebookModel.dispose();
	}

	get notebookModel() {
		return this._notebookModel;
	}

	async snapshot(token: CancellationToken): Promise<VSBufferReadableStream> {

		const data: NotebookDataDto = {
			metadata: this._notebookModel.metadata,
			cells: [],
		};

		for (const cell of this._notebookModel.cells) {
			data.cells.push({
				cellKind: cell.cellKind,
				language: cell.language,
				source: cell.getValue(),
				outputs: cell.outputs
			});
		}

		const bytes = await this._notebookSerializer.notebookToData(data);
		if (token.isCancellationRequested) {
			throw canceled();
		}
		return bufferToStream(bytes);
	}

	async update(stream: VSBufferReadableStream, token: CancellationToken): Promise<void> {

		const bytes = await streamToBuffer(stream);
		const data = await this._notebookSerializer.dataToNotebook(bytes);

		if (token.isCancellationRequested) {
			return;
		}

		this._notebookModel.metadata = data.metadata;
		this._notebookModel.transientOptions = this._notebookSerializer.options;
		const edits: ICellEditOperation[] = [{ editType: CellEditType.Replace, index: 0, count: this._notebookModel.cells.length, cells: data.cells }];
		this._notebookModel.applyEdits(edits, true, undefined, () => undefined, undefined, false);
	}

	getAlternativeVersionId(): number {
		return this._notebookModel.alternativeVersionId;
	}

	pushStackElement(): void {
		this._notebookModel.pushStackElement(nls.localize('save', 'Save Notebook'), undefined, undefined);
	}
}

export class NotebookFileWorkingCopyModelFactory implements IFileWorkingCopyModelFactory<NotebookFileWorkingCopyModel>{

	constructor(
		@INotebookService private readonly _notebookService: INotebookService
	) { }

	async createModel(resource: URI, stream: VSBufferReadableStream, token: CancellationToken): Promise<NotebookFileWorkingCopyModel> {

		const info = await this._notebookService.withNotebookDataProvider(resource);
		if (!(info instanceof SimpleNotebookProviderInfo)) {
			throw new Error('CANNOT open file notebook with this provider');
		}

		const data = await info.serializer.dataToNotebook(await streamToBuffer(stream));

		if (token.isCancellationRequested) {
			throw canceled();
		}

		const notebookModel = this._notebookService.createNotebookTextModel(info.viewType, resource, data, info.serializer.options);
		return new NotebookFileWorkingCopyModel(notebookModel, info.serializer);
	}
}

//#endregion
