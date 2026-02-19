/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../workbench/browser/style.js';
import './style.css';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../base/common/lifecycle.js';
import { Emitter, Event, setGlobalLeakWarningThreshold } from '../../base/common/event.js';
import { getActiveDocument, getActiveElement, getClientArea, getWindowId, getWindows, IDimension, isAncestorUsingFlowTo, size, Dimension, runWhenWindowIdle } from '../../base/browser/dom.js';
import { DeferredPromise, RunOnceScheduler } from '../../base/common/async.js';
import { isFullscreen, onDidChangeFullscreen, isChrome, isFirefox, isSafari } from '../../base/browser/browser.js';
import { mark } from '../../base/common/performance.js';
import { onUnexpectedError, setUnexpectedErrorHandler } from '../../base/common/errors.js';
import { isWindows, isLinux, isWeb, isNative, isMacintosh } from '../../base/common/platform.js';
import { Parts, Position, PanelAlignment, IWorkbenchLayoutService, SINGLE_WINDOW_PARTS, MULTI_WINDOW_PARTS, IPartVisibilityChangeEvent, positionToString } from '../../workbench/services/layout/browser/layoutService.js';
import { ILayoutOffsetInfo } from '../../platform/layout/browser/layoutService.js';
import { Part } from '../../workbench/browser/part.js';
import { Direction, ISerializableView, ISerializedGrid, ISerializedLeafNode, ISerializedNode, IViewSize, Orientation, SerializableGrid } from '../../base/browser/ui/grid/grid.js';
import { IEditorGroupsService } from '../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../workbench/services/editor/common/editorService.js';
import { IPaneCompositePartService } from '../../workbench/services/panecomposite/browser/panecomposite.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../workbench/common/views.js';
import { ILogService } from '../../platform/log/common/log.js';
import { IInstantiationService, ServicesAccessor } from '../../platform/instantiation/common/instantiation.js';
import { ITitleService } from '../../workbench/services/title/browser/titleService.js';
import { mainWindow, CodeWindow } from '../../base/browser/window.js';
import { coalesce } from '../../base/common/arrays.js';
import { ServiceCollection } from '../../platform/instantiation/common/serviceCollection.js';
import { InstantiationService } from '../../platform/instantiation/common/instantiationService.js';
import { getSingletonServiceDescriptors } from '../../platform/instantiation/common/extensions.js';
import { ILifecycleService, LifecyclePhase, WillShutdownEvent } from '../../workbench/services/lifecycle/common/lifecycle.js';
import { IStorageService, WillSaveStateReason, StorageScope, StorageTarget } from '../../platform/storage/common/storage.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { IHostService } from '../../workbench/services/host/browser/host.js';
import { IDialogService } from '../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../platform/notification/common/notification.js';
import { NotificationService } from '../../workbench/services/notification/common/notificationService.js';
import { IHoverService, WorkbenchHoverDelegate } from '../../platform/hover/browser/hover.js';
import { setHoverDelegateFactory } from '../../base/browser/ui/hover/hoverDelegateFactory.js';
import { setBaseLayerHoverDelegate } from '../../base/browser/ui/hover/hoverDelegate2.js';
import { Registry } from '../../platform/registry/common/platform.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../workbench/common/contributions.js';
import { IEditorFactoryRegistry, EditorExtensions } from '../../workbench/common/editor.js';
import { setARIAContainer } from '../../base/browser/ui/aria/aria.js';
import { FontMeasurements } from '../../editor/browser/config/fontMeasurements.js';
import { createBareFontInfoFromRawSettings } from '../../editor/common/config/fontInfoFromSettings.js';
import { toErrorMessage } from '../../base/common/errorMessage.js';
import { WorkbenchContextKeysHandler } from '../../workbench/browser/contextkeys.js';
import { PixelRatio } from '../../base/browser/pixelRatio.js';
import { AccessibilityProgressSignalScheduler } from '../../platform/accessibilitySignal/browser/progressAccessibilitySignalScheduler.js';
import { setProgressAccessibilitySignalScheduler } from '../../base/browser/ui/progressbar/progressAccessibilitySignal.js';
import { AccessibleViewRegistry } from '../../platform/accessibility/browser/accessibleViewRegistry.js';
import { NotificationAccessibleView } from '../../workbench/browser/parts/notifications/notificationAccessibleView.js';
import { NotificationsCenter } from '../../workbench/browser/parts/notifications/notificationsCenter.js';
import { NotificationsAlerts } from '../../workbench/browser/parts/notifications/notificationsAlerts.js';
import { NotificationsStatus } from '../../workbench/browser/parts/notifications/notificationsStatus.js';
import { registerNotificationCommands } from '../../workbench/browser/parts/notifications/notificationsCommands.js';
import { NotificationsToasts } from '../../workbench/browser/parts/notifications/notificationsToasts.js';
import { IMarkdownRendererService } from '../../platform/markdown/browser/markdownRenderer.js';
import { EditorMarkdownCodeBlockRenderer } from '../../editor/browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js';
import { EditorModal } from './parts/editorModal.js';
import { SyncDescriptor } from '../../platform/instantiation/common/descriptors.js';
import { TitleService } from './parts/titlebarPart.js';

//#region Workbench Options

export interface IWorkbenchOptions {
	/**
	 * Extra classes to be added to the workbench container.
	 */
	extraClasses?: string[];
}

//#endregion

//#region Layout Classes

enum LayoutClasses {
	SIDEBAR_HIDDEN = 'nosidebar',
	MAIN_EDITOR_AREA_HIDDEN = 'nomaineditorarea',
	PANEL_HIDDEN = 'nopanel',
	AUXILIARYBAR_HIDDEN = 'noauxiliarybar',
	CHATBAR_HIDDEN = 'nochatbar',
	FULLSCREEN = 'fullscreen',
	MAXIMIZED = 'maximized',
	EDITOR_MODAL_VISIBLE = 'editor-modal-visible'
}

//#endregion

//#region Part Visibility State

interface IPartVisibilityState {
	sidebar: boolean;
	auxiliaryBar: boolean;
	editor: boolean;
	panel: boolean;
	chatBar: boolean;
}

//#endregion

export class Workbench extends Disposable implements IWorkbenchLayoutService {

	declare readonly _serviceBrand: undefined;

	//#region Lifecycle Events

