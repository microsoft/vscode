/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INativeWindowConfiguration } from '../../platform/window/common/window.js';
import { domContentLoaded } from '../../base/browser/dom.js';
import { mainWindow } from '../../base/browser/window.js';
import { ServiceCollection } from '../../platform/instantiation/common/serviceCollection.js';
import { ILoggerService, ILogService, LogLevel } from '../../platform/log/common/log.js';
import { Disposable, DisposableStore, IDisposable } from '../../base/common/lifecycle.js';
import { IMainProcessService } from '../../platform/ipc/common/mainProcessService.js';
import { ElectronIPCMainProcessService } from '../../platform/ipc/electron-browser/mainProcessService.js';
import { IProductService } from '../../platform/product/common/productService.js';
import product from '../../platform/product/common/product.js';
import { INativeWorkbenchEnvironmentService, NativeWorkbenchEnvironmentService } from '../services/environment/electron-browser/environmentService.js';
import { LoggerChannelClient } from '../../platform/log/common/logIpc.js';
import { NativeLogService } from '../services/log/electron-browser/logService.js';
import { URI } from '../../base/common/uri.js';
import { FileService } from '../../platform/files/common/fileService.js';
import { IFileService } from '../../platform/files/common/files.js';
import { Schemas } from '../../base/common/network.js';
import { DiskFileSystemProvider } from '../services/files/electron-browser/diskFileSystemProvider.js';
import { IUtilityProcessWorkerWorkbenchService, UtilityProcessWorkerWorkbenchService } from '../services/utilityProcess/electron-browser/utilityProcessWorkerWorkbenchService.js';
import { InstantiationService } from '../../platform/instantiation/common/instantiationService.js';
import { IWorkspaceContextService, toWorkspaceIdentifier } from '../../platform/workspace/common/workspace.js';
import { IUserDataProfilesService, reviveProfile } from '../../platform/userDataProfile/common/userDataProfile.js';
import { UserDataProfilesService } from '../../platform/userDataProfile/common/userDataProfileIpc.js';
import { UserDataProfileService } from '../services/userDataProfile/common/userDataProfileService.js';
import { IUserDataProfileService } from '../services/userDataProfile/common/userDataProfile.js';
import { UriIdentityService } from '../../platform/uriIdentity/common/uriIdentityService.js';
import { IUriIdentityService } from '../../platform/uriIdentity/common/uriIdentity.js';
import { FileUserDataProvider } from '../../platform/userData/common/fileUserDataProvider.js';
import { Emitter, Event } from '../../base/common/event.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { IRemoteAgentService } from '../services/remote/common/remoteAgentService.js';
import { RemoteAgentService } from '../services/remote/electron-browser/remoteAgentService.js';
import { IRemoteAuthorityResolverService, RemoteConnectionType } from '../../platform/remote/common/remoteAuthorityResolver.js';
import { RemoteAuthorityResolverService } from '../../platform/remote/electron-browser/remoteAuthorityResolverService.js';
import { ISignService } from '../../platform/sign/common/sign.js';
import { ProxyChannel } from '../../base/parts/ipc/common/ipc.js';
import { ElectronRemoteResourceLoader } from '../../platform/remote/electron-browser/electronRemoteResourceLoader.js';
import { RemoteSocketFactoryService, IRemoteSocketFactoryService } from '../../platform/remote/common/remoteSocketFactoryService.js';
import { BrowserSocketFactory } from '../../platform/remote/browser/browserSocketFactory.js';
import { IStorageService } from '../../platform/storage/common/storage.js';
import { NativeWorkbenchStorageService } from '../services/storage/electron-browser/storageService.js';
import { ITelemetryService } from '../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from '../../platform/workspace/common/workspaceTrust.js';
import { WorkspaceTrustEnablementService, WorkspaceTrustManagementService } from '../services/workspaces/common/workspaceTrust.js';
import { IExtensionManifestPropertiesService, ExtensionManifestPropertiesService } from '../services/extensions/common/extensionManifestPropertiesService.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { IDialogService } from '../../platform/dialogs/common/dialogs.js';
import { DialogService } from '../services/dialogs/common/dialogService.js';
import { ILayoutService, ILayoutOffsetInfo } from '../../platform/layout/browser/layoutService.js';
import { IWorkbenchLayoutService, Parts, PanelAlignment, Position } from '../services/layout/browser/layoutService.js';
import { IEditorGroupsService, GroupOrientation, EditorGroupLayout, IEditorWorkingSet, IEditorPart } from '../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../services/editor/common/editorService.js';
import { IDefaultAccountService } from '../../platform/defaultAccount/common/defaultAccount.js';
import { DefaultAccountService } from '../services/accounts/browser/defaultAccount.js';
import { SyncDescriptor } from '../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { IEditorProgressService, IProgressRunner, emptyProgressRunner } from '../../platform/progress/common/progress.js';
import { ISharedProcessService } from '../../platform/ipc/electron-browser/services.js';
import { SharedProcessService } from '../services/sharedProcess/electron-browser/sharedProcessService.js';
import { NullPolicyService } from '../../platform/policy/common/policy.js';
import { getSingletonServiceDescriptors } from '../../platform/instantiation/common/extensions.js';
import { INativeKeyboardLayoutService, NativeKeyboardLayoutService } from '../services/keybinding/electron-browser/nativeKeyboardLayoutService.js';
import { WorkspaceService } from '../services/configuration/browser/configurationService.js';
import { IWorkbenchConfigurationService } from '../services/configuration/common/configuration.js';
import { ConfigurationCache } from '../services/configuration/common/configurationCache.js';
import { IURLService, IOpenURLOptions } from '../../platform/url/common/url.js';
import { IStatusbarService, IStatusbarEntry, IStatusbarEntryAccessor, StatusbarAlignment } from '../services/statusbar/browser/statusbar.js';
import { IAuxiliaryStatusbarPart, IStatusbarEntryContainer } from '../browser/parts/statusbar/statusbarPart.js';
import { ILifecycleService, LifecyclePhase, StartupKind, BeforeShutdownEvent, BeforeShutdownErrorEvent, WillShutdownEvent } from '../services/lifecycle/common/lifecycle.js';

