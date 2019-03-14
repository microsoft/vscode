/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/workbench/browser/style';

import { localize } from 'vs/nls';
import { setFileNameComparer } from 'vs/base/common/comparers';
import { IDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { Event, Emitter, setGlobalLeakWarningThreshold } from 'vs/base/common/event';
import { EventType, addDisposableListener, addClasses, addClass, removeClass, isAncestor, getClientArea, position, size, removeClasses } from 'vs/base/browser/dom';
import { runWhenIdle, IdleValue } from 'vs/base/common/async';
import { getZoomLevel, onDidChangeFullscreen, isFullscreen, getZoomFactor } from 'vs/base/browser/browser';
import { mark } from 'vs/base/common/performance';
import { onUnexpectedError, setUnexpectedErrorHandler } from 'vs/base/common/errors';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { Registry } from 'vs/platform/registry/common/platform';
import { isWindows, isLinux, isMacintosh } from 'vs/base/common/platform';
import { IResourceInput } from 'vs/platform/editor/common/editor';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IEditorInputFactoryRegistry, Extensions as EditorExtensions, IUntitledResourceInput, IResourceDiffInput } from 'vs/workbench/common/editor';
import { SidebarPart } from 'vs/workbench/browser/parts/sidebar/sidebarPart';
import { PanelPart } from 'vs/workbench/browser/parts/panel/panelPart';
import { IActionBarRegistry, Extensions as ActionBarExtensions } from 'vs/workbench/browser/actions';
import { PanelRegistry, Extensions as PanelExtensions } from 'vs/workbench/browser/panel';
import { getServices } from 'vs/platform/instantiation/common/extensions';
import { Position, Parts, IWorkbenchLayoutService, ILayoutOptions } from 'vs/workbench/services/layout/browser/layoutService';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IStorageService, StorageScope, IWillSaveStateEvent, WillSaveStateReason } from 'vs/platform/storage/common/storage';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IFileService } from 'vs/platform/files/common/files';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { ITitleService } from 'vs/workbench/services/title/common/titleService';
import { IInstantiationService, ServicesAccessor, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { LifecyclePhase, StartupKind, ILifecycleService, WillShutdownEvent } from 'vs/platform/lifecycle/common/lifecycle';
import { IWindowService, IPath, MenuBarVisibility, getTitleBarStyle } from 'vs/platform/windows/common/windows';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { NotificationService } from 'vs/workbench/services/notification/common/notificationService';
import { NotificationsCenter } from 'vs/workbench/browser/parts/notifications/notificationsCenter';
import { NotificationsAlerts } from 'vs/workbench/browser/parts/notifications/notificationsAlerts';
import { NotificationsStatus } from 'vs/workbench/browser/parts/notifications/notificationsStatus';
import { registerNotificationCommands } from 'vs/workbench/browser/parts/notifications/notificationsCommands';
import { NotificationsToasts } from 'vs/workbench/browser/parts/notifications/notificationsToasts';
import { IEditorService, IResourceEditor } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { Sizing, Direction, Grid, View } from 'vs/base/browser/ui/grid/grid';
import { WorkbenchLegacyLayout } from 'vs/workbench/browser/legacyLayout';
import { setARIAContainer } from 'vs/base/browser/ui/aria/aria';
import { restoreFontInfo, readFontInfo, saveFontInfo } from 'vs/editor/browser/config/configuration';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { ILogService } from 'vs/platform/log/common/log';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { WorkbenchContextKeysHandler } from 'vs/workbench/browser/contextkeys';
import { IDimension } from 'vs/platform/layout/browser/layoutService';
import { Part } from 'vs/workbench/browser/part';
import { IStatusbarService } from 'vs/platform/statusbar/common/statusbar';
import { IActivityBarService } from 'vs/workbench/services/activityBar/browser/activityBarService';
import { coalesce } from 'vs/base/common/arrays';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';

export interface IWorkbenchOptions {
	hasInitialFilesToOpen: boolean;
}

enum Settings {
	MENUBAR_VISIBLE = 'window.menuBarVisibility',
	ACTIVITYBAR_VISIBLE = 'workbench.activityBar.visible',
	STATUSBAR_VISIBLE = 'workbench.statusBar.visible',

	SIDEBAR_POSITION = 'workbench.sideBar.location',
	PANEL_POSITION = 'workbench.panel.defaultLocation',

	FONT_ALIASING = 'workbench.fontAliasing',
	ZEN_MODE_RESTORE = 'zenMode.restore'
}

enum Storage {
	SIDEBAR_HIDDEN = 'workbench.sidebar.hidden',

	PANEL_HIDDEN = 'workbench.panel.hidden',
	PANEL_POSITION = 'workbench.panel.location',

	ZEN_MODE_ENABLED = 'workbench.zenmode.active',
	CENTERED_LAYOUT_ENABLED = 'workbench.centerededitorlayout.active',
}

export class Workbench extends Disposable implements IWorkbenchLayoutService {

	_serviceBrand: ServiceIdentifier<any>;

	private readonly _onShutdown = this._register(new Emitter<void>());
	get onShutdown(): Event<void> { return this._onShutdown.event; }

	private readonly _onWillShutdown = this._register(new Emitter<WillShutdownEvent>());
	get onWillShutdown(): Event<WillShutdownEvent> { return this._onWillShutdown.event; }

	private workbench: HTMLElement = document.createElement('div');

	constructor(
		private readonly parent: HTMLElement,
		private readonly serviceCollection: ServiceCollection,
		logService: ILogService
	) {
		super();

		this.registerErrorHandler(logService);
	}

	private registerErrorHandler(logService: ILogService): void {

		// Listen on unhandled rejection events
		window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {

			// See https://developer.mozilla.org/en-US/docs/Web/API/PromiseRejectionEvent
			onUnexpectedError(event.reason);

			// Prevent the printing of this event to the console
			event.preventDefault();
		});

		// Install handler for unexpected errors
		setUnexpectedErrorHandler(error => this.handleUnexpectedError(error, logService));

		// Inform user about loading issues from the loader
		(<any>self).require.config({
			onError: err => {
				if (err.errorCode === 'load') {
					onUnexpectedError(new Error(localize('loaderErrorNative', "Failed to load a required file. Please restart the application to try again. Details: {0}", JSON.stringify(err))));
				}
			}
		});
	}

	private previousUnexpectedError: { message: string | undefined, time: number } = { message: undefined, time: 0 };
	private handleUnexpectedError(error: any, logService: ILogService): void {
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

	startup(): IInstantiationService {
		try {

			// Configure emitter leak warning threshold
			setGlobalLeakWarningThreshold(175);

			// Setup Intl for comparers
			setFileNameComparer(new IdleValue(() => {
				const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
				return {
					collator: collator,
					collatorIsNumeric: collator.resolvedOptions().numeric
				};
			}));

			// ARIA
			setARIAContainer(document.body);

			// Services
			const instantiationService = this.initServices(this.serviceCollection);

			instantiationService.invokeFunction(accessor => {
				const lifecycleService = accessor.get(ILifecycleService);
				const storageService = accessor.get(IStorageService);
				const configurationService = accessor.get(IConfigurationService);

				// Layout
				this.initLayout(accessor);

				// Registries
				this.initRegistries(accessor);

				// Context Keys
				this._register(instantiationService.createInstance(WorkbenchContextKeysHandler));

				// Register Listeners
				this.registerListeners(lifecycleService, storageService, configurationService);

				// Render Workbench
				this.renderWorkbench(instantiationService, accessor.get(INotificationService) as NotificationService, storageService, configurationService);

				// Workbench Layout
				this.createWorkbenchLayout(instantiationService);

				// Layout
				this.layout();

				// Restore
				this.restoreWorkbench(accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IViewletService), accessor.get(IPanelService), accessor.get(ILogService), lifecycleService).then(undefined, error => onUnexpectedError(error));
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

		//
		// NOTE: DO NOT ADD ANY OTHER SERVICE INTO THE COLLECTION HERE.
		// INSTEAD, CONTRIBUTE IT VIA WORKBENCH.MAIN.TS
		//

		// All Contributed Services
		const contributedServices = getServices();
		for (let contributedService of contributedServices) {
			serviceCollection.set(contributedService.id, contributedService.descriptor);
		}

		const instantationServie = new InstantiationService(serviceCollection, true);

		// Wrap up
		instantationServie.invokeFunction(accessor => {
			const lifecycleService = accessor.get(ILifecycleService);

			// TODO@Ben TODO@Sandeep TODO@Martin debt around cyclic dependencies
			const fileService = accessor.get(IFileService);
			const instantiationService = accessor.get(IInstantiationService);
			const configurationService = accessor.get(IConfigurationService) as any;
			const themeService = accessor.get(IWorkbenchThemeService) as any;

			if (typeof configurationService.acquireFileService === 'function') {
				configurationService.acquireFileService(fileService);
			}

			if (typeof configurationService.acquireInstantiationService === 'function') {
				configurationService.acquireInstantiationService(instantiationService);
			}

			if (typeof themeService.acquireFileService === 'function') {
				themeService.acquireFileService(fileService);
			}

			// Signal to lifecycle that services are set
			lifecycleService.phase = LifecyclePhase.Ready;
		});

		return instantationServie;
	}

	private initRegistries(accessor: ServicesAccessor): void {
		Registry.as<IActionBarRegistry>(ActionBarExtensions.Actionbar).start(accessor);
		Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).start(accessor);
		Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories).start(accessor);
	}

	private registerListeners(
		lifecycleService: ILifecycleService,
		storageService: IStorageService,
		configurationService: IConfigurationService
	): void {

		// Lifecycle
		this._register(lifecycleService.onWillShutdown(event => this._onWillShutdown.fire(event)));
		this._register(lifecycleService.onShutdown(() => {
			this._onShutdown.fire();
			this.dispose();
		}));

		// Storage
		this._register(storageService.onWillSaveState(() => saveFontInfo(storageService)));

		// Configuration changes
		this._register(configurationService.onDidChangeConfiguration(() => this.setFontAliasing(configurationService)));
	}

	private fontAliasing: 'default' | 'antialiased' | 'none' | 'auto';
	private setFontAliasing(configurationService: IConfigurationService) {
		const aliasing = configurationService.getValue<'default' | 'antialiased' | 'none' | 'auto'>(Settings.FONT_ALIASING);
		if (this.fontAliasing === aliasing) {
			return;
		}

		this.fontAliasing = aliasing;

		// Remove all
		const fontAliasingValues: (typeof aliasing)[] = ['antialiased', 'none', 'auto'];
		removeClasses(this.workbench, ...fontAliasingValues.map(value => `monaco-font-aliasing-${value}`));

		// Add specific
		if (fontAliasingValues.some(option => option === aliasing)) {
			addClass(this.workbench, `monaco-font-aliasing-${aliasing}`);
		}
	}

	private renderWorkbench(instantiationService: IInstantiationService, notificationService: NotificationService, storageService: IStorageService, configurationService: IConfigurationService): void {

		// State specific classes
		const platformClass = isWindows ? 'windows' : isLinux ? 'linux' : 'mac';
		const workbenchClasses = coalesce([
			'monaco-workbench',
			platformClass,
			this.state.sideBar.hidden ? 'nosidebar' : undefined,
			this.state.panel.hidden ? 'nopanel' : undefined,
			this.state.statusBar.hidden ? 'nostatusbar' : undefined,
			this.state.fullscreen ? 'fullscreen' : undefined
		]);

		addClasses(this.workbench, ...workbenchClasses);
		addClasses(document.body, platformClass); // used by our fonts

		// Apply font aliasing
		this.setFontAliasing(configurationService);

		// Warm up font cache information before building up too many dom elements
		restoreFontInfo(storageService);
		readFontInfo(BareFontInfo.createFromRawSettings(configurationService.getValue('editor'), getZoomLevel()));

		// Create Parts
		[
			{ id: Parts.TITLEBAR_PART, role: 'contentinfo', classes: ['titlebar'] },
			{ id: Parts.ACTIVITYBAR_PART, role: 'navigation', classes: ['activitybar', this.state.sideBar.position === Position.LEFT ? 'left' : 'right'] },
			{ id: Parts.SIDEBAR_PART, role: 'complementary', classes: ['sidebar', this.state.sideBar.position === Position.LEFT ? 'left' : 'right'] },
			{ id: Parts.EDITOR_PART, role: 'main', classes: ['editor'], options: { restorePreviousState: this.state.editor.restoreEditors } },
			{ id: Parts.PANEL_PART, role: 'complementary', classes: ['panel', this.state.panel.position === Position.BOTTOM ? 'bottom' : 'right'] },
			{ id: Parts.STATUSBAR_PART, role: 'contentinfo', classes: ['statusbar'] }
		].forEach(({ id, role, classes, options }) => {
			const partContainer = this.createPart(id, role, classes);

			if (!configurationService.getValue('workbench.useExperimentalGridLayout')) {
				// TODO@Ben cleanup once moved to grid
				// Insert all workbench parts at the beginning. Issue #52531
				// This is primarily for the title bar to allow overriding -webkit-app-region
				this.workbench.insertBefore(partContainer, this.workbench.lastChild);
			}

			this.getPart(id).create(partContainer, options);
		});

		// Notification Handlers
		this.createNotificationsHandlers(instantiationService, notificationService);

		// Add Workbench to DOM
		this.parent.appendChild(this.workbench);
	}

	private createPart(id: string, role: string, classes: string[]): HTMLElement {
		const part = document.createElement('div');
		addClasses(part, 'part', ...classes);
		part.id = id;
		part.setAttribute('role', role);

		return part;
	}

	private createNotificationsHandlers(instantiationService: IInstantiationService, notificationService: NotificationService): void {

		// Instantiate Notification components
		const notificationsCenter = this._register(instantiationService.createInstance(NotificationsCenter, this.workbench, notificationService.model));
		const notificationsToasts = this._register(instantiationService.createInstance(NotificationsToasts, this.workbench, notificationService.model));
		this._register(instantiationService.createInstance(NotificationsAlerts, notificationService.model));
		const notificationsStatus = instantiationService.createInstance(NotificationsStatus, notificationService.model);

		// Visibility
		this._register(notificationsCenter.onDidChangeVisibility(() => {
			notificationsStatus.update(notificationsCenter.isVisible);
			notificationsToasts.update(notificationsCenter.isVisible);
		}));

		// Register Commands
		registerNotificationCommands(notificationsCenter, notificationsToasts);
	}

	private restoreWorkbench(
		editorService: IEditorService,
		editorGroupService: IEditorGroupsService,
		viewletService: IViewletService,
		panelService: IPanelService,
		logService: ILogService,
		lifecycleService: ILifecycleService
	): Promise<void> {
		const restorePromises: Promise<any>[] = [];

		// Restore editors
		mark('willRestoreEditors');
		restorePromises.push(editorGroupService.whenRestored.then(() => {

			function openEditors(editors: IResourceEditor[], editorService: IEditorService) {
				if (editors.length) {
					return editorService.openEditors(editors);
				}

				return Promise.resolve(undefined);
			}

			if (Array.isArray(this.state.editor.editorsToOpen)) {
				return openEditors(this.state.editor.editorsToOpen, editorService);
			}

			return this.state.editor.editorsToOpen.then(editors => openEditors(editors, editorService));
		}).then(() => mark('didRestoreEditors')));

		// Restore Sidebar
		if (this.state.sideBar.viewletToRestore) {
			mark('willRestoreViewlet');
			restorePromises.push(viewletService.openViewlet(this.state.sideBar.viewletToRestore)
				.then(viewlet => {
					if (!viewlet) {
						return viewletService.openViewlet(viewletService.getDefaultViewletId()); // fallback to default viewlet as needed
					}

					return viewlet;
				})
				.then(() => mark('didRestoreViewlet')));
		}

		// Restore Panel
		if (this.state.panel.panelToRestore) {
			mark('willRestorePanel');
			panelService.openPanel(this.state.panel.panelToRestore);
			mark('didRestorePanel');
		}

		// Restore Zen Mode
		if (this.state.zenMode.restore) {
			this.toggleZenMode(true, true);
		}

		// Restore Editor Center Mode
		if (this.state.editor.restoreCentered) {
			this.centerEditorLayout(true);
		}

		// Emit a warning after 10s if restore does not complete
		const restoreTimeoutHandle = setTimeout(() => logService.warn('Workbench did not finish loading in 10 seconds, that might be a problem that should be reported.'), 10000);

		return Promise.all(restorePromises)
			.then(() => clearTimeout(restoreTimeoutHandle))
			.catch(error => onUnexpectedError(error))
			.finally(() => {

				// Set lifecycle phase to `Restored`
				lifecycleService.phase = LifecyclePhase.Restored;

				// Set lifecycle phase to `Eventually` after a short delay and when idle (min 2.5sec, max 5sec)
				setTimeout(() => {
					this._register(runWhenIdle(() => {
						lifecycleService.phase = LifecyclePhase.Eventually;
					}, 2500));
				}, 2500);

				// Telemetry: startup metrics
				mark('didStartWorkbench');
			});
	}

	//#region ILayoutService

	private readonly _onTitleBarVisibilityChange: Emitter<void> = this._register(new Emitter<void>());
	get onTitleBarVisibilityChange(): Event<void> { return this._onTitleBarVisibilityChange.event; }

	private readonly _onZenMode: Emitter<boolean> = this._register(new Emitter<boolean>());
	get onZenModeChange(): Event<boolean> { return this._onZenMode.event; }

	private readonly _onLayout = this._register(new Emitter<IDimension>());
	get onLayout(): Event<IDimension> { return this._onLayout.event; }

	private _dimension: IDimension;
	get dimension(): IDimension { return this._dimension; }

	get container(): HTMLElement { return this.workbench; }

	get hasWorkbench(): boolean { return true; }

	private parts: Map<string, Part> = new Map<string, Part>();

	private workbenchGrid: Grid<View> | WorkbenchLegacyLayout;

	private disposed: boolean;

	private titleBarPartView: View;
	private activityBarPartView: View;
	private sideBarPartView: View;
	private panelPartView: View;
	private editorPartView: View;
	private statusBarPartView: View;

	private environmentService: IEnvironmentService;
	private configurationService: IConfigurationService;
	private lifecycleService: ILifecycleService;
	private storageService: IStorageService;
	private windowService: IWindowService;
	private editorService: IEditorService;
	private editorGroupService: IEditorGroupsService;
	private panelService: IPanelService;
	private titleService: ITitleService;
	private viewletService: IViewletService;
	private contextService: IWorkspaceContextService;
	private backupFileService: IBackupFileService;

	private readonly state = {
		fullscreen: false,

		menuBar: {
			visibility: 'default' as MenuBarVisibility,
			toggled: false
		},

		activityBar: {
			hidden: false
		},

		sideBar: {
			hidden: false,
			position: Position.LEFT,
			width: 300,
			viewletToRestore: undefined as string | undefined
		},

		editor: {
			hidden: false,
			centered: false,
			restoreCentered: false,
			restoreEditors: false,
			editorsToOpen: [] as Promise<IResourceEditor[]> | IResourceEditor[]
		},

		panel: {
			hidden: false,
			position: Position.BOTTOM,
			height: 350,
			width: 350,
			panelToRestore: undefined as string | undefined
		},

		statusBar: {
			hidden: false
		},

		zenMode: {
			active: false,
			restore: false,
			transitionedToFullScreen: false,
			transitionedToCenteredEditorLayout: false,
			wasSideBarVisible: false,
			wasPanelVisible: false,
			transitionDisposeables: [] as IDisposable[]
		}
	};

	private initLayout(accessor: ServicesAccessor) {

		// Services
		this.environmentService = accessor.get(IEnvironmentService);
		this.configurationService = accessor.get(IConfigurationService);
		this.lifecycleService = accessor.get(ILifecycleService);
		this.windowService = accessor.get(IWindowService);
		this.contextService = accessor.get(IWorkspaceContextService);
		this.storageService = accessor.get(IStorageService);

		// Parts
		this.editorService = accessor.get(IEditorService);
		this.editorGroupService = accessor.get(IEditorGroupsService);
		this.panelService = accessor.get(IPanelService);
		this.viewletService = accessor.get(IViewletService);
		this.titleService = accessor.get(ITitleService);
		accessor.get(IStatusbarService); // not used, but called to ensure instantiated
		accessor.get(IActivityBarService); // not used, but called to ensure instantiated

		// Listeners
		this.registerLayoutListeners();

		// State
		this.initLayoutState(accessor.get(ILifecycleService));
	}

	private registerLayoutListeners(): void {

		// Storage
		this._register(this.storageService.onWillSaveState(e => this.saveLayoutState(e)));

		// Restore editor if hidden and it changes
		this._register(this.editorService.onDidVisibleEditorsChange(() => this.setEditorHidden(false)));
		this._register(this.editorGroupService.onDidActivateGroup(() => this.setEditorHidden(false)));

		// Configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(() => this.doUpdateLayoutConfiguration()));

		// Fullscreen changes
		this._register(onDidChangeFullscreen(() => this.onFullscreenChanged()));

		// Group changes
		this._register(this.editorGroupService.onDidAddGroup(() => this.centerEditorLayout(this.state.editor.centered)));
		this._register(this.editorGroupService.onDidRemoveGroup(() => this.centerEditorLayout(this.state.editor.centered)));

		// Prevent workbench from scrolling #55456
		this._register(addDisposableListener(this.workbench, EventType.SCROLL, () => this.workbench.scrollTop = 0));

		// Menubar visibility changes
		if ((isWindows || isLinux) && getTitleBarStyle(this.configurationService, this.environmentService) === 'custom') {
			this._register(this.titleService.onMenubarVisibilityChange(visible => this.onMenubarToggled(visible)));
		}
	}

	private onMenubarToggled(visible: boolean) {
		if (visible !== this.state.menuBar.toggled) {
			this.state.menuBar.toggled = visible;

			if (this.state.fullscreen && (this.state.menuBar.visibility === 'toggle' || this.state.menuBar.visibility === 'default')) {
				this._onTitleBarVisibilityChange.fire();
				this.layout();
			}
		}
	}

	private onFullscreenChanged(): void {
		this.state.fullscreen = isFullscreen();

		// Apply as CSS class
		if (this.state.fullscreen) {
			addClass(this.workbench, 'fullscreen');
		} else {
			removeClass(this.workbench, 'fullscreen');

			if (this.state.zenMode.transitionedToFullScreen && this.state.zenMode.active) {
				this.toggleZenMode();
			}
		}

		// Changing fullscreen state of the window has an impact on custom title bar visibility, so we need to update
		if (getTitleBarStyle(this.configurationService, this.environmentService) === 'custom') {
			this._onTitleBarVisibilityChange.fire();
			this.layout(); // handle title bar when fullscreen changes
		}
	}

	private doUpdateLayoutConfiguration(skipLayout?: boolean): void {

		// Sidebar position
		const newSidebarPositionValue = this.configurationService.getValue<string>(Settings.SIDEBAR_POSITION);
		const newSidebarPosition = (newSidebarPositionValue === 'right') ? Position.RIGHT : Position.LEFT;
		if (newSidebarPosition !== this.getSideBarPosition()) {
			this.setSideBarPosition(newSidebarPosition);
		}

		// Panel position
		this.updatePanelPosition();

		if (!this.state.zenMode.active) {

			// Statusbar visibility
			const newStatusbarHiddenValue = !this.configurationService.getValue<boolean>(Settings.STATUSBAR_VISIBLE);
			if (newStatusbarHiddenValue !== this.state.statusBar.hidden) {
				this.setStatusBarHidden(newStatusbarHiddenValue, skipLayout);
			}

			// Activitybar visibility
			const newActivityBarHiddenValue = !this.configurationService.getValue<boolean>(Settings.ACTIVITYBAR_VISIBLE);
			if (newActivityBarHiddenValue !== this.state.activityBar.hidden) {
				this.setActivityBarHidden(newActivityBarHiddenValue, skipLayout);
			}
		}

		// Menubar visibility
		const newMenubarVisibility = this.configurationService.getValue<MenuBarVisibility>(Settings.MENUBAR_VISIBLE);
		this.setMenubarVisibility(newMenubarVisibility, !!skipLayout);
	}

	private setSideBarPosition(position: Position): void {
		const activityBar = this.getPart(Parts.ACTIVITYBAR_PART);
		const sideBar = this.getPart(Parts.SIDEBAR_PART);
		const wasHidden = this.state.sideBar.hidden;

		if (this.state.sideBar.hidden) {
			this.setSideBarHidden(false, true /* Skip Layout */);
		}

		const newPositionValue = (position === Position.LEFT) ? 'left' : 'right';
		const oldPositionValue = (this.state.sideBar.position === Position.LEFT) ? 'left' : 'right';
		this.state.sideBar.position = position;

		// Adjust CSS
		removeClass(activityBar.getContainer(), oldPositionValue);
		removeClass(sideBar.getContainer(), oldPositionValue);
		addClass(activityBar.getContainer(), newPositionValue);
		addClass(sideBar.getContainer(), newPositionValue);

		// Update Styles
		activityBar.updateStyles();
		sideBar.updateStyles();

		// Layout
		if (this.workbenchGrid instanceof Grid) {
			if (!wasHidden) {
				this.state.sideBar.width = this.workbenchGrid.getViewSize(this.sideBarPartView);
			}

			this.workbenchGrid.removeView(this.sideBarPartView);
			this.workbenchGrid.removeView(this.activityBarPartView);

			if (!this.state.panel.hidden && this.state.panel.position === Position.BOTTOM) {
				this.workbenchGrid.removeView(this.panelPartView);
			}

			this.layout();
		} else {
			this.workbenchGrid.layout();
		}
	}

	private initLayoutState(lifecycleService: ILifecycleService): void {

		// Fullscreen
		this.state.fullscreen = isFullscreen();

		// Menubar visibility
		this.state.menuBar.visibility = this.configurationService.getValue<MenuBarVisibility>(Settings.MENUBAR_VISIBLE);

		// Activity bar visibility
		this.state.activityBar.hidden = !this.configurationService.getValue<string>(Settings.ACTIVITYBAR_VISIBLE);

		// Sidebar visibility
		this.state.sideBar.hidden = this.storageService.getBoolean(Storage.SIDEBAR_HIDDEN, StorageScope.WORKSPACE, this.contextService.getWorkbenchState() === WorkbenchState.EMPTY);

		// Sidebar position
		this.state.sideBar.position = (this.configurationService.getValue<string>(Settings.SIDEBAR_POSITION) === 'right') ? Position.RIGHT : Position.LEFT;

		// Sidebar viewlet
		if (!this.state.sideBar.hidden) {

			// Only restore last viewlet if window was reloaded or we are in development mode
			let viewletToRestore: string;
			if (!this.environmentService.isBuilt || lifecycleService.startupKind === StartupKind.ReloadedWindow) {
				viewletToRestore = this.storageService.get(SidebarPart.activeViewletSettingsKey, StorageScope.WORKSPACE, this.viewletService.getDefaultViewletId());
			} else {
				viewletToRestore = this.viewletService.getDefaultViewletId();
			}

			if (viewletToRestore) {
				this.state.sideBar.viewletToRestore = viewletToRestore;
			} else {
				this.state.sideBar.hidden = true; // we hide sidebar if there is no viewlet to restore
			}
		}

		// Editor centered layout
		this.state.editor.restoreCentered = this.storageService.getBoolean(Storage.CENTERED_LAYOUT_ENABLED, StorageScope.WORKSPACE, false);

		// Editors to open
		this.state.editor.editorsToOpen = this.resolveEditorsToOpen();

		// Panel visibility
		this.state.panel.hidden = this.storageService.getBoolean(Storage.PANEL_HIDDEN, StorageScope.WORKSPACE, true);

		// Panel position
		this.updatePanelPosition();

		// Panel to restore
		if (!this.state.panel.hidden) {
			const panelRegistry = Registry.as<PanelRegistry>(PanelExtensions.Panels);

			let panelToRestore = this.storageService.get(PanelPart.activePanelSettingsKey, StorageScope.WORKSPACE, panelRegistry.getDefaultPanelId());
			if (!panelRegistry.hasPanel(panelToRestore)) {
				panelToRestore = panelRegistry.getDefaultPanelId(); // fallback to default if panel is unknown
			}

			if (panelToRestore) {
				this.state.panel.panelToRestore = panelToRestore;
			} else {
				this.state.panel.hidden = true; // we hide panel if there is no panel to restore
			}
		}

		// Statusbar visibility
		this.state.statusBar.hidden = !this.configurationService.getValue<string>(Settings.STATUSBAR_VISIBLE);

		// Zen mode enablement
		this.state.zenMode.restore = this.storageService.getBoolean(Storage.ZEN_MODE_ENABLED, StorageScope.WORKSPACE, false) && this.configurationService.getValue(Settings.ZEN_MODE_RESTORE);
	}

	private resolveEditorsToOpen(): Promise<IResourceEditor[]> | IResourceEditor[] {
		const configuration = this.windowService.getConfiguration();
		const hasInitialFilesToOpen = this.hasInitialFilesToOpen();

		// Only restore editors if we are not instructed to open files initially
		this.state.editor.restoreEditors = !hasInitialFilesToOpen;

		// Files to open, diff or create
		if (hasInitialFilesToOpen) {

			// Files to diff is exclusive
			const filesToDiff = this.toInputs(configuration.filesToDiff, false);
			if (filesToDiff && filesToDiff.length === 2) {
				return [<IResourceDiffInput>{
					leftResource: filesToDiff[0].resource,
					rightResource: filesToDiff[1].resource,
					options: { pinned: true },
					forceFile: true
				}];
			}

			const filesToCreate = this.toInputs(configuration.filesToCreate, true);
			const filesToOpen = this.toInputs(configuration.filesToOpen, false);

			// Otherwise: Open/Create files
			return [...filesToOpen, ...filesToCreate];
		}

		// Empty workbench
		else if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY && this.configurationService.inspect('workbench.startupEditor').value === 'newUntitledFile') {
			const isEmpty = this.editorGroupService.count === 1 && this.editorGroupService.activeGroup.count === 0;
			if (!isEmpty) {
				return []; // do not open any empty untitled file if we restored editors from previous session
			}

			return this.backupFileService.hasBackups().then(hasBackups => {
				if (hasBackups) {
					return []; // do not open any empty untitled file if we have backups to restore
				}

				return [<IUntitledResourceInput>{}];
			});
		}

		return [];
	}

	private hasInitialFilesToOpen(): boolean {
		const configuration = this.windowService.getConfiguration();

		return !!(
			(configuration.filesToCreate && configuration.filesToCreate.length > 0) ||
			(configuration.filesToOpen && configuration.filesToOpen.length > 0) ||
			(configuration.filesToDiff && configuration.filesToDiff.length > 0));
	}

	private toInputs(paths: IPath[] | undefined, isNew: boolean): Array<IResourceInput | IUntitledResourceInput> {
		if (!paths || !paths.length) {
			return [];
		}

		return coalesce(paths.map(p => {
			const resource = p.fileUri;
			if (!resource) {
				return undefined;
			}

			let input: IResourceInput | IUntitledResourceInput;
			if (isNew) {
				input = { filePath: resource.fsPath, options: { pinned: true } } as IUntitledResourceInput;
			} else {
				input = { resource, options: { pinned: true }, forceFile: true } as IResourceInput;
			}

			if (!isNew && typeof p.lineNumber === 'number') {
				input.options!.selection = {
					startLineNumber: p.lineNumber,
					startColumn: p.columnNumber || 1
				};
			}

			return input;
		}));
	}

	private updatePanelPosition() {
		const defaultPanelPosition = this.configurationService.getValue<string>(Settings.PANEL_POSITION);
		const panelPosition = this.storageService.get(Storage.PANEL_POSITION, StorageScope.WORKSPACE, defaultPanelPosition);

		this.state.panel.position = (panelPosition === 'right') ? Position.RIGHT : Position.BOTTOM;
	}

	registerPart(part: Part): void {
		this.parts.set(part.getId(), part);
	}

	isRestored(): boolean {
		return this.lifecycleService.phase >= LifecyclePhase.Restored;
	}

	hasFocus(part: Parts): boolean {
		const activeElement = document.activeElement;
		if (!activeElement) {
			return false;
		}

		const container = this.getContainer(part);

		return isAncestor(activeElement, container);
	}

	getContainer(part: Parts): HTMLElement {
		switch (part) {
			case Parts.TITLEBAR_PART:
				return this.getPart(Parts.TITLEBAR_PART).getContainer();
			case Parts.ACTIVITYBAR_PART:
				return this.getPart(Parts.ACTIVITYBAR_PART).getContainer();
			case Parts.SIDEBAR_PART:
				return this.getPart(Parts.SIDEBAR_PART).getContainer();
			case Parts.PANEL_PART:
				return this.getPart(Parts.PANEL_PART).getContainer();
			case Parts.EDITOR_PART:
				return this.getPart(Parts.EDITOR_PART).getContainer();
			case Parts.STATUSBAR_PART:
				return this.getPart(Parts.STATUSBAR_PART).getContainer();
		}
	}

	isVisible(part: Parts): boolean {
		switch (part) {
			case Parts.TITLEBAR_PART:
				if (getTitleBarStyle(this.configurationService, this.environmentService) === 'native') {
					return false;
				} else if (!this.state.fullscreen) {
					return true;
				} else if (isMacintosh) {
					return false;
				} else if (this.state.menuBar.visibility === 'visible') {
					return true;
				} else if (this.state.menuBar.visibility === 'toggle' || this.state.menuBar.visibility === 'default') {
					return this.state.menuBar.toggled;
				}

				return false;
			case Parts.SIDEBAR_PART:
				return !this.state.sideBar.hidden;
			case Parts.PANEL_PART:
				return !this.state.panel.hidden;
			case Parts.STATUSBAR_PART:
				return !this.state.statusBar.hidden;
			case Parts.ACTIVITYBAR_PART:
				return !this.state.activityBar.hidden;
			case Parts.EDITOR_PART:
				return this.workbenchGrid instanceof Grid ? !this.state.editor.hidden : true;
		}

		return true; // any other part cannot be hidden
	}

	getTitleBarOffset(): number {
		let offset = 0;
		if (this.isVisible(Parts.TITLEBAR_PART)) {
			if (this.workbenchGrid instanceof Grid) {
				offset = this.getPart(Parts.TITLEBAR_PART).maximumHeight;
			} else {
				offset = this.workbenchGrid.partLayoutInfo.titlebar.height;

				if (isMacintosh || this.state.menuBar.visibility === 'hidden') {
					offset /= getZoomFactor();
				}
			}
		}

		return offset;
	}

	getWorkbenchElement(): HTMLElement {
		return this.workbench;
	}

	toggleZenMode(skipLayout?: boolean, restoring = false): void {
		this.state.zenMode.active = !this.state.zenMode.active;
		this.state.zenMode.transitionDisposeables = dispose(this.state.zenMode.transitionDisposeables);

		const setLineNumbers = (lineNumbers: any) => this.editorService.visibleTextEditorWidgets.forEach(editor => editor.updateOptions({ lineNumbers }));

		// Check if zen mode transitioned to full screen and if now we are out of zen mode
		// -> we need to go out of full screen (same goes for the centered editor layout)
		let toggleFullScreen = false;

		// Zen Mode Active
		if (this.state.zenMode.active) {
			const config: {
				fullScreen: boolean;
				centerLayout: boolean;
				hideTabs: boolean;
				hideActivityBar: boolean;
				hideStatusBar: boolean;
				hideLineNumbers: boolean;
			} = this.configurationService.getValue('zenMode');

			toggleFullScreen = !this.state.fullscreen && config.fullScreen;

			this.state.zenMode.transitionedToFullScreen = restoring ? config.fullScreen : toggleFullScreen;
			this.state.zenMode.transitionedToCenteredEditorLayout = !this.isEditorLayoutCentered() && config.centerLayout;
			this.state.zenMode.wasSideBarVisible = this.isVisible(Parts.SIDEBAR_PART);
			this.state.zenMode.wasPanelVisible = this.isVisible(Parts.PANEL_PART);

			this.setPanelHidden(true, true);
			this.setSideBarHidden(true, true);

			if (config.hideActivityBar) {
				this.setActivityBarHidden(true, true);
			}

			if (config.hideStatusBar) {
				this.setStatusBarHidden(true, true);
			}

			if (config.hideLineNumbers) {
				setLineNumbers('off');
				this.state.zenMode.transitionDisposeables.push(this.editorService.onDidVisibleEditorsChange(() => setLineNumbers('off')));
			}

			if (config.hideTabs && this.editorGroupService.partOptions.showTabs) {
				this.state.zenMode.transitionDisposeables.push(this.editorGroupService.enforcePartOptions({ showTabs: false }));
			}

			if (config.centerLayout) {
				this.centerEditorLayout(true, true);
			}
		}

		// Zen Mode Inactive
		else {
			if (this.state.zenMode.wasPanelVisible) {
				this.setPanelHidden(false, true);
			}

			if (this.state.zenMode.wasSideBarVisible) {
				this.setSideBarHidden(false, true);
			}

			if (this.state.zenMode.transitionedToCenteredEditorLayout) {
				this.centerEditorLayout(false, true);
			}

			setLineNumbers(this.configurationService.getValue('editor.lineNumbers'));

			// Status bar and activity bar visibility come from settings -> update their visibility.
			this.doUpdateLayoutConfiguration(true);

			this.editorGroupService.activeGroup.focus();

			toggleFullScreen = this.state.zenMode.transitionedToFullScreen && this.state.fullscreen;
		}

		if (!skipLayout) {
			this.layout();
		}

		if (toggleFullScreen) {
			this.windowService.toggleFullScreen();
		}

		// Event
		this._onZenMode.fire(this.state.zenMode.active);
	}

	private setStatusBarHidden(hidden: boolean, skipLayout?: boolean): void {
		this.state.statusBar.hidden = hidden;

		// Adjust CSS
		if (hidden) {
			addClass(this.workbench, 'nostatusbar');
		} else {
			removeClass(this.workbench, 'nostatusbar');
		}

		// Layout
		if (!skipLayout) {
			if (this.workbenchGrid instanceof Grid) {
				this.layout();
			} else {
				this.workbenchGrid.layout();
			}
		}
	}

	private createWorkbenchLayout(instantiationService: IInstantiationService): void {
		const titleBar = this.getPart(Parts.TITLEBAR_PART);
		const editorPart = this.getPart(Parts.EDITOR_PART);
		const activityBar = this.getPart(Parts.ACTIVITYBAR_PART);
		const panelPart = this.getPart(Parts.PANEL_PART);
		const sideBar = this.getPart(Parts.SIDEBAR_PART);
		const statusBar = this.getPart(Parts.STATUSBAR_PART);

		if (this.configurationService.getValue('workbench.useExperimentalGridLayout')) {

			// Create view wrappers for all parts
			this.titleBarPartView = new View(titleBar);
			this.sideBarPartView = new View(sideBar);
			this.activityBarPartView = new View(activityBar);
			this.editorPartView = new View(editorPart);
			this.panelPartView = new View(panelPart);
			this.statusBarPartView = new View(statusBar);

			this.workbenchGrid = new Grid(this.editorPartView, { proportionalLayout: false });

			this.workbench.prepend(this.workbenchGrid.element);
		} else {
			this.workbenchGrid = instantiationService.createInstance(
				WorkbenchLegacyLayout,
				this.parent,
				this.workbench,
				{
					titlebar: titleBar,
					activitybar: activityBar,
					editor: editorPart,
					sidebar: sideBar,
					panel: panelPart,
					statusbar: statusBar,
				}
			);
		}
	}

	layout(options?: ILayoutOptions): void {
		if (!this.disposed) {
			this._dimension = getClientArea(this.parent);

			if (this.workbenchGrid instanceof Grid) {
				position(this.workbench, 0, 0, 0, 0, 'relative');
				size(this.workbench, this._dimension.width, this._dimension.height);

				// Layout the grid widget
				this.workbenchGrid.layout(this._dimension.width, this._dimension.height);

				// Layout grid views
				this.layoutGrid();
			} else {
				this.workbenchGrid.layout(options);
			}

			// Emit as event
			this._onLayout.fire(this._dimension);
		}
	}

	private layoutGrid(): void {
		if (!(this.workbenchGrid instanceof Grid)) {
			return;
		}

		let panelInGrid = this.workbenchGrid.hasView(this.panelPartView);
		let sidebarInGrid = this.workbenchGrid.hasView(this.sideBarPartView);
		let activityBarInGrid = this.workbenchGrid.hasView(this.activityBarPartView);
		let statusBarInGrid = this.workbenchGrid.hasView(this.statusBarPartView);
		let titlebarInGrid = this.workbenchGrid.hasView(this.titleBarPartView);

		// Add parts to grid
		if (!statusBarInGrid) {
			this.workbenchGrid.addView(this.statusBarPartView, Sizing.Split, this.editorPartView, Direction.Down);
			statusBarInGrid = true;
		}

		if (!titlebarInGrid && getTitleBarStyle(this.configurationService, this.environmentService) === 'custom') {
			this.workbenchGrid.addView(this.titleBarPartView, Sizing.Split, this.editorPartView, Direction.Up);
			titlebarInGrid = true;
		}

		if (!activityBarInGrid) {
			this.workbenchGrid.addView(this.activityBarPartView, Sizing.Split, panelInGrid && this.state.sideBar.position === this.state.panel.position ? this.panelPartView : this.editorPartView, this.state.sideBar.position === Position.RIGHT ? Direction.Right : Direction.Left);
			activityBarInGrid = true;
		}

		if (!sidebarInGrid) {
			this.workbenchGrid.addView(this.sideBarPartView, this.state.sideBar.width !== undefined ? this.state.sideBar.width : Sizing.Split, this.activityBarPartView, this.state.sideBar.position === Position.LEFT ? Direction.Right : Direction.Left);
			sidebarInGrid = true;
		}

		if (!panelInGrid) {
			this.workbenchGrid.addView(this.panelPartView, this.getPanelDimension(this.state.panel.position) !== undefined ? this.getPanelDimension(this.state.panel.position) : Sizing.Split, this.editorPartView, this.state.panel.position === Position.BOTTOM ? Direction.Down : Direction.Right);
			panelInGrid = true;
		}

		// Hide parts
		if (this.state.panel.hidden) {
			this.panelPartView.hide();
		}

		if (this.state.statusBar.hidden) {
			this.statusBarPartView.hide();
		}

		if (!this.isVisible(Parts.TITLEBAR_PART)) {
			this.titleBarPartView.hide();
		}

		if (this.state.activityBar.hidden) {
			this.activityBarPartView.hide();
		}

		if (this.state.sideBar.hidden) {
			this.sideBarPartView.hide();
		}

		if (this.state.editor.hidden) {
			this.editorPartView.hide();
		}

		// Show visible parts
		if (!this.state.editor.hidden) {
			this.editorPartView.show();
		}

		if (!this.state.statusBar.hidden) {
			this.statusBarPartView.show();
		}

		if (this.isVisible(Parts.TITLEBAR_PART)) {
			this.titleBarPartView.show();
		}

		if (!this.state.activityBar.hidden) {
			this.activityBarPartView.show();
		}

		if (!this.state.sideBar.hidden) {
			this.sideBarPartView.show();
		}

		if (!this.state.panel.hidden) {
			this.panelPartView.show();
		}
	}

	private getPanelDimension(position: Position): number {
		return position === Position.BOTTOM ? this.state.panel.height : this.state.panel.width;
	}

	isEditorLayoutCentered(): boolean {
		return this.state.editor.centered;
	}

	centerEditorLayout(active: boolean, skipLayout?: boolean): void {
		this.state.editor.centered = active;

		this.storageService.store(Storage.CENTERED_LAYOUT_ENABLED, active, StorageScope.WORKSPACE);

		let smartActive = active;
		if (this.editorGroupService.groups.length > 1 && this.configurationService.getValue('workbench.editor.centeredLayoutAutoResize')) {
			smartActive = false; // Respect the auto resize setting - do not go into centered layout if there is more than 1 group.
		}

		// Enter Centered Editor Layout
		if (this.editorGroupService.isLayoutCentered() !== smartActive) {
			this.editorGroupService.centerLayout(smartActive);

			if (!skipLayout) {
				this.layout();
			}
		}
	}

	resizePart(part: Parts, sizeChange: number): void {
		let view: View;
		switch (part) {
			case Parts.SIDEBAR_PART:
				view = this.sideBarPartView;
			case Parts.PANEL_PART:
				view = this.panelPartView;
			case Parts.EDITOR_PART:
				view = this.editorPartView;
				if (this.workbenchGrid instanceof Grid) {
					this.workbenchGrid.resizeView(view, this.workbenchGrid.getViewSize(view) + sizeChange);
				} else {
					this.workbenchGrid.resizePart(part, sizeChange);
				}
				break;
			default:
				return; // Cannot resize other parts
		}
	}

	setActivityBarHidden(hidden: boolean, skipLayout?: boolean): void {
		this.state.activityBar.hidden = hidden;

		// Layout
		if (!skipLayout) {
			if (this.workbenchGrid instanceof Grid) {
				this.layout();
			} else {
				this.workbenchGrid.layout();
			}
		}
	}

	setEditorHidden(hidden: boolean, skipLayout?: boolean): void {
		if (!(this.workbenchGrid instanceof Grid) || hidden === this.state.editor.hidden) {
			return;
		}

		this.state.editor.hidden = hidden;

		// The editor and the panel cannot be hidden at the same time
		if (this.state.editor.hidden && this.state.panel.hidden) {
			this.setPanelHidden(false, true);
		}

		if (!skipLayout) {
			this.layout();
		}
	}

	setSideBarHidden(hidden: boolean, skipLayout?: boolean): void {
		this.state.sideBar.hidden = hidden;

		// Adjust CSS
		if (hidden) {
			addClass(this.workbench, 'nosidebar');
		} else {
			removeClass(this.workbench, 'nosidebar');
		}

		// If sidebar becomes hidden, also hide the current active Viewlet if any
		if (hidden && this.viewletService.getActiveViewlet()) {
			this.viewletService.hideActiveViewlet();

			// Pass Focus to Editor or Panel if Sidebar is now hidden
			const activePanel = this.panelService.getActivePanel();
			if (this.hasFocus(Parts.PANEL_PART) && activePanel) {
				activePanel.focus();
			} else {
				this.editorGroupService.activeGroup.focus();
			}
		}

		// If sidebar becomes visible, show last active Viewlet or default viewlet
		else if (!hidden && !this.viewletService.getActiveViewlet()) {
			const viewletToOpen = this.viewletService.getLastActiveViewletId();
			if (viewletToOpen) {
				const viewlet = this.viewletService.openViewlet(viewletToOpen, true);
				if (!viewlet) {
					this.viewletService.openViewlet(this.viewletService.getDefaultViewletId(), true);
				}
			}
		}

		// Remember in settings
		const defaultHidden = this.contextService.getWorkbenchState() === WorkbenchState.EMPTY;
		if (hidden !== defaultHidden) {
			this.storageService.store(Storage.SIDEBAR_HIDDEN, hidden ? 'true' : 'false', StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(Storage.SIDEBAR_HIDDEN, StorageScope.WORKSPACE);
		}

		// Layout
		if (!skipLayout) {
			if (this.workbenchGrid instanceof Grid) {
				this.layout();
			} else {
				this.workbenchGrid.layout();
			}
		}
	}

	setPanelHidden(hidden: boolean, skipLayout?: boolean): void {
		this.state.panel.hidden = hidden;

		// Adjust CSS
		if (hidden) {
			addClass(this.workbench, 'nopanel');
		} else {
			removeClass(this.workbench, 'nopanel');
		}

		// If panel part becomes hidden, also hide the current active panel if any
		if (hidden && this.panelService.getActivePanel()) {
			this.panelService.hideActivePanel();
			this.editorGroupService.activeGroup.focus(); // Pass focus to editor group if panel part is now hidden
		}

		// If panel part becomes visible, show last active panel or default panel
		else if (!hidden && !this.panelService.getActivePanel()) {
			const panelToOpen = this.panelService.getLastActivePanelId();
			if (panelToOpen) {
				const focus = !skipLayout;
				this.panelService.openPanel(panelToOpen, focus);
			}
		}

		// Remember in settings
		if (!hidden) {
			this.storageService.store(Storage.PANEL_HIDDEN, 'false', StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(Storage.PANEL_HIDDEN, StorageScope.WORKSPACE);
		}

		// The editor and panel cannot be hidden at the same time
		if (hidden && this.state.editor.hidden) {
			this.setEditorHidden(false, true);
		}

		// Layout
		if (!skipLayout) {
			if (this.workbenchGrid instanceof Grid) {
				this.layout();
			} else {
				this.workbenchGrid.layout();
			}
		}
	}

	toggleMaximizedPanel(): void {
		if (this.workbenchGrid instanceof Grid) {
			this.workbenchGrid.maximizeViewSize(this.panelPartView);
		} else {
			this.workbenchGrid.layout({ toggleMaximizedPanel: true, source: Parts.PANEL_PART });
		}
	}

	isPanelMaximized(): boolean {
		if (this.workbenchGrid instanceof Grid) {
			try {
				return this.workbenchGrid.getViewSize2(this.panelPartView).height === this.getPart(Parts.PANEL_PART).maximumHeight;
			} catch (e) {
				return false;
			}
		} else {
			return this.workbenchGrid.isPanelMaximized();
		}
	}

	getSideBarPosition(): Position {
		return this.state.sideBar.position;
	}

	setMenubarVisibility(visibility: MenuBarVisibility, skipLayout: boolean): void {
		if (this.state.menuBar.visibility !== visibility) {
			this.state.menuBar.visibility = visibility;

			// Layout
			if (!skipLayout) {
				if (this.workbenchGrid instanceof Grid) {
					const dimensions = getClientArea(this.parent);
					this.workbenchGrid.layout(dimensions.width, dimensions.height);
				} else {
					this.workbenchGrid.layout();
				}
			}
		}
	}

	getMenubarVisibility(): MenuBarVisibility {
		return this.state.menuBar.visibility;
	}

	getPanelPosition(): Position {
		return this.state.panel.position;
	}

	setPanelPosition(position: Position): void {
		const panelPart = this.getPart(Parts.PANEL_PART);
		const wasHidden = this.state.panel.hidden;

		if (this.state.panel.hidden) {
			this.setPanelHidden(false, true /* Skip Layout */);
		} else {
			this.savePanelDimension();
		}

		const newPositionValue = (position === Position.BOTTOM) ? 'bottom' : 'right';
		const oldPositionValue = (this.state.panel.position === Position.BOTTOM) ? 'bottom' : 'right';
		this.state.panel.position = position;

		function positionToString(position: Position): string {
			switch (position) {
				case Position.LEFT: return 'left';
				case Position.RIGHT: return 'right';
				case Position.BOTTOM: return 'bottom';
			}
		}

		this.storageService.store(Storage.PANEL_POSITION, positionToString(this.state.panel.position), StorageScope.WORKSPACE);

		// Adjust CSS
		removeClass(panelPart.getContainer(), oldPositionValue);
		addClass(panelPart.getContainer(), newPositionValue);

		// Update Styles
		panelPart.updateStyles();

		// Layout
		if (this.workbenchGrid instanceof Grid) {
			if (!wasHidden) {
				this.savePanelDimension();
			}

			this.workbenchGrid.removeView(this.panelPartView);
			this.layout();
		} else {
			this.workbenchGrid.layout();
		}
	}

	private savePanelDimension(): void {
		if (!(this.workbenchGrid instanceof Grid)) {
			return;
		}

		if (this.state.panel.position === Position.BOTTOM) {
			this.state.panel.height = this.workbenchGrid.getViewSize(this.panelPartView);
		} else {
			this.state.panel.width = this.workbenchGrid.getViewSize(this.panelPartView);
		}
	}

	private saveLayoutState(e: IWillSaveStateEvent): void {

		// Zen Mode
		if (this.state.zenMode.active) {
			this.storageService.store(Storage.ZEN_MODE_ENABLED, true, StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(Storage.ZEN_MODE_ENABLED, StorageScope.WORKSPACE);
		}

		if (e.reason === WillSaveStateReason.SHUTDOWN && this.state.zenMode.active) {
			if (!this.configurationService.getValue(Settings.ZEN_MODE_RESTORE)) {
				this.toggleZenMode(true); // We will not restore zen mode, need to clear all zen mode state changes
			}
		}
	}

	private getPart(key: Parts): Part {
		const part = this.parts.get(key);
		if (!part) {
			throw new Error('unknown part');
		}
		return part;
	}

	dispose(): void {
		super.dispose();

		this.disposed = true;
	}

	//#endregion
}
