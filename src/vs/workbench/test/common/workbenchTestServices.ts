/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, timeout } from '../../../base/common/async.js';
import { bufferToStream, readableToBuffer, VSBuffer, VSBufferReadable } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Iterable } from '../../../base/common/iterator.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { Schemas } from '../../../base/common/network.js';
import { observableValue } from '../../../base/common/observable.js';
import { join } from '../../../base/common/path.js';
import { isLinux, isMacintosh } from '../../../base/common/platform.js';
import { basename, isEqual, isEqualOrParent } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { ITextResourcePropertiesService } from '../../../editor/common/services/textResourceConfiguration.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IResourceEditorInput } from '../../../platform/editor/common/editor.js';
import { FileChangesEvent, FileOperationEvent, FileSystemProviderCapabilities, IBaseFileStat, ICreateFileOptions, IFileContent, IFileService, IFileStat, IFileStatResult, IFileStatWithMetadata, IFileStatWithPartialMetadata, IFileStreamContent, IFileSystemProvider, IFileSystemProviderActivationEvent, IFileSystemProviderCapabilitiesChangeEvent, IFileSystemWatcher, IReadFileOptions, IReadFileStreamOptions, IResolveFileOptions, IResolveMetadataFileOptions, IWatchOptions, IWatchOptionsWithCorrelation, IWriteFileOptions } from '../../../platform/files/common/files.js';
import { AbstractLoggerService, ILogger, LogLevel, NullLogger } from '../../../platform/log/common/log.js';
import { IMarker, IMarkerData, IMarkerService, IResourceMarker, MarkerStatistics } from '../../../platform/markers/common/markers.js';
import product from '../../../platform/product/common/product.js';
import { IProgress, IProgressStep } from '../../../platform/progress/common/progress.js';
import { InMemoryStorageService, WillSaveStateReason } from '../../../platform/storage/common/storage.js';
import { toUserDataProfile } from '../../../platform/userDataProfile/common/userDataProfile.js';
import { ISingleFolderWorkspaceIdentifier, IWorkspace, IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent, IWorkspaceFoldersWillChangeEvent, IWorkspaceIdentifier, WorkbenchState, Workspace } from '../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService, IWorkspaceTrustRequestService, IWorkspaceTrustTransitionParticipant, IWorkspaceTrustUriInfo, WorkspaceTrustRequestOptions, WorkspaceTrustUriResponse } from '../../../platform/workspace/common/workspaceTrust.js';
import { TestWorkspace } from '../../../platform/workspace/test/common/testWorkspace.js';
import { GroupIdentifier, IRevertOptions, ISaveOptions, SaveReason } from '../../common/editor.js';
import { EditorInput } from '../../common/editor/editorInput.js';
import { IActivity, IActivityService } from '../../services/activity/common/activity.js';
import { ChatEntitlement, IChatEntitlementService } from '../../services/chat/common/chatEntitlementService.js';
import { NullExtensionService } from '../../services/extensions/common/extensions.js';
import { IAutoSaveConfiguration, IAutoSaveMode, IFilesConfigurationService } from '../../services/filesConfiguration/common/filesConfigurationService.js';
import { IHistoryService } from '../../services/history/common/history.js';
import { BeforeShutdownErrorEvent, ILifecycleService, InternalBeforeShutdownEvent, LifecyclePhase, ShutdownReason, StartupKind, WillShutdownEvent } from '../../services/lifecycle/common/lifecycle.js';
import { IResourceEncoding } from '../../services/textfile/common/textfiles.js';
import { IUserDataProfileService } from '../../services/userDataProfile/common/userDataProfile.js';
import { IStoredFileWorkingCopySaveEvent } from '../../services/workingCopy/common/storedFileWorkingCopy.js';
import { IWorkingCopy, IWorkingCopyBackup, WorkingCopyCapabilities } from '../../services/workingCopy/common/workingCopy.js';
import { ICopyOperation, ICreateFileOperation, ICreateOperation, IDeleteOperation, IFileOperationUndoRedoInfo, IMoveOperation, IStoredFileWorkingCopySaveParticipant, IStoredFileWorkingCopySaveParticipantContext, IWorkingCopyFileOperationParticipant, IWorkingCopyFileService, WorkingCopyFileEvent } from '../../services/workingCopy/common/workingCopyFileService.js';

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