/**
 * Stub notification service for Agent window
 */
class AgentNotificationService implements INotificationService {
	declare readonly _serviceBrand: undefined;

	readonly onDidAddNotification = Event.None;
	readonly onDidRemoveNotification = Event.None;
	readonly onDidChangeFilter = Event.None;
	readonly onDidChangeDoNotDisturbMode = Event.None;

	info(): { close: () => void } { return { close: () => { } }; }
	warn(): { close: () => void } { return { close: () => { } }; }
	error(): { close: () => void } { return { close: () => { } }; }
	notify() {
		const noop = () => { };
		return {
			close: noop,
			updateSeverity: noop,
			updateMessage: noop,
			updateActions: noop,
			onDidClose: Event.None,
			onDidChangeVisibility: Event.None,
			progress: { infinite: noop, total: noop, worked: noop, done: noop }
		};
	}
	prompt() {
		const noop = () => { };
		return {
			close: noop,
			updateSeverity: noop,
			updateMessage: noop,
			updateActions: noop,
			onDidClose: Event.None,
			onDidChangeVisibility: Event.None,
			progress: { infinite: noop, total: noop, worked: noop, done: noop }
		};
	}
	status() { return { close: () => { }, dispose: () => { } }; }
	setFilter() { }
	getFilter() { return undefined!; }
	getFilters() { return []; }
	removeFilter() { }
	setDoNotDisturbMode() { }
	doNotDisturbMode = false;
}

/**
 * Stub URL service for Agent window
 */
class AgentURLService implements IURLService {
	declare readonly _serviceBrand: undefined;

	readonly onOpenURL = Event.None;

	create(): URI { return URI.parse(''); }
	open(_url: URI, _options?: IOpenURLOptions): Promise<boolean> { return Promise.resolve(true); }
	registerHandler(_handler: unknown): { dispose(): void } { return { dispose: () => { } }; }
}

/**
 * Stub statusbar service for Agent window
 */
class AgentStatusbarService implements IStatusbarService {
	declare readonly _serviceBrand: undefined;