	private readonly _onWillShutdown = this._register(new Emitter<WillShutdownEvent>());
	readonly onWillShutdown = this._onWillShutdown.event;

	private readonly _onDidShutdown = this._register(new Emitter<void>());
	readonly onDidShutdown = this._onDidShutdown.event;

	//#endregion

	//#region Events

	private readonly _onDidChangeZenMode = this._register(new Emitter<boolean>());
	readonly onDidChangeZenMode = this._onDidChangeZenMode.event;

	private readonly _onDidChangeMainEditorCenteredLayout = this._register(new Emitter<boolean>());
	readonly onDidChangeMainEditorCenteredLayout = this._onDidChangeMainEditorCenteredLayout.event;

	private readonly _onDidChangePanelAlignment = this._register(new Emitter<PanelAlignment>());
	readonly onDidChangePanelAlignment = this._onDidChangePanelAlignment.event;

	private readonly _onDidChangeWindowMaximized = this._register(new Emitter<{ windowId: number; maximized: boolean }>());
	readonly onDidChangeWindowMaximized = this._onDidChangeWindowMaximized.event;

	private readonly _onDidChangePanelPosition = this._register(new Emitter<string>());
	readonly onDidChangePanelPosition = this._onDidChangePanelPosition.event;

	private readonly _onDidChangePartVisibility = this._register(new Emitter<IPartVisibilityChangeEvent>());
	readonly onDidChangePartVisibility = this._onDidChangePartVisibility.event;

	private readonly _onDidChangeNotificationsVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeNotificationsVisibility = this._onDidChangeNotificationsVisibility.event;

	private readonly _onDidChangeAuxiliaryBarMaximized = this._register(new Emitter<void>());
	readonly onDidChangeAuxiliaryBarMaximized = this._onDidChangeAuxiliaryBarMaximized.event;

	private readonly _onDidLayoutMainContainer = this._register(new Emitter<IDimension>());
	readonly onDidLayoutMainContainer = this._onDidLayoutMainContainer.event;

	private readonly _onDidLayoutActiveContainer = this._register(new Emitter<IDimension>());
	readonly onDidLayoutActiveContainer = this._onDidLayoutActiveContainer.event;

	private readonly _onDidLayoutContainer = this._register(new Emitter<{ container: HTMLElement; dimension: IDimension }>());
	readonly onDidLayoutContainer = this._onDidLayoutContainer.event;

	private readonly _onDidAddContainer = this._register(new Emitter<{ container: HTMLElement; disposables: DisposableStore }>());
	readonly onDidAddContainer = this._onDidAddContainer.event;

	private readonly _onDidChangeActiveContainer = this._register(new Emitter<void>());
	readonly onDidChangeActiveContainer = this._onDidChangeActiveContainer.event;

	//#endregion

	//#region Properties

	readonly mainContainer = document.createElement('div');

	get activeContainer(): HTMLElement {
		return this.getContainerFromDocument(getActiveDocument());
	}

	get containers(): Iterable<HTMLElement> {
		const containers: HTMLElement[] = [];
		for (const { window } of getWindows()) {
			containers.push(this.getContainerFromDocument(window.document));
		}
		return containers;
	}

	private getContainerFromDocument(targetDocument: Document): HTMLElement {
		if (targetDocument === this.mainContainer.ownerDocument) {
			return this.mainContainer;
		} else {
			// eslint-disable-next-line no-restricted-syntax
			return targetDocument.body.getElementsByClassName('monaco-workbench')[0] as HTMLElement;
		}
	}

	private _mainContainerDimension!: IDimension;
	get mainContainerDimension(): IDimension { return this._mainContainerDimension; }

	get activeContainerDimension(): IDimension {
		return this.getContainerDimension(this.activeContainer);
	}

	private getContainerDimension(container: HTMLElement): IDimension {
		if (container === this.mainContainer) {
			return this.mainContainerDimension;
		} else {
			return getClientArea(container);
		}
	}

	get mainContainerOffset(): ILayoutOffsetInfo {
		return this.computeContainerOffset();
	}

	get activeContainerOffset(): ILayoutOffsetInfo {
		return this.computeContainerOffset();
	}

	private computeContainerOffset(): ILayoutOffsetInfo {
		let top = 0;
		let quickPickTop = 0;

		if (this.isVisible(Parts.TITLEBAR_PART, mainWindow)) {
			top = this.getPart(Parts.TITLEBAR_PART).maximumHeight;
			quickPickTop = top;
		}

		return { top, quickPickTop };
	}

	//#endregion

	//#region State

	private readonly parts = new Map<string, Part>();
	private workbenchGrid!: SerializableGrid<ISerializableView>;

	private titleBarPartView!: ISerializableView;
	private sideBarPartView!: ISerializableView;
	private panelPartView!: ISerializableView;
	private auxiliaryBarPartView!: ISerializableView;

	// Editor modal
	private editorModal!: EditorModal;
	private chatBarPartView!: ISerializableView;

	private readonly partVisibility: IPartVisibilityState = {
		sidebar: true,
		auxiliaryBar: false,
		editor: false,
		panel: false,
		chatBar: true
	};

	private mainWindowFullscreen = false;
	private readonly maximized = new Set<number>();

	private readonly restoredPromise = new DeferredPromise<void>();
	readonly whenRestored = this.restoredPromise.p;
	private restored = false;

	readonly openedDefaultEditors = false;

	//#endregion

	//#region Services

	private editorGroupService!: IEditorGroupsService;
	private editorService!: IEditorService;
	private paneCompositeService!: IPaneCompositePartService;
	private viewDescriptorService!: IViewDescriptorService;

	//#endregion

	constructor(
		protected readonly parent: HTMLElement,
		private readonly options: IWorkbenchOptions | undefined,
		private readonly serviceCollection: ServiceCollection,
		private readonly logService: ILogService
	) {
		super();

		// Perf: measure workbench startup time
		mark('code/willStartWorkbench');

		this.registerErrorHandler(logService);
	}

	//#region Error Handling

	private registerErrorHandler(logService: ILogService): void {
		// Increase stack trace limit for better errors stacks
		if (!isFirefox) {
			Error.stackTraceLimit = 100;
		}

		// Listen on unhandled rejection events
		// Note: intentionally not registered as disposable to handle
		//       errors that can occur during shutdown phase.
		mainWindow.addEventListener('unhandledrejection', (event) => {
			// See https://developer.mozilla.org/en-US/docs/Web/API/PromiseRejectionEvent
			onUnexpectedError(event.reason);

			// Prevent the printing of this event to the console
			event.preventDefault();
		});

		// Install handler for unexpected errors
		setUnexpectedErrorHandler(error => this.handleUnexpectedError(error, logService));
	}

