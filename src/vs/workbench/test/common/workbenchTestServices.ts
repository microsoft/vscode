/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'vs/base/common/path';
import { basename, isEqual, isEqualOrParent } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceContextService, IWorkspace, WorkbenchState, IWorkspaceFolder, IWorkspaceFoldersChangeEvent, Workspace, IWorkspaceFoldersWillChangeEvent, ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';
import { TestWorkspace } from 'vs/platform/workspace/test/common/testWorkspace';
import { ITextResourcePropertiesService } from 'vs/editor/common/services/textResourceConfiguration';
import { isLinux, isMacintosh } from 'vs/base/common/platform';
import { InMemoryStorageService, WillSaveStateReason } from 'vs/platform/storage/common/storage';
import { IWorkingCopy, IWorkingCopyBackup, WorkingCopyCapabilities } from 'vs/workbench/services/workingCopy/common/workingCopy';
import { NullExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkingCopyFileService, IWorkingCopyFileOperationParticipant, WorkingCopyFileEvent, IDeleteOperation, ICopyOperation, IMoveOperation, IFileOperationUndoRedoInfo, ICreateFileOperation, ICreateOperation, IStoredFileWorkingCopySaveParticipant } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { IBaseFileStat, IFileStatWithMetadata } from 'vs/platform/files/common/files';
import { ISaveOptions, IRevertOptions, SaveReason, GroupIdentifier } from 'vs/workbench/common/editor';
import { CancellationToken } from 'vs/base/common/cancellation';
import product from 'vs/platform/product/common/product';
import { IActivity, IActivityService } from 'vs/workbench/services/activity/common/activity';
import { IStoredFileWorkingCopySaveEvent } from 'vs/workbench/services/workingCopy/common/storedFileWorkingCopy';
import { AbstractLoggerService, ILogger, LogLevel, NullLogger } from 'vs/platform/log/common/log';
import { IResourceEditorInput } from 'vs/platform/editor/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { AutoSaveMode, IAutoSaveConfiguration, IFilesConfigurationService } from 'vs/workbench/services/filesConfiguration/common/filesConfigurationService';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService, IWorkspaceTrustRequestService, IWorkspaceTrustTransitionParticipant, IWorkspaceTrustUriInfo, WorkspaceTrustRequestOptions, WorkspaceTrustUriResponse } from 'vs/platform/workspace/common/workspaceTrust';

export class TestLoggerService extends AbstractLoggerService {
	constructor(logsHome?: URI) {
		super(LogLevel.Info, logsHome ?? URI.file('tests').with({ scheme: 'vscode-tests' }));
	}
	protected doCreateLogger(): ILogger { return new NullLogger(); }
}

export class TestTextResourcePropertiesService implements ITextResourcePropertiesService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
	}

	getEOL(resource: URI, language?: string): string {
		const eol = this.configurationService.getValue('files.eol', { overrideIdentifier: language, resource });
		if (eol && typeof eol === 'string' && eol !== 'auto') {
			return eol;
		}
		return (isLinux || isMacintosh) ? '\n' : '\r\n';
	}
}

export class TestContextService implements IWorkspaceContextService {

	declare readonly _serviceBrand: undefined;

	private workspace: Workspace;
	private options: object;

	private readonly _onDidChangeWorkspaceName: Emitter<void>;
	get onDidChangeWorkspaceName(): Event<void> { return this._onDidChangeWorkspaceName.event; }

	private readonly _onWillChangeWorkspaceFolders: Emitter<IWorkspaceFoldersWillChangeEvent>;
	get onWillChangeWorkspaceFolders(): Event<IWorkspaceFoldersWillChangeEvent> { return this._onWillChangeWorkspaceFolders.event; }

	private readonly _onDidChangeWorkspaceFolders: Emitter<IWorkspaceFoldersChangeEvent>;
	get onDidChangeWorkspaceFolders(): Event<IWorkspaceFoldersChangeEvent> { return this._onDidChangeWorkspaceFolders.event; }

	private readonly _onDidChangeWorkbenchState: Emitter<WorkbenchState>;
	get onDidChangeWorkbenchState(): Event<WorkbenchState> { return this._onDidChangeWorkbenchState.event; }