	readonly onDidChangeEntryVisibility = Event.None;

	addEntry(_entry: IStatusbarEntry, _id: string, _alignment: StatusbarAlignment, _priorityOrLocation?: number | unknown): IStatusbarEntryAccessor {
		return {
			update: () => { },
			dispose: () => { }
		};
	}
	isEntryVisible(_id: string): boolean { return false; }
	updateEntryVisibility(_id: string, _visible: boolean): void { }
	focus(_preserveEntryFocus?: boolean): void { }
	focusNextEntry(): void { }
	focusPreviousEntry(): void { }
	overrideStyle(_style: unknown): { dispose(): void } { return { dispose: () => { } }; }
	getPart(_container: HTMLElement): IStatusbarEntryContainer { return this; }
	createAuxiliaryStatusbarPart(_container: HTMLElement, _instantiationService: IInstantiationService): IAuxiliaryStatusbarPart { throw new Error('Not supported in Agent window'); }
	createScoped(_statusbarEntryContainer: IStatusbarEntryContainer, _disposables: DisposableStore): IStatusbarService { return this; }
	overrideEntry(_id: string, _entry: Partial<IStatusbarEntry>): IDisposable { return { dispose: () => { } }; }
	compact(): void { }
	isCompact(): boolean { return false; }
	isEntryFocused(): boolean { return false; }
	dispose(): void { }
}

/**
 * Stub editor progress service for Agent window
 * Required by DiffEditorWidget / MultiDiffEditorWidget
 */
class AgentEditorProgressService implements IEditorProgressService {
	declare readonly _serviceBrand: undefined;

	show(_infiniteOrTotal: true | number, _delay?: number): IProgressRunner {
		return emptyProgressRunner;
	}

	async showWhile(_promise: Promise<unknown>, _delay?: number): Promise<void> {
		// No-op - just wait for the promise
	}
}

/**
 * Stub lifecycle service for Agent window
 */
class AgentLifecycleService implements ILifecycleService {
	declare readonly _serviceBrand: undefined;

	private _phase: LifecyclePhase = LifecyclePhase.Starting;
	private readonly _phaseWhen = new Map<LifecyclePhase, { promise: Promise<void>; resolve: () => void }>();

	readonly startupKind = StartupKind.NewWindow;

	private readonly _onBeforeShutdown = new Emitter<BeforeShutdownEvent>();
	readonly onBeforeShutdown = this._onBeforeShutdown.event;

	readonly onShutdownVeto = Event.None;

	private readonly _onBeforeShutdownError = new Emitter<BeforeShutdownErrorEvent>();
	readonly onBeforeShutdownError = this._onBeforeShutdownError.event;

	private readonly _onWillShutdown = new Emitter<WillShutdownEvent>();
	readonly onWillShutdown = this._onWillShutdown.event;

	readonly onDidShutdown = Event.None;

	readonly willShutdown = false;

	get phase(): LifecyclePhase { return this._phase; }
	set phase(value: LifecyclePhase) {
		if (value < this._phase) {
			return; // Cannot go backwards
		}

		if (this._phase === value) {
			return; // No change
		}

		this._phase = value;

		// Resolve promises for all phases up to and including this one
		for (const [phase, entry] of this._phaseWhen.entries()) {
			if (phase <= value) {
				entry.resolve();
				this._phaseWhen.delete(phase);
			}
		}
	}

	when(phase: LifecyclePhase): Promise<void> {
		if (this._phase >= phase) {
			return Promise.resolve();
		}

		let entry = this._phaseWhen.get(phase);
		if (!entry) {
			let resolve: () => void;
			const promise = new Promise<void>(r => resolve = r);
			entry = { promise, resolve: resolve! };
			this._phaseWhen.set(phase, entry);
		}

		return entry.promise;
	}

	async shutdown(): Promise<void> {
		// No-op for agent window
	}
}

/**
 * Stub layout service for Agent window
 */
class AgentLayoutService implements IWorkbenchLayoutService {
	declare readonly _serviceBrand: undefined;

	private readonly _container: HTMLElement;

	constructor() {
		this._container = mainWindow.document.body;
	}

