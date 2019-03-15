/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { ITextSnapshot, IFileStat, IContent, IFileService, IResourceEncodings, IResolveFileOptions, IResolveFileResult, IResolveContentOptions, IStreamContent, IUpdateContentOptions, snapshotToString, ICreateFileOptions, IResourceEncoding } from 'vs/platform/files/common/files';
import { ITextBufferFactory } from 'vs/editor/common/model';
import { createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { keys, ResourceMap } from 'vs/base/common/map';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
// tslint:disable-next-line: import-patterns no-standalone-editor
import { SimpleConfigurationService as StandaloneEditorConfigurationService, SimpleDialogService as StandaloneEditorDialogService, StandaloneKeybindingService, SimpleResourcePropertiesService } from 'vs/editor/standalone/browser/simpleServices';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IDownloadService } from 'vs/platform/download/common/download';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IEnvironmentService, IExtensionHostDebugParams, IDebugParams } from 'vs/platform/environment/common/environment';
import { IExtensionGalleryService, IQueryOptions, IGalleryExtension, InstallOperation, StatisticType, ITranslation, IGalleryExtensionVersion, IExtensionIdentifier, IReportedExtension, IExtensionManagementService, ILocalExtension, IGalleryMetadata, IExtensionTipsService, ExtensionRecommendationReason, IExtensionRecommendation } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IPager } from 'vs/base/common/paging';
import { IExtensionManifest, ExtensionType, ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { NullExtensionService, IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IURLHandler, IURLService } from 'vs/platform/url/common/url';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ITelemetryService, ITelemetryData, ITelemetryInfo } from 'vs/platform/telemetry/common/telemetry';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { AbstractLifecycleService } from 'vs/platform/lifecycle/common/lifecycleService';
import { ILogService, LogLevel, ConsoleLogService } from 'vs/platform/log/common/log';
import { ShutdownReason, ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IMenubarService, IMenubarData } from 'vs/platform/menubar/common/menubar';
import { IProductService } from 'vs/platform/product/common/product';
import { IRemoteAuthorityResolverService, ResolvedAuthority } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { joinPath, isEqualOrParent, isEqual, dirname } from 'vs/base/common/resources';
import { basename } from 'vs/base/common/path';
import { ISearchService, ITextQueryProps, ISearchProgressItem, ISearchComplete, IFileQueryProps, SearchProviderType, ISearchResultProvider, ITextQuery, IFileMatch, QueryType, FileMatch, pathIncludedInQuery } from 'vs/workbench/services/search/common/search';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { coalesce } from 'vs/base/common/arrays';
import { Schemas } from 'vs/base/common/network';
import { editorMatchesToTextSearchResults, addContextToEditorMatches } from 'vs/workbench/services/search/common/searchHelpers';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { InMemoryStorageService, IStorageService } from 'vs/platform/storage/common/storage';
import { ITextMateService, IGrammar as ITextMategrammar } from 'vs/workbench/services/textMate/common/textMateService';
import { LanguageId, TokenizationRegistry } from 'vs/editor/common/modes';
import { IUpdateService, State } from 'vs/platform/update/common/update';
import { IWindowConfiguration, IPath, IPathsToWaitFor, IWindowService, INativeOpenDialogOptions, IEnterWorkspaceResult, IURIToOpen, IMessageBoxResult, IWindowsService } from 'vs/platform/windows/common/windows';
import { IProcessEnvironment, isWindows } from 'vs/base/common/platform';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, IWorkspaceFolderCreationData, isSingleFolderWorkspaceIdentifier, IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { ExportData } from 'vs/base/common/performance';
import { IRecentlyOpened, IRecent } from 'vs/platform/history/common/history';
import { ISerializableCommandAction } from 'vs/platform/actions/common/actions';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { IWorkspaceContextService, Workspace, toWorkspaceFolders, IWorkspaceFolder, WorkbenchState, IWorkspace } from 'vs/platform/workspace/common/workspace';
import { ITextResourcePropertiesService } from 'vs/editor/common/services/resourceConfiguration';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Color, RGBA } from 'vs/base/common/color';

export const workspaceResource = URI.file(isWindows ? 'C:\\simpleWorkspace' : '/simpleWorkspace');

//#region Backup File

export class SimpleBackupFileService implements IBackupFileService {

	_serviceBrand: any;

	private backups: Map<string, ITextSnapshot> = new Map();

	hasBackups(): Promise<boolean> {
		return Promise.resolve(this.backups.size > 0);
	}

	loadBackupResource(resource: URI): Promise<URI | undefined> {
		const backupResource = this.toBackupResource(resource);
		if (this.backups.has(backupResource.toString())) {
			return Promise.resolve(backupResource);
		}

		return Promise.resolve(undefined);
	}

	backupResource(resource: URI, content: ITextSnapshot, versionId?: number): Promise<void> {
		const backupResource = this.toBackupResource(resource);
		this.backups.set(backupResource.toString(), content);

		return Promise.resolve();
	}

	resolveBackupContent(backupResource: URI): Promise<ITextBufferFactory | undefined> {
		const snapshot = this.backups.get(backupResource.toString());
		if (snapshot) {
			return Promise.resolve(createTextBufferFactoryFromSnapshot(snapshot));
		}

		return Promise.resolve(undefined);
	}

	getWorkspaceFileBackups(): Promise<URI[]> {
		return Promise.resolve(keys(this.backups).map(key => URI.parse(key)));
	}

	discardResourceBackup(resource: URI): Promise<void> {
		this.backups.delete(this.toBackupResource(resource).toString());

		return Promise.resolve();
	}

	discardAllWorkspaceBackups(): Promise<void> {
		this.backups.clear();

		return Promise.resolve();
	}

	toBackupResource(resource: URI): URI {
		return resource;
	}
}