	constructor(workspace = TestWorkspace, options = null) {
		this.workspace = workspace;
		this.options = options || Object.create(null);
		this._onDidChangeWorkspaceName = new Emitter<void>();
		this._onWillChangeWorkspaceFolders = new Emitter<IWorkspaceFoldersWillChangeEvent>();
		this._onDidChangeWorkspaceFolders = new Emitter<IWorkspaceFoldersChangeEvent>();
		this._onDidChangeWorkbenchState = new Emitter<WorkbenchState>();
	}

	getFolders(): IWorkspaceFolder[] {
		return this.workspace ? this.workspace.folders : [];
	}

	getWorkbenchState(): WorkbenchState {
		if (this.workspace.configuration) {
			return WorkbenchState.WORKSPACE;
		}

		if (this.workspace.folders.length) {
			return WorkbenchState.FOLDER;
		}

		return WorkbenchState.EMPTY;
	}

	getCompleteWorkspace(): Promise<IWorkspace> {
		return Promise.resolve(this.getWorkspace());
	}

	getWorkspace(): IWorkspace {
		return this.workspace;
	}

	getWorkspaceFolder(resource: URI): IWorkspaceFolder | null {
		return this.workspace.getFolder(resource);
	}

	setWorkspace(workspace: any): void {
		this.workspace = workspace;
	}

	getOptions() {
		return this.options;
	}

	updateOptions() { }

	isInsideWorkspace(resource: URI): boolean {
		if (resource && this.workspace) {
			return isEqualOrParent(resource, this.workspace.folders[0].uri);
		}

		return false;
	}

	toResource(workspaceRelativePath: string): URI {
		return URI.file(join('C:\\', workspaceRelativePath));
	}

	isCurrentWorkspace(workspaceIdOrFolder: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI): boolean {
		return URI.isUri(workspaceIdOrFolder) && isEqual(this.workspace.folders[0].uri, workspaceIdOrFolder);
	}
}

export class TestStorageService extends InMemoryStorageService {

	testEmitWillSaveState(reason: WillSaveStateReason): void {
		super.emitWillSaveState(reason);
	}
}

export class TestHistoryService implements IHistoryService {

	declare readonly _serviceBrand: undefined;

	constructor(private root?: URI) { }

	async reopenLastClosedEditor(): Promise<void> { }
	async goForward(): Promise<void> { }
	async goBack(): Promise<void> { }
	async goPrevious(): Promise<void> { }
	async goLast(): Promise<void> { }
	removeFromHistory(_input: EditorInput | IResourceEditorInput): void { }
	clear(): void { }
	clearRecentlyOpened(): void { }
	getHistory(): readonly (EditorInput | IResourceEditorInput)[] { return []; }
	async openNextRecentlyUsedEditor(group?: GroupIdentifier): Promise<void> { }
	async openPreviouslyUsedEditor(group?: GroupIdentifier): Promise<void> { }
	getLastActiveWorkspaceRoot(_schemeFilter: string): URI | undefined { return this.root; }
	getLastActiveFile(_schemeFilter: string): URI | undefined { return undefined; }
}

export class TestWorkingCopy extends Disposable implements IWorkingCopy {

	private readonly _onDidChangeDirty = this._register(new Emitter<void>());
	readonly onDidChangeDirty = this._onDidChangeDirty.event;

	private readonly _onDidChangeContent = this._register(new Emitter<void>());
	readonly onDidChangeContent = this._onDidChangeContent.event;

	private readonly _onDidSave = this._register(new Emitter<IStoredFileWorkingCopySaveEvent>());
	readonly onDidSave = this._onDidSave.event;

	readonly capabilities = WorkingCopyCapabilities.None;

	readonly name = basename(this.resource);

	private dirty = false;

	constructor(readonly resource: URI, isDirty = false, readonly typeId = 'testWorkingCopyType') {
		super();

		this.dirty = isDirty;
	}

	setDirty(dirty: boolean): void {
		if (this.dirty !== dirty) {
			this.dirty = dirty;
			this._onDidChangeDirty.fire();
		}
	}

	setContent(content: string): void {
		this._onDidChangeContent.fire();
	}

	isDirty(): boolean {
		return this.dirty;
	}

	isModified(): boolean {
		return this.isDirty();
	}

	async save(options?: ISaveOptions, stat?: IFileStatWithMetadata): Promise<boolean> {
		this._onDidSave.fire({ reason: options?.reason ?? SaveReason.EXPLICIT, stat: stat ?? createFileStat(this.resource), source: options?.source });

		return true;
	}

	async revert(options?: IRevertOptions): Promise<void> {
		this.setDirty(false);
	}

	async backup(token: CancellationToken): Promise<IWorkingCopyBackup> {
		return {};
	}
}