	private previousUnexpectedError: { message: string | undefined; time: number } = { message: undefined, time: 0 };
	private handleUnexpectedError(error: unknown, logService: ILogService): void {
		const message = toErrorMessage(error, true);
		if (!message) {
			return;
		}

		const now = Date.now();
		if (message === this.previousUnexpectedError.message && now - this.previousUnexpectedError.time <= 1000) {
			return; // Return if error message identical to previous and shorter than 1 second
		}

		this.previousUnexpectedError.time = now;
		this.previousUnexpectedError.message = message;

		// Log it
		logService.error(message);
	}

	//#endregion

	//#region Startup

	startup(): IInstantiationService {
		try {
			// Configure emitter leak warning threshold
			this._register(setGlobalLeakWarningThreshold(175));

			// Services
			const instantiationService = this.initServices(this.serviceCollection);

			instantiationService.invokeFunction(accessor => {
				const lifecycleService = accessor.get(ILifecycleService);
				const storageService = accessor.get(IStorageService);
				const configurationService = accessor.get(IConfigurationService);
				const hostService = accessor.get(IHostService);
				const hoverService = accessor.get(IHoverService);
				const dialogService = accessor.get(IDialogService);
				const notificationService = accessor.get(INotificationService) as NotificationService;
				const markdownRendererService = accessor.get(IMarkdownRendererService);

				// Set code block renderer for markdown rendering
				markdownRendererService.setDefaultCodeBlockRenderer(instantiationService.createInstance(EditorMarkdownCodeBlockRenderer));

				// Default Hover Delegate must be registered before creating any workbench/layout components
				setHoverDelegateFactory((placement, enableInstantHover) => instantiationService.createInstance(WorkbenchHoverDelegate, placement, { instantHover: enableInstantHover }, {}));
				setBaseLayerHoverDelegate(hoverService);

				// Layout
				this.initLayout(accessor);

				// Registries - this creates and registers all parts
				Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).start(accessor);
				Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor);

				// Context Keys
				this._register(instantiationService.createInstance(WorkbenchContextKeysHandler));

				// Register Listeners
				this.registerListeners(lifecycleService, storageService, configurationService, hostService, dialogService);

				// Render Workbench
				this.renderWorkbench(instantiationService, notificationService, storageService, configurationService);

				// Workbench Layout
				this.createWorkbenchLayout();

				// Workbench Management
				this.createWorkbenchManagement(instantiationService);

				// Layout
				this.layout();

				// Restore
				this.restore(lifecycleService);
			});