registerSingleton(IBackupFileService, SimpleBackupFileService, true);

//#endregion

//#region Broadcast

export const IBroadcastService = createDecorator<IBroadcastService>('broadcastService');

export interface IBroadcast {
	channel: string;
	payload: any;
}

export interface IBroadcastService {
	_serviceBrand: any;

	onBroadcast: Event<IBroadcast>;

	broadcast(b: IBroadcast): void;
}

export class SimpleBroadcastService implements IBroadcastService {

	_serviceBrand: any;

	readonly onBroadcast: Event<IBroadcast> = Event.None;

	broadcast(b: IBroadcast): void { }
}

registerSingleton(IBroadcastService, SimpleBroadcastService, true);

//#endregion

//#region Clipboard

export class SimpleClipboardService implements IClipboardService {

	_serviceBrand: any;

	writeText(text: string, type?: string): void { }

	readText(type?: string): string {
		// @ts-ignore
		return undefined;
	}

	readFindText(): string {
		// @ts-ignore
		return undefined;
	}

	writeFindText(text: string): void { }

	writeResources(resources: URI[]): void { }

	readResources(): URI[] {
		return [];
	}

	hasResources(): boolean {
		return false;
	}
}

registerSingleton(IClipboardService, SimpleClipboardService, true);

//#endregion

//#region Configuration

export class SimpleConfigurationService extends StandaloneEditorConfigurationService { }

registerSingleton(IConfigurationService, SimpleConfigurationService);

//#endregion

//#region Dialog

export class SimpleDialogService extends StandaloneEditorDialogService { }

registerSingleton(IDialogService, SimpleDialogService, true);

//#endregion

//#region Download

export class SimpleDownloadService implements IDownloadService {

	_serviceBrand: any;

	download(uri: URI, to?: string, cancellationToken?: CancellationToken): Promise<string> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}
}

registerSingleton(IDownloadService, SimpleDownloadService, true);

//#endregion

//#region Environment

export class SimpleEnvironmentService implements IEnvironmentService {
	untitledWorkspacesHome: URI;
	extensionTestsLocationURI?: URI;
	_serviceBrand: any;
	args = { _: [] };
	execPath: string;
	cliPath: string;
	appRoot: string = '/nodeless/';
	userHome: string;
	userDataPath: string;
	appNameLong: string;
	appQuality?: string;
	appSettingsHome: string = '/nodeless/settings';
	appSettingsPath: string = '/nodeless/settings/settings.json';
	appKeybindingsPath: string = '/nodeless/settings/keybindings.json';
	settingsSearchBuildId?: number;
	settingsSearchUrl?: string;
	globalStorageHome: string;
	workspaceStorageHome: string;
	backupHome: string;
	backupWorkspacesPath: string;
	workspacesHome: string;
	isExtensionDevelopment: boolean;
	disableExtensions: boolean | string[];
	builtinExtensionsPath: string;
	extensionsPath: string;
	extensionDevelopmentLocationURI?: URI;
	extensionTestsPath?: string;
	debugExtensionHost: IExtensionHostDebugParams;
	debugSearch: IDebugParams;
	logExtensionHostCommunication: boolean;
	isBuilt: boolean;
	wait: boolean;
	status: boolean;
	log?: string;
	logsPath: string = '/nodeless/logs';
	verbose: boolean;
	skipGettingStarted: boolean;
	skipReleaseNotes: boolean;
	skipAddToRecentlyOpened: boolean;
	mainIPCHandle: string;
	sharedIPCHandle: string;
	nodeCachedDataDir?: string;
	installSourcePath: string;
	disableUpdates: boolean;
	disableCrashReporter: boolean;
	driverHandle?: string;
	driverVerbose: boolean;
}

registerSingleton(IEnvironmentService, SimpleEnvironmentService);

//#endregion

//#region Extension Gallery

export class SimpleExtensionGalleryService implements IExtensionGalleryService {

	_serviceBrand: any;

	isEnabled(): boolean {
		return false;
	}

	query(options?: IQueryOptions): Promise<IPager<IGalleryExtension>> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}

	download(extension: IGalleryExtension, operation: InstallOperation): Promise<string> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}

	reportStatistic(publisher: string, name: string, version: string, type: StatisticType): Promise<void> {
		return Promise.resolve(undefined);
	}

	getReadme(extension: IGalleryExtension, token: CancellationToken): Promise<string> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}

	getManifest(extension: IGalleryExtension, token: CancellationToken): Promise<IExtensionManifest> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}

	getChangelog(extension: IGalleryExtension, token: CancellationToken): Promise<string> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}

	getCoreTranslation(extension: IGalleryExtension, languageId: string): Promise<ITranslation> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}

	getAllVersions(extension: IGalleryExtension, compatible: boolean): Promise<IGalleryExtensionVersion[]> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}

	loadAllDependencies(dependencies: IExtensionIdentifier[], token: CancellationToken): Promise<IGalleryExtension[]> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}

	getExtensionsReport(): Promise<IReportedExtension[]> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}

	// @ts-ignore
	getCompatibleExtension(extension: IGalleryExtension): Promise<IGalleryExtension>;
	getCompatibleExtension(id: IExtensionIdentifier, version?: string): Promise<IGalleryExtension>;
	getCompatibleExtension(id: any, version?: any) {
		return Promise.resolve(undefined);
	}
}

registerSingleton(IExtensionGalleryService, SimpleExtensionGalleryService, true);

//#endregion

//#region Extension Management

//#region Extension Tips

export class SimpleExtensionTipsService implements IExtensionTipsService {
	_serviceBrand: any;

	onRecommendationChange = Event.None;

	getAllRecommendationsWithReason(): { [id: string]: { reasonId: ExtensionRecommendationReason; reasonText: string; }; } {
		return Object.create(null);
	}

	getFileBasedRecommendations(): IExtensionRecommendation[] {
		return [];
	}