	readonly openedDefaultEditors = false;

	readonly onDidLayoutMainContainer = Event.None;
	readonly onDidLayoutContainer = Event.None;
	readonly onDidLayoutActiveContainer = Event.None;
	readonly onDidAddContainer = Event.None;
	readonly onDidChangeActiveContainer = Event.None;
	readonly onDidChangeZenMode = Event.None;
	readonly onDidChangeWindowMaximized = Event.None;
	readonly onDidChangeMainEditorCenteredLayout = Event.None;
	readonly onDidChangePanelPosition = Event.None;
	readonly onDidChangePanelAlignment = Event.None;
	readonly onDidChangePartVisibility = Event.None;
	readonly onDidChangeNotificationsVisibility = Event.None;
	readonly onDidChangeAuxiliaryBarMaximized = Event.None;

	get mainContainerDimension() { return { width: this._container.clientWidth, height: this._container.clientHeight }; }
	get activeContainerDimension() { return this.mainContainerDimension; }
	get mainContainer() { return this._container; }
	get activeContainer() { return this._container; }
	get containers(): Iterable<HTMLElement> { return [this._container]; }

	getContainer(_window: Window): HTMLElement { return this._container; }
	whenContainerStylesLoaded(_window: Window): Promise<void> | undefined { return Promise.resolve(); }

	get mainContainerOffset(): ILayoutOffsetInfo { return { top: 0, quickPickTop: 0 }; }
	get activeContainerOffset(): ILayoutOffsetInfo { return { top: 0, quickPickTop: 0 }; }

	layout(): void { }
	isRestored(): boolean { return true; }
	readonly whenRestored: Promise<void> = Promise.resolve();
	hasFocus(_part: Parts): boolean { return false; }
	focusPart(_part: Parts): void { }
	isVisible(_part: Parts): boolean { return true; }
	setPartHidden(_hidden: boolean, _part: Parts): void { }
	toggleMaximizedPanel(): void { }
	isPanelMaximized(): boolean { return false; }
	toggleMaximizedAuxiliaryBar(): void { }
	setAuxiliaryBarMaximized(_maximized: boolean): boolean { return false; }
	isAuxiliaryBarMaximized(): boolean { return false; }
	hasMainWindowBorder(): boolean { return false; }
	getMainWindowBorderRadius(): string | undefined { return undefined; }
	getSideBarPosition(): Position { return Position.LEFT; }
	toggleMenuBar(): void { }
	getPanelPosition(): Position { return Position.BOTTOM; }
	setPanelPosition(_position: Position): void { }
	getPanelAlignment(): PanelAlignment { return 'center'; }
	setPanelAlignment(_alignment: PanelAlignment): void { }
	getMaximumEditorDimensions(): { width: number; height: number } { return this.mainContainerDimension; }
	toggleZenMode(): void { }
	isMainEditorLayoutCentered(): boolean { return false; }
	centerMainEditorLayout(_active: boolean): void { }
	getSize(_part: Parts) { return { width: 0, height: 0 }; }
	setSize(_part: Parts, _size: { width: number; height: number }): void { }
	resizePart(_part: Parts, _sizeChangeWidth: number, _sizeChangeHeight: number): void { }
	registerPart(_part: unknown): { dispose(): void } { return { dispose: () => { } }; }
	isWindowMaximized(_targetWindow: Window): boolean { return false; }
	updateWindowMaximizedState(_targetWindow: Window, _maximized: boolean): void { }
	getVisibleNeighborPart(_part: Parts, _direction: unknown): Parts | undefined { return undefined; }

	focus(): void { this._container.focus(); }
}

/**
 * Stub editor groups service for Agent window - provides one empty tab group
 * This enables extensions to have a valid activeTabGroup
 */
