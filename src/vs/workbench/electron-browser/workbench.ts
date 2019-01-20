/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/workbench';

import { localize } from 'vs/nls';
import { IDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import * as DOM from 'vs/base/browser/dom';
import { RunOnceScheduler, runWhenIdle } from 'vs/base/common/async';
import * as browser from 'vs/base/browser/browser';
import * as perf from 'vs/base/common/performance';
import * as errors from 'vs/base/common/errors';
import { BackupFileService, InMemoryBackupFileService } from 'vs/workbench/services/backup/node/backupFileService';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { Registry } from 'vs/platform/registry/common/platform';
import { isWindows, isLinux, isMacintosh } from 'vs/base/common/platform';
import { IResourceInput } from 'vs/platform/editor/common/editor';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IEditorInputFactoryRegistry, Extensions as EditorExtensions, TextCompareEditorVisibleContext, TEXT_DIFF_EDITOR_ID, EditorsVisibleContext, InEditorZenModeContext, ActiveEditorGroupEmptyContext, MultipleEditorGroupsContext, IUntitledResourceInput, IResourceDiffInput, SplitEditorsVertically, TextCompareEditorActiveContext, ActiveEditorContext } from 'vs/workbench/common/editor';
import { HistoryService } from 'vs/workbench/services/history/electron-browser/history';
import { ActivitybarPart } from 'vs/workbench/browser/parts/activitybar/activitybarPart';
import { SidebarPart } from 'vs/workbench/browser/parts/sidebar/sidebarPart';
import { PanelPart } from 'vs/workbench/browser/parts/panel/panelPart';
import { StatusbarPart } from 'vs/workbench/browser/parts/statusbar/statusbarPart';
import { TitlebarPart } from 'vs/workbench/browser/parts/titlebar/titlebarPart';
import { EditorPart } from 'vs/workbench/browser/parts/editor/editorPart';
import { WorkbenchLayout } from 'vs/workbench/browser/layout';
import { IActionBarRegistry, Extensions as ActionBarExtensions } from 'vs/workbench/browser/actions';
import { PanelRegistry, Extensions as PanelExtensions } from 'vs/workbench/browser/panel';
import { QuickOpenController } from 'vs/workbench/browser/parts/quickopen/quickOpenController';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { QuickInputService } from 'vs/workbench/browser/parts/quickinput/quickInput';
import { getServices } from 'vs/platform/instantiation/common/extensions';
import { Position, Parts, IPartService, ILayoutOptions, IDimension, PositionToString } from 'vs/workbench/services/part/common/partService';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IStorageService, StorageScope, IWillSaveStateEvent, WillSaveStateReason } from 'vs/platform/storage/common/storage';
import { ContextMenuService as NativeContextMenuService } from 'vs/workbench/services/contextview/electron-browser/contextmenuService';
import { ContextMenuService as HTMLContextMenuService } from 'vs/platform/contextview/browser/contextMenuService';
import { WorkbenchKeybindingService } from 'vs/workbench/services/keybinding/electron-browser/keybindingService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { WorkspaceService, DefaultConfigurationExportHelper } from 'vs/workbench/services/configuration/node/configurationService';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { JSONEditingService } from 'vs/workbench/services/configuration/node/jsonEditingService';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IKeybindingEditingService, KeybindingsEditingService } from 'vs/workbench/services/keybinding/common/keybindingEditing';
import { RawContextKey, IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IActivityService } from 'vs/workbench/services/activity/common/activity';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { RemoteFileService } from 'vs/workbench/services/files/electron-browser/remoteFileService';
import { IFileService } from 'vs/platform/files/common/files';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { ConfigurationResolverService } from 'vs/workbench/services/configurationResolver/electron-browser/configurationResolverService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { ITitleService } from 'vs/workbench/services/title/common/titleService';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ClipboardService } from 'vs/platform/clipboard/electron-browser/clipboardService';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { TextFileService } from 'vs/workbench/services/textfile/electron-browser/textFileService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ISCMService } from 'vs/workbench/services/scm/common/scm';
import { SCMService } from 'vs/workbench/services/scm/common/scmService';
import { IProgressService2 } from 'vs/platform/progress/common/progress';
import { ProgressService2 } from 'vs/workbench/services/progress/browser/progressService2';
import { TextModelResolverService } from 'vs/workbench/services/textmodelResolver/common/textModelResolverService';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { LifecyclePhase, StartupKind } from 'vs/platform/lifecycle/common/lifecycle';
import { LifecycleService } from 'vs/platform/lifecycle/electron-browser/lifecycleService';
import { IWindowService, IWindowConfiguration, IPath, MenuBarVisibility, getTitleBarStyle } from 'vs/platform/windows/common/windows';
import { IStatusbarService } from 'vs/platform/statusbar/common/statusbar';
import { IMenuService, SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { MenuService } from 'vs/platform/actions/common/menuService';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { OpenRecentAction, ToggleDevToolsAction, ReloadWindowAction, ShowPreviousWindowTab, MoveWindowTabToNewWindow, MergeAllWindowTabs, ShowNextWindowTab, ToggleWindowTabsBar, ReloadWindowWithExtensionsDisabledAction, NewWindowTab } from 'vs/workbench/electron-browser/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { WorkspaceEditingService } from 'vs/workbench/services/workspace/node/workspaceEditingService';
import { FileDecorationsService } from 'vs/workbench/services/decorations/browser/decorationsService';
import { IDecorationsService } from 'vs/workbench/services/decorations/browser/decorations';
import { ActivityService } from 'vs/workbench/services/activity/browser/activityService';
import { URI } from 'vs/base/common/uri';
import { IListService, ListService } from 'vs/platform/list/browser/listService';
import { InputFocusedContext, IsMacContext, IsLinuxContext, IsWindowsContext } from 'vs/platform/workbench/common/contextkeys';
import { IViewsService } from 'vs/workbench/common/views';
import { ViewsService } from 'vs/workbench/browser/parts/views/views';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { NotificationService } from 'vs/workbench/services/notification/common/notificationService';
import { NotificationsCenter } from 'vs/workbench/browser/parts/notifications/notificationsCenter';
import { NotificationsAlerts } from 'vs/workbench/browser/parts/notifications/notificationsAlerts';
import { NotificationsStatus } from 'vs/workbench/browser/parts/notifications/notificationsStatus';
import { registerNotificationCommands } from 'vs/workbench/browser/parts/notifications/notificationsCommands';
import { NotificationsToasts } from 'vs/workbench/browser/parts/notifications/notificationsToasts';
import { IPCClient } from 'vs/base/parts/ipc/node/ipc';
import { registerWindowDriver } from 'vs/platform/driver/electron-browser/driver';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { PreferencesService } from 'vs/workbench/services/preferences/browser/preferencesService';
import { IEditorService, IResourceEditor } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService, GroupDirection, preferredSideBySideGroupDirection } from 'vs/workbench/services/group/common/editorGroupsService';
import { EditorService } from 'vs/workbench/services/editor/browser/editorService';
import { IExtensionUrlHandler, ExtensionUrlHandler } from 'vs/workbench/services/extensions/electron-browser/inactiveExtensionUrlHandler';
import { ContextViewService } from 'vs/platform/contextview/browser/contextViewService';
import { WorkbenchThemeService } from 'vs/workbench/services/themes/electron-browser/workbenchThemeService';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { FileDialogService } from 'vs/workbench/services/dialogs/electron-browser/dialogService';
import { LogStorageAction } from 'vs/platform/storage/node/storageService';
import { IEditor } from 'vs/editor/common/editorCommon';