	getOtherRecommendations(): Promise<IExtensionRecommendation[]> {
		return Promise.resolve([]);
	}

	getWorkspaceRecommendations(): Promise<IExtensionRecommendation[]> {
		return Promise.resolve([]);
	}

	getKeymapRecommendations(): IExtensionRecommendation[] {
		return [];
	}

	toggleIgnoredRecommendation(extensionId: string, shouldIgnore: boolean): void {
	}

	getAllIgnoredRecommendations(): { global: string[]; workspace: string[]; } {
		return Object.create(null);
	}
}

registerSingleton(IExtensionTipsService, SimpleExtensionTipsService, true);

//#endregion

export class SimpleExtensionManagementService implements IExtensionManagementService {

	_serviceBrand: any;

	onInstallExtension = Event.None;
	onDidInstallExtension = Event.None;
	onUninstallExtension = Event.None;
	onDidUninstallExtension = Event.None;

	zip(extension: ILocalExtension): Promise<URI> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}

	unzip(zipLocation: URI, type: ExtensionType): Promise<IExtensionIdentifier> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}

	install(vsix: URI): Promise<IExtensionIdentifier> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}

	installFromGallery(extension: IGalleryExtension): Promise<void> {
		return Promise.resolve(undefined);
	}

	uninstall(extension: ILocalExtension, force?: boolean): Promise<void> {
		return Promise.resolve(undefined);
	}

	reinstallFromGallery(extension: ILocalExtension): Promise<void> {
		return Promise.resolve(undefined);
	}

	getInstalled(type?: ExtensionType): Promise<ILocalExtension[]> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}

	getExtensionsReport(): Promise<IReportedExtension[]> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}

	updateMetadata(local: ILocalExtension, metadata: IGalleryMetadata): Promise<ILocalExtension> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}
}

registerSingleton(IExtensionManagementService, SimpleExtensionManagementService);

//#endregion

//#region Extensions

export class SimpleExtensionService extends NullExtensionService { }

registerSingleton(IExtensionService, SimpleExtensionService);

//#endregion

//#region Extension URL Handler

export const IExtensionUrlHandler = createDecorator<IExtensionUrlHandler>('inactiveExtensionUrlHandler');

export interface IExtensionUrlHandler {
	readonly _serviceBrand: any;
	registerExtensionHandler(extensionId: ExtensionIdentifier, handler: IURLHandler): void;
	unregisterExtensionHandler(extensionId: ExtensionIdentifier): void;
}

export class SimpleExtensionURLHandler implements IExtensionUrlHandler {

	_serviceBrand: any;

	registerExtensionHandler(extensionId: ExtensionIdentifier, handler: IURLHandler): void { }

	unregisterExtensionHandler(extensionId: ExtensionIdentifier): void { }
}

registerSingleton(IExtensionUrlHandler, SimpleExtensionURLHandler, true);

//#endregion

//#region Keybinding

export class SimpleKeybindingService extends StandaloneKeybindingService {
	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService,
		@ITelemetryService telemetryService: ITelemetryService,
		@INotificationService notificationService: INotificationService,
	) {
		super(contextKeyService, commandService, telemetryService, notificationService, window.document.body);
	}
}

registerSingleton(IKeybindingService, SimpleKeybindingService);

//#endregion

//#region Lifecycle

export class SimpleLifecycleService extends AbstractLifecycleService {

	_serviceBrand: any;

	constructor(
		@ILogService readonly logService: ILogService
	) {
		super(logService);

		this.registerListeners();
	}

	private registerListeners(): void {
		window.onbeforeunload = () => this.beforeUnload();
	}

	private beforeUnload(): string {

		// Before Shutdown
		this._onBeforeShutdown.fire({
			veto(value) {
				if (value === true) {
					console.warn(new Error('Preventing onBeforeUnload currently not supported'));
				} else if (value instanceof Promise) {
					console.warn(new Error('Long running onBeforeShutdown currently not supported'));
				}
			},
			reason: ShutdownReason.QUIT
		});

		// Will Shutdown
		this._onWillShutdown.fire({
			join() {
				console.warn(new Error('Long running onWillShutdown currently not supported'));
			},
			reason: ShutdownReason.QUIT
		});

		// @ts-ignore
		return null;
	}
}

registerSingleton(ILifecycleService, SimpleLifecycleService);

//#endregion

//#region Log

export class SimpleLogService extends ConsoleLogService { }

//#endregion

//#region Menu Bar

export class SimpleMenubarService implements IMenubarService {

	_serviceBrand: any;

	updateMenubar(windowId: number, menuData: IMenubarData): Promise<void> {
		return Promise.resolve(undefined);
	}
}

registerSingleton(IMenubarService, SimpleMenubarService);

//#endregion

//#region Multi Extension Management

export class SimpleMultiExtensionsManagementService implements IExtensionManagementService {

	_serviceBrand: any;

	onInstallExtension = Event.None;
	onDidInstallExtension = Event.None;
	onUninstallExtension = Event.None;
	onDidUninstallExtension = Event.None;

	zip(extension: ILocalExtension): Promise<URI> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}

	unzip(zipLocation: URI, type: ExtensionType): Promise<IExtensionIdentifier> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}

	install(vsix: URI): Promise<IExtensionIdentifier> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}

	installFromGallery(extension: IGalleryExtension): Promise<void> {
		return Promise.resolve(undefined);
	}

	uninstall(extension: ILocalExtension, force?: boolean): Promise<void> {
		return Promise.resolve(undefined);
	}

	reinstallFromGallery(extension: ILocalExtension): Promise<void> {
		return Promise.resolve(undefined);
	}

	getInstalled(type?: ExtensionType): Promise<ILocalExtension[]> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}

	getExtensionsReport(): Promise<IReportedExtension[]> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}

	updateMetadata(local: ILocalExtension, metadata: IGalleryMetadata): Promise<ILocalExtension> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}
}