function createAgentEditorGroupsService(): IEditorGroupsService {
	const emptyGroup = {
		id: 1,
		windowId: 1,
		index: 0,
		label: 'Agent',
		ariaLabel: 'Agent Editor Group',
		isEmpty: true,
		isLocked: false,
		stickyCount: 0,
		count: 0,
		editors: [],
		selectedEditors: [],
		activeEditorPane: undefined,
		activeEditor: null,
		previewEditor: null,
		onDidModelChange: Event.None,
		onWillDispose: Event.None,
		onDidActiveEditorChange: Event.None,
		onWillCloseEditor: Event.None,
		onDidCloseEditor: Event.None,
		onWillMoveEditor: Event.None,
		onWillOpenEditor: Event.None,
		get scopedContextKeyService() { return undefined!; },
		getEditors: () => [],
		findEditors: () => [],
		getEditorByIndex: () => undefined,
		getIndexOfEditor: () => -1,
		isFirst: () => false,
		isLast: () => false,
		focus: () => { },
		pinEditor: () => { },
		unpinEditor: () => { },
		stickEditor: () => { },
		unstickEditor: () => { },
		lock: () => { },
		isActive: () => false,
		isSelected: () => false,
		setSelection: () => Promise.resolve(),
		openEditor: async () => undefined,
		openEditors: async () => undefined,
		isPinned: () => false,
		isSticky: () => false,
		isTransient: () => false,
		closeEditor: async () => true,
		closeEditors: async () => true,
		closeAllEditors: () => true as unknown,
		replaceEditors: async () => { },
		moveEditor: () => false,
		moveEditors: () => false,
		copyEditor: async () => { },
		copyEditors: async () => { },
		contains: () => false,
		createEditorActions: () => ({ actions: [], onDidChange: Event.None }),
	};

	const service = {
		_serviceBrand: undefined,
		mainPart: undefined as unknown as IEditorPart,
		parts: [] as readonly IEditorPart[],
		onDidChangeActiveGroup: Event.None,
		onDidAddGroup: Event.None,
		onDidRemoveGroup: Event.None,
		onDidMoveGroup: Event.None,
		onDidActivateGroup: Event.None,
		onDidLayout: Event.None,
		onDidScroll: Event.None,
		onDidChangeGroupIndex: Event.None,
		onDidChangeGroupLocked: Event.None,
		onDidChangeGroupMaximized: Event.None,
		onDidCreateAuxiliaryEditorPart: Event.None,
		// IEditorPart properties needed when service is cast to IEditorPart
		onWillDispose: Event.None,
		get contentDimension() { return { width: 0, height: 0 }; },
		get activeGroup() { return emptyGroup; },
		get sideGroup() { return undefined!; },
		get groups() { return [emptyGroup]; },
		get count() { return 1; },
		get orientation() { return GroupOrientation.HORIZONTAL; },
		getGroups: () => [emptyGroup],
		getGroup: () => emptyGroup,
		activateGroup: () => emptyGroup,
		restoreGroup: () => emptyGroup,
		getSize: () => ({ width: 0, height: 0 }),
		setSize: () => { },
		arrangeGroups: () => { },
		toggleMaximizeGroup: () => { },
		toggleExpandGroup: () => { },
		isGroupMaximized: () => false,
		isGroupExpanded: () => false,
		applyLayout: () => { },
		getLayout: (): EditorGroupLayout => ({ orientation: GroupOrientation.HORIZONTAL, groups: [] }),
		setGroupOrientation: () => { },
		findGroup: () => emptyGroup,
		addGroup: () => emptyGroup,
		removeGroup: () => { },
		moveGroup: () => emptyGroup,
		mergeGroup: () => false,
		mergeAllGroups: () => false,
		copyGroup: () => emptyGroup,
		createEditorDropTarget: () => ({ dispose: () => { } }),
		saveWorkingSet: (name: string): IEditorWorkingSet => ({ id: '', name }),
		getWorkingSets: () => [],
		applyWorkingSet: async () => true,
		deleteWorkingSet: async () => true,
		registerEditorPart: () => ({ dispose: () => { } }),
		registerContextKeyProvider: () => ({ dispose: () => { } }),
		createAuxiliaryEditorPart: async () => undefined!,
		// IEditorPart methods
		get partOptions() { return {}; },
		onDidChangeEditorPartOptions: Event.None,
		get whenReady() { return Promise.resolve(); },
		get whenRestored() { return Promise.resolve(); },
		get hasRestorableState() { return false; },
		get isReady() { return true; },
		get windowId() { return 1; },
		getPart: () => service,
		getScopedInstantiationService: () => undefined!,
		enforcePartOptions: () => ({ dispose: () => { } }),
	};

	service.mainPart = service as unknown as IEditorPart;
	service.parts = [service as unknown as IEditorPart];

	return service as unknown as IEditorGroupsService;
}

