/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBufferReadableStream, streamToBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { assertType } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWriteFileOptions, IFileStatWithMetadata, FileOperationError, FileOperationResult } from '../../../../platform/files/common/files.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IRevertOptions, ISaveOptions, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorModel } from '../../../common/editor/editorModel.js';
import { NotebookTextModel } from './model/notebookTextModel.js';
import { INotebookEditorModel, INotebookLoadOptions, IResolvedNotebookEditorModel, NotebookCellsChangeType, NotebookSetting } from './notebookCommon.js';
import { INotebookLoggingService } from './notebookLoggingService.js';
import { INotebookSerializer, INotebookService, SimpleNotebookProviderInfo } from './notebookService.js';
import { IFilesConfigurationService } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { IFileWorkingCopyModelConfiguration, SnapshotContext } from '../../../services/workingCopy/common/fileWorkingCopy.js';
import { IFileWorkingCopyManager } from '../../../services/workingCopy/common/fileWorkingCopyManager.js';
import { IStoredFileWorkingCopy, IStoredFileWorkingCopyModel, IStoredFileWorkingCopyModelContentChangedEvent, IStoredFileWorkingCopyModelFactory, IStoredFileWorkingCopySaveEvent, StoredFileWorkingCopyState } from '../../../services/workingCopy/common/storedFileWorkingCopy.js';
import { IUntitledFileWorkingCopy, IUntitledFileWorkingCopyModel, IUntitledFileWorkingCopyModelContentChangedEvent, IUntitledFileWorkingCopyModelFactory } from '../../../services/workingCopy/common/untitledFileWorkingCopy.js';
import { WorkingCopyCapabilities } from '../../../services/workingCopy/common/workingCopy.js';

//#region --- simple content provider

export class SimpleNotebookEditorModel extends EditorModel implements INotebookEditorModel {

	private readonly _onDidChangeDirty = this._register(new Emitter<void>());
	private readonly _onDidSave = this._register(new Emitter<IStoredFileWorkingCopySaveEvent>());
	private readonly _onDidChangeOrphaned = this._register(new Emitter<void>());
	private readonly _onDidChangeReadonly = this._register(new Emitter<void>());
	private readonly _onDidRevertUntitled = this._register(new Emitter<void>());

	readonly onDidChangeDirty: Event<void> = this._onDidChangeDirty.event;
	readonly onDidSave: Event<IStoredFileWorkingCopySaveEvent> = this._onDidSave.event;
	readonly onDidChangeOrphaned: Event<void> = this._onDidChangeOrphaned.event;
	readonly onDidChangeReadonly: Event<void> = this._onDidChangeReadonly.event;
	readonly onDidRevertUntitled: Event<void> = this._onDidRevertUntitled.event;

	private _workingCopy?: IStoredFileWorkingCopy<NotebookFileWorkingCopyModel> | IUntitledFileWorkingCopy<NotebookFileWorkingCopyModel>;
	private readonly _workingCopyListeners = this._register(new DisposableStore());
	private readonly scratchPad: boolean;

	constructor(
		readonly resource: URI,
		private readonly _hasAssociatedFilePath: boolean,
		readonly viewType: string,
		private readonly _workingCopyManager: IFileWorkingCopyManager<NotebookFileWorkingCopyModel, NotebookFileWorkingCopyModel>,
		scratchpad: boolean,
		@IFilesConfigurationService private readonly _filesConfigurationService: IFilesConfigurationService,
	) {
		super();

		this.scratchPad = scratchpad;
	}

	override dispose(): void {
		this._workingCopy?.dispose();
		super.dispose();
	}

	get notebook(): NotebookTextModel | undefined {
		return this._workingCopy?.model?.notebookModel;
	}

	override isResolved(): this is IResolvedNotebookEditorModel {
		return Boolean(this._workingCopy?.model?.notebookModel);
	}

	async canDispose(): Promise<boolean> {
		if (!this._workingCopy) {
			return true;
		}

		if (SimpleNotebookEditorModel._isStoredFileWorkingCopy(this._workingCopy)) {
			return this._workingCopyManager.stored.canDispose(this._workingCopy);
		} else {
			return true;
		}
	}

	isDirty(): boolean {
		return this._workingCopy?.isDirty() ?? false;
	}

	isModified(): boolean {
		return this._workingCopy?.isModified() ?? false;
	}

