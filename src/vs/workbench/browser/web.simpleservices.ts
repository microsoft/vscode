/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IBackupFileService, IResolvedBackup } from 'vs/workbench/services/backup/common/backup';
import { ITextSnapshot } from 'vs/editor/common/model';
import { createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { keys, ResourceMap } from 'vs/base/common/map';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Event, Emitter } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
// tslint:disable-next-line: import-patterns no-standalone-editor
import { StandaloneKeybindingService, SimpleResourcePropertiesService } from 'vs/editor/standalone/browser/simpleServices';
import { IDownloadService } from 'vs/platform/download/common/download';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IExtensionHostDebugParams, IDebugParams } from 'vs/platform/environment/common/environment';
import { IExtensionGalleryService, IQueryOptions, IGalleryExtension, InstallOperation, StatisticType, ITranslation, IGalleryExtensionVersion, IExtensionIdentifier, IReportedExtension, IExtensionManagementService, ILocalExtension, IGalleryMetadata, IExtensionTipsService, ExtensionRecommendationReason, IExtensionRecommendation, IExtensionEnablementService, EnablementState } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IPager } from 'vs/base/common/paging';
import { IExtensionManifest, ExtensionType, ExtensionIdentifier, IExtension } from 'vs/platform/extensions/common/extensions';
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
import { isEqualOrParent, isEqual } from 'vs/base/common/resources';
import { ISearchService, ITextQueryProps, ISearchProgressItem, ISearchComplete, IFileQueryProps, SearchProviderType, ISearchResultProvider, ITextQuery, IFileMatch, QueryType, FileMatch, pathIncludedInQuery } from 'vs/workbench/services/search/common/search';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { coalesce } from 'vs/base/common/arrays';
import { Schemas } from 'vs/base/common/network';
import { editorMatchesToTextSearchResults, addContextToEditorMatches } from 'vs/workbench/services/search/common/searchHelpers';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { InMemoryStorageService, IStorageService } from 'vs/platform/storage/common/storage';
import { IUpdateService, State } from 'vs/platform/update/common/update';
import { IWindowConfiguration, IPath, IPathsToWaitFor, IWindowService, INativeOpenDialogOptions, IEnterWorkspaceResult, IURIToOpen, IMessageBoxResult, IWindowsService, IOpenSettings } from 'vs/platform/windows/common/windows';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, IWorkspaceFolderCreationData, isSingleFolderWorkspaceIdentifier, IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { ExportData } from 'vs/base/common/performance';
import { IRecentlyOpened, IRecent } from 'vs/platform/history/common/history';
import { ISerializableCommandAction } from 'vs/platform/actions/common/actions';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { IWorkspaceContextService, Workspace, toWorkspaceFolder, IWorkspaceFolder, WorkbenchState, IWorkspace } from 'vs/platform/workspace/common/workspace';
import { ITextResourcePropertiesService } from 'vs/editor/common/services/resourceConfiguration';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IConfigurationService, IConfigurationChangeEvent, IConfigurationData, IConfigurationOverrides, isConfigurationOverrides, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { ITunnelService } from 'vs/platform/remote/common/tunnel';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IFileService } from 'vs/platform/files/common/files';
import { IReloadSessionEvent, IExtensionHostDebugService, ICloseSessionEvent, IAttachSessionEvent, ILogToSessionEvent, ITerminateSessionEvent } from 'vs/workbench/services/extensions/common/extensionHostDebug';
import { IRemoteConsoleLog } from 'vs/base/common/console';
// tslint:disable-next-line: import-patterns
import { State as DebugState, IDebugService, IDebugSession, IConfigurationManager, IStackFrame, IThread, IViewModel, IExpression, IFunctionBreakpoint } from 'vs/workbench/contrib/debug/common/debug';
// tslint:disable-next-line: import-patterns
import { IExtensionsWorkbenchService, IExtension as IExtension2 } from 'vs/workbench/contrib/extensions/common/extensions';
// tslint:disable-next-line: import-patterns
import { ITerminalService, ITerminalConfigHelper, ITerminalTab, ITerminalInstance, ITerminalProcessExtHostRequest } from 'vs/workbench/contrib/terminal/common/terminal';
// tslint:disable-next-line: import-patterns
import { ITaskService } from 'vs/workbench/contrib/tasks/common/taskService';
// tslint:disable-next-line: import-patterns
import { TaskEvent } from 'vs/workbench/contrib/tasks/common/tasks';
// tslint:disable-next-line: import-patterns
import { ICommentService, IResourceCommentThreadEvent, IWorkspaceCommentThreadsEvent } from 'vs/workbench/contrib/comments/browser/commentService';
// tslint:disable-next-line: import-patterns
import { ICommentThreadChangedEvent } from 'vs/workbench/contrib/comments/common/commentModel';
import { CommentingRanges } from 'vs/editor/common/modes';
import { Range } from 'vs/editor/common/core/range';
import { Configuration, DefaultConfigurationModel, ConfigurationModel, ConfigurationChangeEvent } from 'vs/platform/configuration/common/configurationModels';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';