export class TestUserDataProfileService implements IUserDataProfileService {

	readonly _serviceBrand: undefined;
	readonly onDidChangeCurrentProfile = Event.None;
	readonly currentProfile = toUserDataProfile('test', 'test', URI.file('tests').with({ scheme: 'vscode-tests' }), URI.file('tests').with({ scheme: 'vscode-tests' }));
	async updateCurrentProfile(): Promise<void> { }
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

	readonly name;

	private dirty = false;

	constructor(readonly resource: URI, isDirty = false, readonly typeId = 'testWorkingCopyType') {
		super();

		this.name = basename(this.resource);
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

export function createFileStat(resource: URI, readonly = false, isFile?: boolean, isDirectory?: boolean, isSymbolicLink?: boolean, children?: { resource: URI; isFile?: boolean; isDirectory?: boolean; isSymbolicLink?: boolean }[] | undefined): IFileStatWithMetadata {
	return {
		resource,
		etag: Date.now().toString(),
		mtime: Date.now(),
		ctime: Date.now(),
		size: 42,
		isFile: isFile ?? true,
		isDirectory: isDirectory ?? false,
		isSymbolicLink: isSymbolicLink ?? false,
		readonly,
		locked: false,
		name: basename(resource),
		children: children?.map(c => createFileStat(c.resource, false, c.isFile, c.isDirectory, c.isSymbolicLink)),
	};
}

export class TestWorkingCopyFileService implements IWorkingCopyFileService {

	declare readonly _serviceBrand: undefined;

	readonly onWillRunWorkingCopyFileOperation: Event<WorkingCopyFileEvent> = Event.None;
	readonly onDidFailWorkingCopyFileOperation: Event<WorkingCopyFileEvent> = Event.None;
	readonly onDidRunWorkingCopyFileOperation: Event<WorkingCopyFileEvent> = Event.None;

	addFileOperationParticipant(participant: IWorkingCopyFileOperationParticipant): IDisposable { return Disposable.None; }

	readonly hasSaveParticipants = false;
	addSaveParticipant(participant: IStoredFileWorkingCopySaveParticipant): IDisposable { return Disposable.None; }
	async runSaveParticipants(workingCopy: IWorkingCopy, context: IStoredFileWorkingCopySaveParticipantContext, progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> { }

	async delete(operations: IDeleteOperation[], token: CancellationToken, undoInfo?: IFileOperationUndoRedoInfo): Promise<void> { }

	registerWorkingCopyProvider(provider: (resourceOrFolder: URI) => IWorkingCopy[]): IDisposable { return Disposable.None; }

	getDirty(resource: URI): IWorkingCopy[] { return []; }

	create(operations: ICreateFileOperation[], token: CancellationToken, undoInfo?: IFileOperationUndoRedoInfo): Promise<IFileStatWithMetadata[]> { throw new Error('Method not implemented.'); }
	createFolder(operations: ICreateOperation[], token: CancellationToken, undoInfo?: IFileOperationUndoRedoInfo): Promise<IFileStatWithMetadata[]> { throw new Error('Method not implemented.'); }

	move(operations: IMoveOperation[], token: CancellationToken, undoInfo?: IFileOperationUndoRedoInfo): Promise<IFileStatWithMetadata[]> { throw new Error('Method not implemented.'); }

	copy(operations: ICopyOperation[], token: CancellationToken, undoInfo?: IFileOperationUndoRedoInfo): Promise<IFileStatWithMetadata[]> { throw new Error('Method not implemented.'); }
}

export function mock<T>(): Ctor<T> {
	// eslint-disable-next-line local/code-no-any-casts
	return function () { } as any;
}

export interface Ctor<T> {
	new(): T;
}

export class TestExtensionService extends NullExtensionService { }

export const TestProductService = { _serviceBrand: undefined, ...product };

export class TestActivityService implements IActivityService {
	_serviceBrand: undefined;
	onDidChangeActivity = Event.None;
	getViewContainerActivities(viewContainerId: string): IActivity[] {
		return [];
	}
	getActivity(id: string): IActivity[] {
		return [];
	}
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

	readonly onDidChangeAutoSaveConfiguration = Event.None;
	readonly onDidChangeAutoSaveDisabled = Event.None;
	readonly onDidChangeReadonly = Event.None;
	readonly onDidChangeFilesAssociation = Event.None;

	readonly isHotExitEnabled = false;
	readonly hotExitConfiguration = undefined;

	getAutoSaveConfiguration(): IAutoSaveConfiguration { throw new Error('Method not implemented.'); }
	getAutoSaveMode(): IAutoSaveMode { throw new Error('Method not implemented.'); }
	hasShortAutoSaveDelay(): boolean { throw new Error('Method not implemented.'); }
	toggleAutoSave(): Promise<void> { throw new Error('Method not implemented.'); }
	enableAutoSaveAfterShortDelay(resourceOrEditor: URI | EditorInput): IDisposable { throw new Error('Method not implemented.'); }
	disableAutoSave(resourceOrEditor: URI | EditorInput): IDisposable { throw new Error('Method not implemented.'); }
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

export class TestMarkerService implements IMarkerService {

	_serviceBrand: undefined;

	onMarkerChanged = Event.None;

	getStatistics(): MarkerStatistics { throw new Error('Method not implemented.'); }
	changeOne(owner: string, resource: URI, markers: IMarkerData[]): void { }
	changeAll(owner: string, data: IResourceMarker[]): void { }
	remove(owner: string, resources: URI[]): void { }
	read(filter?: { owner?: string | undefined; resource?: URI | undefined; severities?: number | undefined; take?: number | undefined } | undefined): IMarker[] { return []; }
	installResourceFilter(resource: URI, reason: string): IDisposable {
		return { dispose: () => { /* TODO: Implement cleanup logic */ } };
	}
}

export class TestFileService implements IFileService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidFilesChange = new Emitter<FileChangesEvent>();
	get onDidFilesChange(): Event<FileChangesEvent> { return this._onDidFilesChange.event; }
	fireFileChanges(event: FileChangesEvent): void { this._onDidFilesChange.fire(event); }

	private readonly _onDidRunOperation = new Emitter<FileOperationEvent>();
	get onDidRunOperation(): Event<FileOperationEvent> { return this._onDidRunOperation.event; }
	fireAfterOperation(event: FileOperationEvent): void { this._onDidRunOperation.fire(event); }

	private readonly _onDidChangeFileSystemProviderCapabilities = new Emitter<IFileSystemProviderCapabilitiesChangeEvent>();
	get onDidChangeFileSystemProviderCapabilities(): Event<IFileSystemProviderCapabilitiesChangeEvent> { return this._onDidChangeFileSystemProviderCapabilities.event; }
	fireFileSystemProviderCapabilitiesChangeEvent(event: IFileSystemProviderCapabilitiesChangeEvent): void { this._onDidChangeFileSystemProviderCapabilities.fire(event); }

	private _onWillActivateFileSystemProvider = new Emitter<IFileSystemProviderActivationEvent>();
	readonly onWillActivateFileSystemProvider = this._onWillActivateFileSystemProvider.event;
	readonly onDidWatchError = Event.None;

	protected content = 'Hello Html';
	protected lastReadFileUri!: URI;

	readonly = false;

	// Tracking functionality for tests
	readonly writeOperations: Array<{ resource: URI; content: string }> = [];
	readonly readOperations: Array<{ resource: URI }> = [];

	setContent(content: string): void { this.content = content; }
	getContent(): string { return this.content; }
	getLastReadFileUri(): URI { return this.lastReadFileUri; }

	// Clear tracking data for tests
	clearTracking(): void {
		this.writeOperations.length = 0;
		this.readOperations.length = 0;
	}

	resolve(resource: URI, _options: IResolveMetadataFileOptions): Promise<IFileStatWithMetadata>;
	resolve(resource: URI, _options?: IResolveFileOptions): Promise<IFileStat>;
	async resolve(resource: URI, _options?: IResolveFileOptions): Promise<IFileStat> {
		return createFileStat(resource, this.readonly);
	}

	stat(resource: URI): Promise<IFileStatWithPartialMetadata> {
		return this.resolve(resource, { resolveMetadata: true });
	}

	async realpath(resource: URI): Promise<URI> {
		return resource;
	}

	async resolveAll(toResolve: { resource: URI; options?: IResolveFileOptions }[]): Promise<IFileStatResult[]> {
		const stats = await Promise.all(toResolve.map(resourceAndOption => this.resolve(resourceAndOption.resource, resourceAndOption.options)));

		return stats.map(stat => ({ stat, success: true }));
	}

	readonly notExistsSet = new ResourceMap<boolean>();

	async exists(_resource: URI): Promise<boolean> { return !this.notExistsSet.has(_resource); }

	readShouldThrowError: Error | undefined = undefined;

	async readFile(resource: URI, options?: IReadFileOptions | undefined): Promise<IFileContent> {
		if (this.readShouldThrowError) {
			throw this.readShouldThrowError;
		}

		this.lastReadFileUri = resource;
		this.readOperations.push({ resource });

		return {
			...createFileStat(resource, this.readonly),
			value: VSBuffer.fromString(this.content)
		};
	}

	async readFileStream(resource: URI, options?: IReadFileStreamOptions | undefined): Promise<IFileStreamContent> {
		if (this.readShouldThrowError) {
			throw this.readShouldThrowError;
		}

		this.lastReadFileUri = resource;

		return {
			...createFileStat(resource, this.readonly),
			value: bufferToStream(VSBuffer.fromString(this.content))
		};
	}

	writeShouldThrowError: Error | undefined = undefined;

	async writeFile(resource: URI, bufferOrReadable: VSBuffer | VSBufferReadable, options?: IWriteFileOptions): Promise<IFileStatWithMetadata> {
		await timeout(0);

		if (this.writeShouldThrowError) {
			throw this.writeShouldThrowError;
		}

		let content: VSBuffer | undefined;
		if (bufferOrReadable instanceof VSBuffer) {
			content = bufferOrReadable;
		} else {
			try {
				content = readableToBuffer(bufferOrReadable);
			} catch {
				// Some preexisting tests are writing with invalid objects
			}
		}

		if (content) {
			this.writeOperations.push({ resource, content: content.toString() });
		}

		return createFileStat(resource, this.readonly);
	}

	move(_source: URI, _target: URI, _overwrite?: boolean): Promise<IFileStatWithMetadata> { return Promise.resolve(null!); }
	copy(_source: URI, _target: URI, _overwrite?: boolean): Promise<IFileStatWithMetadata> { return Promise.resolve(null!); }
	async cloneFile(_source: URI, _target: URI): Promise<void> { }
	createFile(_resource: URI, _content?: VSBuffer | VSBufferReadable, _options?: ICreateFileOptions): Promise<IFileStatWithMetadata> { return Promise.resolve(null!); }
	createFolder(_resource: URI): Promise<IFileStatWithMetadata> { return Promise.resolve(null!); }

	onDidChangeFileSystemProviderRegistrations = Event.None;

	private providers = new Map<string, IFileSystemProvider>();

	registerProvider(scheme: string, provider: IFileSystemProvider) {
		this.providers.set(scheme, provider);

		return toDisposable(() => this.providers.delete(scheme));
	}

	getProvider(scheme: string) {
		return this.providers.get(scheme);
	}

	async activateProvider(_scheme: string): Promise<void> {
		this._onWillActivateFileSystemProvider.fire({ scheme: _scheme, join: () => { } });
	}
	async canHandleResource(resource: URI): Promise<boolean> { return this.hasProvider(resource); }
	hasProvider(resource: URI): boolean { return resource.scheme === Schemas.file || this.providers.has(resource.scheme); }
	listCapabilities() {
		return [
			{ scheme: Schemas.file, capabilities: FileSystemProviderCapabilities.FileOpenReadWriteClose },
			...Iterable.map(this.providers, ([scheme, p]) => { return { scheme, capabilities: p.capabilities }; })
		];
	}
	hasCapability(resource: URI, capability: FileSystemProviderCapabilities): boolean {
		if (capability === FileSystemProviderCapabilities.PathCaseSensitive && isLinux) {
			return true;
		}

		const provider = this.getProvider(resource.scheme);

		return !!(provider && (provider.capabilities & capability));
	}

	async del(_resource: URI, _options?: { useTrash?: boolean; recursive?: boolean }): Promise<void> { }

	createWatcher(resource: URI, options: IWatchOptions): IFileSystemWatcher {
		return {
			onDidChange: Event.None,
			dispose: () => { }
		};
	}


	readonly watches: URI[] = [];
	watch(_resource: URI, options: IWatchOptionsWithCorrelation): IFileSystemWatcher;
	watch(_resource: URI): IDisposable;
	watch(_resource: URI): IDisposable {
		this.watches.push(_resource);

		return toDisposable(() => this.watches.splice(this.watches.indexOf(_resource), 1));
	}

	getWriteEncoding(_resource: URI): IResourceEncoding { return { encoding: 'utf8', hasBOM: false }; }
	dispose(): void { }

	async canCreateFile(source: URI, options?: ICreateFileOptions): Promise<Error | true> { return true; }
	async canMove(source: URI, target: URI, overwrite?: boolean | undefined): Promise<Error | true> { return true; }
	async canCopy(source: URI, target: URI, overwrite?: boolean | undefined): Promise<Error | true> { return true; }
	async canDelete(resource: URI, options?: { useTrash?: boolean | undefined; recursive?: boolean | undefined } | undefined): Promise<Error | true> { return true; }
}

/**
 * TestFileService with in-memory file storage.
 * Use this when your test needs to write files and read them back.
 */
export class InMemoryTestFileService extends TestFileService {

	private files = new ResourceMap<VSBuffer>();

	override clearTracking(): void {
		super.clearTracking();
		this.files.clear();
	}

	override async readFile(resource: URI, options?: IReadFileOptions | undefined): Promise<IFileContent> {
		if (this.readShouldThrowError) {
			throw this.readShouldThrowError;
		}

		this.lastReadFileUri = resource;
		this.readOperations.push({ resource });

		// Check if we have content in our in-memory store
		const content = this.files.get(resource);
		if (content) {
			return {
				...createFileStat(resource, this.readonly),
				value: content
			};
		}

		return {
			...createFileStat(resource, this.readonly),
			value: VSBuffer.fromString(this.content)
		};
	}

	override async writeFile(resource: URI, bufferOrReadable: VSBuffer | VSBufferReadable, options?: IWriteFileOptions): Promise<IFileStatWithMetadata> {
		await timeout(0);

		if (this.writeShouldThrowError) {
			throw this.writeShouldThrowError;
		}

		let content: VSBuffer;
		if (bufferOrReadable instanceof VSBuffer) {
			content = bufferOrReadable;
		} else {
			content = readableToBuffer(bufferOrReadable);
		}

		// Store in memory and track
		this.files.set(resource, content);
		this.writeOperations.push({ resource, content: content.toString() });

		return createFileStat(resource, this.readonly);
	}

	override async del(resource: URI, _options?: { useTrash?: boolean; recursive?: boolean }): Promise<void> {
		this.files.delete(resource);
		this.notExistsSet.set(resource, true);
	}

	override async exists(resource: URI): Promise<boolean> {
		const inMemory = this.files.has(resource);
		if (inMemory) {
			return true;
		}

		return super.exists(resource);
	}
}

export class TestChatEntitlementService implements IChatEntitlementService {

	_serviceBrand: undefined;

	readonly organisations: undefined;
	readonly isInternal = false;
	readonly sku = undefined;

	readonly onDidChangeQuotaExceeded = Event.None;
	readonly onDidChangeQuotaRemaining = Event.None;
	readonly quotas = {};

	update(token: CancellationToken): Promise<void> {
		throw new Error('Method not implemented.');
	}

	readonly onDidChangeSentiment = Event.None;
	readonly sentimentObs = observableValue({}, {});
	readonly sentiment = {};

	readonly onDidChangeEntitlement = Event.None;
	entitlement: ChatEntitlement = ChatEntitlement.Unknown;
	readonly entitlementObs = observableValue({}, ChatEntitlement.Unknown);

	readonly anonymous = false;
	onDidChangeAnonymous = Event.None;
	readonly anonymousObs = observableValue({}, false);
}

export class TestLifecycleService extends Disposable implements ILifecycleService {

	declare readonly _serviceBrand: undefined;

	usePhases = false;
	_phase!: LifecyclePhase;
	get phase(): LifecyclePhase { return this._phase; }
	set phase(value: LifecyclePhase) {
		this._phase = value;
		if (value === LifecyclePhase.Starting) {
			this.whenStarted.complete();
		} else if (value === LifecyclePhase.Ready) {
			this.whenReady.complete();
		} else if (value === LifecyclePhase.Restored) {
			this.whenRestored.complete();
		} else if (value === LifecyclePhase.Eventually) {
			this.whenEventually.complete();
		}
	}

	private readonly whenStarted = new DeferredPromise<void>();
	private readonly whenReady = new DeferredPromise<void>();
	private readonly whenRestored = new DeferredPromise<void>();
	private readonly whenEventually = new DeferredPromise<void>();
	async when(phase: LifecyclePhase): Promise<void> {
		if (!this.usePhases) {
			return;
		}
		if (phase === LifecyclePhase.Starting) {
			await this.whenStarted.p;
		} else if (phase === LifecyclePhase.Ready) {
			await this.whenReady.p;
		} else if (phase === LifecyclePhase.Restored) {
			await this.whenRestored.p;
		} else if (phase === LifecyclePhase.Eventually) {
			await this.whenEventually.p;
		}
	}

	startupKind!: StartupKind;
	willShutdown = false;

	private readonly _onBeforeShutdown = this._register(new Emitter<InternalBeforeShutdownEvent>());
	get onBeforeShutdown(): Event<InternalBeforeShutdownEvent> { return this._onBeforeShutdown.event; }

	private readonly _onBeforeShutdownError = this._register(new Emitter<BeforeShutdownErrorEvent>());
	get onBeforeShutdownError(): Event<BeforeShutdownErrorEvent> { return this._onBeforeShutdownError.event; }

	private readonly _onShutdownVeto = this._register(new Emitter<void>());
	get onShutdownVeto(): Event<void> { return this._onShutdownVeto.event; }

	private readonly _onWillShutdown = this._register(new Emitter<WillShutdownEvent>());
	get onWillShutdown(): Event<WillShutdownEvent> { return this._onWillShutdown.event; }

	private readonly _onDidShutdown = this._register(new Emitter<void>());
	get onDidShutdown(): Event<void> { return this._onDidShutdown.event; }

	shutdownJoiners: Promise<void>[] = [];

	fireShutdown(reason = ShutdownReason.QUIT): void {
		this.shutdownJoiners = [];

		this._onWillShutdown.fire({
			join: p => {
				this.shutdownJoiners.push(typeof p === 'function' ? p() : p);
			},
			joiners: () => [],
			force: () => { /* No-Op in tests */ },
			token: CancellationToken.None,
			reason
		});
	}

	fireBeforeShutdown(event: InternalBeforeShutdownEvent): void { this._onBeforeShutdown.fire(event); }

	fireWillShutdown(event: WillShutdownEvent): void { this._onWillShutdown.fire(event); }

	async shutdown(): Promise<void> {
		this.fireShutdown();
	}
}