//#endregion

//#region Product

export class SimpleProductService implements IProductService {

	_serviceBrand: any;

	version?: string;
	commit?: string;

	enableTelemetry: boolean = false;
}

registerSingleton(IProductService, SimpleProductService, true);

//#endregion

//#region Remote Agent

export const IRemoteAgentService = createDecorator<IRemoteAgentService>('remoteAgentService');

export interface IRemoteAgentService {
	_serviceBrand: any;

	getConnection(): object;
}

export class SimpleRemoteAgentService implements IRemoteAgentService {

	_serviceBrand: any;

	getConnection(): object {
		// @ts-ignore
		return undefined;
	}
}

registerSingleton(IRemoteAgentService, SimpleRemoteAgentService);

//#endregion

//#region Remote Authority Resolver

export class SimpleRemoteAuthorityResolverService implements IRemoteAuthorityResolverService {

	_serviceBrand: any;

	resolveAuthority(authority: string): Promise<ResolvedAuthority> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}

	setResolvedAuthority(resolvedAuthority: ResolvedAuthority): void { }

	setResolvedAuthorityError(authority: string, err: any): void { }
}

registerSingleton(IRemoteAuthorityResolverService, SimpleRemoteAuthorityResolverService, true);

//#endregion

//#region File Servie

const fileMap: ResourceMap<IFileStat> = new ResourceMap();
const contentMap: ResourceMap<IContent> = new ResourceMap();
initFakeFileSystem();

export class SimpleRemoteFileService implements IFileService {

	_serviceBrand: any;

	encoding: IResourceEncodings;

	readonly onFileChanges = Event.None;
	readonly onAfterOperation = Event.None;
	readonly onDidChangeFileSystemProviderRegistrations = Event.None;

	resolveFile(resource: URI, options?: IResolveFileOptions): Promise<IFileStat> {
		// @ts-ignore
		return Promise.resolve(fileMap.get(resource));
	}

	resolveFiles(toResolve: { resource: URI, options?: IResolveFileOptions }[]): Promise<IResolveFileResult[]> {
		return Promise.all(toResolve.map(resourceAndOption => this.resolveFile(resourceAndOption.resource, resourceAndOption.options))).then(stats => stats.map(stat => ({ stat, success: true })));
	}

	existsFile(resource: URI): Promise<boolean> {
		return Promise.resolve(fileMap.has(resource));
	}

	resolveContent(resource: URI, _options?: IResolveContentOptions): Promise<IContent> {
		// @ts-ignore
		return Promise.resolve(contentMap.get(resource));
	}

	resolveStreamContent(resource: URI, _options?: IResolveContentOptions): Promise<IStreamContent> {
		return Promise.resolve(contentMap.get(resource)).then(content => {
			return {
				// @ts-ignore
				resource: content.resource,
				value: {
					on: (event: string, callback: Function): void => {
						if (event === 'data') {
							// @ts-ignore
							callback(content.value);
						}

						if (event === 'end') {
							callback();
						}
					}
				},
				// @ts-ignore
				etag: content.etag,
				// @ts-ignore
				encoding: content.encoding,
				// @ts-ignore
				mtime: content.mtime,
				// @ts-ignore
				name: content.name
			};
		});
	}

	updateContent(resource: URI, value: string | ITextSnapshot, _options?: IUpdateContentOptions): Promise<IFileStat> {
		// @ts-ignore
		return Promise.resolve(fileMap.get(resource)).then(file => {
			const content = contentMap.get(resource);

			if (typeof value === 'string') {
				// @ts-ignore
				content.value = value;
			} else {
				// @ts-ignore
				content.value = snapshotToString(value);
			}

			return file;
		});
	}

	moveFile(_source: URI, _target: URI, _overwrite?: boolean): Promise<IFileStat> { return Promise.resolve(null!); }

	copyFile(_source: URI, _target: URI, _overwrite?: boolean): Promise<any> {
		const parent = fileMap.get(dirname(_target));
		if (!parent) {
			return Promise.resolve(undefined);
		}

		return this.resolveContent(_source).then(content => {
			return Promise.resolve(createFile(parent, basename(_target.path), content.value));
		});
	}

	createFile(_resource: URI, _content?: string, _options?: ICreateFileOptions): Promise<IFileStat> {
		const parent = fileMap.get(dirname(_resource));
		if (!parent) {
			return Promise.reject(new Error(`Unable to create file in ${dirname(_resource).path}`));
		}

		return Promise.resolve(createFile(parent, basename(_resource.path)));
	}

	readFolder(_resource: URI) { return Promise.resolve([]); }

	createFolder(_resource: URI): Promise<IFileStat> {
		const parent = fileMap.get(dirname(_resource));
		if (!parent) {
			return Promise.reject(new Error(`Unable to create folder in ${dirname(_resource).path}`));
		}

		return Promise.resolve(createFolder(parent, basename(_resource.path)));
	}

	registerProvider(_scheme: string, _provider) { return { dispose() { } }; }

	activateProvider(_scheme: string): Promise<void> { return Promise.resolve(undefined); }

	canHandleResource(resource: URI): boolean { return resource.scheme === 'file'; }

	del(_resource: URI, _options?: { useTrash?: boolean, recursive?: boolean }): Promise<void> { return Promise.resolve(); }

	watchFileChanges(_resource: URI): void { }

	unwatchFileChanges(_resource: URI): void { }

	getWriteEncoding(_resource: URI): IResourceEncoding { return { encoding: 'utf8', hasBOM: false }; }

	dispose(): void { }
}