export function createFileStat(resource: URI, readonly = false): IFileStatWithMetadata {
	return {
		resource,
		etag: Date.now().toString(),
		mtime: Date.now(),
		ctime: Date.now(),
		size: 42,
		isFile: true,
		isDirectory: false,
		isSymbolicLink: false,
		readonly,
		locked: false,
		name: basename(resource),
		children: undefined
	};
}

export class TestWorkingCopyFileService implements IWorkingCopyFileService {

	declare readonly _serviceBrand: undefined;

	onWillRunWorkingCopyFileOperation: Event<WorkingCopyFileEvent> = Event.None;
	onDidFailWorkingCopyFileOperation: Event<WorkingCopyFileEvent> = Event.None;
	onDidRunWorkingCopyFileOperation: Event<WorkingCopyFileEvent> = Event.None;

	addFileOperationParticipant(participant: IWorkingCopyFileOperationParticipant): IDisposable { return Disposable.None; }

	readonly hasSaveParticipants = false;
	addSaveParticipant(participant: IStoredFileWorkingCopySaveParticipant): IDisposable { return Disposable.None; }
	async runSaveParticipants(workingCopy: IWorkingCopy, context: { reason: SaveReason }, token: CancellationToken): Promise<void> { }

	async delete(operations: IDeleteOperation[], token: CancellationToken, undoInfo?: IFileOperationUndoRedoInfo): Promise<void> { }

	registerWorkingCopyProvider(provider: (resourceOrFolder: URI) => IWorkingCopy[]): IDisposable { return Disposable.None; }

	getDirty(resource: URI): IWorkingCopy[] { return []; }

	create(operations: ICreateFileOperation[], token: CancellationToken, undoInfo?: IFileOperationUndoRedoInfo): Promise<IFileStatWithMetadata[]> { throw new Error('Method not implemented.'); }
	createFolder(operations: ICreateOperation[], token: CancellationToken, undoInfo?: IFileOperationUndoRedoInfo): Promise<IFileStatWithMetadata[]> { throw new Error('Method not implemented.'); }

	move(operations: IMoveOperation[], token: CancellationToken, undoInfo?: IFileOperationUndoRedoInfo): Promise<IFileStatWithMetadata[]> { throw new Error('Method not implemented.'); }

	copy(operations: ICopyOperation[], token: CancellationToken, undoInfo?: IFileOperationUndoRedoInfo): Promise<IFileStatWithMetadata[]> { throw new Error('Method not implemented.'); }
}

export function mock<T>(): Ctor<T> {
	return function () { } as any;
}

export interface Ctor<T> {
	new(): T;
}

export class TestExtensionService extends NullExtensionService { }

export const TestProductService = { _serviceBrand: undefined, ...product };

export class TestActivityService implements IActivityService {
	_serviceBrand: undefined;
	showViewContainerActivity(viewContainerId: string, badge: IActivity): IDisposable {
		return this;
	}
	showViewActivity(viewId: string, badge: IActivity): IDisposable {
		return this;
	}
	showAccountsActivity(activity: IActivity): IDisposable {
		return this;
	}
	showGlobalActivity(activity: IActivity): IDisposable {
		return this;
	}

	dispose() { }
}

export const NullFilesConfigurationService = new class implements IFilesConfigurationService {

	_serviceBrand: undefined;

	readonly onAutoSaveConfigurationChange = Event.None;
	readonly onReadonlyChange = Event.None;
	readonly onFilesAssociationChange = Event.None;

	readonly isHotExitEnabled = false;
	readonly hotExitConfiguration = undefined;

	getAutoSaveConfiguration(): IAutoSaveConfiguration { throw new Error('Method not implemented.'); }
	getAutoSaveMode(): AutoSaveMode { throw new Error('Method not implemented.'); }
	toggleAutoSave(): Promise<void> { throw new Error('Method not implemented.'); }
	isReadonly(resource: URI, stat?: IBaseFileStat | undefined): boolean { return false; }
	async updateReadonly(resource: URI, readonly: boolean | 'toggle' | 'reset'): Promise<void> { }
	preventSaveConflicts(resource: URI, language?: string | undefined): boolean { throw new Error('Method not implemented.'); }
};

export class TestWorkspaceTrustEnablementService implements IWorkspaceTrustEnablementService {
	_serviceBrand: undefined;

	constructor(private isEnabled: boolean = true) { }

