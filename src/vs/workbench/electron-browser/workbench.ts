/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/workbench/browser/style';

import { localize } from 'vs/nls';
import { IDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { EventType, addDisposableListener, addClasses, scheduleAtNextAnimationFrame, addClass, removeClass, trackFocus, isAncestor, getClientArea, position, size } from 'vs/base/browser/dom';
import { RunOnceScheduler, runWhenIdle } from 'vs/base/common/async';
import { getZoomLevel, onDidChangeFullscreen, isFullscreen, getZoomFactor } from 'vs/base/browser/browser';
import { mark } from 'vs/base/common/performance';
import { onUnexpectedError, setUnexpectedErrorHandler } from 'vs/base/common/errors';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { Registry } from 'vs/platform/registry/common/platform';
import { isWindows, isLinux, isMacintosh, language } from 'vs/base/common/platform';
import { IResourceInput } from 'vs/platform/editor/common/editor';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IEditorInputFactoryRegistry, Extensions as EditorExtensions, TextCompareEditorVisibleContext, TEXT_DIFF_EDITOR_ID, EditorsVisibleContext, InEditorZenModeContext, ActiveEditorGroupEmptyContext, MultipleEditorGroupsContext, IUntitledResourceInput, IResourceDiffInput, SplitEditorsVertically, TextCompareEditorActiveContext, ActiveEditorContext } from 'vs/workbench/common/editor';
import { ActivitybarPart } from 'vs/workbench/browser/parts/activitybar/activitybarPart';
import { SidebarPart } from 'vs/workbench/browser/parts/sidebar/sidebarPart';
import { PanelPart } from 'vs/workbench/browser/parts/panel/panelPart';
import { StatusbarPart } from 'vs/workbench/browser/parts/statusbar/statusbarPart';
import { TitlebarPart } from 'vs/workbench/browser/parts/titlebar/titlebarPart';
import { EditorPart } from 'vs/workbench/browser/parts/editor/editorPart';
import { IActionBarRegistry, Extensions as ActionBarExtensions } from 'vs/workbench/browser/actions';
import { PanelRegistry, Extensions as PanelExtensions } from 'vs/workbench/browser/panel';
import { QuickOpenController } from 'vs/workbench/browser/parts/quickopen/quickOpenController';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { QuickInputService } from 'vs/workbench/browser/parts/quickinput/quickInput';
import { getServices } from 'vs/platform/instantiation/common/extensions';
import { Position, Parts, IPartService, IDimension, PositionToString, ILayoutOptions } from 'vs/workbench/services/part/common/partService';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IStorageService, StorageScope, IWillSaveStateEvent, WillSaveStateReason } from 'vs/platform/storage/common/storage';
import { ContextMenuService as HTMLContextMenuService } from 'vs/platform/contextview/browser/contextMenuService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IKeybindingEditingService, KeybindingsEditingService } from 'vs/workbench/services/keybinding/common/keybindingEditing';
import { RawContextKey, IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IActivityService } from 'vs/workbench/services/activity/common/activity';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IFileService } from 'vs/platform/files/common/files';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { ITitleService } from 'vs/workbench/services/title/common/titleService';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { TextFileService } from 'vs/workbench/services/textfile/common/textFileService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IProgressService2 } from 'vs/platform/progress/common/progress';
import { ProgressService2 } from 'vs/workbench/services/progress/browser/progressService2';
import { TextModelResolverService } from 'vs/workbench/services/textmodelResolver/common/textModelResolverService';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { LifecyclePhase, StartupKind, ILifecycleService, WillShutdownEvent } from 'vs/platform/lifecycle/common/lifecycle';
import { IWindowService, IWindowConfiguration, IPath, MenuBarVisibility, getTitleBarStyle, IWindowsService } from 'vs/platform/windows/common/windows';
import { IStatusbarService } from 'vs/platform/statusbar/common/statusbar';
import { IMenuService, SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { MenuService } from 'vs/platform/actions/common/menuService';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { FileDecorationsService } from 'vs/workbench/services/decorations/browser/decorationsService';
import { IDecorationsService } from 'vs/workbench/services/decorations/browser/decorations';
import { ActivityService } from 'vs/workbench/services/activity/browser/activityService';
import { URI } from 'vs/base/common/uri';
import { IListService, ListService } from 'vs/platform/list/browser/listService';
import { InputFocusedContext, IsMacContext, IsLinuxContext, IsWindowsContext, SupportsOpenFileFolderContext, SupportsWorkspacesContext } from 'vs/platform/contextkey/common/contextkeys';
import { IViewsService } from 'vs/workbench/common/views';
import { ViewsService } from 'vs/workbench/browser/parts/views/views';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { NotificationService } from 'vs/workbench/services/notification/common/notificationService';
import { NotificationsCenter } from 'vs/workbench/browser/parts/notifications/notificationsCenter';
import { NotificationsAlerts } from 'vs/workbench/browser/parts/notifications/notificationsAlerts';
import { NotificationsStatus } from 'vs/workbench/browser/parts/notifications/notificationsStatus';
import { registerNotificationCommands } from 'vs/workbench/browser/parts/notifications/notificationsCommands';
import { NotificationsToasts } from 'vs/workbench/browser/parts/notifications/notificationsToasts';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { PreferencesService } from 'vs/workbench/services/preferences/browser/preferencesService';
import { IEditorService, IResourceEditor } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService, GroupDirection, preferredSideBySideGroupDirection } from 'vs/workbench/services/editor/common/editorGroupsService';
import { EditorService } from 'vs/workbench/services/editor/browser/editorService';
import { ContextViewService } from 'vs/platform/contextview/browser/contextViewService';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { IFileDialogService, IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { Sizing, Direction, Grid, View } from 'vs/base/browser/ui/grid/grid';
import { IEditor } from 'vs/editor/common/editorCommon';
import { WorkbenchLayout } from 'vs/workbench/browser/layout';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { setARIAContainer } from 'vs/base/browser/ui/aria/aria';
import { restoreFontInfo, readFontInfo, saveFontInfo } from 'vs/editor/browser/config/configuration';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';
import { ILogService } from 'vs/platform/log/common/log';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { ILabelService } from 'vs/platform/label/common/label';
import { LabelService } from 'vs/workbench/services/label/common/labelService';
import { IHashService } from 'vs/workbench/services/hash/common/hashService';
import { ITelemetryServiceConfig, TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { combinedAppender, LogAppender, NullTelemetryService, configurationTelemetry } from 'vs/platform/telemetry/common/telemetryUtils';
import ErrorTelemetry from 'vs/platform/telemetry/browser/errorTelemetry';
import { IDownloadService } from 'vs/platform/download/common/download';
import { IExtensionGalleryService, IExtensionManagementServerService, IExtensionManagementService, IExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { ExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionEnablementService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { CommandService } from 'vs/workbench/services/commands/common/commandService';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { MarkerService } from 'vs/platform/markers/common/markerService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { WorkbenchModeServiceImpl } from 'vs/workbench/services/mode/common/workbenchModeService';
import { ITextResourceConfigurationService, ITextResourcePropertiesService } from 'vs/editor/common/services/resourceConfiguration';
import { TextResourceConfigurationService } from 'vs/editor/common/services/resourceConfigurationImpl';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { IMarkerDecorationsService } from 'vs/editor/common/services/markersDecorationService';
import { MarkerDecorationsService } from 'vs/editor/common/services/markerDecorationsServiceImpl';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { EditorWorkerServiceImpl } from 'vs/editor/common/services/editorWorkerServiceImpl';
import { IUntitledEditorService, UntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { ISearchService, ISearchHistoryService } from 'vs/workbench/services/search/common/search';
import { SearchHistoryService } from 'vs/workbench/services/search/common/searchHistoryService';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { CodeEditorService } from 'vs/workbench/services/editor/browser/codeEditorService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { OpenerService } from 'vs/editor/browser/services/openerService';
import { IIntegrityService } from 'vs/workbench/services/integrity/common/integrity';
import { ILocalizationsService } from 'vs/platform/localizations/common/localizations';
import { HistoryService } from 'vs/workbench/services/history/browser/history';
import { ConfigurationResolverService } from 'vs/workbench/services/configurationResolver/browser/configurationResolverService';

// import@node
import product from 'vs/platform/node/product';
import pkg from 'vs/platform/node/package';
import { BackupFileService, InMemoryBackupFileService } from 'vs/workbench/services/backup/node/backupFileService';
import { WorkspaceService, DefaultConfigurationExportHelper } from 'vs/workbench/services/configuration/node/configurationService';
import { JSONEditingService } from 'vs/workbench/services/configuration/node/jsonEditingService';
import { WorkspaceEditingService } from 'vs/workbench/services/workspace/node/workspaceEditingService';
import { IPCClient, getDelayedChannel } from 'vs/base/parts/ipc/node/ipc';
import { LogStorageAction } from 'vs/platform/storage/node/storageService';
import { HashService } from 'vs/workbench/services/hash/node/hashService';
import { connect as connectNet } from 'vs/base/parts/ipc/node/ipc.net';
import { DialogChannel } from 'vs/platform/dialogs/node/dialogIpc';
import { TelemetryAppenderClient } from 'vs/platform/telemetry/node/telemetryIpc';
import { resolveWorkbenchCommonProperties } from 'vs/platform/telemetry/node/workbenchCommonProperties';
import { IRequestService } from 'vs/platform/request/node/request';
import { RequestService } from 'vs/platform/request/node/requestService';
import { DownloadService } from 'vs/platform/download/node/downloadService';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/node/extensionGalleryService';
import { IRemoteAgentService } from 'vs/workbench/services/remote/node/remoteAgentService';
import { DownloadServiceChannel } from 'vs/platform/download/node/downloadIpc';
import { LogLevelSetterChannel } from 'vs/platform/log/node/logIpc';
import { ExtensionManagementChannelClient } from 'vs/platform/extensionManagement/node/extensionManagementIpc';
import { ExtensionManagementServerService } from 'vs/workbench/services/extensions/node/extensionManagementServerService';
import { MultiExtensionManagementService } from 'vs/workbench/services/extensionManagement/node/multiExtensionManagement';
import { SearchService } from 'vs/workbench/services/search/node/searchService';
import { IntegrityServiceImpl } from 'vs/workbench/services/integrity/node/integrityServiceImpl';
import { LocalizationsChannelClient } from 'vs/platform/localizations/node/localizationsIpc';

// import@electron-browser
import { ContextMenuService as NativeContextMenuService } from 'vs/workbench/services/contextview/electron-browser/contextmenuService';
import { WorkbenchKeybindingService } from 'vs/workbench/services/keybinding/electron-browser/keybindingService';
import { RemoteFileService } from 'vs/workbench/services/files/electron-browser/remoteFileService';
import { ClipboardService } from 'vs/platform/clipboard/electron-browser/clipboardService';
import { LifecycleService } from 'vs/platform/lifecycle/electron-browser/lifecycleService';
import { ToggleDevToolsAction } from 'vs/workbench/electron-browser/actions/developerActions';
import { registerWindowDriver } from 'vs/platform/driver/electron-browser/driver';
import { IExtensionUrlHandler, ExtensionUrlHandler } from 'vs/workbench/services/extensions/electron-browser/inactiveExtensionUrlHandler';
import { WorkbenchThemeService } from 'vs/workbench/services/themes/browser/workbenchThemeService';
import { DialogService, FileDialogService } from 'vs/workbench/services/dialogs/electron-browser/dialogService';
import { ShowPreviousWindowTab, MoveWindowTabToNewWindow, MergeAllWindowTabs, ShowNextWindowTab, ToggleWindowTabsBar, NewWindowTab, OpenRecentAction, ReloadWindowAction, ReloadWindowWithExtensionsDisabledAction } from 'vs/workbench/electron-browser/actions/windowActions';
import { IBroadcastService, BroadcastService } from 'vs/workbench/services/broadcast/electron-browser/broadcastService';
import { WindowService } from 'vs/platform/windows/electron-browser/windowService';
import { RemoteAuthorityResolverService } from 'vs/platform/remote/electron-browser/remoteAuthorityResolverService';
import { RemoteAgentService } from 'vs/workbench/services/remote/electron-browser/remoteAgentServiceImpl';
import { ExtensionService } from 'vs/workbench/services/extensions/electron-browser/extensionService';
import { TextResourcePropertiesService } from 'vs/workbench/services/textfile/electron-browser/textResourcePropertiesService';
import { ITextMateService } from 'vs/workbench/services/textMate/electron-browser/textMateService';
import { TextMateService } from 'vs/workbench/services/textMate/electron-browser/TMSyntax';

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

interface IWorkbenchStartedInfo {
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

interface IWorkbenchUIState {
	lastPanelHeight?: number;
	lastPanelWidth?: number;
	lastSidebarDimension?: number;
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

	private readonly _onShutdown = this._register(new Emitter<void>());
	get onShutdown(): Event<void> { return this._onShutdown.event; }

	private readonly _onWillShutdown = this._register(new Emitter<WillShutdownEvent>());
	get onWillShutdown(): Event<WillShutdownEvent> { return this._onWillShutdown.event; }

	_serviceBrand: any;

	private previousErrorValue: string;
	private previousErrorTime: number = 0;

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
	private notificationService: NotificationService;
	private themeService: WorkbenchThemeService;
	private telemetryService: ITelemetryService;
	private windowService: IWindowService;
	private lifecycleService: LifecycleService;
	private fileService: IFileService;
	private quickInput: QuickInputService;

	private workbenchGrid: Grid<View> | WorkbenchLayout;

	private titlebarPart: TitlebarPart;
	private activitybarPart: ActivitybarPart;
	private sidebarPart: SidebarPart;
	private panelPart: PanelPart;
	private editorPart: EditorPart;
	private statusbarPart: StatusbarPart;

	private titlebarPartView: View;
	private activitybarPartView: View;
	private sidebarPartView: View;
	private panelPartView: View;
	private editorPartView: View;
	private statusbarPartView: View;

	private quickOpen: QuickOpenController;
	private notificationsCenter: NotificationsCenter;
	private notificationsToasts: NotificationsToasts;

	private editorHidden: boolean;
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
	private uiState: IWorkbenchUIState = {
		lastPanelHeight: 350,
		lastPanelWidth: 350,
		lastSidebarDimension: 300,
	};

	private inZenMode: IContextKey<boolean>;
	private sideBarVisibleContext: IContextKey<boolean>;

	private closeEmptyWindowScheduler: RunOnceScheduler = this._register(new RunOnceScheduler(() => this.onAllEditorsClosed(), 50));

	constructor(
		private container: HTMLElement,
		private configuration: IWindowConfiguration,
		serviceCollection: ServiceCollection,
		private mainProcessClient: IPCClient,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: WorkspaceService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILogService private readonly logService: ILogService,
		@IWindowsService private readonly windowsService: IWindowsService
	) {
		super();

		this.workbenchParams = { configuration, serviceCollection };

		this.hasInitialFilesToOpen = !!(
			(configuration.filesToCreate && configuration.filesToCreate.length > 0) ||
			(configuration.filesToOpen && configuration.filesToOpen.length > 0) ||
			(configuration.filesToDiff && configuration.filesToDiff.length > 0));

		this.registerErrorHandler();
	}

	private registerErrorHandler(): void {

		// Listen on unhandled rejection events
		window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {

			// See https://developer.mozilla.org/en-US/docs/Web/API/PromiseRejectionEvent
			onUnexpectedError(event.reason);

			// Prevent the printing of this event to the console
			event.preventDefault();
		});

		// Install handler for unexpected errors
		setUnexpectedErrorHandler(error => this.handleUnexpectedError(error));
	}

	private handleUnexpectedError(error: any): void {
		const errorMsg = toErrorMessage(error, true);
		if (!errorMsg) {
			return;
		}

		const now = Date.now();
		if (errorMsg === this.previousErrorValue && now - this.previousErrorTime <= 1000) {
			return; // Return if error message identical to previous and shorter than 1 second
		}

		this.previousErrorTime = now;
		this.previousErrorValue = errorMsg;

		// Log it
		this.logService.error(errorMsg);

		// Show to user if friendly message provided
		if (error && error.friendlyMessage && this.notificationService) {
			this.notificationService.error(error.friendlyMessage);
		}
	}

	startup(): Promise<void> {
		try {
			return this.doStartup().then(undefined, error => this.logService.error(toErrorMessage(error, true)));
		} catch (error) {
			this.logService.error(toErrorMessage(error, true));

			throw error; // rethrow because this is a critical issue we cannot handle properly here
		}
	}

	private doStartup(): Promise<void> {
		this.workbenchStarted = true;

		// Logging
		this.logService.trace('workbench configuration', JSON.stringify(this.configuration));

		// ARIA
		setARIAContainer(document.body);

		// Warm up font cache information before building up too many dom elements
		restoreFontInfo(this.storageService);
		readFontInfo(BareFontInfo.createFromRawSettings(this.configurationService.getValue('editor'), getZoomLevel()));
		this._register(this.storageService.onWillSaveState(() => {
			saveFontInfo(this.storageService); // Keep font info for next startup around
		}));

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

		// Layout
		this.layout();

		// Driver
		if (this.environmentService.driverHandle) {
			registerWindowDriver(this.mainProcessClient, this.configuration.windowId, this.instantiationService).then(disposable => this._register(disposable));
		}

		// Handle case where workbench is not starting up properly
		const timeoutHandle = setTimeout(() => {
			this.logService.warn('Workbench did not finish loading in 10 seconds, that might be a problem that should be reported.');
		}, 10000);

		this.lifecycleService.when(LifecyclePhase.Restored).then(() => {
			clearTimeout(timeoutHandle);
		});

		// Restore Parts
		return this.restoreParts();
	}

	private createWorkbench(): void {
		this.workbench = document.createElement('div');
		this.workbench.id = Identifiers.WORKBENCH_CONTAINER;

		addClasses(this.workbench, 'monaco-workbench', isWindows ? 'windows' : isLinux ? 'linux' : 'mac');
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

		// Parts
		serviceCollection.set(IPartService, this);

		// Labels
		serviceCollection.set(ILabelService, new SyncDescriptor(LabelService, undefined, true));

		// Clipboard
		serviceCollection.set(IClipboardService, new SyncDescriptor(ClipboardService));

		// Broadcast
		serviceCollection.set(IBroadcastService, new SyncDescriptor(BroadcastService, [this.configuration.windowId]));

		// Notifications
		this.notificationService = new NotificationService();
		serviceCollection.set(INotificationService, this.notificationService);

		// Window
		this.windowService = this.instantiationService.createInstance(WindowService, this.configuration);
		serviceCollection.set(IWindowService, this.windowService);

		// Shared Process
		const sharedProcess = this.windowsService.whenSharedProcessReady()
			.then(() => connectNet(this.environmentService.sharedIPCHandle, `window:${this.configuration.windowId}`))
			.then(client => {
				client.registerChannel('dialog', this.instantiationService.createInstance(DialogChannel));

				return client;
			});

		// Telemetry
		if (!this.environmentService.isExtensionDevelopment && !this.environmentService.args['disable-telemetry'] && !!product.enableTelemetry) {
			const channel = getDelayedChannel(sharedProcess.then(c => c.getChannel('telemetryAppender')));
			const config: ITelemetryServiceConfig = {
				appender: combinedAppender(new TelemetryAppenderClient(channel), new LogAppender(this.logService)),
				commonProperties: resolveWorkbenchCommonProperties(this.storageService, product.commit, pkg.version, this.configuration.machineId, this.environmentService.installSourcePath),
				piiPaths: [this.environmentService.appRoot, this.environmentService.extensionsPath]
			};

			this.telemetryService = this._register(this.instantiationService.createInstance(TelemetryService, config));
			this._register(new ErrorTelemetry(this.telemetryService));
		} else {
			this.telemetryService = NullTelemetryService;
		}

		serviceCollection.set(ITelemetryService, this.telemetryService);
		this._register(configurationTelemetry(this.telemetryService, this.configurationService));

		// Dialogs
		serviceCollection.set(IDialogService, this.instantiationService.createInstance(DialogService));

		// Lifecycle
		this.lifecycleService = this.instantiationService.createInstance(LifecycleService);
		this.lifecycleService.phase = LifecyclePhase.Ready; // Set lifecycle phase to `Ready`

		serviceCollection.set(ILifecycleService, this.lifecycleService);

		this._register(this.lifecycleService.onWillShutdown(event => this._onWillShutdown.fire(event)));
		this._register(this.lifecycleService.onShutdown(() => {
			this._onShutdown.fire();
			this.dispose();
		}));

		// Request Service
		serviceCollection.set(IRequestService, new SyncDescriptor(RequestService, undefined, true));

		// Download Service
		serviceCollection.set(IDownloadService, new SyncDescriptor(DownloadService, undefined, true));

		// Extension Gallery
		serviceCollection.set(IExtensionGalleryService, new SyncDescriptor(ExtensionGalleryService, undefined, true));

		// Remote Resolver
		const remoteAuthorityResolverService = new RemoteAuthorityResolverService();
		serviceCollection.set(IRemoteAuthorityResolverService, remoteAuthorityResolverService);

		// Remote Agent
		const remoteAgentService = new RemoteAgentService(this.configuration, this.notificationService, this.environmentService, remoteAuthorityResolverService);
		serviceCollection.set(IRemoteAgentService, remoteAgentService);

		const remoteAgentConnection = remoteAgentService.getConnection();
		if (remoteAgentConnection) {
			remoteAgentConnection.registerChannel('dialog', this.instantiationService.createInstance(DialogChannel));
			remoteAgentConnection.registerChannel('download', new DownloadServiceChannel());
			remoteAgentConnection.registerChannel('loglevel', new LogLevelSetterChannel(this.logService));
		}

		// Extensions Management
		const extensionManagementChannel = getDelayedChannel(sharedProcess.then(c => c.getChannel('extensions')));
		const extensionManagementChannelClient = new ExtensionManagementChannelClient(extensionManagementChannel);
		serviceCollection.set(IExtensionManagementServerService, new SyncDescriptor(ExtensionManagementServerService, [extensionManagementChannelClient]));
		serviceCollection.set(IExtensionManagementService, new SyncDescriptor(MultiExtensionManagementService));

		// Extension Enablement
		const extensionEnablementService = this._register(this.instantiationService.createInstance(ExtensionEnablementService));
		serviceCollection.set(IExtensionEnablementService, extensionEnablementService);

		// Extensions
		serviceCollection.set(IExtensionService, this.instantiationService.createInstance(ExtensionService));

		// Theming
		this.themeService = this.instantiationService.createInstance(WorkbenchThemeService, document.body);
		serviceCollection.set(IWorkbenchThemeService, this.themeService);

		// Commands
		serviceCollection.set(ICommandService, new SyncDescriptor(CommandService, undefined, true));

		// Markers
		serviceCollection.set(IMarkerService, new SyncDescriptor(MarkerService, undefined, true));

		// Editor Mode
		serviceCollection.set(IModeService, new SyncDescriptor(WorkbenchModeServiceImpl));

		// Text Resource Config
		serviceCollection.set(ITextResourceConfigurationService, new SyncDescriptor(TextResourceConfigurationService));

		// Text Resource Properties
		serviceCollection.set(ITextResourcePropertiesService, new SyncDescriptor(TextResourcePropertiesService));

		// Editor Models
		serviceCollection.set(IModelService, new SyncDescriptor(ModelServiceImpl, undefined, true));

		// Marker Decorations
		serviceCollection.set(IMarkerDecorationsService, new SyncDescriptor(MarkerDecorationsService));

		// Editor Worker
		serviceCollection.set(IEditorWorkerService, new SyncDescriptor(EditorWorkerServiceImpl));

		// Untitled Editors
		serviceCollection.set(IUntitledEditorService, new SyncDescriptor(UntitledEditorService, undefined, true));

		// Text Mate
		serviceCollection.set(ITextMateService, new SyncDescriptor(TextMateService));

		// Search
		serviceCollection.set(ISearchService, new SyncDescriptor(SearchService));
		serviceCollection.set(ISearchHistoryService, new SyncDescriptor(SearchHistoryService));

		// Code Editor
		serviceCollection.set(ICodeEditorService, new SyncDescriptor(CodeEditorService));

		// Opener
		serviceCollection.set(IOpenerService, new SyncDescriptor(OpenerService, undefined, true));

		// Integrity
		serviceCollection.set(IIntegrityService, new SyncDescriptor(IntegrityServiceImpl));

		// Localization
		const localizationsChannel = getDelayedChannel(sharedProcess.then(c => c.getChannel('localizations')));
		serviceCollection.set(ILocalizationsService, new SyncDescriptor(LocalizationsChannelClient, [localizationsChannel]));

		// Hash
		serviceCollection.set(IHashService, new SyncDescriptor(HashService, undefined, true));

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

		this.configurationService.acquireInstantiationService(this.instantiationService);
	}

	//#region event handling

	private registerListeners(): void {

		// Storage
		this._register(this.storageService.onWillSaveState(e => this.saveState(e)));

		// Listen to visible editor changes
		this._register(this.editorService.onDidVisibleEditorsChange(() => this.onDidVisibleEditorsChange()));

		// Listen to editor group activations when editor is hidden
		this._register(this.editorPart.onDidActivateGroup(() => { if (this.editorHidden) { this.setEditorHidden(false); } }));

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
		this._register(onDidChangeFullscreen(() => this.onFullscreenChanged()));

		// Group changes
		this._register(this.editorGroupService.onDidAddGroup(() => this.centerEditorLayout(this.shouldCenterLayout)));
		this._register(this.editorGroupService.onDidRemoveGroup(() => this.centerEditorLayout(this.shouldCenterLayout)));

		// Layout
		this._register(addDisposableListener(window, EventType.RESIZE, e => this.onWindowResize(e, true)));

		// Prevent workbench from scrolling #55456
		this._register(addDisposableListener(this.workbench, EventType.SCROLL, () => {
			this.workbench.scrollTop = 0;
		}));
	}

	private onWindowResize(e: any, retry: boolean): void {
		if (e.target === window) {
			if (window.document && window.document.body && window.document.body.clientWidth === 0) {
				// TODO@Ben this is an electron issue on macOS when simple fullscreen is enabled
				// where for some reason the window clientWidth is reported as 0 when switching
				// between simple fullscreen and normal screen. In that case we schedule the layout
				// call at the next animation frame once, in the hope that the dimensions are
				// proper then.
				if (retry) {
					scheduleAtNextAnimationFrame(() => this.onWindowResize(e, false));
				}
				return;
			}

			this.layout();
		}
	}

	private onFullscreenChanged(): void {

		// Apply as CSS class
		if (isFullscreen()) {
			addClass(this.workbench, 'fullscreen');
		} else {
			removeClass(this.workbench, 'fullscreen');

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

			if (isFullscreen() && (this.menubarVisibility === 'toggle' || this.menubarVisibility === 'default')) {
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

		if (this.editorHidden) {
			this.setEditorHidden(false);
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
		this.setMenubarVisibility(newMenubarVisibility, !!skipLayout);
	}

	//#endregion

	private handleContextKeys(): void {
		this.inZenMode = InEditorZenModeContext.bindTo(this.contextKeyService);

		IsMacContext.bindTo(this.contextKeyService);
		IsLinuxContext.bindTo(this.contextKeyService);
		IsWindowsContext.bindTo(this.contextKeyService);
		const supportsOpenFileFolderContextKey = SupportsOpenFileFolderContext.bindTo(this.contextKeyService);
		const supportsWorkspacesContextKey = SupportsWorkspacesContext.bindTo(this.contextKeyService);
		if (this.windowService.getConfiguration().remoteAuthority) {
			supportsOpenFileFolderContextKey.set(true);
			supportsWorkspacesContextKey.set(false);
		}

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

			textCompareEditorActive.set(!!activeControl && activeControl.getId() === TEXT_DIFF_EDITOR_ID);
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
			return !!document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
		}

		function trackInputFocus(): void {
			const isInputFocused = activeElementIsInput();
			inputFocused.set(isInputFocused);

			if (isInputFocused) {
				const tracker = trackFocus(document.activeElement as HTMLElement);
				Event.once(tracker.onDidBlur)(() => {
					inputFocused.set(activeElementIsInput());

					tracker.dispose();
				});
			}
		}

		this._register(addDisposableListener(window, 'focusin', () => trackInputFocus(), true));

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

	private restoreParts(): Promise<void> {
		const restorePromises: Promise<any>[] = [];

		// Restore Editorpart
		mark('willRestoreEditors');
		restorePromises.push(this.editorPart.whenRestored.then(() => {

			function openEditors(editors: IResourceEditor[], editorService: IEditorService) {
				if (editors.length) {
					return editorService.openEditors(editors);
				}

				return Promise.resolve(undefined);
			}

			const editorsToOpen = this.resolveEditorsToOpen();

			if (Array.isArray(editorsToOpen)) {
				return openEditors(editorsToOpen, this.editorService);
			}

			return editorsToOpen.then(editors => openEditors(editors, this.editorService));
		}).then(() => mark('didRestoreEditors')));

		// Restore Sidebar
		let viewletIdToRestore: string | undefined;
		if (!this.sideBarHidden) {
			this.sideBarVisibleContext.set(true);

			if (this.shouldRestoreLastOpenedViewlet()) {
				viewletIdToRestore = this.storageService.get(SidebarPart.activeViewletSettingsKey, StorageScope.WORKSPACE);
			}

			if (!viewletIdToRestore) {
				viewletIdToRestore = this.sidebarPart.getDefaultViewletId();
			}

			mark('willRestoreViewlet');
			restorePromises.push(this.sidebarPart.openViewlet(viewletIdToRestore)
				.then(viewlet => viewlet || this.sidebarPart.openViewlet(this.sidebarPart.getDefaultViewletId()))
				.then(() => mark('didRestoreViewlet')));
		}

		// Restore Panel
		const panelRegistry = Registry.as<PanelRegistry>(PanelExtensions.Panels);
		const panelId = this.storageService.get(PanelPart.activePanelSettingsKey, StorageScope.WORKSPACE, panelRegistry.getDefaultPanelId());
		if (!this.panelHidden && !!panelId) {
			mark('willRestorePanel');
			const isPanelToRestoreEnabled = !!this.panelPart.getPanels().filter(p => p.id === panelId).length;
			const panelIdToRestore = isPanelToRestoreEnabled ? panelId : panelRegistry.getDefaultPanelId();
			this.panelPart.openPanel(panelIdToRestore, false);
			mark('didRestorePanel');
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

		const onRestored = (error?: Error): void => {
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
				onUnexpectedError(error);
			}

			this.logStartupTelemetry({
				customKeybindingsCount: this.keybindingService.customKeybindingsCount(),
				pinnedViewlets: this.activitybarPart.getPinnedViewletIds(),
				restoredViewlet: viewletIdToRestore,
				restoredEditorsCount: this.editorService.visibleEditors.length
			});
		};

		return Promise.all(restorePromises).then(() => onRestored(), error => onRestored(error));
	}

	private logStartupTelemetry(info: IWorkbenchStartedInfo): void {
		const { filesToOpen, filesToCreate, filesToDiff } = this.configuration;

		/* __GDPR__
			"workspaceLoad" : {
				"userAgent" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"windowSize.innerHeight": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"windowSize.innerWidth": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"windowSize.outerHeight": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"windowSize.outerWidth": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"emptyWorkbench": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"workbench.filesToOpen": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"workbench.filesToCreate": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"workbench.filesToDiff": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"customKeybindingsCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"theme": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"language": { "classification": "SystemMetaData", "purpose": "BusinessInsight" },
				"pinnedViewlets": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"restoredViewlet": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"restoredEditors": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
				"pinnedViewlets": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"startupKind": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
			}
		*/
		this.telemetryService.publicLog('workspaceLoad', {
			userAgent: navigator.userAgent,
			windowSize: { innerHeight: window.innerHeight, innerWidth: window.innerWidth, outerHeight: window.outerHeight, outerWidth: window.outerWidth },
			emptyWorkbench: this.contextService.getWorkbenchState() === WorkbenchState.EMPTY,
			'workbench.filesToOpen': filesToOpen && filesToOpen.length || 0,
			'workbench.filesToCreate': filesToCreate && filesToCreate.length || 0,
			'workbench.filesToDiff': filesToDiff && filesToDiff.length || 0,
			customKeybindingsCount: info.customKeybindingsCount,
			theme: this.themeService.getColorTheme().id,
			language,
			pinnedViewlets: info.pinnedViewlets,
			restoredViewlet: info.restoredViewlet,
			restoredEditors: info.restoredEditorsCount,
			startupKind: this.lifecycleService.startupKind
		});

		// Telemetry: startup metrics
		mark('didStartWorkbench');
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

		// Editor visiblity
		this.editorHidden = false;

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

	private saveLastPanelDimension(): void {
		if (!(this.workbenchGrid instanceof Grid)) {
			return;
		}

		if (this.panelPosition === Position.BOTTOM) {
			this.uiState.lastPanelHeight = this.workbenchGrid.getViewSize(this.panelPartView);
		} else {
			this.uiState.lastPanelWidth = this.workbenchGrid.getViewSize(this.panelPartView);
		}
	}

	private getLastPanelDimension(position: Position): number | undefined {
		return position === Position.BOTTOM ? this.uiState.lastPanelHeight : this.uiState.lastPanelWidth;
	}

	private setStatusBarHidden(hidden: boolean, skipLayout?: boolean): void {
		this.statusBarHidden = hidden;

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
		if (this.configurationService.getValue('workbench.useExperimentalGridLayout')) {

			// Create view wrappers for all parts
			this.titlebarPartView = new View(this.titlebarPart);
			this.sidebarPartView = new View(this.sidebarPart);
			this.activitybarPartView = new View(this.activitybarPart);
			this.editorPartView = new View(this.editorPart);
			this.panelPartView = new View(this.panelPart);
			this.statusbarPartView = new View(this.statusbarPart);

			this.workbenchGrid = new Grid(this.editorPartView, { proportionalLayout: false });

			this.workbench.prepend(this.workbenchGrid.element);
		} else {
			this.workbenchGrid = this.instantiationService.createInstance(
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
	}

	private renderWorkbench(): void {

		// Apply sidebar state as CSS class
		if (this.sideBarHidden) {
			addClass(this.workbench, 'nosidebar');
		}

		if (this.panelHidden) {
			addClass(this.workbench, 'nopanel');
		}

		if (this.statusBarHidden) {
			addClass(this.workbench, 'nostatusbar');
		}

		// Apply font aliasing
		this.setFontAliasing(this.fontAliasing);

		// Apply fullscreen state
		if (isFullscreen()) {
			addClass(this.workbench, 'fullscreen');
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
		classes.forEach(clazz => addClass(part, clazz));
		part.id = id;
		part.setAttribute('role', role);

		if (!this.configurationService.getValue('workbench.useExperimentalGridLayout')) {
			// Insert all workbench parts at the beginning. Issue #52531
			// This is primarily for the title bar to allow overriding -webkit-app-region
			this.workbench.insertBefore(part, this.workbench.lastChild);
		}

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

	private readonly _onTitleBarVisibilityChange: Emitter<void> = this._register(new Emitter<void>());
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
		return isAncestor(activeElement, container);
	}

	getContainer(part: Parts): HTMLElement | null {
		switch (part) {
			case Parts.TITLEBAR_PART:
				return this.titlebarPart.getContainer();
			case Parts.ACTIVITYBAR_PART:
				return this.activitybarPart.getContainer();
			case Parts.SIDEBAR_PART:
				return this.sidebarPart.getContainer();
			case Parts.PANEL_PART:
				return this.panelPart.getContainer();
			case Parts.EDITOR_PART:
				return this.editorPart.getContainer();
			case Parts.STATUSBAR_PART:
				return this.statusbarPart.getContainer();
		}

		return null;
	}

	isVisible(part: Parts): boolean {
		switch (part) {
			case Parts.TITLEBAR_PART:
				if (!this.useCustomTitleBarStyle()) {
					return false;
				} else if (!isFullscreen()) {
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
			case Parts.EDITOR_PART:
				return this.workbenchGrid instanceof Grid ? !this.editorHidden : true;
		}

		return true; // any other part cannot be hidden
	}

	getTitleBarOffset(): number {
		let offset = 0;
		if (this.isVisible(Parts.TITLEBAR_PART)) {
			if (this.workbenchGrid instanceof Grid) {
				offset = this.titlebarPart.maximumHeight;
			} else {
				offset = this.workbenchGrid.partLayoutInfo.titlebar.height;

				if (isMacintosh || this.menubarVisibility === 'hidden') {
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

			toggleFullScreen = !isFullscreen() && config.fullScreen;
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

			toggleFullScreen = this.zenMode.transitionedToFullScreen && isFullscreen();
		}

		this.inZenMode.set(this.zenMode.active);

		if (!skipLayout) {
			this.layout();
		}

		if (toggleFullScreen) {
			this.windowService.toggleFullScreen();
		}
	}

	private updateGrid(): void {
		if (!(this.workbenchGrid instanceof Grid)) {
			return;
		}

		let panelInGrid = this.workbenchGrid.hasView(this.panelPartView);
		let sidebarInGrid = this.workbenchGrid.hasView(this.sidebarPartView);
		let activityBarInGrid = this.workbenchGrid.hasView(this.activitybarPartView);
		let statusBarInGrid = this.workbenchGrid.hasView(this.statusbarPartView);
		let titlebarInGrid = this.workbenchGrid.hasView(this.titlebarPartView);

		// Add parts to grid
		if (!statusBarInGrid) {
			this.workbenchGrid.addView(this.statusbarPartView, Sizing.Split, this.editorPartView, Direction.Down);
			statusBarInGrid = true;
		}

		if (!titlebarInGrid && this.useCustomTitleBarStyle()) {
			this.workbenchGrid.addView(this.titlebarPartView, Sizing.Split, this.editorPartView, Direction.Up);
			titlebarInGrid = true;
		}

		if (!activityBarInGrid) {
			this.workbenchGrid.addView(this.activitybarPartView, Sizing.Split, panelInGrid && this.sideBarPosition === this.panelPosition ? this.panelPartView : this.editorPartView, this.sideBarPosition === Position.RIGHT ? Direction.Right : Direction.Left);
			activityBarInGrid = true;
		}

		if (!sidebarInGrid) {
			this.workbenchGrid.addView(this.sidebarPartView, this.uiState.lastSidebarDimension !== undefined ? this.uiState.lastSidebarDimension : Sizing.Split, this.activitybarPartView, this.sideBarPosition === Position.LEFT ? Direction.Right : Direction.Left);
			sidebarInGrid = true;
		}

		if (!panelInGrid) {
			this.workbenchGrid.addView(this.panelPartView, this.getLastPanelDimension(this.panelPosition) !== undefined ? this.getLastPanelDimension(this.panelPosition) : Sizing.Split, this.editorPartView, this.panelPosition === Position.BOTTOM ? Direction.Down : Direction.Right);
			panelInGrid = true;
		}

		// Hide parts
		if (this.panelHidden) {
			this.panelPartView.hide();
		}

		if (this.statusBarHidden) {
			this.statusbarPartView.hide();
		}

		if (!this.isVisible(Parts.TITLEBAR_PART)) {
			this.titlebarPartView.hide();
		}

		if (this.activityBarHidden) {
			this.activitybarPartView.hide();
		}

		if (this.sideBarHidden) {
			this.sidebarPartView.hide();
		}

		if (this.editorHidden) {
			this.editorPartView.hide();
		}

		// Show visible parts
		if (!this.editorHidden) {
			this.editorPartView.show();
		}

		if (!this.statusBarHidden) {
			this.statusbarPartView.show();
		}

		if (this.isVisible(Parts.TITLEBAR_PART)) {
			this.titlebarPartView.show();
		}

		if (!this.activityBarHidden) {
			this.activitybarPartView.show();
		}

		if (!this.sideBarHidden) {
			this.sidebarPartView.show();
		}

		if (!this.panelHidden) {
			this.panelPartView.show();
		}
	}

	private layout(options?: ILayoutOptions): void {
		this.contextViewService.layout();

		if (this.workbenchStarted && !this.workbenchShutdown) {
			if (this.workbenchGrid instanceof Grid) {
				const dimensions = getClientArea(this.container);
				position(this.workbench, 0, 0, 0, 0, 'relative');
				size(this.workbench, dimensions.width, dimensions.height);

				// Layout the grid
				this.workbenchGrid.layout(dimensions.width, dimensions.height);

				// Layout non-view ui components
				this.quickInput.layout(dimensions);
				this.quickOpen.layout(dimensions);
				this.notificationsCenter.layout(dimensions);
				this.notificationsToasts.layout(dimensions);

				// Update grid view membership
				this.updateGrid();
			} else {
				this.workbenchGrid.layout(options);
			}
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
		let view: View;
		switch (part) {
			case Parts.SIDEBAR_PART:
				view = this.sidebarPartView;
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
		this.activityBarHidden = hidden;

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
		if (!(this.workbenchGrid instanceof Grid)) {
			return;
		}

		this.editorHidden = hidden;

		// The editor and the panel cannot be hidden at the same time
		if (this.editorHidden && this.panelHidden) {
			this.setPanelHidden(false, true);
		}

		if (!skipLayout) {
			this.layout();
		}
	}

	setSideBarHidden(hidden: boolean, skipLayout?: boolean): void {
		this.sideBarHidden = hidden;
		this.sideBarVisibleContext.set(!hidden);

		// Adjust CSS
		if (hidden) {
			addClass(this.workbench, 'nosidebar');
		} else {
			removeClass(this.workbench, 'nosidebar');
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
			if (this.workbenchGrid instanceof Grid) {
				this.layout();
			} else {
				this.workbenchGrid.layout();
			}
		}
	}

	setPanelHidden(hidden: boolean, skipLayout?: boolean): void {
		this.panelHidden = hidden;

		// Adjust CSS
		if (hidden) {
			addClass(this.workbench, 'nopanel');
		} else {
			removeClass(this.workbench, 'nopanel');
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

		// The editor and panel cannot be hiddne at the same time
		if (hidden && this.editorHidden) {
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
				return this.workbenchGrid.getViewSize2(this.panelPartView).height === this.panelPart.maximumHeight;
			} catch (e) {
				return false;
			}
		} else {
			return this.workbenchGrid.isPanelMaximized();
		}
	}

	getSideBarPosition(): Position {
		return this.sideBarPosition;
	}

	setSideBarPosition(position: Position): void {
		const wasHidden = this.sideBarHidden;

		if (this.sideBarHidden) {
			this.setSideBarHidden(false, true /* Skip Layout */);
		}

		const newPositionValue = (position === Position.LEFT) ? 'left' : 'right';
		const oldPositionValue = (this.sideBarPosition === Position.LEFT) ? 'left' : 'right';
		this.sideBarPosition = position;

		// Adjust CSS
		removeClass(this.activitybarPart.getContainer(), oldPositionValue);
		removeClass(this.sidebarPart.getContainer(), oldPositionValue);
		addClass(this.activitybarPart.getContainer(), newPositionValue);
		addClass(this.sidebarPart.getContainer(), newPositionValue);

		// Update Styles
		this.activitybarPart.updateStyles();
		this.sidebarPart.updateStyles();

		// Layout
		if (this.workbenchGrid instanceof Grid) {

			if (!wasHidden) {
				this.uiState.lastSidebarDimension = this.workbenchGrid.getViewSize(this.sidebarPartView);
			}

			this.workbenchGrid.removeView(this.sidebarPartView);
			this.workbenchGrid.removeView(this.activitybarPartView);

			if (!this.panelHidden && this.panelPosition === Position.BOTTOM) {
				this.workbenchGrid.removeView(this.panelPartView);
			}

			this.layout();
		} else {
			this.workbenchGrid.layout();
		}
	}

	setMenubarVisibility(visibility: MenuBarVisibility, skipLayout: boolean): void {
		if (this.menubarVisibility !== visibility) {
			this.menubarVisibility = visibility;

			// Layout
			if (!skipLayout) {
				if (this.workbenchGrid instanceof Grid) {
					const dimensions = getClientArea(this.container);
					this.workbenchGrid.layout(dimensions.width, dimensions.height);
				} else {
					this.workbenchGrid.layout();
				}
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
		const wasHidden = this.panelHidden;

		if (this.panelHidden) {
			this.setPanelHidden(false, true /* Skip Layout */);
		} else {
			this.saveLastPanelDimension();
		}

		const newPositionValue = (position === Position.BOTTOM) ? 'bottom' : 'right';
		const oldPositionValue = (this.panelPosition === Position.BOTTOM) ? 'bottom' : 'right';
		this.panelPosition = position;
		this.storageService.store(Workbench.panelPositionStorageKey, PositionToString(this.panelPosition).toLowerCase(), StorageScope.WORKSPACE);

		// Adjust CSS
		removeClass(this.panelPart.getContainer(), oldPositionValue);
		addClass(this.panelPart.getContainer(), newPositionValue);

		// Update Styles
		this.panelPart.updateStyles();

		// Layout
		if (this.workbenchGrid instanceof Grid) {
			if (!wasHidden) {
				this.saveLastPanelDimension();
			}

			this.workbenchGrid.removeView(this.panelPartView);
			this.layout();
		} else {
			this.workbenchGrid.layout();
		}
	}

	//#endregion
}