function createFile(parent: IFileStat, name: string, content: string = ''): IFileStat {
	const file: IFileStat = {
		resource: joinPath(parent.resource, name),
		etag: Date.now().toString(),
		mtime: Date.now(),
		isDirectory: false,
		name
	};

	// @ts-ignore
	parent.children.push(file);

	fileMap.set(file.resource, file);

	contentMap.set(file.resource, {
		resource: joinPath(parent.resource, name),
		etag: Date.now().toString(),
		mtime: Date.now(),
		value: content,
		encoding: 'utf8',
		name
	} as IContent);

	return file;
}

function createFolder(parent: IFileStat, name: string): IFileStat {
	const folder: IFileStat = {
		resource: joinPath(parent.resource, name),
		etag: Date.now().toString(),
		mtime: Date.now(),
		isDirectory: true,
		name,
		children: []
	};

	// @ts-ignore
	parent.children.push(folder);

	fileMap.set(folder.resource, folder);

	return folder;
}

function initFakeFileSystem(): void {

	const root: IFileStat = {
		resource: workspaceResource,
		etag: Date.now().toString(),
		mtime: Date.now(),
		isDirectory: true,
		name: basename(workspaceResource.fsPath),
		children: []
	};

	fileMap.set(root.resource, root);

	createFile(root, '.gitignore', `out
node_modules
.vscode-test/
*.vsix
`);
	createFile(root, '.vscodeignore', `.vscode/**
.vscode-test/**
out/test/**
src/**
.gitignore
vsc-extension-quickstart.md
**/tsconfig.json
**/tslint.json
**/*.map
**/*.ts`);
	createFile(root, 'CHANGELOG.md', `# Change Log
All notable changes to the "test-ts" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]
- Initial release`);
	createFile(root, 'package.json', `{
	"name": "test-ts",
	"displayName": "test-ts",
	"description": "",
	"version": "0.0.1",
	"engines": {
		"vscode": "^1.31.0"
	},
	"categories": [
		"Other"
	],
	"activationEvents": [
		"onCommand:extension.helloWorld"
	],
	"main": "./out/extension.js",
	"contributes": {
		"commands": [
			{
				"command": "extension.helloWorld",
				"title": "Hello World"
			}
		]
	},
	"scripts": {
		"vscode:prepublish": "npm run compile",
		"compile": "tsc -p ./",
		"watch": "tsc -watch -p ./",
		"postinstall": "node ./node_modules/vscode/bin/install",
		"test": "npm run compile && node ./node_modules/vscode/bin/test"
	},
	"devDependencies": {
		"typescript": "^3.3.1",
		"vscode": "^1.1.28",
		"tslint": "^5.12.1",
		"@types/node": "^8.10.25",
		"@types/mocha": "^2.2.42"
	}
}
`);
	createFile(root, 'tsconfig.json', `{
	"compilerOptions": {
		"module": "commonjs",
		"target": "es6",
		"outDir": "out",
		"lib": [
			"es6"
		],
		"sourceMap": true,
		"rootDir": "src",
		"strict": true   /* enable all strict type-checking options */
		/* Additional Checks */
		// "noImplicitReturns": true, /* Report error when not all code paths in function return a value. */
		// "noFallthroughCasesInSwitch": true, /* Report errors for fallthrough cases in switch statement. */
		// "noUnusedParameters": true,  /* Report errors on unused parameters. */
	},
	"exclude": [
		"node_modules",
		".vscode-test"
	]
}
`);
	createFile(root, 'tslint.json', `{
	"rules": {
		"no-string-throw": true,
		"no-unused-expression": true,
		"no-duplicate-variable": true,
		"curly": true,
		"class-name": true,
		"semicolon": [
			true,
			"always"
		],
		"triple-equals": true
	},
	"defaultSeverity": "warning"
}
`);

	const src = createFolder(root, 'src');
	createFile(src, 'extension.ts', `// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
		console.log('Congratulations, your extension "test-ts" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('extension.helloWorld', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World!');
	});

	context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
`);

	const test = createFolder(src, 'test');

	createFile(test, 'extension.test.ts', `//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
// import * as vscode from 'vscode';
// import * as myExtension from '../extension';

// Defines a Mocha test suite to group tests of similar kind together
suite("Extension Tests", function () {

	// Defines a Mocha unit test
	test("Something 1", function() {
		assert.equal(-1, [1, 2, 3].indexOf(5));
		assert.equal(-1, [1, 2, 3].indexOf(0));
	});
});`);

	createFile(test, 'index.ts', `//
// PLEASE DO NOT MODIFY / DELETE UNLESS YOU KNOW WHAT YOU ARE DOING
//
// This file is providing the test runner to use when running extension tests.
// By default the test runner in use is Mocha based.
//
// You can provide your own test runner if you want to override it by exporting
// a function run(testRoot: string, clb: (error:Error) => void) that the extension
// host can call to run the tests. The test runner is expected to use console.log
// to report the results back to the caller. When the tests are finished, return
// a possible error to the callback or null if none.

import * as testRunner from 'vscode/lib/testrunner';

// You can directly control Mocha options by configuring the test runner below
// See https://github.com/mochajs/mocha/wiki/Using-mocha-programmatically#set-options
// for more info
testRunner.configure({
	ui: 'tdd', 		// the TDD UI is being used in extension.test.ts (suite, test, etc.)
	useColors: true // colored output from test results
});

module.exports = testRunner;`);
}

registerSingleton(IFileService, SimpleRemoteFileService);

//#endregion

//#region Request

export const IRequestService = createDecorator<IRequestService>('requestService');

export interface IRequestService {
	_serviceBrand: any;

	request(options, token: CancellationToken): Promise<object>;
}

export class SimpleRequestService implements IRequestService {

	_serviceBrand: any;

	request(options, token: CancellationToken): Promise<object> {
		return Promise.resolve(Object.create(null));
	}
}

//#endregion

//#region Search

export class SimpleSearchService implements ISearchService {

	_serviceBrand: any;