	isWorkspaceTrustEnabled(): boolean {
		return this.isEnabled;
	}
}

export class TestWorkspaceTrustManagementService extends Disposable implements IWorkspaceTrustManagementService {
	_serviceBrand: undefined;

	private _onDidChangeTrust = this._register(new Emitter<boolean>());
	onDidChangeTrust = this._onDidChangeTrust.event;

	private _onDidChangeTrustedFolders = this._register(new Emitter<void>());
	onDidChangeTrustedFolders = this._onDidChangeTrustedFolders.event;

	private _onDidInitiateWorkspaceTrustRequestOnStartup = this._register(new Emitter<void>());
	onDidInitiateWorkspaceTrustRequestOnStartup = this._onDidInitiateWorkspaceTrustRequestOnStartup.event;


	constructor(
		private trusted: boolean = true
	) {
		super();
	}

	get acceptsOutOfWorkspaceFiles(): boolean {
		throw new Error('Method not implemented.');
	}

	set acceptsOutOfWorkspaceFiles(value: boolean) {
		throw new Error('Method not implemented.');
	}

	addWorkspaceTrustTransitionParticipant(participant: IWorkspaceTrustTransitionParticipant): IDisposable {
		throw new Error('Method not implemented.');
	}

	getTrustedUris(): URI[] {
		throw new Error('Method not implemented.');
	}

	setParentFolderTrust(trusted: boolean): Promise<void> {
		throw new Error('Method not implemented.');
	}

	getUriTrustInfo(uri: URI): Promise<IWorkspaceTrustUriInfo> {
		throw new Error('Method not implemented.');
	}

	async setTrustedUris(folders: URI[]): Promise<void> {
		throw new Error('Method not implemented.');
	}

	async setUrisTrust(uris: URI[], trusted: boolean): Promise<void> {
		throw new Error('Method not implemented.');
	}

	canSetParentFolderTrust(): boolean {
		throw new Error('Method not implemented.');
	}

	canSetWorkspaceTrust(): boolean {
		throw new Error('Method not implemented.');
	}

	isWorkspaceTrusted(): boolean {
		return this.trusted;
	}

	isWorkspaceTrustForced(): boolean {
		return false;
	}

	get workspaceTrustInitialized(): Promise<void> {
		return Promise.resolve();
	}

	get workspaceResolved(): Promise<void> {
		return Promise.resolve();
	}

	async setWorkspaceTrust(trusted: boolean): Promise<void> {
		if (this.trusted !== trusted) {
			this.trusted = trusted;
			this._onDidChangeTrust.fire(this.trusted);
		}
	}
}

export class TestWorkspaceTrustRequestService extends Disposable implements IWorkspaceTrustRequestService {
	_serviceBrand: any;

	private readonly _onDidInitiateOpenFilesTrustRequest = this._register(new Emitter<void>());
	readonly onDidInitiateOpenFilesTrustRequest = this._onDidInitiateOpenFilesTrustRequest.event;

	private readonly _onDidInitiateWorkspaceTrustRequest = this._register(new Emitter<WorkspaceTrustRequestOptions>());
	readonly onDidInitiateWorkspaceTrustRequest = this._onDidInitiateWorkspaceTrustRequest.event;

	private readonly _onDidInitiateWorkspaceTrustRequestOnStartup = this._register(new Emitter<void>());
	readonly onDidInitiateWorkspaceTrustRequestOnStartup = this._onDidInitiateWorkspaceTrustRequestOnStartup.event;

	constructor(private readonly _trusted: boolean) {
		super();
	}

	requestOpenUrisHandler = async (uris: URI[]) => {
		return WorkspaceTrustUriResponse.Open;
	};

	requestOpenFilesTrust(uris: URI[]): Promise<WorkspaceTrustUriResponse> {
		return this.requestOpenUrisHandler(uris);
	}

	async completeOpenFilesTrustRequest(result: WorkspaceTrustUriResponse, saveResponse: boolean): Promise<void> {
		throw new Error('Method not implemented.');
	}

	cancelWorkspaceTrustRequest(): void {
		throw new Error('Method not implemented.');
	}

	async completeWorkspaceTrustRequest(trusted?: boolean): Promise<void> {
		throw new Error('Method not implemented.');
	}

	async requestWorkspaceTrust(options?: WorkspaceTrustRequestOptions): Promise<boolean> {
		return this._trusted;
	}

	requestWorkspaceTrustOnStartup(): void {
		throw new Error('Method not implemented.');
	}
}