			return instantiationService;
		} catch (error) {
			onUnexpectedError(error);

			throw error; // rethrow because this is a critical issue we cannot handle properly here
		}
	}

	private initServices(serviceCollection: ServiceCollection): IInstantiationService {
		// Layout Service
		serviceCollection.set(IWorkbenchLayoutService, this);

		// Title Service - agent sessions titlebar with dedicated part overrides
		serviceCollection.set(ITitleService, new SyncDescriptor(TitleService, []));

		// All Contributed Services
		const contributedServices = getSingletonServiceDescriptors();
		for (const [id, descriptor] of contributedServices) {
			serviceCollection.set(id, descriptor);
		}

		const instantiationService = new InstantiationService(serviceCollection, true);

		// Wrap up
		instantiationService.invokeFunction(accessor => {
			const lifecycleService = accessor.get(ILifecycleService);

			// TODO@Sandeep debt around cyclic dependencies
			const configurationService = accessor.get(IConfigurationService);
			// eslint-disable-next-line local/code-no-in-operator
			if (configurationService && 'acquireInstantiationService' in configurationService) {
				(configurationService as { acquireInstantiationService: (instantiationService: unknown) => void }).acquireInstantiationService(instantiationService);
			}

			// Signal to lifecycle that services are set
			lifecycleService.phase = LifecyclePhase.Ready;
		});

		return instantiationService;
	}

	private registerListeners(lifecycleService: ILifecycleService, storageService: IStorageService, configurationService: IConfigurationService, hostService: IHostService, dialogService: IDialogService): void {
		// Configuration changes
		this._register(configurationService.onDidChangeConfiguration(e => this.updateFontAliasing(e, configurationService)));

		// Font Info
		if (isNative) {
			this._register(storageService.onWillSaveState(e => {
				if (e.reason === WillSaveStateReason.SHUTDOWN) {
					this.storeFontInfo(storageService);
				}
			}));
		} else {
			this._register(lifecycleService.onWillShutdown(() => this.storeFontInfo(storageService)));
		}

		// Lifecycle
		this._register(lifecycleService.onWillShutdown(event => this._onWillShutdown.fire(event)));
		this._register(lifecycleService.onDidShutdown(() => {
			this._onDidShutdown.fire();
			this.dispose();
		}));

		// Flush storage on window focus loss
		this._register(hostService.onDidChangeFocus(focus => {
			if (!focus) {
				storageService.flush();
			}
		}));

		// Dialogs showing/hiding
		this._register(dialogService.onWillShowDialog(() => this.mainContainer.classList.add('modal-dialog-visible')));
		this._register(dialogService.onDidShowDialog(() => this.mainContainer.classList.remove('modal-dialog-visible')));
	}

	//#region Font Aliasing and Caching

	private fontAliasing: 'default' | 'antialiased' | 'none' | 'auto' | undefined;
	private updateFontAliasing(e: IConfigurationChangeEvent | undefined, configurationService: IConfigurationService) {
		if (!isMacintosh) {
			return; // macOS only
		}

		if (e && !e.affectsConfiguration('workbench.fontAliasing')) {
			return;
		}

		const aliasing = configurationService.getValue<'default' | 'antialiased' | 'none' | 'auto'>('workbench.fontAliasing');
		if (this.fontAliasing === aliasing) {
			return;
		}

		this.fontAliasing = aliasing;

		// Remove all
		const fontAliasingValues: (typeof aliasing)[] = ['antialiased', 'none', 'auto'];
		this.mainContainer.classList.remove(...fontAliasingValues.map(value => `monaco-font-aliasing-${value}`));

		// Add specific
		if (fontAliasingValues.some(option => option === aliasing)) {
			this.mainContainer.classList.add(`monaco-font-aliasing-${aliasing}`);
		}
	}

	private restoreFontInfo(storageService: IStorageService, configurationService: IConfigurationService): void {
		const storedFontInfoRaw = storageService.get('editorFontInfo', StorageScope.APPLICATION);
		if (storedFontInfoRaw) {
			try {
				const storedFontInfo = JSON.parse(storedFontInfoRaw);
				if (Array.isArray(storedFontInfo)) {
					FontMeasurements.restoreFontInfo(mainWindow, storedFontInfo);
				}
			} catch (err) {
				/* ignore */
			}
		}

		FontMeasurements.readFontInfo(mainWindow, createBareFontInfoFromRawSettings(configurationService.getValue('editor'), PixelRatio.getInstance(mainWindow).value));
	}

	private storeFontInfo(storageService: IStorageService): void {
		const serializedFontInfo = FontMeasurements.serializeFontInfo(mainWindow);
		if (serializedFontInfo) {
			storageService.store('editorFontInfo', JSON.stringify(serializedFontInfo), StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
	}

	//#endregion

	private renderWorkbench(instantiationService: IInstantiationService, notificationService: NotificationService, storageService: IStorageService, configurationService: IConfigurationService): void {
		// ARIA & Signals
		setARIAContainer(this.mainContainer);
		setProgressAccessibilitySignalScheduler((msDelayTime: number, msLoopTime?: number) => instantiationService.createInstance(AccessibilityProgressSignalScheduler, msDelayTime, msLoopTime));

		// State specific classes
		const platformClass = isWindows ? 'windows' : isLinux ? 'linux' : 'mac';
		const workbenchClasses = coalesce([
			'monaco-workbench',
			'agent-sessions-workbench',
			platformClass,
			isWeb ? 'web' : undefined,
			isChrome ? 'chromium' : isFirefox ? 'firefox' : isSafari ? 'safari' : undefined,
			...this.getLayoutClasses(),
			...(this.options?.extraClasses ? this.options.extraClasses : [])
		]);

		this.mainContainer.classList.add(...workbenchClasses);

		// Apply font aliasing
		this.updateFontAliasing(undefined, configurationService);

		// Warm up font cache information before building up too many dom elements
		this.restoreFontInfo(storageService, configurationService);

		// Create Parts (excluding editor - it will be in a modal)
		for (const { id, role, classes } of [
			{ id: Parts.TITLEBAR_PART, role: 'none', classes: ['titlebar'] },
			{ id: Parts.SIDEBAR_PART, role: 'none', classes: ['sidebar', 'left'] },
			{ id: Parts.AUXILIARYBAR_PART, role: 'none', classes: ['auxiliarybar', 'basepanel', 'right'] },
			{ id: Parts.CHATBAR_PART, role: 'main', classes: ['chatbar', 'basepanel', 'right'] },
			{ id: Parts.PANEL_PART, role: 'none', classes: ['panel', 'basepanel', positionToString(this.getPanelPosition())] },
		]) {
			const partContainer = this.createPartContainer(id, role, classes);

			mark(`code/willCreatePart/${id}`);
			this.getPart(id).create(partContainer);
			mark(`code/didCreatePart/${id}`);
		}

		// Create Editor Part in modal
		this.createEditorModal();

		// Notification Handlers
		this.createNotificationsHandlers(instantiationService, notificationService);

		// Add Workbench to DOM
		this.parent.appendChild(this.mainContainer);
	}

	private createNotificationsHandlers(instantiationService: IInstantiationService, notificationService: NotificationService): void {
		// Instantiate Notification components
		const notificationsCenter = this._register(instantiationService.createInstance(NotificationsCenter, this.mainContainer, notificationService.model));
		const notificationsToasts = this._register(instantiationService.createInstance(NotificationsToasts, this.mainContainer, notificationService.model));
		this._register(instantiationService.createInstance(NotificationsAlerts, notificationService.model));
		const notificationsStatus = instantiationService.createInstance(NotificationsStatus, notificationService.model);

		// Visibility
		this._register(notificationsCenter.onDidChangeVisibility(() => {
			notificationsStatus.update(notificationsCenter.isVisible, notificationsToasts.isVisible);
			notificationsToasts.update(notificationsCenter.isVisible);
		}));

		this._register(notificationsToasts.onDidChangeVisibility(() => {
			notificationsStatus.update(notificationsCenter.isVisible, notificationsToasts.isVisible);
		}));

		// Register Commands
		registerNotificationCommands(notificationsCenter, notificationsToasts, notificationService.model);

		// Register notification accessible view
		AccessibleViewRegistry.register(new NotificationAccessibleView());

		// Register with Layout
		this.registerNotifications({
			onDidChangeNotificationsVisibility: Event.map(Event.any(notificationsToasts.onDidChangeVisibility, notificationsCenter.onDidChangeVisibility), () => notificationsToasts.isVisible || notificationsCenter.isVisible)
		});
	}

	private createPartContainer(id: string, role: string, classes: string[]): HTMLElement {
		const part = document.createElement('div');
		part.classList.add('part', ...classes);
		part.id = id;
		part.setAttribute('role', role);
		return part;
	}

	private createEditorModal(): void {
		const editorPart = this.getPart(Parts.EDITOR_PART);
		this.editorModal = this._register(new EditorModal(
			this.mainContainer,
			editorPart,
			this.editorGroupService
		));
	}

	private restore(lifecycleService: ILifecycleService): void {
		// Update perf marks
		mark('code/didStartWorkbench');
		performance.measure('perf: workbench create & restore', 'code/didLoadWorkbenchMain', 'code/didStartWorkbench');

		// Restore parts (open default view containers)
		this.restoreParts();

		// Set lifecycle phase to `Restored`
		lifecycleService.phase = LifecyclePhase.Restored;

		// Mark as restored
		this.setRestored();

		// Set lifecycle phase to `Eventually` after a short delay and when idle (min 2.5sec, max 5sec)
		const eventuallyPhaseScheduler = this._register(new RunOnceScheduler(() => {
			this._register(runWhenWindowIdle(mainWindow, () => lifecycleService.phase = LifecyclePhase.Eventually, 2500));
		}, 2500));
		eventuallyPhaseScheduler.schedule();
	}

	private restoreParts(): void {
		// Open default view containers for each visible part
		const partsToRestore: { location: ViewContainerLocation; visible: boolean }[] = [
			{ location: ViewContainerLocation.Sidebar, visible: this.partVisibility.sidebar },
			{ location: ViewContainerLocation.Panel, visible: this.partVisibility.panel },
			{ location: ViewContainerLocation.AuxiliaryBar, visible: this.partVisibility.auxiliaryBar },
			{ location: ViewContainerLocation.ChatBar, visible: this.partVisibility.chatBar },
		];

		for (const { location, visible } of partsToRestore) {
			if (visible) {
				const defaultViewContainer = this.viewDescriptorService.getDefaultViewContainer(location);
				if (defaultViewContainer) {
					this.paneCompositeService.openPaneComposite(defaultViewContainer.id, location);
				}
			}
		}
	}

	//#endregion

	//#region Initialization

	initLayout(accessor: ServicesAccessor): void {
		// Services - accessing these triggers their instantiation
		// which creates and registers the parts
		this.editorGroupService = accessor.get(IEditorGroupsService);
		this.editorService = accessor.get(IEditorService);
		this.paneCompositeService = accessor.get(IPaneCompositePartService);
		this.viewDescriptorService = accessor.get(IViewDescriptorService);
		accessor.get(ITitleService);

		// Register layout listeners
		this.registerLayoutListeners();

		// Show editor part when an editor opens
		this._register(this.editorService.onWillOpenEditor(() => {
			if (!this.partVisibility.editor) {
				this.setEditorHidden(false);
			}
		}));

		// Hide editor part when last editor closes
		this._register(this.editorService.onDidCloseEditor(() => {
			if (this.partVisibility.editor && this.areAllGroupsEmpty()) {
				this.setEditorHidden(true);
			}
		}));

		// Initialize layout state (must be done before createWorkbenchLayout)
		this._mainContainerDimension = getClientArea(this.parent, new Dimension(800, 600));
	}

	private areAllGroupsEmpty(): boolean {
		for (const group of this.editorGroupService.groups) {
			if (!group.isEmpty) {
				return false;
			}
		}
		return true;
	}

	private registerLayoutListeners(): void {
		// Fullscreen changes
		this._register(onDidChangeFullscreen(windowId => {
			if (windowId === getWindowId(mainWindow)) {
				this.mainWindowFullscreen = isFullscreen(mainWindow);
				this.updateFullscreenClass();
				this.layout();
			}
		}));
	}

	private updateFullscreenClass(): void {
		if (this.mainWindowFullscreen) {
			this.mainContainer.classList.add(LayoutClasses.FULLSCREEN);
		} else {
			this.mainContainer.classList.remove(LayoutClasses.FULLSCREEN);
		}
	}

	//#endregion

	//#region Workbench Layout Creation

	createWorkbenchLayout(): void {
		const titleBar = this.getPart(Parts.TITLEBAR_PART);
		const editorPart = this.getPart(Parts.EDITOR_PART);
		const panelPart = this.getPart(Parts.PANEL_PART);
		const auxiliaryBarPart = this.getPart(Parts.AUXILIARYBAR_PART);
		const sideBar = this.getPart(Parts.SIDEBAR_PART);
		const chatBarPart = this.getPart(Parts.CHATBAR_PART);

		// View references for parts in the grid (editor is NOT in grid)
		this.titleBarPartView = titleBar;
		this.sideBarPartView = sideBar;
		this.panelPartView = panelPart;
		this.auxiliaryBarPartView = auxiliaryBarPart;
		this.chatBarPartView = chatBarPart;

		const viewMap: { [key: string]: ISerializableView } = {
			[Parts.TITLEBAR_PART]: this.titleBarPartView,
			[Parts.PANEL_PART]: this.panelPartView,
			[Parts.SIDEBAR_PART]: this.sideBarPartView,
			[Parts.AUXILIARYBAR_PART]: this.auxiliaryBarPartView,
			[Parts.CHATBAR_PART]: this.chatBarPartView
		};

		const fromJSON = ({ type }: { type: string }) => viewMap[type];
		const workbenchGrid = SerializableGrid.deserialize(
			this.createGridDescriptor(),
			{ fromJSON },
			{ proportionalLayout: false }
		);

		this.mainContainer.prepend(workbenchGrid.element);
		this.mainContainer.setAttribute('role', 'application');
		this.workbenchGrid = workbenchGrid;
		this.workbenchGrid.edgeSnapping = this.mainWindowFullscreen;

		// Listen for part visibility changes (for parts in grid)
		for (const part of [titleBar, panelPart, sideBar, auxiliaryBarPart, chatBarPart]) {
			this._register(part.onDidVisibilityChange(visible => {
				if (part === sideBar) {
					this.setSideBarHidden(!visible);
				} else if (part === panelPart) {
					this.setPanelHidden(!visible);
				} else if (part === auxiliaryBarPart) {
					this.setAuxiliaryBarHidden(!visible);
				} else if (part === chatBarPart) {
					this.setChatBarHidden(!visible);
				}

				this._onDidChangePartVisibility.fire({ partId: part.getId(), visible });
				this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
			}));
		}

		// Listen for editor part visibility changes (modal)
		this._register(editorPart.onDidVisibilityChange(visible => {
			this.setEditorHidden(!visible);
			this._onDidChangePartVisibility.fire({ partId: editorPart.getId(), visible });
			this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
		}));
	}

	createWorkbenchManagement(_instantiationService: IInstantiationService): void {
		// No floating toolbars in this layout
	}

	/**
	 * Creates the grid descriptor for the Agent Sessions layout.
	 * Editor is NOT included - it's rendered as a modal overlay.
	 *
	 * Structure (horizontal orientation):
	 * - Sidebar (left, spans full height from top to bottom)
	 * - Right section (vertical):
	 *   - Titlebar (top of right section)
	 *   - Top right (horizontal): Chat Bar | Auxiliary Bar
	 *   - Panel (below chat and auxiliary bar only)
	 */
	private createGridDescriptor(): ISerializedGrid {
		const { width, height } = this._mainContainerDimension;

		// Default sizes
		const sideBarSize = 300;
		const auxiliaryBarSize = 300;
		const panelSize = 300;
		const titleBarHeight = this.titleBarPartView?.minimumHeight ?? 30;

		// Calculate right section width and chat bar width
		const rightSectionWidth = Math.max(0, width - sideBarSize);
		const chatBarWidth = Math.max(0, rightSectionWidth - auxiliaryBarSize);

		const contentHeight = height - titleBarHeight;
		const topRightHeight = contentHeight - panelSize;

		const titleBarNode: ISerializedLeafNode = {
			type: 'leaf',
			data: { type: Parts.TITLEBAR_PART },
			size: titleBarHeight,
			visible: true
		};

		const sideBarNode: ISerializedLeafNode = {
			type: 'leaf',
			data: { type: Parts.SIDEBAR_PART },
			size: sideBarSize,
			visible: this.partVisibility.sidebar
		};

		const auxiliaryBarNode: ISerializedLeafNode = {
			type: 'leaf',
			data: { type: Parts.AUXILIARYBAR_PART },
			size: auxiliaryBarSize,
			visible: this.partVisibility.auxiliaryBar
		};

		const chatBarNode: ISerializedLeafNode = {
			type: 'leaf',
			data: { type: Parts.CHATBAR_PART },
			size: chatBarWidth,
			visible: this.partVisibility.chatBar
		};

		const panelNode: ISerializedLeafNode = {
			type: 'leaf',
			data: { type: Parts.PANEL_PART },
			size: panelSize,
			visible: this.partVisibility.panel
		};

		// Top right section: Chat Bar | Auxiliary Bar (horizontal)
		const topRightSection: ISerializedNode = {
			type: 'branch',
			data: [chatBarNode, auxiliaryBarNode],
			size: topRightHeight
		};

		// Right section: Titlebar | Top Right | Panel (vertical)
		const rightSection: ISerializedNode = {
			type: 'branch',
			data: [titleBarNode, topRightSection, panelNode],
			size: rightSectionWidth
		};

		const result: ISerializedGrid = {
			root: {
				type: 'branch',
				size: height,
				data: [
					sideBarNode,
					rightSection
				]
			},
			orientation: Orientation.HORIZONTAL,
			width,
			height
		};

		return result;
	}

	//#endregion

	//#region Layout Methods

	layout(): void {
		this._mainContainerDimension = getClientArea(
			this.mainWindowFullscreen ? mainWindow.document.body : this.parent
		);
		this.logService.trace(`Workbench#layout, height: ${this._mainContainerDimension.height}, width: ${this._mainContainerDimension.width}`);

		size(this.mainContainer, this._mainContainerDimension.width, this._mainContainerDimension.height);

		// Layout the grid widget
		this.workbenchGrid.layout(this._mainContainerDimension.width, this._mainContainerDimension.height);

		// Layout the editor modal with workbench dimensions
		this.editorModal.layout(this._mainContainerDimension.width, this._mainContainerDimension.height);

		// Emit as event
		this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
	}

	private handleContainerDidLayout(container: HTMLElement, dimension: IDimension): void {
		this._onDidLayoutContainer.fire({ container, dimension });
		if (container === this.mainContainer) {
			this._onDidLayoutMainContainer.fire(dimension);
		}
		if (container === this.activeContainer) {
			this._onDidLayoutActiveContainer.fire(dimension);
		}
	}

	getLayoutClasses(): string[] {
		return coalesce([
			!this.partVisibility.sidebar ? LayoutClasses.SIDEBAR_HIDDEN : undefined,
			!this.partVisibility.editor ? LayoutClasses.MAIN_EDITOR_AREA_HIDDEN : undefined,
			!this.partVisibility.panel ? LayoutClasses.PANEL_HIDDEN : undefined,
			!this.partVisibility.auxiliaryBar ? LayoutClasses.AUXILIARYBAR_HIDDEN : undefined,
			!this.partVisibility.chatBar ? LayoutClasses.CHATBAR_HIDDEN : undefined,
			this.mainWindowFullscreen ? LayoutClasses.FULLSCREEN : undefined
		]);
	}

	//#endregion

	//#region Part Management

	registerPart(part: Part): IDisposable {
		const id = part.getId();
		this.parts.set(id, part);
		return toDisposable(() => this.parts.delete(id));
	}

	getPart(key: Parts): Part {
		const part = this.parts.get(key);
		if (!part) {
			throw new Error(`Unknown part ${key}`);
		}
		return part;
	}

	hasFocus(part: Parts): boolean {
		const container = this.getContainer(mainWindow, part);
		if (!container) {
			return false;
		}

		const activeElement = getActiveElement();
		if (!activeElement) {
			return false;
		}

		return isAncestorUsingFlowTo(activeElement, container);
	}

	focusPart(part: MULTI_WINDOW_PARTS, targetWindow: Window): void;
	focusPart(part: SINGLE_WINDOW_PARTS): void;
	focusPart(part: Parts, targetWindow: Window = mainWindow): void {
		switch (part) {
			case Parts.EDITOR_PART:
				this.editorGroupService.activeGroup.focus();
				break;
			case Parts.PANEL_PART:
				this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel)?.focus();
				break;
			case Parts.SIDEBAR_PART:
				this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar)?.focus();
				break;
			case Parts.AUXILIARYBAR_PART:
				this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)?.focus();
				break;
			case Parts.CHATBAR_PART:
				this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.ChatBar)?.focus();
				break;
			default: {
				const container = this.getContainer(targetWindow, part);
				container?.focus();
			}
		}
	}

	focus(): void {
		this.focusPart(Parts.CHATBAR_PART);
	}

	//#endregion

	//#region Container Methods

	getContainer(targetWindow: Window): HTMLElement;
	getContainer(targetWindow: Window, part: Parts): HTMLElement | undefined;
	getContainer(targetWindow: Window, part?: Parts): HTMLElement | undefined {
		if (typeof part === 'undefined') {
			return this.getContainerFromDocument(targetWindow.document);
		}

		if (targetWindow === mainWindow) {
			return this.parts.get(part)?.getContainer();
		}

		// For auxiliary windows, only editor part is supported
		if (part === Parts.EDITOR_PART) {
			const container = this.getContainerFromDocument(targetWindow.document);
			const partCandidate = this.editorGroupService.getPart(container);
			if (partCandidate instanceof Part) {
				return partCandidate.getContainer();
			}
		}

		return undefined;
	}

	whenContainerStylesLoaded(_window: CodeWindow): Promise<void> | undefined {
		return undefined;
	}

	//#endregion

	//#region Part Visibility

	isActivityBarHidden(): boolean {
		return true; // No activity bar in this layout
	}

	isVisible(part: SINGLE_WINDOW_PARTS): boolean;
	isVisible(part: MULTI_WINDOW_PARTS, targetWindow: Window): boolean;
	isVisible(part: Parts, targetWindow?: Window): boolean {
		switch (part) {
			case Parts.TITLEBAR_PART:
				return true; // Always visible
			case Parts.SIDEBAR_PART:
				return this.partVisibility.sidebar;
			case Parts.AUXILIARYBAR_PART:
				return this.partVisibility.auxiliaryBar;
			case Parts.EDITOR_PART:
				return this.partVisibility.editor;
			case Parts.PANEL_PART:
				return this.partVisibility.panel;
			case Parts.CHATBAR_PART:
				return this.partVisibility.chatBar;
			case Parts.ACTIVITYBAR_PART:
			case Parts.STATUSBAR_PART:
			case Parts.BANNER_PART:
			default:
				return false;
		}
	}

	setPartHidden(hidden: boolean, part: Parts): void {
		switch (part) {
			case Parts.SIDEBAR_PART:
				this.setSideBarHidden(hidden);
				break;
			case Parts.AUXILIARYBAR_PART:
				this.setAuxiliaryBarHidden(hidden);
				break;
			case Parts.EDITOR_PART:
				this.setEditorHidden(hidden);
				break;
			case Parts.PANEL_PART:
				this.setPanelHidden(hidden);
				break;
			case Parts.CHATBAR_PART:
				this.setChatBarHidden(hidden);
				break;
		}
	}

	private setSideBarHidden(hidden: boolean): void {
		if (this.partVisibility.sidebar === !hidden) {
			return;
		}

		this.partVisibility.sidebar = !hidden;
		this.mainContainer.classList.toggle(LayoutClasses.SIDEBAR_HIDDEN, hidden);

		// Propagate to grid
		this.workbenchGrid.setViewVisible(
			this.sideBarPartView,
			!hidden,
		);

		// If sidebar becomes visible, show last active Viewlet or default viewlet
		if (!hidden && !this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar)) {
			const viewletToOpen = this.paneCompositeService.getLastActivePaneCompositeId(ViewContainerLocation.Sidebar);
			if (viewletToOpen) {
				this.paneCompositeService.openPaneComposite(viewletToOpen, ViewContainerLocation.Sidebar);
			}
		}
	}

	private setAuxiliaryBarHidden(hidden: boolean): void {
		if (this.partVisibility.auxiliaryBar === !hidden) {
			return;
		}

		this.partVisibility.auxiliaryBar = !hidden;
		this.mainContainer.classList.toggle(LayoutClasses.AUXILIARYBAR_HIDDEN, hidden);

		// Propagate to grid
		this.workbenchGrid.setViewVisible(
			this.auxiliaryBarPartView,
			!hidden,
		);

		// If auxiliary bar becomes visible, show last active pane composite
		if (!hidden && !this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)) {
			const paneCompositeToOpen = this.paneCompositeService.getLastActivePaneCompositeId(ViewContainerLocation.AuxiliaryBar);
			if (paneCompositeToOpen) {
				this.paneCompositeService.openPaneComposite(paneCompositeToOpen, ViewContainerLocation.AuxiliaryBar);
			}
		}
	}

	private setEditorHidden(hidden: boolean): void {
		if (this.partVisibility.editor === !hidden) {
			return;
		}

		this.partVisibility.editor = !hidden;
		this.mainContainer.classList.toggle(LayoutClasses.MAIN_EDITOR_AREA_HIDDEN, hidden);
		this.mainContainer.classList.toggle(LayoutClasses.EDITOR_MODAL_VISIBLE, !hidden);

		// Show/hide modal
		if (hidden) {
			this.editorModal.hide();
		} else {
			this.editorModal.show();
		}
	}

	private setPanelHidden(hidden: boolean): void {
		if (this.partVisibility.panel === !hidden) {
			return;
		}

		// If hiding and the panel is maximized, exit maximized state first
		if (hidden && this.workbenchGrid.hasMaximizedView()) {
			this.workbenchGrid.exitMaximizedView();
		}

		this.partVisibility.panel = !hidden;
		this.mainContainer.classList.toggle(LayoutClasses.PANEL_HIDDEN, hidden);

		// Propagate to grid
		this.workbenchGrid.setViewVisible(
			this.panelPartView,
			!hidden,
		);

		// If panel becomes visible, show last active panel
		if (!hidden && !this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel)) {
			const panelToOpen = this.paneCompositeService.getLastActivePaneCompositeId(ViewContainerLocation.Panel);
			if (panelToOpen) {
				this.paneCompositeService.openPaneComposite(panelToOpen, ViewContainerLocation.Panel);
			}
		}
	}

	private setChatBarHidden(hidden: boolean): void {
		if (this.partVisibility.chatBar === !hidden) {
			return;
		}

		this.partVisibility.chatBar = !hidden;
		this.mainContainer.classList.toggle(LayoutClasses.CHATBAR_HIDDEN, hidden);

		// Propagate to grid
		this.workbenchGrid.setViewVisible(this.chatBarPartView, !hidden);

		// If chat bar becomes hidden, also hide the current active pane composite
		if (hidden && this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.ChatBar)) {
			this.paneCompositeService.hideActivePaneComposite(ViewContainerLocation.ChatBar);
		}

		// If chat bar becomes visible, show last active pane composite or default
		if (!hidden && !this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.ChatBar)) {
			const paneCompositeToOpen = this.paneCompositeService.getLastActivePaneCompositeId(ViewContainerLocation.ChatBar) ??
				this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.ChatBar)?.id;
			if (paneCompositeToOpen) {
				this.paneCompositeService.openPaneComposite(paneCompositeToOpen, ViewContainerLocation.ChatBar);
			}
		}
	}

	//#endregion

	//#region Position Methods (Fixed - Not Configurable)

	getSideBarPosition(): Position {
		return Position.LEFT; // Always left in this layout
	}

	getPanelPosition(): Position {
		return Position.BOTTOM; // Always bottom in this layout
	}

	setPanelPosition(_position: Position): void {
		// No-op: Panel position is fixed in this layout
	}

	getPanelAlignment(): PanelAlignment {
		return 'justify'; // Full width panel
	}

	setPanelAlignment(_alignment: PanelAlignment): void {
		// No-op: Panel alignment is fixed in this layout
	}

	//#endregion

	//#region Size Methods

	getSize(part: Parts): IViewSize {
		const view = this.getPartView(part);
		if (!view) {
			return { width: 0, height: 0 };
		}
		return this.workbenchGrid.getViewSize(view);
	}

	setSize(part: Parts, size: IViewSize): void {
		const view = this.getPartView(part);
		if (view) {
			this.workbenchGrid.resizeView(view, size);
		}
	}

	resizePart(part: Parts, sizeChangeWidth: number, sizeChangeHeight: number): void {
		const view = this.getPartView(part);
		if (!view) {
			return;
		}

		const currentSize = this.workbenchGrid.getViewSize(view);
		this.workbenchGrid.resizeView(view, {
			width: currentSize.width + sizeChangeWidth,
			height: currentSize.height + sizeChangeHeight
		});
	}

	private getPartView(part: Parts): ISerializableView | undefined {
		switch (part) {
			case Parts.TITLEBAR_PART:
				return this.titleBarPartView;
			case Parts.SIDEBAR_PART:
				return this.sideBarPartView;
			case Parts.AUXILIARYBAR_PART:
				return this.auxiliaryBarPartView;
			case Parts.EDITOR_PART:
				return undefined; // Editor is not in the grid, it's a modal
			case Parts.PANEL_PART:
				return this.panelPartView;
			case Parts.CHATBAR_PART:
				return this.chatBarPartView;
			default:
				return undefined;
		}
	}

	getMaximumEditorDimensions(_container: HTMLElement): IDimension {
		// Return the available space for editor (excluding other parts)
		const sidebarWidth = this.partVisibility.sidebar ? this.workbenchGrid.getViewSize(this.sideBarPartView).width : 0;
		const auxiliaryBarWidth = this.partVisibility.auxiliaryBar ? this.workbenchGrid.getViewSize(this.auxiliaryBarPartView).width : 0;
		const panelHeight = this.partVisibility.panel ? this.workbenchGrid.getViewSize(this.panelPartView).height : 0;
		const titleBarHeight = this.workbenchGrid.getViewSize(this.titleBarPartView).height;

		return new Dimension(
			this._mainContainerDimension.width - sidebarWidth - auxiliaryBarWidth,
			this._mainContainerDimension.height - titleBarHeight - panelHeight
		);
	}

	//#endregion

	//#region Unsupported Features (No-ops)

	toggleMaximizedPanel(): void {
		if (!this.workbenchGrid) {
			return;
		}

		if (this.isPanelMaximized()) {
			this.workbenchGrid.exitMaximizedView();
		} else {
			this.workbenchGrid.maximizeView(this.panelPartView, [this.titleBarPartView, this.sideBarPartView]);
		}
	}

	isPanelMaximized(): boolean {
		if (!this.workbenchGrid) {
			return false;
		}

		return this.workbenchGrid.isViewMaximized(this.panelPartView);
	}

	toggleMaximizedAuxiliaryBar(): void {
		// No-op: Maximize not supported in this layout
	}

	setAuxiliaryBarMaximized(_maximized: boolean): boolean {
		return false; // Maximize not supported
	}

	isAuxiliaryBarMaximized(): boolean {
		return false; // Maximize not supported
	}

	toggleZenMode(): void {
		// No-op: Zen mode not supported in this layout
	}

	toggleMenuBar(): void {
		// No-op: Menu bar toggle not supported in this layout
	}

	isMainEditorLayoutCentered(): boolean {
		return false; // Centered layout not supported
	}

	centerMainEditorLayout(_active: boolean): void {
		// No-op: Centered layout not supported in this layout
	}

	hasMainWindowBorder(): boolean {
		return false;
	}

	getMainWindowBorderRadius(): string | undefined {
		return undefined;
	}

	//#endregion

	//#region Window Maximized State

	isWindowMaximized(targetWindow: Window): boolean {
		return this.maximized.has(getWindowId(targetWindow));
	}

	updateWindowMaximizedState(targetWindow: Window, maximized: boolean): void {
		const windowId = getWindowId(targetWindow);
		if (maximized) {
			this.maximized.add(windowId);
			if (targetWindow === mainWindow) {
				this.mainContainer.classList.add(LayoutClasses.MAXIMIZED);
			}
		} else {
			this.maximized.delete(windowId);
			if (targetWindow === mainWindow) {
				this.mainContainer.classList.remove(LayoutClasses.MAXIMIZED);
			}
		}

		this._onDidChangeWindowMaximized.fire({ windowId, maximized });
	}

	//#endregion

	//#region Neighbor Parts

	getVisibleNeighborPart(part: Parts, direction: Direction): Parts | undefined {
		if (!this.workbenchGrid) {
			return undefined;
		}

		const view = this.getPartView(part);
		if (!view) {
			return undefined;
		}

		const neighbor = this.workbenchGrid.getNeighborViews(view, direction, false);
		if (neighbor.length === 0) {
			return undefined;
		}

		const neighborView = neighbor[0];

		if (neighborView === this.titleBarPartView) {
			return Parts.TITLEBAR_PART;
		}
		if (neighborView === this.sideBarPartView) {
			return Parts.SIDEBAR_PART;
		}
		if (neighborView === this.auxiliaryBarPartView) {
			return Parts.AUXILIARYBAR_PART;
		}
		// Editor is not in the grid - it's rendered as a modal
		if (neighborView === this.panelPartView) {
			return Parts.PANEL_PART;
		}
		if (neighborView === this.chatBarPartView) {
			return Parts.CHATBAR_PART;
		}

		return undefined;
	}

	//#endregion

	//#region Restore

	isRestored(): boolean {
		return this.restored;
	}

	setRestored(): void {
		this.restored = true;
		this.restoredPromise.complete();
	}

	//#endregion

	//#region Notifications Registration

	registerNotifications(delegate: { onDidChangeNotificationsVisibility: Event<boolean> }): void {
		this._register(delegate.onDidChangeNotificationsVisibility(visible => this._onDidChangeNotificationsVisibility.fire(visible)));
	}

	//#endregion
}