	constructor(
		@IModelService private modelService: IModelService,
		@IEditorService private editorService: IEditorService,
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService
	) {

	}

	textSearch(query: ITextQueryProps<URI>, token?: CancellationToken, onProgress?: (result: ISearchProgressItem) => void): Promise<ISearchComplete> {
		// Get local results from dirty/untitled
		const localResults = this.getLocalResults(query);

		if (onProgress) {
			coalesce(localResults.values()).forEach(onProgress);
		}

		// @ts-ignore
		return Promise.resolve(undefined);
	}

	fileSearch(query: IFileQueryProps<URI>, token?: CancellationToken): Promise<ISearchComplete> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}

	clearCache(cacheKey: string): Promise<void> {
		return Promise.resolve(undefined);
	}

	registerSearchResultProvider(scheme: string, type: SearchProviderType, provider: ISearchResultProvider): IDisposable {
		return Disposable.None;
	}

	private getLocalResults(query: ITextQuery): ResourceMap<IFileMatch> {
		const localResults = new ResourceMap<IFileMatch>();

		if (query.type === QueryType.Text) {
			const models = this.modelService.getModels();
			models.forEach((model) => {
				const resource = model.uri;
				if (!resource) {
					return;
				}

				if (!this.editorService.isOpen({ resource })) {
					return;
				}

				// Support untitled files
				if (resource.scheme === Schemas.untitled) {
					if (!this.untitledEditorService.exists(resource)) {
						return;
					}
				}

				// Don't support other resource schemes than files for now
				// todo@remote
				// why is that? we should search for resources from other
				// schemes
				else if (resource.scheme !== Schemas.file) {
					return;
				}

				if (!this.matches(resource, query)) {
					return; // respect user filters
				}

				// Use editor API to find matches
				// @ts-ignore
				const matches = model.findMatches(query.contentPattern.pattern, false, query.contentPattern.isRegExp, query.contentPattern.isCaseSensitive, query.contentPattern.isWordMatch ? query.contentPattern.wordSeparators : null, false, query.maxResults);
				if (matches.length) {
					const fileMatch = new FileMatch(resource);
					localResults.set(resource, fileMatch);

					const textSearchResults = editorMatchesToTextSearchResults(matches, model, query.previewOptions);
					fileMatch.results = addContextToEditorMatches(textSearchResults, model, query);
				} else {
					// @ts-ignore
					localResults.set(resource, null);
				}
			});
		}

		return localResults;
	}

	private matches(resource: URI, query: ITextQuery): boolean {
		// includes
		if (query.includePattern) {
			if (resource.scheme !== Schemas.file) {
				return false; // if we match on file patterns, we have to ignore non file resources
			}
		}

		return pathIncludedInQuery(query, resource.fsPath);
	}
}

registerSingleton(ISearchService, SimpleSearchService, true);

//#endregion

//#region Storage

export class SimpleStorageService extends InMemoryStorageService { }

registerSingleton(IStorageService, SimpleStorageService);

//#endregion

//#region Telemetry

export class SimpleTelemetryService implements ITelemetryService {

	_serviceBrand: undefined;

	isOptedIn: true;

	publicLog(eventName: string, data?: ITelemetryData) {
		return Promise.resolve(undefined);
	}

	getTelemetryInfo(): Promise<ITelemetryInfo> {
		return Promise.resolve({
			instanceId: 'someValue.instanceId',
			sessionId: 'someValue.sessionId',
			machineId: 'someValue.machineId'
		});
	}
}

registerSingleton(ITelemetryService, SimpleTelemetryService);

//#endregion

//#region Textmate

TokenizationRegistry.setColorMap([<any>null, new Color(new RGBA(212, 212, 212, 1)), new Color(new RGBA(30, 30, 30, 1))]);

export class SimpleTextMateService implements ITextMateService {

	_serviceBrand: any;

	readonly onDidEncounterLanguage: Event<LanguageId> = Event.None;

	createGrammar(modeId: string): Promise<ITextMategrammar> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}
}

registerSingleton(ITextMateService, SimpleTextMateService, true);

//#endregion

//#region Text Resource Properties

export class SimpleTextResourcePropertiesService extends SimpleResourcePropertiesService { }

registerSingleton(ITextResourcePropertiesService, SimpleTextResourcePropertiesService);

//#endregion

//#region Update

export class SimpleUpdateService implements IUpdateService {

	_serviceBrand: any;

	onStateChange = Event.None;
	state: State;

	checkForUpdates(context: any): Promise<void> {
		return Promise.resolve(undefined);
	}

	downloadUpdate(): Promise<void> {
		return Promise.resolve(undefined);
	}

	applyUpdate(): Promise<void> {
		return Promise.resolve(undefined);
	}

	quitAndInstall(): Promise<void> {
		return Promise.resolve(undefined);
	}

	isLatestVersion(): Promise<boolean> {
		return Promise.resolve(true);
	}
}

registerSingleton(IUpdateService, SimpleUpdateService);

//#endregion

//#region URL

export class SimpleURLService implements IURLService {
	_serviceBrand: any;

	open(url: URI): Promise<boolean> {
		return Promise.resolve(false);
	}

	registerHandler(handler: IURLHandler): IDisposable {
		return Disposable.None;
	}
}

registerSingleton(IURLService, SimpleURLService);

//#endregion

//#region Window

export class SimpleWindowConfiguration implements IWindowConfiguration {
	_: any[];
	machineId: string;
	windowId: number;
	logLevel: LogLevel;

	mainPid: number;

	appRoot: string;
	execPath: string;
	isInitialStartup?: boolean;

	userEnv: IProcessEnvironment;
	nodeCachedDataDir?: string;

	backupPath?: string;

	workspace?: IWorkspaceIdentifier;
	folderUri?: ISingleFolderWorkspaceIdentifier;

