/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBufferReadableStream, bufferToStream, streamToBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { CancellationError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { filter } from 'vs/base/common/objects';
import { assertType } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IRevertOptions, ISaveOptions, IUntypedEditorInput } from 'vs/workbench/common/editor';
import { EditorModel } from 'vs/workbench/common/editor/editorModel';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { ICellDto2, INotebookEditorModel, INotebookLoadOptions, IResolvedNotebookEditorModel, NotebookCellsChangeType, NotebookData } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookSerializer, INotebookService, SimpleNotebookProviderInfo } from 'vs/workbench/contrib/notebook/common/notebookService';
import { IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IFileWorkingCopyManager } from 'vs/workbench/services/workingCopy/common/fileWorkingCopyManager';
import { IStoredFileWorkingCopy, IStoredFileWorkingCopyModel, IStoredFileWorkingCopyModelContentChangedEvent, IStoredFileWorkingCopyModelFactory, IStoredFileWorkingCopySaveEvent, StoredFileWorkingCopyState } from 'vs/workbench/services/workingCopy/common/storedFileWorkingCopy';
import { IUntitledFileWorkingCopy, IUntitledFileWorkingCopyModel, IUntitledFileWorkingCopyModelContentChangedEvent, IUntitledFileWorkingCopyModelFactory } from 'vs/workbench/services/workingCopy/common/untitledFileWorkingCopy';
import { WorkingCopyCapabilities } from 'vs/workbench/services/workingCopy/common/workingCopy';

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
		@ILifecycleService lifecycleService: ILifecycleService,
		@IFilesConfigurationService private readonly _filesConfigurationService: IFilesConfigurationService
	) {
		super();

		if (this.viewType === 'interactive') {
			lifecycleService.onBeforeShutdown(async e => e.veto(this.onBeforeShutdown(), 'veto.InteractiveWindow'));
		}
	}

	private async onBeforeShutdown() {
		if (this._workingCopy?.isDirty()) {
			await this._workingCopy.save();
		}
		return false;
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

	isOrphaned(): boolean {
		return SimpleNotebookEditorModel._isStoredFileWorkingCopy(this._workingCopy) && this._workingCopy.hasState(StoredFileWorkingCopyState.ORPHAN);
	}

	hasAssociatedFilePath(): boolean {
		return !SimpleNotebookEditorModel._isStoredFileWorkingCopy(this._workingCopy) && !!this._workingCopy?.hasAssociatedFilePath;
	}

	isReadonly(): boolean {
		if (SimpleNotebookEditorModel._isStoredFileWorkingCopy(this._workingCopy)) {
			return this._workingCopy?.isReadonly();
		} else if (this._filesConfigurationService.isReadonly(this.resource)) {
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
		if (!this._workingCopy || !this._workingCopy.model) {
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
		private readonly _notebookService: INotebookService
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
		const serializer = await this.getNotebookSerializer();

		const data: NotebookData = {
			metadata: filter(this._notebookModel.metadata, key => !serializer.options.transientDocumentMetadata[key]),
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

			cellData.outputs = !serializer.options.transientOutputs ? cell.outputs : [];
			cellData.metadata = filter(cell.metadata, key => !serializer.options.transientCellMetadata[key]);

			data.cells.push(cellData);
		}

		const bytes = await serializer.notebookToData(data);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		return bufferToStream(bytes);
	}

	async update(stream: VSBufferReadableStream, token: CancellationToken): Promise<void> {
		const serializer = await this.getNotebookSerializer();

		const bytes = await streamToBuffer(stream);
		const data = await serializer.dataToNotebook(bytes);

		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		this._notebookModel.reset(data.cells, data.metadata, serializer.options);
	}

	async getNotebookSerializer(): Promise<INotebookSerializer> {
		const info = await this._notebookService.withNotebookDataProvider(this.notebookModel.viewType);
		if (!(info instanceof SimpleNotebookProviderInfo)) {
			throw new Error('CANNOT open file notebook with this provider');
		}

		return info.serializer;
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

		let data: NotebookData = {
			metadata: {},
			cells: []
		};
		if (resource.scheme !== Schemas.vscodeInteractive) {
			const bytes = await streamToBuffer(stream);
			data = await info.serializer.dataToNotebook(bytes);
		}

		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		const notebookModel = this._notebookService.createNotebookTextModel(info.viewType, resource, data, info.serializer.options);
		return new NotebookFileWorkingCopyModel(notebookModel, this._notebookService);
	}
}

//#endregion