interface WorkbenchParams {
	configuration: IWindowConfiguration;
	serviceCollection: ServiceCollection;
}

interface IZenModeSettings {
	fullScreen: boolean;
	centerLayout: boolean;
	hideTabs: boolean;
	hideActivityBar: boolean;
	hideStatusBar: boolean;
	hideLineNumbers: boolean;
	restore: boolean;
}

export interface IWorkbenchStartedInfo {
	customKeybindingsCount: number;
	pinnedViewlets: string[];
	restoredViewlet: string;
	restoredEditorsCount: number;
}

type FontAliasingOption = 'default' | 'antialiased' | 'none' | 'auto';

const fontAliasingValues: FontAliasingOption[] = ['antialiased', 'none', 'auto'];

const Identifiers = {
	WORKBENCH_CONTAINER: 'workbench.main.container',
	TITLEBAR_PART: 'workbench.parts.titlebar',
	ACTIVITYBAR_PART: 'workbench.parts.activitybar',
	SIDEBAR_PART: 'workbench.parts.sidebar',
	PANEL_PART: 'workbench.parts.panel',
	EDITOR_PART: 'workbench.parts.editor',
	STATUSBAR_PART: 'workbench.parts.statusbar'
};

function getWorkbenchStateString(state: WorkbenchState): string {
	switch (state) {
		case WorkbenchState.EMPTY: return 'empty';
		case WorkbenchState.FOLDER: return 'folder';
		case WorkbenchState.WORKSPACE: return 'workspace';
	}
}

interface IZenMode {
	active: boolean;
	transitionedToFullScreen: boolean;
	transitionedToCenteredEditorLayout: boolean;
	transitionDisposeables: IDisposable[];
	wasSideBarVisible: boolean;
	wasPanelVisible: boolean;
}

export class Workbench extends Disposable implements IPartService {

	private static readonly sidebarHiddenStorageKey = 'workbench.sidebar.hidden';
	private static readonly menubarVisibilityConfigurationKey = 'window.menuBarVisibility';
	private static readonly panelHiddenStorageKey = 'workbench.panel.hidden';
	private static readonly zenModeActiveStorageKey = 'workbench.zenmode.active';
	private static readonly centeredEditorLayoutActiveStorageKey = 'workbench.centerededitorlayout.active';
	private static readonly panelPositionStorageKey = 'workbench.panel.location';
	private static readonly defaultPanelPositionStorageKey = 'workbench.panel.defaultLocation';
	private static readonly sidebarPositionConfigurationKey = 'workbench.sideBar.location';
	private static readonly statusbarVisibleConfigurationKey = 'workbench.statusBar.visible';
	private static readonly activityBarVisibleConfigurationKey = 'workbench.activityBar.visible';
	private static readonly closeWhenEmptyConfigurationKey = 'window.closeWhenEmpty';
	private static readonly fontAliasingConfigurationKey = 'workbench.fontAliasing';

	_serviceBrand: any;

	private workbenchParams: WorkbenchParams;
	private workbench: HTMLElement;
	private workbenchStarted: boolean;
	private workbenchRestored: boolean;
	private workbenchShutdown: boolean;

	private editorService: EditorService;
	private editorGroupService: IEditorGroupsService;
	private contextViewService: ContextViewService;
	private contextKeyService: IContextKeyService;
	private keybindingService: IKeybindingService;
	private backupFileService: IBackupFileService;
	private fileService: IFileService;
	private quickInput: QuickInputService;

	private workbenchLayout: WorkbenchLayout;

	private titlebarPart: TitlebarPart;
	private activitybarPart: ActivitybarPart;
	private sidebarPart: SidebarPart;
	private panelPart: PanelPart;
	private editorPart: EditorPart;
	private statusbarPart: StatusbarPart;
	private quickOpen: QuickOpenController;
	private notificationsCenter: NotificationsCenter;
	private notificationsToasts: NotificationsToasts;

	private sideBarHidden: boolean;
	private statusBarHidden: boolean;
	private activityBarHidden: boolean;
	private menubarToggled: boolean;
	private sideBarPosition: Position;
	private panelPosition: Position;
	private panelHidden: boolean;
	private menubarVisibility: MenuBarVisibility;
	private zenMode: IZenMode;
	private fontAliasing: FontAliasingOption;
	private hasInitialFilesToOpen: boolean;
	private shouldCenterLayout = false;

	private inZenMode: IContextKey<boolean>;
	private sideBarVisibleContext: IContextKey<boolean>;

	private closeEmptyWindowScheduler: RunOnceScheduler = this._register(new RunOnceScheduler(() => this.onAllEditorsClosed(), 50));

	constructor(
		private container: HTMLElement,
		private configuration: IWindowConfiguration,
		serviceCollection: ServiceCollection,
		private lifecycleService: LifecycleService,
		private mainProcessClient: IPCClient,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: WorkspaceService,
		@IWorkbenchThemeService private readonly themeService: WorkbenchThemeService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IWindowService private readonly windowService: IWindowService,
		@INotificationService private readonly notificationService: NotificationService
	) {
		super();

		this.workbenchParams = { configuration, serviceCollection };

		this.hasInitialFilesToOpen =
			(configuration.filesToCreate && configuration.filesToCreate.length > 0) ||
			(configuration.filesToOpen && configuration.filesToOpen.length > 0) ||
			(configuration.filesToDiff && configuration.filesToDiff.length > 0);
	}

	startup(): Promise<IWorkbenchStartedInfo> {
		this.workbenchStarted = true;

		// Create Workbench Container
		this.createWorkbench();

		// Install some global actions
		this.createGlobalActions();

		// Services
		this.initServices();

		// Context Keys
		this.handleContextKeys();

		// Register Listeners
		this.registerListeners();

		// Settings
		this.initSettings();

		// Create Workbench and Parts
		this.renderWorkbench();

		// Workbench Layout
		this.createWorkbenchLayout();

		// Driver
		if (this.environmentService.driverHandle) {
			registerWindowDriver(this.mainProcessClient, this.configuration.windowId, this.instantiationService).then(disposable => this._register(disposable));
		}

		// Restore Parts
		return this.restoreParts();
	}

	private createWorkbench(): void {
		this.workbench = document.createElement('div');
		this.workbench.id = Identifiers.WORKBENCH_CONTAINER;
		DOM.addClass(this.workbench, 'monaco-workbench');

		this._register(DOM.addDisposableListener(this.workbench, DOM.EventType.SCROLL, () => {
			this.workbench.scrollTop = 0; // Prevent workbench from scrolling #55456
		}));
	}