	remoteAuthority?: string;

	zoomLevel?: number;
	fullscreen?: boolean;
	maximized?: boolean;
	highContrast?: boolean;
	frameless?: boolean;
	accessibilitySupport?: boolean;
	partsSplashPath?: string;

	perfStartTime?: number;
	perfAppReady?: number;
	perfWindowLoadTime?: number;
	perfEntries: ExportData;

	filesToOpen?: IPath[];
	filesToCreate?: IPath[];
	filesToDiff?: IPath[];
	filesToWait?: IPathsToWaitFor;
	termProgram?: string;
}

export class SimpleWindowService implements IWindowService {

	_serviceBrand: any;

	readonly onDidChangeFocus: Event<boolean> = Event.None;
	readonly onDidChangeMaximize: Event<boolean> = Event.None;

	hasFocus = true;

	private configuration: IWindowConfiguration = new SimpleWindowConfiguration();

	isFocused(): Promise<boolean> {
		return Promise.resolve(false);
	}

	isMaximized(): Promise<boolean> {
		return Promise.resolve(false);
	}

	getConfiguration(): IWindowConfiguration {
		return this.configuration;
	}

	getCurrentWindowId(): number {
		return 0;
	}

	pickFileFolderAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	pickFileAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	pickFolderAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	pickWorkspaceAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	reloadWindow(): Promise<void> {
		return Promise.resolve();
	}

	openDevTools(): Promise<void> {
		return Promise.resolve();
	}

	toggleDevTools(): Promise<void> {
		return Promise.resolve();
	}

	closeWorkspace(): Promise<void> {
		return Promise.resolve();
	}

	enterWorkspace(_path: URI): Promise<IEnterWorkspaceResult | undefined> {
		return Promise.resolve(undefined);
	}

	toggleFullScreen(): Promise<void> {
		return Promise.resolve();
	}

	setRepresentedFilename(_fileName: string): Promise<void> {
		return Promise.resolve();
	}

	getRecentlyOpened(): Promise<IRecentlyOpened> {
		return Promise.resolve({
			workspaces: [],
			files: []
		});
	}

	focusWindow(): Promise<void> {
		return Promise.resolve();
	}

	maximizeWindow(): Promise<void> {
		return Promise.resolve();
	}

	unmaximizeWindow(): Promise<void> {
		return Promise.resolve();
	}

	minimizeWindow(): Promise<void> {
		return Promise.resolve();
	}

	openWindow(_uris: IURIToOpen[], _options?: { forceNewWindow?: boolean, forceReuseWindow?: boolean, forceOpenWorkspaceAsFile?: boolean }): Promise<void> {
		return Promise.resolve();
	}

	closeWindow(): Promise<void> {
		return Promise.resolve();
	}

	setDocumentEdited(_flag: boolean): Promise<void> {
		return Promise.resolve();
	}

	onWindowTitleDoubleClick(): Promise<void> {
		return Promise.resolve();
	}

	show(): Promise<void> {
		return Promise.resolve();
	}

	showMessageBox(_options: Electron.MessageBoxOptions): Promise<IMessageBoxResult> {
		return Promise.resolve({ button: 0 });
	}

	showSaveDialog(_options: Electron.SaveDialogOptions): Promise<string> {
		throw new Error('not implemented');
	}

	showOpenDialog(_options: Electron.OpenDialogOptions): Promise<string[]> {
		throw new Error('not implemented');
	}

	updateTouchBar(_items: ISerializableCommandAction[][]): Promise<void> {
		return Promise.resolve();
	}

	resolveProxy(url: string): Promise<string | undefined> {
		return Promise.resolve(undefined);
	}
}

registerSingleton(IWindowService, SimpleWindowService);

//#endregion

//#region Window

export class SimpleWindowsService implements IWindowsService {
	_serviceBrand: any;

	windowCount = 1;

	readonly onWindowOpen: Event<number> = Event.None;
	readonly onWindowFocus: Event<number> = Event.None;
	readonly onWindowBlur: Event<number> = Event.None;
	readonly onWindowMaximize: Event<number> = Event.None;
	readonly onWindowUnmaximize: Event<number> = Event.None;
	readonly onRecentlyOpenedChange: Event<void> = Event.None;

	isFocused(_windowId: number): Promise<boolean> {
		return Promise.resolve(false);
	}

	pickFileFolderAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	pickFileAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	pickFolderAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	pickWorkspaceAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	reloadWindow(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	openDevTools(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	toggleDevTools(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	closeWorkspace(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	enterWorkspace(_windowId: number, _path: URI): Promise<IEnterWorkspaceResult | undefined> {
		return Promise.resolve(undefined);
	}

	toggleFullScreen(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	setRepresentedFilename(_windowId: number, _fileName: string): Promise<void> {
		return Promise.resolve();
	}

	addRecentlyOpened(recents: IRecent[]): Promise<void> {
		return Promise.resolve();
	}

	removeFromRecentlyOpened(_paths: URI[]): Promise<void> {
		return Promise.resolve();
	}

	clearRecentlyOpened(): Promise<void> {
		return Promise.resolve();
	}

	getRecentlyOpened(_windowId: number): Promise<IRecentlyOpened> {
		return Promise.resolve({
			workspaces: [],
			files: []
		});
	}

	focusWindow(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	closeWindow(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	isMaximized(_windowId: number): Promise<boolean> {
		return Promise.resolve(false);
	}

	maximizeWindow(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	minimizeWindow(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	unmaximizeWindow(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	onWindowTitleDoubleClick(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	setDocumentEdited(_windowId: number, _flag: boolean): Promise<void> {
		return Promise.resolve();
	}

	quit(): Promise<void> {
		return Promise.resolve();
	}

	relaunch(_options: { addArgs?: string[], removeArgs?: string[] }): Promise<void> {
		return Promise.resolve();
	}

	whenSharedProcessReady(): Promise<void> {
		return Promise.resolve();
	}

	toggleSharedProcess(): Promise<void> {
		return Promise.resolve();
	}

	// Global methods
	openWindow(_windowId: number, _uris: IURIToOpen[], _options?: { forceNewWindow?: boolean, forceReuseWindow?: boolean, forceOpenWorkspaceAsFile?: boolean }): Promise<void> {
		return Promise.resolve();
	}

	openNewWindow(): Promise<void> {
		return Promise.resolve();
	}

	showWindow(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	getWindows(): Promise<{ id: number; workspace?: IWorkspaceIdentifier; folderUri?: ISingleFolderWorkspaceIdentifier; title: string; filename?: string; }[]> {
		return Promise.resolve([]);
	}

	getWindowCount(): Promise<number> {
		return Promise.resolve(this.windowCount);
	}

	log(_severity: string, ..._messages: string[]): Promise<void> {
		return Promise.resolve();
	}

	showItemInFolder(_path: URI): Promise<void> {
		return Promise.resolve();
	}

	newWindowTab(): Promise<void> {
		return Promise.resolve();
	}

	showPreviousWindowTab(): Promise<void> {
		return Promise.resolve();
	}

	showNextWindowTab(): Promise<void> {
		return Promise.resolve();
	}

	moveWindowTabToNewWindow(): Promise<void> {
		return Promise.resolve();
	}

	mergeAllWindowTabs(): Promise<void> {
		return Promise.resolve();
	}

	toggleWindowTabsBar(): Promise<void> {
		return Promise.resolve();
	}

	updateTouchBar(_windowId: number, _items: ISerializableCommandAction[][]): Promise<void> {
		return Promise.resolve();
	}

	getActiveWindowId(): Promise<number | undefined> {
		return Promise.resolve(undefined);
	}

	// This needs to be handled from browser process to prevent
	// foreground ordering issues on Windows
	openExternal(_url: string): Promise<boolean> {
		return Promise.resolve(true);
	}

	// TODO: this is a bit backwards
	startCrashReporter(_config: Electron.CrashReporterStartOptions): Promise<void> {
		return Promise.resolve();
	}

	showMessageBox(_windowId: number, _options: Electron.MessageBoxOptions): Promise<IMessageBoxResult> {
		throw new Error('not implemented');
	}

	showSaveDialog(_windowId: number, _options: Electron.SaveDialogOptions): Promise<string> {
		throw new Error('not implemented');
	}

	showOpenDialog(_windowId: number, _options: Electron.OpenDialogOptions): Promise<string[]> {
		throw new Error('not implemented');
	}

	openAboutDialog(): Promise<void> {
		return Promise.resolve();
	}

	resolveProxy(windowId: number, url: string): Promise<string | undefined> {
		return Promise.resolve(undefined);
	}
}

registerSingleton(IWindowsService, SimpleWindowsService);

//#endregion

//#region Workspace Editing

export class SimpleWorkspaceEditingService implements IWorkspaceEditingService {

	_serviceBrand: any;

	addFolders(folders: IWorkspaceFolderCreationData[], donotNotifyError?: boolean): Promise<void> {
		return Promise.resolve(undefined);
	}

	removeFolders(folders: URI[], donotNotifyError?: boolean): Promise<void> {
		return Promise.resolve(undefined);
	}

	updateFolders(index: number, deleteCount?: number, foldersToAdd?: IWorkspaceFolderCreationData[], donotNotifyError?: boolean): Promise<void> {
		return Promise.resolve(undefined);
	}

	enterWorkspace(path: URI): Promise<void> {
		return Promise.resolve(undefined);
	}

	createAndEnterWorkspace(folders: IWorkspaceFolderCreationData[], path?: URI): Promise<void> {
		return Promise.resolve(undefined);
	}

	saveAndEnterWorkspace(path: URI): Promise<void> {
		return Promise.resolve(undefined);
	}

	copyWorkspaceSettings(toWorkspace: IWorkspaceIdentifier): Promise<void> {
		return Promise.resolve(undefined);
	}

	pickNewWorkspacePath(): Promise<URI> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}
}

registerSingleton(IWorkspaceEditingService, SimpleWorkspaceEditingService, true);

//#endregion

//#region Workspace

export class SimpleWorkspaceService implements IWorkspaceContextService {
	_serviceBrand: any;

	private workspace: Workspace;

	readonly onDidChangeWorkspaceName = Event.None;
	readonly onDidChangeWorkspaceFolders = Event.None;
	readonly onDidChangeWorkbenchState = Event.None;

	constructor() {
		this.workspace = new Workspace(
			workspaceResource.toString(),
			toWorkspaceFolders([{ path: workspaceResource.fsPath }])
		);
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

	isInsideWorkspace(resource: URI): boolean {
		if (resource && this.workspace) {
			return isEqualOrParent(resource, this.workspace.folders[0].uri);
		}

		return false;
	}

	isCurrentWorkspace(workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): boolean {
		return isSingleFolderWorkspaceIdentifier(workspaceIdentifier) && isEqual(this.workspace.folders[0].uri, workspaceIdentifier);
	}
}

registerSingleton(IWorkspaceContextService, SimpleWorkspaceService);

//#endregion

//#region Workspaces

export class SimpleWorkspacesService implements IWorkspacesService {

	_serviceBrand: any;

	createUntitledWorkspace(folders?: IWorkspaceFolderCreationData[]): Promise<IWorkspaceIdentifier> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}

	deleteUntitledWorkspace(workspace: IWorkspaceIdentifier): Promise<void> {
		return Promise.resolve(undefined);
	}

	getWorkspaceIdentifier(workspacePath: URI): Promise<IWorkspaceIdentifier> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}
}

registerSingleton(IWorkspacesService, SimpleWorkspacesService);

//#endregion