/**
 * Creates a stub IEditorService for Agent Window.
 * Provides empty editor state so extensions get valid responses.
 */
function createAgentEditorService(): IEditorService {
	const service = {
		_serviceBrand: undefined,
		onDidActiveEditorChange: Event.None,
		onDidMostRecentlyActiveEditorsChange: Event.None,
		onDidVisibleEditorsChange: Event.None,
		onDidEditorsChange: Event.None,
		onWillOpenEditor: Event.None,
		onDidOpenEditorFail: Event.None,
		onDidCloseEditor: Event.None,
		activeEditorPane: undefined,
		activeEditor: undefined,
		activeTextEditorControl: undefined,
		activeTextEditorLanguageId: undefined,
		visibleEditorPanes: [],
		visibleEditors: [],
		visibleTextEditorControls: [],
		editors: [],
		count: 0,
		getVisibleTextEditorControls: () => [],
		getEditors: () => [],
		openEditor: async () => undefined,
		openEditors: async () => [],
		replaceEditors: async () => { },
		isOpened: () => false,
		isVisible: () => false,
		closeEditor: async () => { },
		closeEditors: async () => { },
		findEditors: () => [],
		save: async () => ({ success: true, editors: [] }),
		saveAll: async () => ({ success: true, editors: [] }),
		revert: async () => true,
		revertAll: async () => true,
		createScoped: () => service as unknown as IEditorService,
	};
	return service as unknown as IEditorService;
}

/**
 * Interface for AgentWindow class that can be passed from root-level entry point
 * (root-level files can import from contrib/, electron-browser/ cannot)
 */
export interface IAgentWindowConstructor {
	new(instantiationService: IInstantiationService, logService: ILogService): IAgentWindowInstance;
}

export interface IAgentWindowInstance {
	createLayout(): void;
	registerChatWidgetService(serviceCollection: ServiceCollection): void;
	registerTerminalServices(serviceCollection: ServiceCollection): void;
	startup(): Promise<void>;
	dispose(): void;
}

export class AgentMain extends Disposable {

	constructor(
		private readonly configuration: INativeWindowConfiguration,
		private readonly AgentWindowClass: IAgentWindowConstructor
	) {
		super();
	}

	async open(): Promise<void> {
		// Wait for DOM first so we can show status updates
		await domContentLoaded(mainWindow);

		const services = await this.initServices();
		services.logService.info('[Agent] Services initialized');

		// Create and start the AgentWindow (which handles all UI/contrib code)
		const agentWindow = this._register(new this.AgentWindowClass(
			services.instantiationService,
			services.logService
		));

		// Create layout first (required for session controller initialization)
		agentWindow.createLayout();

		// Register the chat widget service before starting
		agentWindow.registerChatWidgetService(services.serviceCollection);

		// Register the terminal services before starting
		agentWindow.registerTerminalServices(services.serviceCollection);

		// Start the agent window
		await agentWindow.startup();
	}