	isOrphaned(): boolean {
		return SimpleNotebookEditorModel._isStoredFileWorkingCopy(this._workingCopy) && this._workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN);
	}

	hasAssociatedFilePath(): boolean {
		return !SimpleNotebookEditorModel._isStoredFileWorkingCopy(this._workingCopy) && !!this._workingCopy?.hasAssociatedFilePath;
	}

	isReadonly(): boolean | IMarkdownString {
		if (SimpleNotebookEditorModel._isStoredFileWorkingCopy(this._workingCopy)) {
			return this._workingCopy?.isReadonly();
		} else {
			return this._filesConfigurationService.isReadonly(this.resource);
		}
	}

	get hasErrorState(): boolean {
		if (this._workingCopy && 'hasState' in this._workingCopy) {
			return this._workingCopy.hasState(StoredFileWorkingCopyState.ERROR);
		}

		return false;
	}

	async revert(options?: IRevertOptions): Promise<void> {
		assertType(this.isResolved());
		return this._workingCopy!.revert(options);
	}

	async save(options?: ISaveOptions): Promise<boolean> {
		assertType(this.isResolved());
		return this._workingCopy!.save(options);
	}

	async load(options?: INotebookLoadOptions): Promise<IResolvedNotebookEditorModel> {
		if (!this._workingCopy || !this._workingCopy.model) {
			if (this.resource.scheme === Schemas.untitled) {
				if (this._hasAssociatedFilePath) {
					this._workingCopy = await this._workingCopyManager.resolve({ associatedResource: this.resource });
				} else {
					this._workingCopy = await this._workingCopyManager.resolve({ untitledResource: this.resource, isScratchpad: this.scratchPad });
				}
				this._register(this._workingCopy.onDidRevert(() => this._onDidRevertUntitled.fire()));
			} else {
				this._workingCopy = await this._workingCopyManager.resolve(this.resource, {
					limits: options?.limits,
					reload: options?.forceReadFromFile ? { async: false, force: true } : undefined
				});
				this._workingCopyListeners.add(this._workingCopy.onDidSave(e => this._onDidSave.fire(e)));
				this._workingCopyListeners.add(this._workingCopy.onDidChangeOrphaned(() => this._onDidChangeOrphaned.fire()));
				this._workingCopyListeners.add(this._workingCopy.onDidChangeReadonly(() => this._onDidChangeReadonly.fire()));
			}
			this._workingCopyListeners.add(this._workingCopy.onDidChangeDirty(() => this._onDidChangeDirty.fire(), undefined));

			this._workingCopyListeners.add(this._workingCopy.onWillDispose(() => {
				this._workingCopyListeners.clear();
				this._workingCopy?.model?.dispose();
			}));
		} else {
			await this._workingCopyManager.resolve(this.resource, {
				reload: {
					async: !options?.forceReadFromFile,
					force: options?.forceReadFromFile
				},
				limits: options?.limits
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

	readonly configuration: IFileWorkingCopyModelConfiguration | undefined = undefined;
	save: ((options: IWriteFileOptions, token: CancellationToken) => Promise<IFileStatWithMetadata>) | undefined;

	constructor(
		private readonly _notebookModel: NotebookTextModel,
		private readonly _notebookService: INotebookService,
		private readonly _configurationService: IConfigurationService,
		private readonly _telemetryService: ITelemetryService,
		private readonly _notebookLogService: INotebookLoggingService,
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

		const saveWithReducedCommunication = this._configurationService.getValue(NotebookSetting.remoteSaving);

		if (saveWithReducedCommunication || _notebookModel.uri.scheme === Schemas.vscodeRemote) {
			this.configuration = {
				// Intentionally pick a larger delay for triggering backups to allow auto-save
				// to complete first on the optimized save path
				backupDelay: 10000
			};
		}

		// Override save behavior to avoid transferring the buffer across the wire 3 times
		if (saveWithReducedCommunication) {
			this.setSaveDelegate().catch(error => this._notebookLogService.error('WorkingCopyModel', `Failed to set save delegate: ${error}`));
		}
	}

	private async setSaveDelegate() {
		// make sure we wait for a serializer to resolve before we try to handle saves in the EH
		await this.getNotebookSerializer();

		this.save = async (options: IWriteFileOptions, token: CancellationToken) => {
			try {
				let serializer = this._notebookService.tryGetDataProviderSync(this.notebookModel.viewType)?.serializer;

				if (!serializer) {
					this._notebookLogService.info('WorkingCopyModel', 'No serializer found for notebook model, checking if provider still needs to be resolved');
					serializer = await this.getNotebookSerializer().catch(error => {
						this._notebookLogService.error('WorkingCopyModel', `Failed to get notebook serializer: ${error}`);
						// The serializer was set initially but somehow is no longer available
						this.save = undefined;
						throw new NotebookSaveError('Failed to get notebook serializer');
					});
				}

				if (token.isCancellationRequested) {
					throw new CancellationError();
				}

				const stat = await serializer.save(this._notebookModel.uri, this._notebookModel.versionId, options, token);
				return stat;
			} catch (error) {
				if (!token.isCancellationRequested && error.name !== 'Canceled') {
					type notebookSaveErrorData = {
						isRemote: boolean;
						isIPyNbWorkerSerializer: boolean;
						error: string;
					};
					type notebookSaveErrorClassification = {
						owner: 'amunger';
						comment: 'Detect if we are having issues saving a notebook on the Extension Host';
						isRemote: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the save is happening on a remote file system' };
						isIPyNbWorkerSerializer: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the IPynb files are serialized in workers' };
						error: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Info about the error that occurred' };
					};
					const isIPynb = this._notebookModel.viewType === 'jupyter-notebook' || this._notebookModel.viewType === 'interactive';
					const errorMessage = getSaveErrorMessage(error);
					this._telemetryService.publicLogError2<notebookSaveErrorData, notebookSaveErrorClassification>('notebook/SaveError', {
						isRemote: this._notebookModel.uri.scheme === Schemas.vscodeRemote,
						isIPyNbWorkerSerializer: isIPynb && this._configurationService.getValue<boolean>('ipynb.experimental.serialization'),
						error: errorMessage
					});
				}

				throw error;
			}
		};
	}

	override dispose(): void {
		this._notebookModel.dispose();
		super.dispose();
	}

	get notebookModel() {
		return this._notebookModel;
	}

	async snapshot(context: SnapshotContext, token: CancellationToken): Promise<VSBufferReadableStream> {
		return this._notebookService.createNotebookTextDocumentSnapshot(this._notebookModel.uri, context, token);
	}

	async update(stream: VSBufferReadableStream, token: CancellationToken): Promise<void> {
		const serializer = await this.getNotebookSerializer();

		const bytes = await streamToBuffer(stream);
		const data = await serializer.dataToNotebook(bytes);

		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		this._notebookLogService.info('WorkingCopyModel', 'Notebook content updated from file system - ' + this._notebookModel.uri.toString());
		this._notebookModel.reset(data.cells, data.metadata, serializer.options);
	}

	async getNotebookSerializer(): Promise<INotebookSerializer> {
		const info = await this._notebookService.withNotebookDataProvider(this.notebookModel.viewType);
		if (!(info instanceof SimpleNotebookProviderInfo)) {
			const message = 'CANNOT open notebook with this provider';
			throw new NotebookSaveError(message);
		}

		return info.serializer;
	}

	get versionId() {
		return this._notebookModel.alternativeVersionId;
	}

	pushStackElement(): void {
		this._notebookModel.pushStackElement();
	}
}

export class NotebookFileWorkingCopyModelFactory implements IStoredFileWorkingCopyModelFactory<NotebookFileWorkingCopyModel>, IUntitledFileWorkingCopyModelFactory<NotebookFileWorkingCopyModel> {

	constructor(
		private readonly _viewType: string,
		@INotebookService private readonly _notebookService: INotebookService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@INotebookLoggingService private readonly _notebookLogService: INotebookLoggingService
	) { }

	async createModel(resource: URI, stream: VSBufferReadableStream, token: CancellationToken): Promise<NotebookFileWorkingCopyModel> {

		const notebookModel = this._notebookService.getNotebookTextModel(resource) ??
			await this._notebookService.createNotebookTextModel(this._viewType, resource, stream);

		return new NotebookFileWorkingCopyModel(notebookModel, this._notebookService, this._configurationService, this._telemetryService, this._notebookLogService);
	}
}

//#endregion

class NotebookSaveError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'NotebookSaveError';
	}
}

function getSaveErrorMessage(error: Error): string {
	if (error.name === 'NotebookSaveError') {
		return error.message;
	} else if (error instanceof FileOperationError) {
		switch (error.fileOperationResult) {
			case FileOperationResult.FILE_IS_DIRECTORY:
				return 'File is a directory';
			case FileOperationResult.FILE_NOT_FOUND:
				return 'File not found';
			case FileOperationResult.FILE_NOT_MODIFIED_SINCE:
				return 'File not modified since';
			case FileOperationResult.FILE_MODIFIED_SINCE:
				return 'File modified since';
			case FileOperationResult.FILE_MOVE_CONFLICT:
				return 'File move conflict';
			case FileOperationResult.FILE_WRITE_LOCKED:
				return 'File write locked';
			case FileOperationResult.FILE_PERMISSION_DENIED:
				return 'File permission denied';
			case FileOperationResult.FILE_TOO_LARGE:
				return 'File too large';
			case FileOperationResult.FILE_INVALID_PATH:
				return 'File invalid path';
			case FileOperationResult.FILE_NOT_DIRECTORY:
				return 'File not directory';
			case FileOperationResult.FILE_OTHER_ERROR:
				return 'File other error';
		}
	}
	return 'Unknown error';
}