export const workspaceResource = URI.file((<any>self).USER_HOME_DIR || '/').with({
	scheme: Schemas.vscodeRemote,
	authority: document.location.host
});

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

	backupResource<T extends object>(resource: URI, content: ITextSnapshot, versionId?: number, meta?: T): Promise<void> {
		const backupResource = this.toBackupResource(resource);
		this.backups.set(backupResource.toString(), content);

		return Promise.resolve();
	}

	resolveBackupContent<T extends object>(backupResource: URI): Promise<IResolvedBackup<T>> {
		const snapshot = this.backups.get(backupResource.toString());
		if (snapshot) {
			return Promise.resolve({ value: createTextBufferFactoryFromSnapshot(snapshot) });
		}

		return Promise.reject('Unexpected backup resource to resolve');
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

export class SimpleConfigurationService extends Disposable implements IConfigurationService {

	_serviceBrand: any;

	private _configuration: Configuration;

	private readonly _onDidChangeConfiguration: Emitter<IConfigurationChangeEvent> = this._register(new Emitter<IConfigurationChangeEvent>());
	readonly onDidChangeConfiguration: Event<IConfigurationChangeEvent> = this._onDidChangeConfiguration.event;

	constructor() {
		super();

		// Initialize
		const defaults = new DefaultConfigurationModel();
		this._configuration = new Configuration(defaults, new ConfigurationModel());

		// Listeners
		this._register(Registry.as<IConfigurationRegistry>(Extensions.Configuration).onDidUpdateConfiguration(configurationProperties => this.onDidDefaultConfigurationChange(configurationProperties)));
	}

	get configuration(): Configuration {
		return this._configuration;
	}

	getConfigurationData(): IConfigurationData {
		return this.configuration.toData();
	}

	getValue<T>(): T;
	getValue<T>(section: string): T;
	getValue<T>(overrides: IConfigurationOverrides): T;
	getValue<T>(section: string, overrides: IConfigurationOverrides): T;
	getValue(arg1?: any, arg2?: any): any {
		const section = typeof arg1 === 'string' ? arg1 : undefined;
		const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : {};
		return this.configuration.getValue(section, overrides, undefined);
	}

	updateValue(key: string, value: any): Promise<void>;
	updateValue(key: string, value: any, overrides: IConfigurationOverrides): Promise<void>;
	updateValue(key: string, value: any, target: ConfigurationTarget): Promise<void>;
	updateValue(key: string, value: any, overrides: IConfigurationOverrides, target: ConfigurationTarget): Promise<void>;
	updateValue(key: string, value: any, arg3?: any, arg4?: any): Promise<void> {
		return Promise.reject(new Error('not supported'));
	}

	inspect<T>(key: string): {
		default: T,
		user: T,
		workspace?: T,
		workspaceFolder?: T
		value: T
	} {
		return this.configuration.inspect<T>(key, {}, undefined);
	}

	keys(): {
		default: string[];
		user: string[];
		workspace: string[];
		workspaceFolder: string[];
	} {
		return this.configuration.keys(undefined);
	}

	reloadConfiguration(folder?: IWorkspaceFolder): Promise<void> {
		return Promise.resolve(undefined);
	}

	private onDidDefaultConfigurationChange(keys: string[]): void {
		this._configuration.updateDefaultConfiguration(new DefaultConfigurationModel());
		this.trigger(keys, ConfigurationTarget.DEFAULT);
	}

	private trigger(keys: string[], source: ConfigurationTarget): void {
		this._onDidChangeConfiguration.fire(new ConfigurationChangeEvent().change(keys).telemetryData(source, this.getTargetConfiguration(source)));
	}

	private getTargetConfiguration(target: ConfigurationTarget): any {
		switch (target) {
			case ConfigurationTarget.DEFAULT:
				return this._configuration.defaults.contents;
			case ConfigurationTarget.USER:
				return this._configuration.localUserConfiguration.contents;
		}
		return {};
	}
}

registerSingleton(IConfigurationService, SimpleConfigurationService);

//#endregion

//#region Dialog

// export class SimpleDialogService extends StandaloneEditorDialogService { }

// registerSingleton(IDialogService, SimpleDialogService, true);

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

export class SimpleWorkbenchEnvironmentService implements IWorkbenchEnvironmentService {
	configuration: IWindowConfiguration = new SimpleWindowConfiguration();
	untitledWorkspacesHome: URI;
	extensionTestsLocationURI?: URI;
	_serviceBrand: any;
	args = { _: [] };
	execPath: string;
	cliPath: string;
	appRoot: string = '/web/';
	userHome: string;
	userDataPath: string;
	appNameLong: string;
	appQuality?: string;
	appSettingsHome: string = '/web/settings';
	appSettingsPath: string = '/web/settings/settings.json';
	appKeybindingsPath: string = '/web/settings/keybindings.json';
	machineSettingsHome: string;
	machineSettingsPath: string;
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
	extensionDevelopmentLocationURI?: URI[];
	extensionTestsPath?: string;
	debugExtensionHost: IExtensionHostDebugParams = {
		port: null,
		break: false
	};
	debugSearch: IDebugParams;
	logExtensionHostCommunication: boolean;
	isBuilt: boolean;
	wait: boolean;
	status: boolean;
	log?: string;
	logsPath: string = '/web/logs';
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


//#endregion

//#region Extension Gallery

export class SimpleExtensionGalleryService implements IExtensionGalleryService {

	_serviceBrand: any;

	isEnabled(): boolean {
		return false;
	}

	query(token: CancellationToken): Promise<IPager<IGalleryExtension>>;
	query(options: IQueryOptions, token: CancellationToken): Promise<IPager<IGalleryExtension>>;
	query(arg1: any, arg2?: any): Promise<IPager<IGalleryExtension>> {
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

//#region IDebugService
export class SimpleDebugService implements IDebugService {
	_serviceBrand: any;
	state: DebugState;
	onDidChangeState: Event<DebugState> = Event.None;
	onDidNewSession: Event<IDebugSession> = Event.None;
	onWillNewSession: Event<IDebugSession> = Event.None;
	onDidEndSession: Event<IDebugSession> = Event.None;
	getConfigurationManager(): IConfigurationManager {
		return new class implements IConfigurationManager {
			canSetBreakpointsIn: any;
			selectedConfiguration: any;
			selectConfiguration: any;
			getLaunches: any;
			getLaunch: any;
			onDidSelectConfiguration: Event<void>;
			activateDebuggers: any;
			hasDebugConfigurationProvider: any;
			registerDebugConfigurationProvider: any;
			unregisterDebugConfigurationProvider: any;
			registerDebugAdapterDescriptorFactory: any;
			unregisterDebugAdapterDescriptorFactory: any;
			resolveConfigurationByProviders: any;
			getDebugAdapterDescriptor: any;
			registerDebugAdapterFactory() { return Disposable.None; }
			createDebugAdapter: any;
			substituteVariables: any;
			runInTerminal: any;
		};
	}
	focusStackFrame: any;
	addBreakpoints: any;
	updateBreakpoints: any;
	enableOrDisableBreakpoints: any;
	setBreakpointsActivated: any;
	removeBreakpoints: any;
	addFunctionBreakpoint: any;
	renameFunctionBreakpoint: any;
	removeFunctionBreakpoints: any;
	sendAllBreakpoints: any;
	addWatchExpression: any;
	renameWatchExpression: any;
	moveWatchExpression: any;
	removeWatchExpressions: any;
	startDebugging: any;
	restartSession: any;
	stopSession: any;
	sourceIsNotAvailable: any;
	getModel: any;
	getViewModel(): IViewModel {
		return new class implements IViewModel {
			focusedSession: IDebugSession | undefined;
			focusedThread: IThread | undefined;
			focusedStackFrame: IStackFrame | undefined;
			getSelectedExpression(): IExpression | undefined {
				throw new Error('Method not implemented.');
			}
			getSelectedFunctionBreakpoint(): IFunctionBreakpoint | undefined {
				throw new Error('Method not implemented.');
			}
			setSelectedExpression(expression: IExpression | undefined): void {
				throw new Error('Method not implemented.');
			}
			setSelectedFunctionBreakpoint(functionBreakpoint: IFunctionBreakpoint | undefined): void {
				throw new Error('Method not implemented.');
			}
			isMultiSessionView(): boolean {
				throw new Error('Method not implemented.');
			}
			onDidFocusSession: Event<IDebugSession | undefined> = Event.None;
			onDidFocusStackFrame: Event<{ stackFrame: IStackFrame | undefined; explicit: boolean; }> = Event.None;
			onDidSelectExpression: Event<IExpression | undefined> = Event.None;
			getId(): string {
				throw new Error('Method not implemented.');
			}
		};
	}
}
registerSingleton(IDebugService, SimpleDebugService, true);

//#endregion IExtensionsWorkbenchService
export class SimpleExtensionsWorkbenchService implements IExtensionsWorkbenchService {
	_serviceBrand: any;
	onChange: Event<IExtension2 | undefined>;
	local: IExtension2[];
	installed: IExtension2[];
	outdated: IExtension2[];
	queryLocal: any;
	queryGallery: any;
	canInstall: any;
	install: any;
	uninstall: any;
	installVersion: any;
	reinstall: any;
	setEnablement: any;
	open: any;
	checkForUpdates: any;
	allowedBadgeProviders: string[];
}
registerSingleton(IExtensionsWorkbenchService, SimpleExtensionsWorkbenchService, true);
//#endregion

//#region ITerminalService
export class SimpleTerminalService implements ITerminalService {
	_serviceBrand: any; activeTabIndex: number;
	configHelper: ITerminalConfigHelper;
	onActiveTabChanged: Event<void> = Event.None;
	onTabDisposed: Event<ITerminalTab> = Event.None;
	onInstanceCreated: Event<ITerminalInstance> = Event.None;
	onInstanceDisposed: Event<ITerminalInstance> = Event.None;
	onInstanceProcessIdReady: Event<ITerminalInstance> = Event.None;
	onInstanceDimensionsChanged: Event<ITerminalInstance> = Event.None;
	onInstanceRequestExtHostProcess: Event<ITerminalProcessExtHostRequest> = Event.None;
	onInstancesChanged: Event<void> = Event.None;
	onInstanceTitleChanged: Event<ITerminalInstance> = Event.None;
	onActiveInstanceChanged: Event<ITerminalInstance | undefined> = Event.None;
	terminalInstances: ITerminalInstance[] = [];
	terminalTabs: ITerminalTab[];
	createTerminal: any;
	createTerminalRenderer: any;
	createInstance: any;
	getInstanceFromId: any;
	getInstanceFromIndex: any;
	getTabLabels: any;
	getActiveInstance() { return null; }
	setActiveInstance: any;
	setActiveInstanceByIndex: any;
	getActiveOrCreateInstance: any;
	splitInstance: any;
	getActiveTab: any;
	setActiveTabToNext: any;
	setActiveTabToPrevious: any;
	setActiveTabByIndex: any;
	refreshActiveTab: any;
	showPanel: any;
	hidePanel: any;
	focusFindWidget: any;
	hideFindWidget: any;
	getFindState: any;
	findNext: any;
	findPrevious: any;
	setContainers: any;
	getDefaultShell: any;
	selectDefaultWindowsShell: any;
	setWorkspaceShellAllowed: any;
	preparePathForTerminalAsync: any;
	extHostReady() { }
	requestExtHostProcess: any;
}
registerSingleton(ITerminalService, SimpleTerminalService, true);

//#endregion

//#region ITaskService
export class SimpleTaskService implements ITaskService {
	_serviceBrand: any;
	onDidStateChange: Event<TaskEvent> = Event.None;
	supportsMultipleTaskExecutions: boolean;
	configureAction: any;
	build: any;
	runTest: any;
	run: any;
	inTerminal: any;
	isActive: any;
	getActiveTasks: any;
	restart: any;
	terminate: any;
	terminateAll: any;
	tasks: any;
	getWorkspaceTasks: any;
	getTask: any;
	getTasksForGroup: any;
	getRecentlyUsedTasks: any;
	createSorter: any;
	needsFolderQualification: any;
	canCustomize: any;
	customize: any;
	openConfig: any;
	registerTaskProvider() { return Disposable.None; }
	registerTaskSystem() { }
	extensionCallbackTaskComplete: any;
}
registerSingleton(ITaskService, SimpleTaskService, true);
//#endregion

//#region ICommentService
export class SimpleCommentService implements ICommentService {
	_serviceBrand: any;
	onDidSetResourceCommentInfos: Event<IResourceCommentThreadEvent> = Event.None;
	onDidSetAllCommentThreads: Event<IWorkspaceCommentThreadsEvent> = Event.None;
	onDidUpdateCommentThreads: Event<ICommentThreadChangedEvent> = Event.None;
	onDidChangeActiveCommentingRange: Event<{ range: Range; commentingRangesInfo: CommentingRanges; }> = Event.None;
	onDidSetDataProvider: Event<void> = Event.None;
	onDidDeleteDataProvider: Event<string> = Event.None;
	setDocumentComments: any;
	setWorkspaceComments: any;
	removeWorkspaceComments: any;
	registerCommentController: any;
	unregisterCommentController: any;
	getCommentController: any;
	createCommentThreadTemplate: any;
	getCommentMenus: any;
	registerDataProvider: any;
	unregisterDataProvider: any;
	updateComments: any;
	disposeCommentThread: any;
	createNewCommentThread: any;
	replyToCommentThread: any;
	editComment: any;
	deleteComment: any;
	getComments() { return Promise.resolve([]); }
	getCommentingRanges: any;
	startDraft: any;
	deleteDraft: any;
	finishDraft: any;
	getStartDraftLabel: any;
	getDeleteDraftLabel: any;
	getFinishDraftLabel: any;
	addReaction: any;
	deleteReaction: any;
	getReactionGroup: any;
	toggleReaction: any;
}
registerSingleton(ICommentService, SimpleCommentService, true);
//#endregion

//#region Extension Management

//#region Extension Enablement

export class SimpleExtensionEnablementService implements IExtensionEnablementService {

	_serviceBrand: any;

	readonly onEnablementChanged = Event.None;

	readonly allUserExtensionsDisabled = false;

	getEnablementState(extension: IExtension): EnablementState {
		return EnablementState.Enabled;
	}

	canChangeEnablement(extension: IExtension): boolean {
		return false;
	}

	setEnablement(extensions: IExtension[], newState: EnablementState): Promise<boolean[]> {
		throw new Error('not implemented');
	}

	isEnabled(extension: IExtension): boolean {
		return true;
	}

}

registerSingleton(IExtensionEnablementService, SimpleExtensionEnablementService, true);

//#endregion

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

	version: string = '1.35.0';
	commit?: string;
	nameLong: string = '';
	urlProtocol: string = '';
	extensionAllowedProposedApi: string[] = [];
	uiExtensions?: string[];
	enableTelemetry: boolean = false;
}

//#endregion

//#region Request

export const IRequestService = createDecorator<IRequestService>('requestService');

export interface IRequestService {
	_serviceBrand: any;

	request(options: any, token: CancellationToken): Promise<object>;
}

export class SimpleRequestService implements IRequestService {

	_serviceBrand: any;

	request(options: any, token: CancellationToken): Promise<object> {
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
		@IUntitledEditorService private untitledEditorService: IUntitledEditorService,
		@IFileService private fileService: IFileService
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

	private getLocalResults(query: ITextQuery): ResourceMap<IFileMatch | null> {
		const localResults = new ResourceMap<IFileMatch | null>();

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

				// Block walkthrough, webview, etc.
				else if (!this.fileService.canHandleResource(resource)) {
					return;
				}

				if (!this.matches(resource, query)) {
					return; // respect user filters
				}

				// Use editor API to find matches
				const matches = model.findMatches(query.contentPattern.pattern, false, !!query.contentPattern.isRegExp, !!query.contentPattern.isCaseSensitive, query.contentPattern.isWordMatch ? query.contentPattern.wordSeparators! : null, false, query.maxResults);
				if (matches.length) {
					const fileMatch = new FileMatch(resource);
					localResults.set(resource, fileMatch);

					const textSearchResults = editorMatchesToTextSearchResults(matches, model, query.previewOptions);
					fileMatch.results = addContextToEditorMatches(textSearchResults, model, query);
				} else {
					localResults.set(resource, null);
				}
			});
		}

		return localResults;
	}

	private matches(resource: URI, query: ITextQuery): boolean {
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

	setEnabled(value: boolean): void {
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

	remoteAuthority: string = document.location.host;

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

	filesToOpenOrCreate?: IPath[];
	filesToDiff?: IPath[];
	filesToWait?: IPathsToWaitFor;
	termProgram?: string;
}

export class SimpleWindowService implements IWindowService {

	_serviceBrand: any;

	readonly onDidChangeFocus: Event<boolean> = Event.None;
	readonly onDidChangeMaximize: Event<boolean> = Event.None;

	hasFocus = true;

	readonly windowId = 0;

	isFocused(): Promise<boolean> {
		return Promise.resolve(false);
	}

	isMaximized(): Promise<boolean> {
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

	openWindow(_uris: IURIToOpen[], _options?: IOpenSettings): Promise<void> {
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

//#region ExtensionHostDebugService

export class SimpleExtensionHostDebugService implements IExtensionHostDebugService {
	_serviceBrand: any;

	reload(sessionId: string): void { }
	onReload: Event<IReloadSessionEvent> = Event.None;

	close(sessionId: string): void { }
	onClose: Event<ICloseSessionEvent> = Event.None;

	attachSession(sessionId: string, port: number, subId?: string): void { }
	onAttachSession: Event<IAttachSessionEvent> = Event.None;

	logToSession(sessionId: string, log: IRemoteConsoleLog): void { }
	onLogToSession: Event<ILogToSessionEvent> = Event.None;

	terminateSession(sessionId: string, subId?: string): void { }
	onTerminateSession: Event<ITerminateSessionEvent> = Event.None;
}
registerSingleton(IExtensionHostDebugService, SimpleExtensionHostDebugService);

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
	openWindow(_windowId: number, _uris: IURIToOpen[], _options: IOpenSettings): Promise<void> {
		return Promise.resolve();
	}

	openNewWindow(): Promise<void> {
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
		this.workspace = new Workspace(workspaceResource.toString(), [toWorkspaceFolder(workspaceResource)]);
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

	createUntitledWorkspace(folders?: IWorkspaceFolderCreationData[], remoteAuthority?: string): Promise<IWorkspaceIdentifier> {
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

//#region remote

class SimpleTunnelService implements ITunnelService {
	_serviceBrand: any;
	openTunnel(remotePort: number) {
		return undefined;
	}
}

registerSingleton(ITunnelService, SimpleTunnelService);

//#endregion