	private async initServices(): Promise<{ serviceCollection: ServiceCollection; logService: ILogService; instantiationService: IInstantiationService }> {
		const serviceCollection = new ServiceCollection();
		const disposables = this._register(new DisposableStore());

		// Main Process
		const mainProcessService = disposables.add(new ElectronIPCMainProcessService(this.configuration.windowId));
		serviceCollection.set(IMainProcessService, mainProcessService);

		// Product
		const productService: IProductService = { _serviceBrand: undefined, ...product };
		serviceCollection.set(IProductService, productService);

		// Environment
		const environmentService = new NativeWorkbenchEnvironmentService(this.configuration, productService);
		serviceCollection.set(INativeWorkbenchEnvironmentService, environmentService);

		// Logger
		const loggers = this.configuration.loggers.map(loggerResource => ({ ...loggerResource, resource: URI.revive(loggerResource.resource) }));
		const loggerService = new LoggerChannelClient(this.configuration.windowId, this.configuration.logLevel, environmentService.windowLogsPath, loggers, mainProcessService.getChannel('logger'));
		serviceCollection.set(ILoggerService, loggerService);

		// Log
		const logService = disposables.add(new NativeLogService(loggerService, environmentService));
		serviceCollection.set(ILogService, logService);

		// Default Account
		const defaultAccountService = disposables.add(new DefaultAccountService(productService));
		serviceCollection.set(IDefaultAccountService, defaultAccountService);

		// Shared Process (needs logService)
		const sharedProcessService = new SharedProcessService(this.configuration.windowId, logService);
		serviceCollection.set(ISharedProcessService, sharedProcessService);
		sharedProcessService.notifyRestored();
		logService.info('[Agent] Shared process marked as restored');

		if (logService.getLevel() === LogLevel.Trace) {
			logService.trace('[Agent] Initializing services...');
		}

		// Utility Process Worker
		const utilityProcessWorkerWorkbenchService = new UtilityProcessWorkerWorkbenchService(this.configuration.windowId, logService, mainProcessService);
		serviceCollection.set(IUtilityProcessWorkerWorkbenchService, utilityProcessWorkerWorkbenchService);

		// Files
		const fileService = disposables.add(new FileService(logService));
		serviceCollection.set(IFileService, fileService);

		// Local Files
		const diskFileSystemProvider = disposables.add(new DiskFileSystemProvider(mainProcessService, utilityProcessWorkerWorkbenchService, logService, loggerService));
		fileService.registerProvider(Schemas.file, diskFileSystemProvider);

		// URI Identity
		const uriIdentityService = new UriIdentityService(fileService);
		serviceCollection.set(IUriIdentityService, uriIdentityService);

		// User Data Profiles
		const userDataProfilesService = new UserDataProfilesService(this.configuration.profiles.all, URI.revive(this.configuration.profiles.home).with({ scheme: environmentService.userRoamingDataHome.scheme }), mainProcessService.getChannel('userDataProfiles'));
		serviceCollection.set(IUserDataProfilesService, userDataProfilesService);
		const userDataProfileService = new UserDataProfileService(reviveProfile(this.configuration.profiles.profile, userDataProfilesService.profilesHome.scheme));
		serviceCollection.set(IUserDataProfileService, userDataProfileService);

		// Use FileUserDataProvider for user data
		fileService.registerProvider(Schemas.vscodeUserData, disposables.add(new FileUserDataProvider(Schemas.file, diskFileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, logService)));

		// Sign
		const signService = ProxyChannel.toService<ISignService>(mainProcessService.getChannel('sign'));
		serviceCollection.set(ISignService, signService);

		// Remote
		const remoteAuthorityResolverService = new RemoteAuthorityResolverService(productService, new ElectronRemoteResourceLoader(environmentService.window.id, mainProcessService, fileService));
		serviceCollection.set(IRemoteAuthorityResolverService, remoteAuthorityResolverService);

		// Remote Socket Factory
		const remoteSocketFactoryService = new RemoteSocketFactoryService();
		remoteSocketFactoryService.register(RemoteConnectionType.WebSocket, new BrowserSocketFactory(null));
		serviceCollection.set(IRemoteSocketFactoryService, remoteSocketFactoryService);

		// Remote Agent
		const remoteAgentService = disposables.add(new RemoteAgentService(remoteSocketFactoryService, userDataProfileService, environmentService, productService, remoteAuthorityResolverService, signService, logService));
		serviceCollection.set(IRemoteAgentService, remoteAgentService);

		// Native Keyboard Layout Service (required by keybinding service)
		const nativeKeyboardLayoutService = disposables.add(new NativeKeyboardLayoutService(mainProcessService));
		await nativeKeyboardLayoutService.initialize();
		serviceCollection.set(INativeKeyboardLayoutService, nativeKeyboardLayoutService);

		// Workspace
		const workspace = toWorkspaceIdentifier(this.configuration.backupPath, environmentService.isExtensionDevelopment);

		// Configuration Service (full WorkspaceService for proper configuration resolution)
		const configurationCache = new ConfigurationCache([Schemas.file, Schemas.vscodeUserData, Schemas.tmp] /* resource schemas that can be cached */, environmentService, fileService);
		const configurationService = disposables.add(new WorkspaceService(
			{ remoteAuthority: environmentService.remoteAuthority, configurationCache },
			environmentService,
			userDataProfileService,
			userDataProfilesService,
			fileService,
			remoteAgentService,
			uriIdentityService,
			logService,
			new NullPolicyService()
		));
		serviceCollection.set(IConfigurationService, configurationService);
		serviceCollection.set(IWorkbenchConfigurationService, configurationService);

		// Workspace Context Service (use the configuration service which implements it)
		serviceCollection.set(IWorkspaceContextService, configurationService);

		// Initialize configuration
		await configurationService.initialize(workspace);

		// Storage
		const storageService = disposables.add(new NativeWorkbenchStorageService(workspace, userDataProfileService, userDataProfilesService, mainProcessService, environmentService));
		await storageService.initialize();
		serviceCollection.set(IStorageService, storageService);

		// Workspace Trust
		const workspaceTrustEnablementService = new WorkspaceTrustEnablementService(configurationService, environmentService);
		serviceCollection.set(IWorkspaceTrustEnablementService, workspaceTrustEnablementService);
		logService.info('[Agent] Workspace trust enabled:', workspaceTrustEnablementService.isWorkspaceTrustEnabled());

		serviceCollection.set(IWorkspaceTrustManagementService, new SyncDescriptor(WorkspaceTrustManagementService, undefined, true));

		// Telemetry (disabled for agent window)
		serviceCollection.set(ITelemetryService, NullTelemetryService);

		// Notification (stub)
		serviceCollection.set(INotificationService, new AgentNotificationService());

		// Dialog
		serviceCollection.set(IDialogService, new DialogService(environmentService, logService));

		// URL Service (stub)
		serviceCollection.set(IURLService, new AgentURLService());

		// Statusbar Service (stub)
		serviceCollection.set(IStatusbarService, new AgentStatusbarService());

		// Editor Progress (stub for diff editors)
		serviceCollection.set(IEditorProgressService, new AgentEditorProgressService());

		// Editor Groups (stub for tab groups API)
		serviceCollection.set(IEditorGroupsService, createAgentEditorGroupsService());

		// Editor Service (stub for open editors API)
		serviceCollection.set(IEditorService, createAgentEditorService());

		// Layout (stub) - register both ILayoutService and IWorkbenchLayoutService
		const agentLayoutService = new AgentLayoutService();
		serviceCollection.set(ILayoutService, agentLayoutService);
		serviceCollection.set(IWorkbenchLayoutService, agentLayoutService);

		// Lifecycle (stub) - needed for contributions that wait for lifecycle phases
		serviceCollection.set(ILifecycleService, new AgentLifecycleService());

		// Extension Manifest Properties
		const extensionManifestPropertiesService = new ExtensionManifestPropertiesService(productService, configurationService, workspaceTrustEnablementService, logService);
		serviceCollection.set(IExtensionManifestPropertiesService, extensionManifestPropertiesService);

		// Add all registered singleton services from the imports above
		const contributedServices = getSingletonServiceDescriptors();
		for (const [id, descriptor] of contributedServices) {
			if (!serviceCollection.has(id)) {
				serviceCollection.set(id, descriptor);
			}
		}

		// Create an instantiation service - the registered singletons from imported service files
		// will be resolved automatically when needed
		const instantiationService = this._register(new InstantiationService(serviceCollection, true));

		logService.info('[Agent] Services initialized');

		return { serviceCollection, logService, instantiationService };
	}
}

export interface IAgentMain {
	main(configuration: INativeWindowConfiguration, AgentWindowClass: IAgentWindowConstructor): Promise<void>;
}

export function main(configuration: INativeWindowConfiguration, AgentWindowClass: IAgentWindowConstructor): Promise<void> {
	const agent = new AgentMain(configuration, AgentWindowClass);
	return agent.open();
}
