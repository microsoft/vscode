/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorModel, IRevertOptions } from 'vs/workbench/common/editor';
import { Emitter, Event } from 'vs/base/common/event';
import { INotebookEditorModel, NotebookDocumentBackupData } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { IReference, ReferenceCollection } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotebookService, INotebookEditorModelResolverService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { URI } from 'vs/base/common/uri';
import { IWorkingCopyService, IWorkingCopy, IWorkingCopyBackup } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { basename } from 'vs/base/common/resources';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { DefaultEndOfLine, ITextBuffer, EndOfLinePreference } from 'vs/editor/common/model';
import { Schemas } from 'vs/base/common/network';
import { ILogService } from 'vs/platform/log/common/log';


export interface INotebookLoadOptions {
	/**
	 * Go to disk bypassing any cache of the model if any.
	 */
	forceReadFromDisk?: boolean;

	editorId?: string;
}


export class NotebookEditorModel extends EditorModel implements IWorkingCopy, INotebookEditorModel {
	private _dirty = false;
	protected readonly _onDidChangeDirty = this._register(new Emitter<void>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;
	private readonly _onDidChangeContent = this._register(new Emitter<void>());
	readonly onDidChangeContent: Event<void> = this._onDidChangeContent.event;
	private _notebook!: NotebookTextModel;

	get notebook() {
		return this._notebook;
	}

	private _name!: string;

	get name() {
		return this._name;
	}

	private _workingCopyResource: URI;

	constructor(
		public readonly resource: URI,
		public readonly viewType: string,
		@INotebookService private readonly notebookService: INotebookService,
		@IWorkingCopyService private readonly workingCopyService: IWorkingCopyService,
		@IBackupFileService private readonly backupFileService: IBackupFileService
	) {
		super();

		const input = this;
		this._workingCopyResource = resource.with({ scheme: Schemas.vscodeNotebook });
		const workingCopyAdapter = new class implements IWorkingCopy {
			readonly resource = input._workingCopyResource;
			get name() { return input.name; }
			readonly capabilities = input.capabilities;
			readonly onDidChangeDirty = input.onDidChangeDirty;
			readonly onDidChangeContent = input.onDidChangeContent;
			isDirty(): boolean { return input.isDirty(); }
			backup(): Promise<IWorkingCopyBackup> { return input.backup(); }
			save(): Promise<boolean> { return input.save(); }
			revert(options?: IRevertOptions): Promise<void> { return input.revert(options); }
		};

		this._register(this.workingCopyService.registerWorkingCopy(workingCopyAdapter));
	}

	capabilities = 0;

	async backup(): Promise<IWorkingCopyBackup<NotebookDocumentBackupData>> {
		return {
			meta: {
				name: this._name,
				viewType: this._notebook.viewType
			},
			content: this._notebook.createSnapshot(true)
		};
	}

	async revert(options?: IRevertOptions | undefined): Promise<void> {
		if (options?.soft) {
			await this.backupFileService.discardBackup(this.resource);
			return;
		}

		await this.load({ forceReadFromDisk: true });
		this._dirty = false;
		this._onDidChangeDirty.fire();
		return;
	}

	async load(options?: INotebookLoadOptions): Promise<NotebookEditorModel> {
		if (options?.forceReadFromDisk) {
			return this.loadFromProvider(true);
		}
		if (this.isResolved()) {
			return this;
		}

		const backup = await this.backupFileService.resolve(this._workingCopyResource);

		if (this.isResolved()) {
			return this; // Make sure meanwhile someone else did not succeed in loading
		}

		if (backup) {
			try {
				return await this.loadFromBackup(backup.value.create(DefaultEndOfLine.LF), options?.editorId);
			} catch (error) {
				// this.logService.error('[text file model] load() from backup', error); // ignore error and continue to load as file below
			}
		}

		return this.loadFromProvider(false, options?.editorId);
	}

	private async loadFromBackup(content: ITextBuffer, editorId?: string): Promise<NotebookEditorModel> {
		const fullRange = content.getRangeAt(0, content.getLength());
		const data = JSON.parse(content.getValueInRange(fullRange, EndOfLinePreference.LF));

		const notebook = await this.notebookService.createNotebookFromBackup(this.viewType!, this.resource, data.metadata, data.languages, data.cells, editorId);
		this._notebook = notebook!;

		this._name = basename(this._notebook!.uri);

		this._register(this._notebook.onDidChangeContent(() => {
			this.setDirty(true);
			this._onDidChangeContent.fire();
		}));
		this._register(this._notebook.onDidChangeUnknown(() => {
			this.setDirty(true);
		}));

		await this.backupFileService.discardBackup(this._workingCopyResource);
		this.setDirty(true);

		return this;
	}

	private async loadFromProvider(forceReloadFromDisk: boolean, editorId?: string) {
		const notebook = await this.notebookService.resolveNotebook(this.viewType!, this.resource, forceReloadFromDisk, editorId);
		this._notebook = notebook!;

		this._name = basename(this._notebook!.uri);

		this._register(this._notebook.onDidChangeContent(() => {
			this.setDirty(true);
			this._onDidChangeContent.fire();
		}));
		this._register(this._notebook.onDidChangeUnknown(() => {
			this.setDirty(true);
		}));

		return this;
	}

	isResolved(): boolean {
		return !!this._notebook;
	}

	setDirty(newState: boolean) {
		if (this._dirty !== newState) {
			this._dirty = newState;
			this._onDidChangeDirty.fire();
		}
	}

	isDirty() {
		return this._dirty;
	}

	async save(): Promise<boolean> {
		const tokenSource = new CancellationTokenSource();
		await this.notebookService.save(this.notebook.viewType, this.notebook.uri, tokenSource.token);
		this._dirty = false;
		this._onDidChangeDirty.fire();
		return true;
	}

	async saveAs(targetResource: URI): Promise<boolean> {
		const tokenSource = new CancellationTokenSource();
		await this.notebookService.saveAs(this.notebook.viewType, this.notebook.uri, targetResource, tokenSource.token);
		this._dirty = false;
		this._onDidChangeDirty.fire();
		return true;
	}
}

class NotebookModelReferenceCollection extends ReferenceCollection<Promise<NotebookEditorModel>> {

	constructor(
		@IInstantiationService readonly _instantiationService: IInstantiationService,
		@INotebookService private readonly _notebookService: INotebookService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	protected createReferencedObject(key: string, ...args: any[]): Promise<NotebookEditorModel> {
		const [viewType, editorId] = args as [string, string | undefined];

		const resource = URI.parse(key);
		const model = this._instantiationService.createInstance(NotebookEditorModel, resource, viewType);
		const promise = model.load({ editorId });
		return promise;
	}

	protected destroyReferencedObject(_key: string, object: Promise<NotebookEditorModel>): void {
		object.then(model => {
			this._notebookService.destoryNotebookDocument(model.viewType, model.notebook);
			model.dispose();
		}).catch(err => {
			this._logService.critical('FAILED to destory notebook', err);
		});
	}
}

export class NotebookModelResolverService implements INotebookEditorModelResolverService {

	readonly _serviceBrand: undefined;

	private readonly _data: NotebookModelReferenceCollection;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this._data = instantiationService.createInstance(NotebookModelReferenceCollection);
	}

	async resolve(resource: URI, viewType: string, editorId?: string | undefined): Promise<IReference<NotebookEditorModel>> {
		const reference = this._data.acquire(resource.toString(), viewType, editorId);
		const model = await reference.object;
		return {
			object: model,
			dispose() { reference.dispose(); }
		};
	}
}