	private createGlobalActions(): void {
		const isDeveloping = !this.environmentService.isBuilt || this.environmentService.isExtensionDevelopment;

		// Actions registered here to adjust for developing vs built workbench
		const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
		registry.registerWorkbenchAction(new SyncActionDescriptor(ReloadWindowAction, ReloadWindowAction.ID, ReloadWindowAction.LABEL, isDeveloping ? { primary: KeyMod.CtrlCmd | KeyCode.KEY_R } : undefined), 'Reload Window');
		registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleDevToolsAction, ToggleDevToolsAction.ID, ToggleDevToolsAction.LABEL, isDeveloping ? { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_I, mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_I } } : undefined), 'Developer: Toggle Developer Tools', localize('developer', "Developer"));
		registry.registerWorkbenchAction(new SyncActionDescriptor(OpenRecentAction, OpenRecentAction.ID, OpenRecentAction.LABEL, { primary: isDeveloping ? null : KeyMod.CtrlCmd | KeyCode.KEY_R, mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_R } }), 'File: Open Recent...', localize('file', "File"));
		registry.registerWorkbenchAction(new SyncActionDescriptor(ReloadWindowWithExtensionsDisabledAction, ReloadWindowWithExtensionsDisabledAction.ID, ReloadWindowWithExtensionsDisabledAction.LABEL), 'Reload Window Without Extensions');
		registry.registerWorkbenchAction(new SyncActionDescriptor(LogStorageAction, LogStorageAction.ID, LogStorageAction.LABEL), 'Developer: Log Storage', localize('developer', "Developer"));

		// Actions for macOS native tabs management (only when enabled)
		const windowConfig = this.configurationService.getValue<IWindowConfiguration>();
		if (windowConfig && windowConfig.window && windowConfig.window.nativeTabs) {
			registry.registerWorkbenchAction(new SyncActionDescriptor(NewWindowTab, NewWindowTab.ID, NewWindowTab.LABEL), 'New Window Tab');
			registry.registerWorkbenchAction(new SyncActionDescriptor(ShowPreviousWindowTab, ShowPreviousWindowTab.ID, ShowPreviousWindowTab.LABEL), 'Show Previous Window Tab');
			registry.registerWorkbenchAction(new SyncActionDescriptor(ShowNextWindowTab, ShowNextWindowTab.ID, ShowNextWindowTab.LABEL), 'Show Next Window Tab');
			registry.registerWorkbenchAction(new SyncActionDescriptor(MoveWindowTabToNewWindow, MoveWindowTabToNewWindow.ID, MoveWindowTabToNewWindow.LABEL), 'Move Window Tab to New Window');
			registry.registerWorkbenchAction(new SyncActionDescriptor(MergeAllWindowTabs, MergeAllWindowTabs.ID, MergeAllWindowTabs.LABEL), 'Merge All Windows');
			registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleWindowTabsBar, ToggleWindowTabsBar.ID, ToggleWindowTabsBar.LABEL), 'Toggle Window Tabs Bar');
		}
	}

	private initServices(): void {
		const { serviceCollection } = this.workbenchParams;

		// Services we contribute
		serviceCollection.set(IPartService, this);

		// Clipboard
		serviceCollection.set(IClipboardService, new SyncDescriptor(ClipboardService));

		// Status bar
		this.statusbarPart = this.instantiationService.createInstance(StatusbarPart, Identifiers.STATUSBAR_PART);
		serviceCollection.set(IStatusbarService, this.statusbarPart);

		// Progress 2
		serviceCollection.set(IProgressService2, new SyncDescriptor(ProgressService2));

		// Keybindings
		this.contextKeyService = this.instantiationService.createInstance(ContextKeyService);
		serviceCollection.set(IContextKeyService, this.contextKeyService);

		this.keybindingService = this.instantiationService.createInstance(WorkbenchKeybindingService, window);
		serviceCollection.set(IKeybindingService, this.keybindingService);

		// List
		serviceCollection.set(IListService, this.instantiationService.createInstance(ListService));

		// Context view service
		this.contextViewService = this.instantiationService.createInstance(ContextViewService, this.workbench);
		serviceCollection.set(IContextViewService, this.contextViewService);

		// Use themable context menus when custom titlebar is enabled to match custom menubar
		if (!isMacintosh && this.useCustomTitleBarStyle()) {
			serviceCollection.set(IContextMenuService, new SyncDescriptor(HTMLContextMenuService, [null]));
		} else {
			serviceCollection.set(IContextMenuService, new SyncDescriptor(NativeContextMenuService));
		}

		// Menus/Actions
		serviceCollection.set(IMenuService, new SyncDescriptor(MenuService));

		// Sidebar part
		this.sidebarPart = this.instantiationService.createInstance(SidebarPart, Identifiers.SIDEBAR_PART);

		// Viewlet service
		serviceCollection.set(IViewletService, this.sidebarPart);

		// Panel service (panel part)
		this.panelPart = this.instantiationService.createInstance(PanelPart, Identifiers.PANEL_PART);
		serviceCollection.set(IPanelService, this.panelPart);

		// views service
		const viewsService = this.instantiationService.createInstance(ViewsService);
		serviceCollection.set(IViewsService, viewsService);

		// Activity service (activitybar part)
		this.activitybarPart = this.instantiationService.createInstance(ActivitybarPart, Identifiers.ACTIVITYBAR_PART);
		const activityService = this.instantiationService.createInstance(ActivityService, this.activitybarPart, this.panelPart);
		serviceCollection.set(IActivityService, activityService);

		// File Service
		this.fileService = this.instantiationService.createInstance(RemoteFileService);
		serviceCollection.set(IFileService, this.fileService);
		this.configurationService.acquireFileService(this.fileService);
		this.themeService.acquireFileService(this.fileService);

		// Editor and Group services
		const restorePreviousEditorState = !this.hasInitialFilesToOpen;
		this.editorPart = this.instantiationService.createInstance(EditorPart, Identifiers.EDITOR_PART, restorePreviousEditorState);
		this.editorGroupService = this.editorPart;
		serviceCollection.set(IEditorGroupsService, this.editorPart);
		this.editorService = this.instantiationService.createInstance(EditorService);
		serviceCollection.set(IEditorService, this.editorService);

		// Title bar
		this.titlebarPart = this.instantiationService.createInstance(TitlebarPart, Identifiers.TITLEBAR_PART);
		serviceCollection.set(ITitleService, this.titlebarPart);

		// History
		serviceCollection.set(IHistoryService, new SyncDescriptor(HistoryService));

		// File Dialogs
		serviceCollection.set(IFileDialogService, new SyncDescriptor(FileDialogService));

		// Backup File Service
		if (this.workbenchParams.configuration.backupPath) {
			this.backupFileService = this.instantiationService.createInstance(BackupFileService, this.workbenchParams.configuration.backupPath);
		} else {
			this.backupFileService = new InMemoryBackupFileService();
		}
		serviceCollection.set(IBackupFileService, this.backupFileService);

		// Text File Service
		serviceCollection.set(ITextFileService, new SyncDescriptor(TextFileService));

		// File Decorations
		serviceCollection.set(IDecorationsService, new SyncDescriptor(FileDecorationsService));

		// SCM Service
		serviceCollection.set(ISCMService, new SyncDescriptor(SCMService));

		// Inactive extension URL handler
		serviceCollection.set(IExtensionUrlHandler, new SyncDescriptor(ExtensionUrlHandler));

		// Text Model Resolver Service
		serviceCollection.set(ITextModelService, new SyncDescriptor(TextModelResolverService));

		// JSON Editing
		const jsonEditingService = this.instantiationService.createInstance(JSONEditingService);
		serviceCollection.set(IJSONEditingService, jsonEditingService);

		// Workspace Editing
		serviceCollection.set(IWorkspaceEditingService, new SyncDescriptor(WorkspaceEditingService));

		// Keybinding Editing
		serviceCollection.set(IKeybindingEditingService, this.instantiationService.createInstance(KeybindingsEditingService));

		// Configuration Resolver
		serviceCollection.set(IConfigurationResolverService, new SyncDescriptor(ConfigurationResolverService, [process.env]));

		// Quick open service (quick open controller)
		this.quickOpen = this.instantiationService.createInstance(QuickOpenController);
		serviceCollection.set(IQuickOpenService, this.quickOpen);

		// Quick input service
		this.quickInput = this.instantiationService.createInstance(QuickInputService);
		serviceCollection.set(IQuickInputService, this.quickInput);

		// PreferencesService
		serviceCollection.set(IPreferencesService, this.instantiationService.createInstance(PreferencesService));

		// Contributed services
		const contributedServices = getServices();
		for (let contributedService of contributedServices) {
			serviceCollection.set(contributedService.id, contributedService.descriptor);
		}

		// Set the some services to registries that have been created eagerly
		Registry.as<IActionBarRegistry>(ActionBarExtensions.Actionbar).setInstantiationService(this.instantiationService);
		Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).start(this.instantiationService, this.lifecycleService);
		Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories).setInstantiationService(this.instantiationService);

		this.instantiationService.createInstance(DefaultConfigurationExportHelper);

		this.configurationService.acquireInstantiationService(this.getInstantiationService());
	}

	//#region event handling

	private registerListeners(): void {

		// Storage
		this._register(this.storageService.onWillSaveState(e => this.saveState(e)));

		// Listen to visible editor changes
		this._register(this.editorService.onDidVisibleEditorsChange(() => this.onDidVisibleEditorsChange()));

		// Listen to editor closing (if we run with --wait)
		const filesToWait = this.workbenchParams.configuration.filesToWait;
		if (filesToWait) {
			const resourcesToWaitFor = filesToWait.paths.map(p => p.fileUri);
			const waitMarkerFile = URI.file(filesToWait.waitMarkerFilePath);
			const listenerDispose = this.editorService.onDidCloseEditor(() => this.onEditorClosed(listenerDispose, resourcesToWaitFor, waitMarkerFile));

			this._register(listenerDispose);
		}

		// Configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(() => this.onDidUpdateConfiguration()));

		// Fullscreen changes
		this._register(browser.onDidChangeFullscreen(() => this.onFullscreenChanged()));

		// Group changes
		this._register(this.editorGroupService.onDidAddGroup(() => this.centerEditorLayout(this.shouldCenterLayout)));
		this._register(this.editorGroupService.onDidRemoveGroup(() => this.centerEditorLayout(this.shouldCenterLayout)));
	}

	private onFullscreenChanged(): void {

		// Apply as CSS class
		const isFullscreen = browser.isFullscreen();
		if (isFullscreen) {
			DOM.addClass(this.workbench, 'fullscreen');
		} else {
			DOM.removeClass(this.workbench, 'fullscreen');

			if (this.zenMode.transitionedToFullScreen && this.zenMode.active) {
				this.toggleZenMode();
			}
		}

		// Changing fullscreen state of the window has an impact on custom title bar visibility, so we need to update
		if (this.useCustomTitleBarStyle()) {
			this._onTitleBarVisibilityChange.fire();
			this.layout(); // handle title bar when fullscreen changes
		}
	}

	private onMenubarToggled(visible: boolean) {
		if (visible !== this.menubarToggled) {
			this.menubarToggled = visible;

			if (browser.isFullscreen() && (this.menubarVisibility === 'toggle' || this.menubarVisibility === 'default')) {
				this._onTitleBarVisibilityChange.fire();
				this.layout();
			}
		}
	}

	private onEditorClosed(listenerDispose: IDisposable, resourcesToWaitFor: URI[], waitMarkerFile: URI): void {

		// In wait mode, listen to changes to the editors and wait until the files
		// are closed that the user wants to wait for. When this happens we delete
		// the wait marker file to signal to the outside that editing is done.
		if (resourcesToWaitFor.every(resource => !this.editorService.isOpen({ resource }))) {
			listenerDispose.dispose();
			this.fileService.del(waitMarkerFile);
		}
	}

	private onDidVisibleEditorsChange(): void {
		const visibleEditors = this.editorService.visibleControls;

		// Close when empty: check if we should close the window based on the setting
		// Overruled by: window has a workspace opened or this window is for extension development
		// or setting is disabled. Also enabled when running with --wait from the command line.
		if (visibleEditors.length === 0 && this.contextService.getWorkbenchState() === WorkbenchState.EMPTY && !this.environmentService.isExtensionDevelopment) {
			const closeWhenEmpty = this.configurationService.getValue<boolean>(Workbench.closeWhenEmptyConfigurationKey);
			if (closeWhenEmpty || this.environmentService.args.wait) {
				this.closeEmptyWindowScheduler.schedule();
			}
		}
	}

	private onAllEditorsClosed(): void {
		const visibleEditors = this.editorService.visibleControls.length;
		if (visibleEditors === 0) {
			this.windowService.closeWindow();
		}
	}

	private onDidUpdateConfiguration(skipLayout?: boolean): void {
		const newSidebarPositionValue = this.configurationService.getValue<string>(Workbench.sidebarPositionConfigurationKey);
		const newSidebarPosition = (newSidebarPositionValue === 'right') ? Position.RIGHT : Position.LEFT;
		if (newSidebarPosition !== this.getSideBarPosition()) {
			this.setSideBarPosition(newSidebarPosition);
		}

		this.setPanelPositionFromStorageOrConfig();

		const fontAliasing = this.configurationService.getValue<FontAliasingOption>(Workbench.fontAliasingConfigurationKey);
		if (fontAliasing !== this.fontAliasing) {
			this.setFontAliasing(fontAliasing);
		}

		if (!this.zenMode.active) {
			const newStatusbarHiddenValue = !this.configurationService.getValue<boolean>(Workbench.statusbarVisibleConfigurationKey);
			if (newStatusbarHiddenValue !== this.statusBarHidden) {
				this.setStatusBarHidden(newStatusbarHiddenValue, skipLayout);
			}

			const newActivityBarHiddenValue = !this.configurationService.getValue<boolean>(Workbench.activityBarVisibleConfigurationKey);
			if (newActivityBarHiddenValue !== this.activityBarHidden) {
				this.setActivityBarHidden(newActivityBarHiddenValue, skipLayout);
			}
		}

		const newMenubarVisibility = this.configurationService.getValue<MenuBarVisibility>(Workbench.menubarVisibilityConfigurationKey);
		this.setMenubarVisibility(newMenubarVisibility, skipLayout);
	}

	//#endregion

	private handleContextKeys(): void {
		this.inZenMode = InEditorZenModeContext.bindTo(this.contextKeyService);

		IsMacContext.bindTo(this.contextKeyService);
		IsLinuxContext.bindTo(this.contextKeyService);
		IsWindowsContext.bindTo(this.contextKeyService);

		const sidebarVisibleContextRaw = new RawContextKey<boolean>('sidebarVisible', false);
		this.sideBarVisibleContext = sidebarVisibleContextRaw.bindTo(this.contextKeyService);

		const activeEditorContext = ActiveEditorContext.bindTo(this.contextKeyService);
		const editorsVisibleContext = EditorsVisibleContext.bindTo(this.contextKeyService);
		const textCompareEditorVisible = TextCompareEditorVisibleContext.bindTo(this.contextKeyService);
		const textCompareEditorActive = TextCompareEditorActiveContext.bindTo(this.contextKeyService);
		const activeEditorGroupEmpty = ActiveEditorGroupEmptyContext.bindTo(this.contextKeyService);
		const multipleEditorGroups = MultipleEditorGroupsContext.bindTo(this.contextKeyService);

		const updateEditorContextKeys = () => {
			const activeControl = this.editorService.activeControl;
			const visibleEditors = this.editorService.visibleControls;

			textCompareEditorActive.set(activeControl && activeControl.getId() === TEXT_DIFF_EDITOR_ID);
			textCompareEditorVisible.set(visibleEditors.some(control => control.getId() === TEXT_DIFF_EDITOR_ID));

			if (visibleEditors.length > 0) {
				editorsVisibleContext.set(true);
			} else {
				editorsVisibleContext.reset();
			}

			if (!this.editorService.activeEditor) {
				activeEditorGroupEmpty.set(true);
			} else {
				activeEditorGroupEmpty.reset();
			}

			if (this.editorGroupService.count > 1) {
				multipleEditorGroups.set(true);
			} else {
				multipleEditorGroups.reset();
			}

			if (activeControl) {
				activeEditorContext.set(activeControl.getId());
			} else {
				activeEditorContext.reset();
			}
		};

		this.editorPart.whenRestored.then(() => updateEditorContextKeys());
		this._register(this.editorService.onDidActiveEditorChange(() => updateEditorContextKeys()));
		this._register(this.editorService.onDidVisibleEditorsChange(() => updateEditorContextKeys()));
		this._register(this.editorGroupService.onDidAddGroup(() => updateEditorContextKeys()));
		this._register(this.editorGroupService.onDidRemoveGroup(() => updateEditorContextKeys()));

		const inputFocused = InputFocusedContext.bindTo(this.contextKeyService);

		function activeElementIsInput(): boolean {
			return document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
		}

		function trackInputFocus(): void {
			const isInputFocused = activeElementIsInput();
			inputFocused.set(isInputFocused);

			if (isInputFocused) {
				const tracker = DOM.trackFocus(document.activeElement as HTMLElement);
				Event.once(tracker.onDidBlur)(() => {
					inputFocused.set(activeElementIsInput());

					tracker.dispose();
				});
			}
		}

		this._register(DOM.addDisposableListener(window, 'focusin', () => trackInputFocus(), true));

		const workbenchStateRawContext = new RawContextKey<string>('workbenchState', getWorkbenchStateString(this.configurationService.getWorkbenchState()));
		const workbenchStateContext = workbenchStateRawContext.bindTo(this.contextKeyService);
		this._register(this.configurationService.onDidChangeWorkbenchState(() => {
			workbenchStateContext.set(getWorkbenchStateString(this.configurationService.getWorkbenchState()));
		}));

		const workspaceFolderCountRawContext = new RawContextKey<number>('workspaceFolderCount', this.configurationService.getWorkspace().folders.length);
		const workspaceFolderCountContext = workspaceFolderCountRawContext.bindTo(this.contextKeyService);
		this._register(this.configurationService.onDidChangeWorkspaceFolders(() => {
			workspaceFolderCountContext.set(this.configurationService.getWorkspace().folders.length);
		}));

		const splitEditorsVerticallyContext = SplitEditorsVertically.bindTo(this.contextKeyService);

		const updateSplitEditorsVerticallyContext = () => {
			const direction = preferredSideBySideGroupDirection(this.configurationService);
			splitEditorsVerticallyContext.set(direction === GroupDirection.DOWN);
		};

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.editor.openSideBySideDirection')) {
				updateSplitEditorsVerticallyContext();
			}
		}));

		updateSplitEditorsVerticallyContext();
	}

	private restoreParts(): Promise<IWorkbenchStartedInfo> {
		const restorePromises: Promise<any>[] = [];

		// Restore Editorpart
		perf.mark('willRestoreEditors');
		restorePromises.push(this.editorPart.whenRestored.then(() => {

			function openEditors(editors: IResourceEditor[], editorService: IEditorService) {
				if (editors.length) {
					return editorService.openEditors(editors);
				}

				return Promise.resolve();
			}

			const editorsToOpen = this.resolveEditorsToOpen();

			if (Array.isArray(editorsToOpen)) {
				return openEditors(editorsToOpen, this.editorService);
			}

			return editorsToOpen.then(editors => openEditors(editors, this.editorService));
		}).then(() => perf.mark('didRestoreEditors')));

		// Restore Sidebar
		let viewletIdToRestore: string;
		if (!this.sideBarHidden) {
			this.sideBarVisibleContext.set(true);

			if (this.shouldRestoreLastOpenedViewlet()) {
				viewletIdToRestore = this.storageService.get(SidebarPart.activeViewletSettingsKey, StorageScope.WORKSPACE);
			}

			if (!viewletIdToRestore) {
				viewletIdToRestore = this.sidebarPart.getDefaultViewletId();
			}

			perf.mark('willRestoreViewlet');
			restorePromises.push(this.sidebarPart.openViewlet(viewletIdToRestore)
				.then(viewlet => viewlet || this.sidebarPart.openViewlet(this.sidebarPart.getDefaultViewletId()))
				.then(() => perf.mark('didRestoreViewlet')));
		}

		// Restore Panel
		const panelRegistry = Registry.as<PanelRegistry>(PanelExtensions.Panels);
		const panelId = this.storageService.get(PanelPart.activePanelSettingsKey, StorageScope.WORKSPACE, panelRegistry.getDefaultPanelId());
		if (!this.panelHidden && !!panelId) {
			perf.mark('willRestorePanel');
			const isPanelToRestoreEnabled = !!this.panelPart.getPanels().filter(p => p.id === panelId).length;
			const panelIdToRestore = isPanelToRestoreEnabled ? panelId : panelRegistry.getDefaultPanelId();
			this.panelPart.openPanel(panelIdToRestore, false);
			perf.mark('didRestorePanel');
		}

		// Restore Zen Mode if active and supported for restore on startup
		const zenConfig = this.configurationService.getValue<IZenModeSettings>('zenMode');
		const wasZenActive = this.storageService.getBoolean(Workbench.zenModeActiveStorageKey, StorageScope.WORKSPACE, false);
		if (wasZenActive && zenConfig.restore) {
			this.toggleZenMode(true, true);
		}

		// Restore Forced Editor Center Mode
		if (this.storageService.getBoolean(Workbench.centeredEditorLayoutActiveStorageKey, StorageScope.WORKSPACE, false)) {
			this.centerEditorLayout(true);
		}

		const onRestored = (error?: Error): IWorkbenchStartedInfo => {
			this.workbenchRestored = true;

			// Set lifecycle phase to `Restored`
			this.lifecycleService.phase = LifecyclePhase.Restored;

			// Set lifecycle phase to `Eventually` after a short delay and when
			// idle (min 2.5sec, max 5sec)
			setTimeout(() => {
				this._register(runWhenIdle(() => {
					this.lifecycleService.phase = LifecyclePhase.Eventually;
				}, 2500));
			}, 2500);

			if (error) {
				errors.onUnexpectedError(error);
			}

			return {
				customKeybindingsCount: this.keybindingService.customKeybindingsCount(),
				pinnedViewlets: this.activitybarPart.getPinnedViewletIds(),
				restoredViewlet: viewletIdToRestore,
				restoredEditorsCount: this.editorService.visibleEditors.length
			};
		};

		return Promise.all(restorePromises).then(() => onRestored(), error => onRestored(error));
	}

	private shouldRestoreLastOpenedViewlet(): boolean {
		if (!this.environmentService.isBuilt) {
			return true; // always restore sidebar when we are in development mode
		}

		// always restore sidebar when the window was reloaded
		return this.lifecycleService.startupKind === StartupKind.ReloadedWindow;
	}

	private resolveEditorsToOpen(): Promise<IResourceEditor[]> | IResourceEditor[] {
		const config = this.workbenchParams.configuration;

		// Files to open, diff or create
		if (this.hasInitialFilesToOpen) {

			// Files to diff is exclusive
			const filesToDiff = this.toInputs(config.filesToDiff, false);
			if (filesToDiff && filesToDiff.length === 2) {
				return [<IResourceDiffInput>{
					leftResource: filesToDiff[0].resource,
					rightResource: filesToDiff[1].resource,
					options: { pinned: true },
					forceFile: true
				}];
			}

			const filesToCreate = this.toInputs(config.filesToCreate, true);
			const filesToOpen = this.toInputs(config.filesToOpen, false);

			// Otherwise: Open/Create files
			return [...filesToOpen, ...filesToCreate];
		}

		// Empty workbench
		else if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY && this.openUntitledFile()) {
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

	private toInputs(paths: IPath[], isNew: boolean): Array<IResourceInput | IUntitledResourceInput> {
		if (!paths || !paths.length) {
			return [];
		}

		return paths.map(p => {
			const resource = p.fileUri;
			let input: IResourceInput | IUntitledResourceInput;
			if (isNew) {
				input = { filePath: resource.fsPath, options: { pinned: true } } as IUntitledResourceInput;
			} else {
				input = { resource, options: { pinned: true }, forceFile: true } as IResourceInput;
			}

			if (!isNew && p.lineNumber) {
				input.options.selection = {
					startLineNumber: p.lineNumber,
					startColumn: p.columnNumber
				};
			}

			return input;
		});
	}

	private openUntitledFile() {
		const startupEditor = this.configurationService.inspect('workbench.startupEditor');

		// Fallback to previous workbench.welcome.enabled setting in case startupEditor is not defined
		if (!startupEditor.user && !startupEditor.workspace) {
			const welcomeEnabledValue = this.configurationService.getValue('workbench.welcome.enabled');
			if (typeof welcomeEnabledValue === 'boolean') {
				return !welcomeEnabledValue;
			}
		}

		return startupEditor.value === 'newUntitledFile';
	}

	private initSettings(): void {

		// Sidebar visibility
		this.sideBarHidden = this.storageService.getBoolean(Workbench.sidebarHiddenStorageKey, StorageScope.WORKSPACE, this.contextService.getWorkbenchState() === WorkbenchState.EMPTY);

		// Panel part visibility
		const panelRegistry = Registry.as<PanelRegistry>(PanelExtensions.Panels);
		this.panelHidden = this.storageService.getBoolean(Workbench.panelHiddenStorageKey, StorageScope.WORKSPACE, true);
		if (!panelRegistry.getDefaultPanelId()) {
			this.panelHidden = true; // we hide panel part if there is no default panel
		}

		// Sidebar position
		const sideBarPosition = this.configurationService.getValue<string>(Workbench.sidebarPositionConfigurationKey);
		this.sideBarPosition = (sideBarPosition === 'right') ? Position.RIGHT : Position.LEFT;

		// Panel position
		this.setPanelPositionFromStorageOrConfig();

		// Menubar visibility
		const menuBarVisibility = this.configurationService.getValue<MenuBarVisibility>(Workbench.menubarVisibilityConfigurationKey);
		this.setMenubarVisibility(menuBarVisibility, true);

		// Statusbar visibility
		const statusBarVisible = this.configurationService.getValue<string>(Workbench.statusbarVisibleConfigurationKey);
		this.statusBarHidden = !statusBarVisible;

		// Activity bar visibility
		const activityBarVisible = this.configurationService.getValue<string>(Workbench.activityBarVisibleConfigurationKey);
		this.activityBarHidden = !activityBarVisible;

		// Font aliasing
		this.fontAliasing = this.configurationService.getValue<FontAliasingOption>(Workbench.fontAliasingConfigurationKey);

		// Zen mode
		this.zenMode = {
			active: false,
			transitionedToFullScreen: false,
			transitionedToCenteredEditorLayout: false,
			wasSideBarVisible: false,
			wasPanelVisible: false,
			transitionDisposeables: []
		};
	}

	private setPanelPositionFromStorageOrConfig() {
		const defaultPanelPosition = this.configurationService.getValue<string>(Workbench.defaultPanelPositionStorageKey);
		const panelPosition = this.storageService.get(Workbench.panelPositionStorageKey, StorageScope.WORKSPACE, defaultPanelPosition);

		this.panelPosition = (panelPosition === 'right') ? Position.RIGHT : Position.BOTTOM;
	}

	private useCustomTitleBarStyle(): boolean {
		return getTitleBarStyle(this.configurationService, this.environmentService) === 'custom';
	}

	private setStatusBarHidden(hidden: boolean, skipLayout?: boolean): void {
		this.statusBarHidden = hidden;

		// Adjust CSS
		if (hidden) {
			DOM.addClass(this.workbench, 'nostatusbar');
		} else {
			DOM.removeClass(this.workbench, 'nostatusbar');
		}

		// Layout
		if (!skipLayout) {
			this.workbenchLayout.layout();
		}
	}

	private setFontAliasing(aliasing: FontAliasingOption) {
		this.fontAliasing = aliasing;

		// Remove all
		document.body.classList.remove(...fontAliasingValues.map(value => `monaco-font-aliasing-${value}`));

		// Add specific
		if (fontAliasingValues.some(option => option === aliasing)) {
			document.body.classList.add(`monaco-font-aliasing-${aliasing}`);
		}
	}

	private createWorkbenchLayout(): void {
		this.workbenchLayout = this.instantiationService.createInstance(
			WorkbenchLayout,
			this.container,
			this.workbench,
			{
				titlebar: this.titlebarPart,
				activitybar: this.activitybarPart,
				editor: this.editorPart,
				sidebar: this.sidebarPart,
				panel: this.panelPart,
				statusbar: this.statusbarPart,
			},
			this.quickOpen,
			this.quickInput,
			this.notificationsCenter,
			this.notificationsToasts
		);
	}

	private renderWorkbench(): void {

		// Apply sidebar state as CSS class
		if (this.sideBarHidden) {
			DOM.addClass(this.workbench, 'nosidebar');
		}

		if (this.panelHidden) {
			DOM.addClass(this.workbench, 'nopanel');
		}

		if (this.statusBarHidden) {
			DOM.addClass(this.workbench, 'nostatusbar');
		}

		// Apply font aliasing
		this.setFontAliasing(this.fontAliasing);

		// Apply fullscreen state
		if (browser.isFullscreen()) {
			DOM.addClass(this.workbench, 'fullscreen');
		}

		// Create Parts
		this.createTitlebarPart();
		this.createActivityBarPart();
		this.createSidebarPart();
		this.createEditorPart();
		this.createPanelPart();
		this.createStatusbarPart();

		// Notification Handlers
		this.createNotificationsHandlers();


		// Menubar visibility changes
		if ((isWindows || isLinux) && this.useCustomTitleBarStyle()) {
			this.titlebarPart.onMenubarVisibilityChange()(e => this.onMenubarToggled(e));
		}

		// Add Workbench to DOM
		this.container.appendChild(this.workbench);
	}

	private createTitlebarPart(): void {
		const titlebarContainer = this.createPart(Identifiers.TITLEBAR_PART, ['part', 'titlebar'], 'contentinfo');

		this.titlebarPart.create(titlebarContainer);
	}

	private createActivityBarPart(): void {
		const activitybarPartContainer = this.createPart(Identifiers.ACTIVITYBAR_PART, ['part', 'activitybar', this.sideBarPosition === Position.LEFT ? 'left' : 'right'], 'navigation');

		this.activitybarPart.create(activitybarPartContainer);
	}

	private createSidebarPart(): void {
		const sidebarPartContainer = this.createPart(Identifiers.SIDEBAR_PART, ['part', 'sidebar', this.sideBarPosition === Position.LEFT ? 'left' : 'right'], 'complementary');

		this.sidebarPart.create(sidebarPartContainer);
	}

	private createPanelPart(): void {
		const panelPartContainer = this.createPart(Identifiers.PANEL_PART, ['part', 'panel', this.panelPosition === Position.BOTTOM ? 'bottom' : 'right'], 'complementary');

		this.panelPart.create(panelPartContainer);
	}

	private createEditorPart(): void {
		const editorContainer = this.createPart(Identifiers.EDITOR_PART, ['part', 'editor'], 'main');

		this.editorPart.create(editorContainer);
	}

	private createStatusbarPart(): void {
		const statusbarContainer = this.createPart(Identifiers.STATUSBAR_PART, ['part', 'statusbar'], 'contentinfo');

		this.statusbarPart.create(statusbarContainer);
	}

	private createPart(id: string, classes: string[], role: string): HTMLElement {
		const part = document.createElement('div');
		classes.forEach(clazz => DOM.addClass(part, clazz));
		part.id = id;
		part.setAttribute('role', role);

		// Insert all workbench parts at the beginning. Issue #52531
		// This is primarily for the title bar to allow overriding -webkit-app-region
		this.workbench.insertBefore(part, this.workbench.lastChild);

		return part;
	}

	private createNotificationsHandlers(): void {

		// Notifications Center
		this.notificationsCenter = this._register(this.instantiationService.createInstance(NotificationsCenter, this.workbench, this.notificationService.model));

		// Notifications Toasts
		this.notificationsToasts = this._register(this.instantiationService.createInstance(NotificationsToasts, this.workbench, this.notificationService.model));

		// Notifications Alerts
		this._register(this.instantiationService.createInstance(NotificationsAlerts, this.notificationService.model));

		// Notifications Status
		const notificationsStatus = this.instantiationService.createInstance(NotificationsStatus, this.notificationService.model);

		// Eventing
		this._register(this.notificationsCenter.onDidChangeVisibility(() => {

			// Update status
			notificationsStatus.update(this.notificationsCenter.isVisible);

			// Update toasts
			this.notificationsToasts.update(this.notificationsCenter.isVisible);
		}));

		// Register Commands
		registerNotificationCommands(this.notificationsCenter, this.notificationsToasts);
	}

	getInstantiationService(): IInstantiationService {
		return this.instantiationService;
	}

	private saveState(e: IWillSaveStateEvent): void {
		if (this.zenMode.active) {
			this.storageService.store(Workbench.zenModeActiveStorageKey, true, StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(Workbench.zenModeActiveStorageKey, StorageScope.WORKSPACE);
		}

		if (e.reason === WillSaveStateReason.SHUTDOWN && this.zenMode.active) {
			const zenConfig = this.configurationService.getValue<IZenModeSettings>('zenMode');
			if (!zenConfig.restore) {
				// We will not restore zen mode, need to clear all zen mode state changes
				this.toggleZenMode(true);
			}
		}
	}

	dispose(): void {
		super.dispose();

		this.workbenchShutdown = true;
	}

	//#region IPartService

	private _onTitleBarVisibilityChange: Emitter<void> = this._register(new Emitter<void>());
	get onTitleBarVisibilityChange(): Event<void> { return this._onTitleBarVisibilityChange.event; }

	get onEditorLayout(): Event<IDimension> { return this.editorPart.onDidLayout; }

	isRestored(): boolean {
		return !!(this.workbenchRestored && this.workbenchStarted);
	}

	hasFocus(part: Parts): boolean {
		const activeElement = document.activeElement;
		if (!activeElement) {
			return false;
		}

		const container = this.getContainer(part);
		return DOM.isAncestor(activeElement, container);
	}

	getContainer(part: Parts): HTMLElement {
		let container: HTMLElement | null = null;
		switch (part) {
			case Parts.TITLEBAR_PART:
				container = this.titlebarPart.getContainer();
				break;
			case Parts.ACTIVITYBAR_PART:
				container = this.activitybarPart.getContainer();
				break;
			case Parts.SIDEBAR_PART:
				container = this.sidebarPart.getContainer();
				break;
			case Parts.PANEL_PART:
				container = this.panelPart.getContainer();
				break;
			case Parts.EDITOR_PART:
				container = this.editorPart.getContainer();
				break;
			case Parts.STATUSBAR_PART:
				container = this.statusbarPart.getContainer();
				break;
		}

		return container;
	}

	isVisible(part: Parts): boolean {
		switch (part) {
			case Parts.TITLEBAR_PART:
				if (!this.useCustomTitleBarStyle()) {
					return false;
				} else if (!browser.isFullscreen()) {
					return true;
				} else if (isMacintosh) {
					return false;
				} else if (this.menubarVisibility === 'visible') {
					return true;
				} else if (this.menubarVisibility === 'toggle' || this.menubarVisibility === 'default') {
					return this.menubarToggled;
				}

				return false;
			case Parts.SIDEBAR_PART:
				return !this.sideBarHidden;
			case Parts.PANEL_PART:
				return !this.panelHidden;
			case Parts.STATUSBAR_PART:
				return !this.statusBarHidden;
			case Parts.ACTIVITYBAR_PART:
				return !this.activityBarHidden;
		}

		return true; // any other part cannot be hidden
	}

	getTitleBarOffset(): number {
		let offset = 0;
		if (this.isVisible(Parts.TITLEBAR_PART)) {
			offset = this.workbenchLayout.partLayoutInfo.titlebar.height;
			if (isMacintosh || this.menubarVisibility === 'hidden') {
				offset /= browser.getZoomFactor();
			}
		}

		return offset;
	}

	getWorkbenchElement(): HTMLElement {
		return this.workbench;
	}

	toggleZenMode(skipLayout?: boolean, restoring = false): void {
		this.zenMode.active = !this.zenMode.active;
		this.zenMode.transitionDisposeables = dispose(this.zenMode.transitionDisposeables);

		// Check if zen mode transitioned to full screen and if now we are out of zen mode
		// -> we need to go out of full screen (same goes for the centered editor layout)
		let toggleFullScreen = false;
		const setLineNumbers = (lineNumbers: any) => {
			this.editorService.visibleControls.forEach(editor => {
				const control = <IEditor>editor.getControl();
				if (control) {
					control.updateOptions({ lineNumbers });
				}
			});
		};

		// Zen Mode Active
		if (this.zenMode.active) {
			const config = this.configurationService.getValue<IZenModeSettings>('zenMode');

			toggleFullScreen = !browser.isFullscreen() && config.fullScreen;
			this.zenMode.transitionedToFullScreen = restoring ? config.fullScreen : toggleFullScreen;
			this.zenMode.transitionedToCenteredEditorLayout = !this.isEditorLayoutCentered() && config.centerLayout;
			this.zenMode.wasSideBarVisible = this.isVisible(Parts.SIDEBAR_PART);
			this.zenMode.wasPanelVisible = this.isVisible(Parts.PANEL_PART);

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
				this.zenMode.transitionDisposeables.push(this.editorService.onDidVisibleEditorsChange(() => setLineNumbers('off')));
			}

			if (config.hideTabs && this.editorPart.partOptions.showTabs) {
				this.zenMode.transitionDisposeables.push(this.editorPart.enforcePartOptions({ showTabs: false }));
			}

			if (config.centerLayout) {
				this.centerEditorLayout(true, true);
			}
		}

		// Zen Mode Inactive
		else {
			if (this.zenMode.wasPanelVisible) {
				this.setPanelHidden(false, true);
			}

			if (this.zenMode.wasSideBarVisible) {
				this.setSideBarHidden(false, true);
			}

			if (this.zenMode.transitionedToCenteredEditorLayout) {
				this.centerEditorLayout(false, true);
			}
			setLineNumbers(this.configurationService.getValue('editor.lineNumbers'));

			// Status bar and activity bar visibility come from settings -> update their visibility.
			this.onDidUpdateConfiguration(true);

			this.editorGroupService.activeGroup.focus();

			toggleFullScreen = this.zenMode.transitionedToFullScreen && browser.isFullscreen();
		}

		this.inZenMode.set(this.zenMode.active);

		if (!skipLayout) {
			this.layout();
		}

		if (toggleFullScreen) {
			this.windowService.toggleFullScreen();
		}
	}

	layout(options?: ILayoutOptions): void {
		this.contextViewService.layout();

		if (this.workbenchStarted && !this.workbenchShutdown) {
			this.workbenchLayout.layout(options);
		}
	}

	isEditorLayoutCentered(): boolean {
		return this.shouldCenterLayout;
	}

	centerEditorLayout(active: boolean, skipLayout?: boolean): void {
		this.storageService.store(Workbench.centeredEditorLayoutActiveStorageKey, active, StorageScope.WORKSPACE);
		this.shouldCenterLayout = active;
		let smartActive = active;
		if (this.editorPart.groups.length > 1 && this.configurationService.getValue('workbench.editor.centeredLayoutAutoResize')) {
			smartActive = false; // Respect the auto resize setting - do not go into centered layout if there is more than 1 group.
		}

		// Enter Centered Editor Layout
		if (this.editorPart.isLayoutCentered() !== smartActive) {
			this.editorPart.centerLayout(smartActive);

			if (!skipLayout) {
				this.layout();
			}
		}
	}

	resizePart(part: Parts, sizeChange: number): void {
		switch (part) {
			case Parts.SIDEBAR_PART:
			case Parts.PANEL_PART:
			case Parts.EDITOR_PART:
				this.workbenchLayout.resizePart(part, sizeChange);
				break;
			default:
				return; // Cannot resize other parts
		}
	}

	setActivityBarHidden(hidden: boolean, skipLayout?: boolean): void {
		this.activityBarHidden = hidden;

		// Layout
		if (!skipLayout) {
			this.workbenchLayout.layout();
		}
	}

	setSideBarHidden(hidden: boolean, skipLayout?: boolean): void {
		this.sideBarHidden = hidden;
		this.sideBarVisibleContext.set(!hidden);

		// Adjust CSS
		if (hidden) {
			DOM.addClass(this.workbench, 'nosidebar');
		} else {
			DOM.removeClass(this.workbench, 'nosidebar');
		}

		// If sidebar becomes hidden, also hide the current active Viewlet if any
		if (hidden && this.sidebarPart.getActiveViewlet()) {
			this.sidebarPart.hideActiveViewlet();
			const activePanel = this.panelPart.getActivePanel();

			// Pass Focus to Editor or Panel if Sidebar is now hidden
			if (this.hasFocus(Parts.PANEL_PART) && activePanel) {
				activePanel.focus();
			} else {
				this.editorGroupService.activeGroup.focus();
			}
		}

		// If sidebar becomes visible, show last active Viewlet or default viewlet
		else if (!hidden && !this.sidebarPart.getActiveViewlet()) {
			const viewletToOpen = this.sidebarPart.getLastActiveViewletId();
			if (viewletToOpen) {
				const viewlet = this.sidebarPart.openViewlet(viewletToOpen, true);
				if (!viewlet) {
					this.sidebarPart.openViewlet(this.sidebarPart.getDefaultViewletId(), true);
				}
			}
		}


		// Remember in settings
		const defaultHidden = this.contextService.getWorkbenchState() === WorkbenchState.EMPTY;
		if (hidden !== defaultHidden) {
			this.storageService.store(Workbench.sidebarHiddenStorageKey, hidden ? 'true' : 'false', StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(Workbench.sidebarHiddenStorageKey, StorageScope.WORKSPACE);
		}

		// Layout
		if (!skipLayout) {
			this.workbenchLayout.layout();
		}
	}

	setPanelHidden(hidden: boolean, skipLayout?: boolean): void {
		this.panelHidden = hidden;

		// Adjust CSS
		if (hidden) {
			DOM.addClass(this.workbench, 'nopanel');
		} else {
			DOM.removeClass(this.workbench, 'nopanel');
		}

		// If panel part becomes hidden, also hide the current active panel if any
		if (hidden && this.panelPart.getActivePanel()) {
			this.panelPart.hideActivePanel();
			this.editorGroupService.activeGroup.focus(); // Pass focus to editor group if panel part is now hidden
		}

		// If panel part becomes visible, show last active panel or default panel
		else if (!hidden && !this.panelPart.getActivePanel()) {
			const panelToOpen = this.panelPart.getLastActivePanelId();
			if (panelToOpen) {
				this.panelPart.openPanel(panelToOpen, true);
			}
		}


		// Remember in settings
		if (!hidden) {
			this.storageService.store(Workbench.panelHiddenStorageKey, 'false', StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(Workbench.panelHiddenStorageKey, StorageScope.WORKSPACE);
		}

		// Layout
		if (!skipLayout) {
			this.workbenchLayout.layout();
		}
	}

	toggleMaximizedPanel(): void {
		this.workbenchLayout.layout({ toggleMaximizedPanel: true, source: Parts.PANEL_PART });
	}

	isPanelMaximized(): boolean {
		return this.workbenchLayout.isPanelMaximized();
	}

	getSideBarPosition(): Position {
		return this.sideBarPosition;
	}

	setSideBarPosition(position: Position): void {
		if (this.sideBarHidden) {
			this.setSideBarHidden(false, true /* Skip Layout */);
		}

		const newPositionValue = (position === Position.LEFT) ? 'left' : 'right';
		const oldPositionValue = (this.sideBarPosition === Position.LEFT) ? 'left' : 'right';
		this.sideBarPosition = position;

		// Adjust CSS
		DOM.removeClass(this.activitybarPart.getContainer(), oldPositionValue);
		DOM.removeClass(this.sidebarPart.getContainer(), oldPositionValue);
		DOM.addClass(this.activitybarPart.getContainer(), newPositionValue);
		DOM.addClass(this.sidebarPart.getContainer(), newPositionValue);

		// Update Styles
		this.activitybarPart.updateStyles();
		this.sidebarPart.updateStyles();

		// Layout
		this.workbenchLayout.layout();
	}

	setMenubarVisibility(visibility: MenuBarVisibility, skipLayout: boolean): void {
		if (this.menubarVisibility !== visibility) {
			this.menubarVisibility = visibility;

			if (!skipLayout) {
				this.workbenchLayout.layout();
			}
		}
	}

	getMenubarVisibility(): MenuBarVisibility {
		return this.menubarVisibility;
	}

	getPanelPosition(): Position {
		return this.panelPosition;
	}

	setPanelPosition(position: Position): void {
		if (this.panelHidden) {
			this.setPanelHidden(false, true /* Skip Layout */);
		}

		const newPositionValue = (position === Position.BOTTOM) ? 'bottom' : 'right';
		const oldPositionValue = (this.panelPosition === Position.BOTTOM) ? 'bottom' : 'right';
		this.panelPosition = position;
		this.storageService.store(Workbench.panelPositionStorageKey, PositionToString(this.panelPosition).toLowerCase(), StorageScope.WORKSPACE);

		// Adjust CSS
		DOM.removeClass(this.panelPart.getContainer(), oldPositionValue);
		DOM.addClass(this.panelPart.getContainer(), newPositionValue);

		// Update Styles
		this.panelPart.updateStyles();

		// Layout
		this.workbenchLayout.layout();
	}

	//#endregion
}
