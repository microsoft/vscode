/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/workbench';

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import * as DOM from 'vs/base/browser/dom';
import { Builder, $ } from 'vs/base/browser/builder';
import { Delayer, RunOnceScheduler } from 'vs/base/common/async';
import * as browser from 'vs/base/browser/browser';
import * as perf from 'vs/base/common/performance';
import * as errors from 'vs/base/common/errors';
import { BackupFileService } from 'vs/workbench/services/backup/node/backupFileService';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { Registry } from 'vs/platform/registry/common/platform';
import { isWindows, isLinux, isMacintosh } from 'vs/base/common/platform';
import { Position as EditorPosition, IResourceDiffInput, IUntitledResourceInput, IEditor, IResourceInput } from 'vs/platform/editor/common/editor';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IEditorInputFactoryRegistry, Extensions as EditorExtensions } from 'vs/workbench/common/editor';
import { HistoryService } from 'vs/workbench/services/history/electron-browser/history';
import { ActivitybarPart } from 'vs/workbench/browser/parts/activitybar/activitybarPart';
import { EditorPart } from 'vs/workbench/browser/parts/editor/editorPart';
import { SidebarPart } from 'vs/workbench/browser/parts/sidebar/sidebarPart';
import { PanelPart } from 'vs/workbench/browser/parts/panel/panelPart';
import { StatusbarPart } from 'vs/workbench/browser/parts/statusbar/statusbarPart';
import { TitlebarPart } from 'vs/workbench/browser/parts/titlebar/titlebarPart';
import { WorkbenchLayout } from 'vs/workbench/browser/layout';
import { IActionBarRegistry, Extensions as ActionBarExtensions } from 'vs/workbench/browser/actions';
import { PanelRegistry, Extensions as PanelExtensions } from 'vs/workbench/browser/panel';
import { QuickOpenController } from 'vs/workbench/browser/parts/quickopen/quickOpenController';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { QuickInputService } from 'vs/workbench/browser/parts/quickinput/quickInput';
import { getServices } from 'vs/platform/instantiation/common/extensions';
import { Position, Parts, IPartService, ILayoutOptions, IDimension } from 'vs/workbench/services/part/common/partService';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ContextMenuService } from 'vs/workbench/services/contextview/electron-browser/contextmenuService';
import { WorkbenchKeybindingService } from 'vs/workbench/services/keybinding/electron-browser/keybindingService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { WorkspaceService, DefaultConfigurationExportHelper } from 'vs/workbench/services/configuration/node/configurationService';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { JSONEditingService } from 'vs/workbench/services/configuration/node/jsonEditingService';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IKeybindingEditingService, KeybindingsEditingService } from 'vs/workbench/services/keybinding/common/keybindingEditing';
import { ContextKeyExpr, RawContextKey, IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IActivityService } from 'vs/workbench/services/activity/common/activity';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { ViewletService } from 'vs/workbench/services/viewlet/browser/viewletService';
import { RemoteFileService } from 'vs/workbench/services/files/electron-browser/remoteFileService';
import { IFileService } from 'vs/platform/files/common/files';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { ConfigurationResolverService } from 'vs/workbench/services/configurationResolver/electron-browser/configurationResolverService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { ITitleService } from 'vs/workbench/services/title/common/titleService';
import { IWorkbenchEditorService, IResourceInputType, WorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ClipboardService } from 'vs/platform/clipboard/electron-browser/clipboardService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
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
import { ShutdownReason } from 'vs/platform/lifecycle/common/lifecycle';
import { LifecycleService } from 'vs/platform/lifecycle/electron-browser/lifecycleService';
import { IWindowService, IWindowConfiguration as IWindowSettings, IWindowConfiguration, IPath } from 'vs/platform/windows/common/windows';
import { IStatusbarService } from 'vs/platform/statusbar/common/statusbar';
import { IMenuService, SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { MenuService } from 'vs/workbench/services/actions/common/menuService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { OpenRecentAction, ToggleDevToolsAction, ReloadWindowAction, ShowPreviousWindowTab, MoveWindowTabToNewWindow, MergeAllWindowTabs, ShowNextWindowTab, ToggleWindowTabsBar, ReloadWindowWithExtensionsDisabledAction } from 'vs/workbench/electron-browser/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { WorkspaceEditingService } from 'vs/workbench/services/workspace/node/workspaceEditingService';
import { FileDecorationsService } from 'vs/workbench/services/decorations/browser/decorationsService';
import { IDecorationsService } from 'vs/workbench/services/decorations/browser/decorations';
import { ActivityService } from 'vs/workbench/services/activity/browser/activityService';
import URI from 'vs/base/common/uri';
import { IListService, ListService } from 'vs/platform/list/browser/listService';
import { domEvent } from 'vs/base/browser/event';
import { InputFocusedContext } from 'vs/platform/workbench/common/contextkeys';
import { ICustomViewsService } from 'vs/workbench/common/views';
import { CustomViewsService } from 'vs/workbench/browser/parts/views/customView';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { NotificationService } from 'vs/workbench/services/notification/common/notificationService';
import { NotificationsCenter } from 'vs/workbench/browser/parts/notifications/notificationsCenter';
import { NotificationsAlerts } from 'vs/workbench/browser/parts/notifications/notificationsAlerts';
import { NotificationsStatus } from 'vs/workbench/browser/parts/notifications/notificationsStatus';
import { registerNotificationCommands } from 'vs/workbench/browser/parts/notifications/notificationsCommands';
import { NotificationsToasts } from 'vs/workbench/browser/parts/notifications/notificationsToasts';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { PreferencesService } from 'vs/workbench/services/preferences/browser/preferencesService';

export const EditorsVisibleContext = new RawContextKey<boolean>('editorIsOpen', false);
export const InZenModeContext = new RawContextKey<boolean>('inZenMode', false);
export const SidebarVisibleContext = new RawContextKey<boolean>('sidebarVisible', false);
export const NoEditorsVisibleContext: ContextKeyExpr = EditorsVisibleContext.toNegated();

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
	restore: boolean;
}

export interface IWorkbenchStartedInfo {
	customKeybindingsCount: number;
	pinnedViewlets: string[];
	restoredViewlet: string;
	restoredEditors: string[];
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

/**
 * The workbench creates and lays out all parts that make up the workbench.
 */
export class Workbench implements IPartService {

	private static readonly sidebarHiddenStorageKey = 'workbench.sidebar.hidden';
	private static readonly sidebarRestoreStorageKey = 'workbench.sidebar.restore';
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

	private readonly _onTitleBarVisibilityChange: Emitter<void>;

	public _serviceBrand: any;

	private parent: HTMLElement;
	private container: HTMLElement;
	private workbenchParams: WorkbenchParams;
	private workbenchContainer: Builder;
	private workbench: Builder;
	private workbenchStarted: boolean;
	private workbenchCreated: boolean;
	private workbenchShutdown: boolean;
	private editorService: WorkbenchEditorService;
	private viewletService: IViewletService;
	private contextKeyService: IContextKeyService;
	private keybindingService: IKeybindingService;
	private backupFileService: IBackupFileService;
	private fileService: IFileService;
	private titlebarPart: TitlebarPart;
	private activitybarPart: ActivitybarPart;
	private sidebarPart: SidebarPart;
	private panelPart: PanelPart;
	private editorPart: EditorPart;
	private statusbarPart: StatusbarPart;
	private quickOpen: QuickOpenController;
	private quickInput: QuickInputService;
	private notificationsCenter: NotificationsCenter;
	private notificationsToasts: NotificationsToasts;
	private workbenchLayout: WorkbenchLayout;
	private toUnbind: IDisposable[];
	private sideBarHidden: boolean;
	private statusBarHidden: boolean;
	private activityBarHidden: boolean;
	private sideBarPosition: Position;
	private panelPosition: Position;
	private panelHidden: boolean;
	private editorBackgroundDelayer: Delayer<any>;
	private closeEmptyWindowScheduler: RunOnceScheduler;
	private editorsVisibleContext: IContextKey<boolean>;
	private inZenMode: IContextKey<boolean>;
	private sideBarVisibleContext: IContextKey<boolean>;
	private hasFilesToCreateOpenOrDiff: boolean;
	private fontAliasing: FontAliasingOption;
	private centeredEditorLayoutActive: boolean;
	private zenMode: {
		active: boolean;
		transitionedToFullScreen: boolean;
		transitionedToCenteredEditorLayout: boolean;
		wasSideBarVisible: boolean;
		wasPanelVisible: boolean;
	};

	constructor(
		parent: HTMLElement,
		container: HTMLElement,
		configuration: IWindowConfiguration,
		serviceCollection: ServiceCollection,
		private lifecycleService: LifecycleService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IStorageService private storageService: IStorageService,
		@IConfigurationService private configurationService: WorkspaceService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IWindowService private windowService: IWindowService,
		@INotificationService private notificationService: NotificationService
	) {
		this.parent = parent;
		this.container = container;

		this.workbenchParams = {
			configuration,
			serviceCollection
		};

		this.hasFilesToCreateOpenOrDiff =
			(configuration.filesToCreate && configuration.filesToCreate.length > 0) ||
			(configuration.filesToOpen && configuration.filesToOpen.length > 0) ||
			(configuration.filesToDiff && configuration.filesToDiff.length > 0);

		this.toUnbind = [];

		this.editorBackgroundDelayer = new Delayer<void>(50);
		this.closeEmptyWindowScheduler = new RunOnceScheduler(() => this.onAllEditorsClosed(), 50);

		this._onTitleBarVisibilityChange = new Emitter<void>();
	}

	public get onTitleBarVisibilityChange(): Event<void> {
		return this._onTitleBarVisibilityChange.event;
	}

	public get onEditorLayout(): Event<IDimension> {
		return this.editorPart.onLayout;
	}

	/**
	 * Starts the workbench and creates the HTML elements on the container. A workbench can only be started
	 * once. Use the shutdown function to free up resources created by the workbench on startup.
	 */
	public startup(): TPromise<IWorkbenchStartedInfo> {
		this.workbenchStarted = true;

		// Create Workbench Container
		this.createWorkbench();

		// Install some global actions
		this.createGlobalActions();

		// Services
		this.initServices();

		// Contexts
		this.editorsVisibleContext = EditorsVisibleContext.bindTo(this.contextKeyService);
		this.inZenMode = InZenModeContext.bindTo(this.contextKeyService);
		this.sideBarVisibleContext = SidebarVisibleContext.bindTo(this.contextKeyService);

		const inputFocused = InputFocusedContext.bindTo(this.contextKeyService);
		const onWindowsFocusIn = domEvent(window, 'focusin', true);
		onWindowsFocusIn(() => inputFocused.set(document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')), null, this.toUnbind);

		// Set workbench state context
		const WorkbenchStateContext = new RawContextKey<string>('workbenchState', getWorkbenchStateString(this.configurationService.getWorkbenchState()));
		const workbenchStateContext = WorkbenchStateContext.bindTo(this.contextKeyService);

		const WorkspaceFolderCountContext = new RawContextKey<number>('workspaceFolderCount', this.configurationService.getWorkspace().folders.length);
		const workspaceFolderCountContext = WorkspaceFolderCountContext.bindTo(this.contextKeyService);

		this.toUnbind.push(this.configurationService.onDidChangeWorkbenchState(() => workbenchStateContext.set(getWorkbenchStateString(this.configurationService.getWorkbenchState()))));
		this.toUnbind.push(this.configurationService.onDidChangeWorkspaceFolders(() => workspaceFolderCountContext.set(this.configurationService.getWorkspace().folders.length)));

		// Register Listeners
		this.registerListeners();

		// Settings
		this.initSettings();

		// Create Workbench and Parts
		this.renderWorkbench();

		// Workbench Layout
		this.createWorkbenchLayout();

		// Restore Parts
		return this.restoreParts();
	}

	private createWorkbench(): void {
		this.workbenchContainer = $('.monaco-workbench-container');
		this.workbench = $().div({
			'class': `monaco-workbench ${isWindows ? 'windows' : isLinux ? 'linux' : 'mac'}`,
			id: Identifiers.WORKBENCH_CONTAINER
		}).appendTo(this.workbenchContainer);
	}

	private restoreParts(): TPromise<IWorkbenchStartedInfo> {
		const restorePromises: TPromise<any>[] = [];

		// Restore Editors
		perf.mark('willRestoreEditors');
		const restoredEditors: string[] = [];
		restorePromises.push(this.resolveEditorsToOpen().then(inputs => {
			let editorOpenPromise: TPromise<IEditor[]>;
			if (inputs.length) {
				editorOpenPromise = this.editorService.openEditors(inputs.map(input => { return { input, position: EditorPosition.ONE }; }));
			} else {
				editorOpenPromise = this.editorPart.restoreEditors();
			}

			return editorOpenPromise.then(editors => {
				this.handleEditorBackground(); // make sure we show the proper background in the editor area

				perf.mark('didRestoreEditors');

				for (const editor of editors) {
					if (editor) {
						if (editor.input) {
							restoredEditors.push(editor.input.getName());
						} else {
							restoredEditors.push(`other:${editor.getId()}`);
						}
					}
				}
			});
		}));

		// Restore Sidebar
		let viewletIdToRestore: string;
		if (!this.sideBarHidden) {
			this.sideBarVisibleContext.set(true);

			if (this.shouldRestoreLastOpenedViewlet()) {
				viewletIdToRestore = this.storageService.get(SidebarPart.activeViewletSettingsKey, StorageScope.WORKSPACE);
			}

			if (!viewletIdToRestore) {
				viewletIdToRestore = this.viewletService.getDefaultViewletId();
			}

			perf.mark('willRestoreViewlet');
			restorePromises.push(this.viewletService.openViewlet(viewletIdToRestore).then(() => {
				perf.mark('didRestoreViewlet');
			}));
		}

		// Restore Panel
		const panelRegistry = Registry.as<PanelRegistry>(PanelExtensions.Panels);
		const panelId = this.storageService.get(PanelPart.activePanelSettingsKey, StorageScope.WORKSPACE, panelRegistry.getDefaultPanelId());
		if (!this.panelHidden && !!panelId) {
			restorePromises.push(this.panelPart.openPanel(panelId, false));
		}

		// Restore Zen Mode if active
		if (this.storageService.getBoolean(Workbench.zenModeActiveStorageKey, StorageScope.WORKSPACE, false)) {
			this.toggleZenMode(true);
		}

		// Restore Forced Editor Center Mode
		if (this.storageService.getBoolean(Workbench.centeredEditorLayoutActiveStorageKey, StorageScope.GLOBAL, false)) {
			this.centeredEditorLayoutActive = true;
		}

		const onRestored = (error?: Error): IWorkbenchStartedInfo => {
			this.workbenchCreated = true;

			if (error) {
				errors.onUnexpectedError(error);
			}

			return {
				customKeybindingsCount: this.keybindingService.customKeybindingsCount(),
				pinnedViewlets: this.activitybarPart.getPinned(),
				restoredViewlet: viewletIdToRestore,
				restoredEditors
			};
		};

		return TPromise.join(restorePromises).then(() => onRestored(), error => onRestored(error));
	}

	private createGlobalActions(): void {
		const isDeveloping = !this.environmentService.isBuilt || this.environmentService.isExtensionDevelopment;

		// Actions registered here to adjust for developing vs built workbench
		const workbenchActionsRegistry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
		workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ReloadWindowAction, ReloadWindowAction.ID, ReloadWindowAction.LABEL, isDeveloping ? { primary: KeyMod.CtrlCmd | KeyCode.KEY_R } : void 0), 'Reload Window');
		workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleDevToolsAction, ToggleDevToolsAction.ID, ToggleDevToolsAction.LABEL, isDeveloping ? { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_I, mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_I } } : void 0), 'Developer: Toggle Developer Tools', localize('developer', "Developer"));
		workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenRecentAction, OpenRecentAction.ID, OpenRecentAction.LABEL, { primary: isDeveloping ? null : KeyMod.CtrlCmd | KeyCode.KEY_R, mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_R } }), 'File: Open Recent...', localize('file', "File"));
		workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ReloadWindowWithExtensionsDisabledAction, ReloadWindowWithExtensionsDisabledAction.ID, ReloadWindowWithExtensionsDisabledAction.LABEL), 'Reload Window Without Extensions');

		// Actions for macOS native tabs management (only when enabled)
		const windowConfig = this.configurationService.getValue<IWindowConfiguration>();
		if (windowConfig && windowConfig.window && windowConfig.window.nativeTabs) {
			workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ShowPreviousWindowTab, ShowPreviousWindowTab.ID, ShowPreviousWindowTab.LABEL), 'Show Previous Window Tab');
			workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ShowNextWindowTab, ShowNextWindowTab.ID, ShowNextWindowTab.LABEL), 'Show Next Window Tab');
			workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(MoveWindowTabToNewWindow, MoveWindowTabToNewWindow.ID, MoveWindowTabToNewWindow.LABEL), 'Move Window Tab to New Window');
			workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(MergeAllWindowTabs, MergeAllWindowTabs.ID, MergeAllWindowTabs.LABEL), 'Merge All Windows');
			workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleWindowTabsBar, ToggleWindowTabsBar.ID, ToggleWindowTabsBar.LABEL), 'Toggle Window Tabs Bar');
		}
	}

	private resolveEditorsToOpen(): TPromise<IResourceInputType[]> {
		const config = this.workbenchParams.configuration;

		// Files to open, diff or create
		if (this.hasFilesToCreateOpenOrDiff) {

			// Files to diff is exclusive
			const filesToDiff = this.toInputs(config.filesToDiff, false);
			if (filesToDiff && filesToDiff.length === 2) {
				return TPromise.as([<IResourceDiffInput>{
					leftResource: filesToDiff[0].resource,
					rightResource: filesToDiff[1].resource,
					options: { pinned: true }
				}]);
			}

			const filesToCreate = this.toInputs(config.filesToCreate, true);
			const filesToOpen = this.toInputs(config.filesToOpen, false);

			// Otherwise: Open/Create files
			return TPromise.as([...filesToOpen, ...filesToCreate]);
		}

		// Empty workbench
		else if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY && this.openUntitledFile()) {
			if (this.editorPart.hasEditorsToRestore()) {
				return TPromise.as([]); // do not open any empty untitled file if we have editors to restore
			}

			return this.backupFileService.hasBackups().then(hasBackups => {
				if (hasBackups) {
					return TPromise.as([]); // do not open any empty untitled file if we have backups to restore
				}

				return TPromise.as([<IUntitledResourceInput>{}]);
			});
		}

		return TPromise.as([]);
	}

	private toInputs(paths: IPath[], isNew: boolean): (IResourceInput | IUntitledResourceInput)[] {
		if (!paths || !paths.length) {
			return [];
		}

		return paths.map(p => {
			const resource = URI.file(p.filePath);
			let input: IResourceInput | IUntitledResourceInput;
			if (isNew) {
				input = { filePath: resource.fsPath, options: { pinned: true } } as IUntitledResourceInput;
			} else {
				input = { resource, options: { pinned: true } } as IResourceInput;
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

	private initServices(): void {
		const { serviceCollection } = this.workbenchParams;

		// Services we contribute
		serviceCollection.set(IPartService, this);

		// Clipboard
		serviceCollection.set(IClipboardService, new ClipboardService());

		// Status bar
		this.statusbarPart = this.instantiationService.createInstance(StatusbarPart, Identifiers.STATUSBAR_PART);
		this.toUnbind.push({ dispose: () => this.statusbarPart.shutdown() });
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

		// Context Menu
		serviceCollection.set(IContextMenuService, new SyncDescriptor(ContextMenuService));

		// Menus/Actions
		serviceCollection.set(IMenuService, new SyncDescriptor(MenuService));

		// Sidebar part
		this.sidebarPart = this.instantiationService.createInstance(SidebarPart, Identifiers.SIDEBAR_PART);
		this.toUnbind.push({ dispose: () => this.sidebarPart.shutdown() });

		// Viewlet service
		this.viewletService = this.instantiationService.createInstance(ViewletService, this.sidebarPart);
		serviceCollection.set(IViewletService, this.viewletService);

		// Panel service (panel part)
		this.panelPart = this.instantiationService.createInstance(PanelPart, Identifiers.PANEL_PART);
		this.toUnbind.push({ dispose: () => this.panelPart.shutdown() });
		serviceCollection.set(IPanelService, this.panelPart);

		// Custom views service
		const customViewsService = this.instantiationService.createInstance(CustomViewsService);
		serviceCollection.set(ICustomViewsService, customViewsService);

		// Activity service (activitybar part)
		this.activitybarPart = this.instantiationService.createInstance(ActivitybarPart, Identifiers.ACTIVITYBAR_PART);
		this.toUnbind.push({ dispose: () => this.activitybarPart.shutdown() });
		const activityService = this.instantiationService.createInstance(ActivityService, this.activitybarPart, this.panelPart);
		serviceCollection.set(IActivityService, activityService);

		// File Service
		this.fileService = this.instantiationService.createInstance(RemoteFileService);
		serviceCollection.set(IFileService, this.fileService);
		this.toUnbind.push(this.fileService.onFileChanges(e => this.configurationService.handleWorkspaceFileEvents(e)));

		// Editor service (editor part)
		this.editorPart = this.instantiationService.createInstance(EditorPart, Identifiers.EDITOR_PART, !this.hasFilesToCreateOpenOrDiff);
		this.toUnbind.push({ dispose: () => this.editorPart.shutdown() });
		this.editorService = this.instantiationService.createInstance(WorkbenchEditorService, this.editorPart);
		serviceCollection.set(IWorkbenchEditorService, this.editorService);
		serviceCollection.set(IEditorGroupService, this.editorPart);

		// Title bar
		this.titlebarPart = this.instantiationService.createInstance(TitlebarPart, Identifiers.TITLEBAR_PART);
		this.toUnbind.push({ dispose: () => this.titlebarPart.shutdown() });
		serviceCollection.set(ITitleService, this.titlebarPart);

		// History
		serviceCollection.set(IHistoryService, new SyncDescriptor(HistoryService));

		// Backup File Service
		this.backupFileService = this.instantiationService.createInstance(BackupFileService, this.workbenchParams.configuration.backupPath);
		serviceCollection.set(IBackupFileService, this.backupFileService);

		// Text File Service
		serviceCollection.set(ITextFileService, new SyncDescriptor(TextFileService));

		// File Decorations
		serviceCollection.set(IDecorationsService, new SyncDescriptor(FileDecorationsService));

		// SCM Service
		serviceCollection.set(ISCMService, new SyncDescriptor(SCMService));

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
		serviceCollection.set(IConfigurationResolverService, new SyncDescriptor(ConfigurationResolverService, process.env));

		// Quick open service (quick open controller)
		this.quickOpen = this.instantiationService.createInstance(QuickOpenController);
		this.toUnbind.push({ dispose: () => this.quickOpen.shutdown() });
		serviceCollection.set(IQuickOpenService, this.quickOpen);

		// Quick input service
		this.quickInput = this.instantiationService.createInstance(QuickInputService);
		this.toUnbind.push({ dispose: () => this.quickInput.shutdown() });
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

		this.configurationService.setInstantiationService(this.getInstantiationService());
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
			wasPanelVisible: false
		};

		// Centered Editor Layout
		this.centeredEditorLayoutActive = false;
	}

	private setPanelPositionFromStorageOrConfig() {
		const defaultPanelPosition = this.configurationService.getValue<string>(Workbench.defaultPanelPositionStorageKey);
		const panelPosition = this.storageService.get(Workbench.panelPositionStorageKey, StorageScope.WORKSPACE, defaultPanelPosition);
		this.panelPosition = (panelPosition === 'right') ? Position.RIGHT : Position.BOTTOM;
	}

	/**
	 * Returns whether the workbench has been started.
	 */
	public isStarted(): boolean {
		return this.workbenchStarted && !this.workbenchShutdown;
	}

	/**
	 * Returns whether the workbench has been fully created.
	 */
	public isCreated(): boolean {
		return this.workbenchCreated && this.workbenchStarted;
	}

	public hasFocus(part: Parts): boolean {
		const activeElement = document.activeElement;
		if (!activeElement) {
			return false;
		}

		const container = this.getContainer(part);
		return DOM.isAncestor(activeElement, container);
	}

	public getContainer(part: Parts): HTMLElement {
		let container: HTMLElement = null;
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

	public isVisible(part: Parts): boolean {
		switch (part) {
			case Parts.TITLEBAR_PART:
				return this.getCustomTitleBarStyle() && !browser.isFullscreen();
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

	public getTitleBarOffset(): number {
		let offset = 0;
		if (this.isVisible(Parts.TITLEBAR_PART)) {
			offset = 22 / browser.getZoomFactor(); // adjust the position based on title bar size and zoom factor
		}

		return offset;
	}

	private getCustomTitleBarStyle(): 'custom' {
		if (!isMacintosh) {
			return null; // custom title bar is only supported on Mac currently
		}

		const isDev = !this.environmentService.isBuilt || this.environmentService.isExtensionDevelopment;
		if (isDev) {
			return null; // not enabled when developing due to https://github.com/electron/electron/issues/3647
		}

		const windowConfig = this.configurationService.getValue<IWindowSettings>();
		if (windowConfig && windowConfig.window) {
			const useNativeTabs = windowConfig.window.nativeTabs;
			if (useNativeTabs) {
				return null; // native tabs on sierra do not work with custom title style
			}

			const style = windowConfig.window.titleBarStyle;
			if (style === 'custom') {
				return style;
			}
		}

		return null;
	}

	private setStatusBarHidden(hidden: boolean, skipLayout?: boolean): void {
		this.statusBarHidden = hidden;

		// Adjust CSS
		if (hidden) {
			this.workbench.addClass('nostatusbar');
		} else {
			this.workbench.removeClass('nostatusbar');
		}

		// Layout
		if (!skipLayout) {
			this.workbenchLayout.layout();
		}
	}

	public setActivityBarHidden(hidden: boolean, skipLayout?: boolean): void {
		this.activityBarHidden = hidden;

		// Layout
		if (!skipLayout) {
			this.workbenchLayout.layout();
		}
	}

	public setSideBarHidden(hidden: boolean, skipLayout?: boolean): TPromise<void> {
		this.sideBarHidden = hidden;
		this.sideBarVisibleContext.set(!hidden);

		// Adjust CSS
		if (hidden) {
			this.workbench.addClass('nosidebar');
		} else {
			this.workbench.removeClass('nosidebar');
		}

		// If sidebar becomes hidden, also hide the current active Viewlet if any
		let promise = TPromise.wrap<any>(null);
		if (hidden && this.sidebarPart.getActiveViewlet()) {
			promise = this.sidebarPart.hideActiveViewlet().then(() => {
				const activeEditor = this.editorPart.getActiveEditor();
				const activePanel = this.panelPart.getActivePanel();

				// Pass Focus to Editor or Panel if Sidebar is now hidden
				if (this.hasFocus(Parts.PANEL_PART) && activePanel) {
					activePanel.focus();
				} else if (activeEditor) {
					activeEditor.focus();
				}
			});
		}

		// If sidebar becomes visible, show last active Viewlet or default viewlet
		else if (!hidden && !this.sidebarPart.getActiveViewlet()) {
			const viewletToOpen = this.sidebarPart.getLastActiveViewletId();
			if (viewletToOpen) {
				promise = this.sidebarPart.openViewlet(viewletToOpen, true);
			}
		}

		return promise.then(() => {

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
		});
	}

	public setPanelHidden(hidden: boolean, skipLayout?: boolean): TPromise<void> {
		this.panelHidden = hidden;

		// Adjust CSS
		if (hidden) {
			this.workbench.addClass('nopanel');
		} else {
			this.workbench.removeClass('nopanel');
		}

		// If panel part becomes hidden, also hide the current active panel if any
		let promise = TPromise.wrap<any>(null);
		if (hidden && this.panelPart.getActivePanel()) {
			promise = this.panelPart.hideActivePanel().then(() => {
				// Pass Focus to Editor if Panel part is now hidden
				const editor = this.editorPart.getActiveEditor();
				if (editor) {
					editor.focus();
				}
			});
		}

		// If panel part becomes visible, show last active panel or default panel
		else if (!hidden && !this.panelPart.getActivePanel()) {
			const panelToOpen = this.panelPart.getLastActivePanelId();
			if (panelToOpen) {
				promise = this.panelPart.openPanel(panelToOpen, true);
			}
		}

		return promise.then(() => {

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
		});
	}

	public toggleMaximizedPanel(): void {
		this.workbenchLayout.layout({ toggleMaximizedPanel: true, source: Parts.PANEL_PART });
	}

	public isPanelMaximized(): boolean {
		return this.workbenchLayout.isPanelMaximized();
	}

	public getSideBarPosition(): Position {
		return this.sideBarPosition;
	}

	public setSideBarPosition(position: Position): void {
		if (this.sideBarHidden) {
			this.setSideBarHidden(false, true /* Skip Layout */).done(void 0, errors.onUnexpectedError);
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

	public getPanelPosition(): Position {
		return this.panelPosition;
	}

	public setPanelPosition(position: Position): TPromise<void> {
		return (this.panelHidden ? this.setPanelHidden(false, true /* Skip Layout */) : TPromise.as(undefined)).then(() => {
			const newPositionValue = (position === Position.BOTTOM) ? 'bottom' : 'right';
			const oldPositionValue = (this.panelPosition === Position.BOTTOM) ? 'bottom' : 'right';
			this.panelPosition = position;
			this.storageService.store(Workbench.panelPositionStorageKey, Position[this.panelPosition].toLowerCase(), StorageScope.WORKSPACE);

			// Adjust CSS
			DOM.removeClass(this.panelPart.getContainer(), oldPositionValue);
			DOM.addClass(this.panelPart.getContainer(), newPositionValue);

			// Update Styles
			this.panelPart.updateStyles();

			// Layout
			this.workbenchLayout.layout();
		});
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

	public dispose(reason = ShutdownReason.QUIT): void {

		// Restore sidebar if we are being shutdown as a matter of a reload
		if (reason === ShutdownReason.RELOAD) {
			this.storageService.store(Workbench.sidebarRestoreStorageKey, 'true', StorageScope.WORKSPACE);
		}

		// Preserve zen mode only on reload. Real quit gets out of zen mode so novice users do not get stuck in zen mode.
		const zenConfig = this.configurationService.getValue<IZenModeSettings>('zenMode');
		const restoreZenMode = this.zenMode.active && (zenConfig.restore || reason === ShutdownReason.RELOAD);
		if (restoreZenMode) {
			this.storageService.store(Workbench.zenModeActiveStorageKey, true, StorageScope.WORKSPACE);
		} else {
			if (this.zenMode.active) {
				this.toggleZenMode(true);
			}
			this.storageService.remove(Workbench.zenModeActiveStorageKey, StorageScope.WORKSPACE);
		}

		// Dispose bindings
		this.toUnbind = dispose(this.toUnbind);

		// Pass shutdown on to each participant
		this.workbenchShutdown = true;
	}

	/**
	 * Asks the workbench and all its UI components inside to lay out according to
	 * the containers dimension the workbench is living in.
	 */
	public layout(options?: ILayoutOptions): void {
		if (this.isStarted()) {
			this.workbenchLayout.layout(options);
		}
	}

	private registerListeners(): void {

		// Listen to editor changes
		this.toUnbind.push(this.editorPart.onEditorsChanged(() => this.onEditorsChanged()));

		// Listen to editor closing (if we run with --wait)
		const filesToWait = this.workbenchParams.configuration.filesToWait;
		if (filesToWait) {
			const resourcesToWaitFor = filesToWait.paths.map(p => URI.file(p.filePath));
			const waitMarkerFile = URI.file(filesToWait.waitMarkerFilePath);
			const listenerDispose = this.editorPart.getStacksModel().onEditorClosed(() => this.onEditorClosed(listenerDispose, resourcesToWaitFor, waitMarkerFile));

			this.toUnbind.push(listenerDispose);
		}

		// Configuration changes
		this.toUnbind.push(this.configurationService.onDidChangeConfiguration(() => this.onDidUpdateConfiguration()));

		// Fullscreen changes
		this.toUnbind.push(browser.onDidChangeFullscreen(() => this.onFullscreenChanged()));
	}

	private onFullscreenChanged(): void {
		if (!this.isCreated) {
			return; // we need to be ready
		}

		// Apply as CSS class
		const isFullscreen = browser.isFullscreen();
		if (isFullscreen) {
			this.addClass('fullscreen');
		} else {
			this.removeClass('fullscreen');
			if (this.zenMode.transitionedToFullScreen && this.zenMode.active) {
				this.toggleZenMode();
			}
		}

		// Changing fullscreen state of the window has an impact on custom title bar visibility, so we need to update
		const hasCustomTitle = this.getCustomTitleBarStyle() === 'custom';
		if (hasCustomTitle) {
			this._onTitleBarVisibilityChange.fire();
			this.layout(); // handle title bar when fullscreen changes
		}
	}

	private onEditorClosed(listenerDispose: IDisposable, resourcesToWaitFor: URI[], waitMarkerFile: URI): void {

		// In wait mode, listen to changes to the editors and wait until the files
		// are closed that the user wants to wait for. When this happens we delete
		// the wait marker file to signal to the outside that editing is done.
		const stacks = this.editorPart.getStacksModel();
		if (resourcesToWaitFor.every(r => !stacks.isOpen(r))) {
			listenerDispose.dispose();
			this.fileService.del(waitMarkerFile).done(null, errors.onUnexpectedError);
		}
	}

	private onEditorsChanged(): void {
		const visibleEditors = this.editorService.getVisibleEditors().length;

		// Close when empty: check if we should close the window based on the setting
		// Overruled by: window has a workspace opened or this window is for extension development
		// or setting is disabled. Also enabled when running with --wait from the command line.
		if (visibleEditors === 0 && this.contextService.getWorkbenchState() === WorkbenchState.EMPTY && !this.environmentService.isExtensionDevelopment) {
			const closeWhenEmpty = this.configurationService.getValue<boolean>(Workbench.closeWhenEmptyConfigurationKey);
			if (closeWhenEmpty || this.environmentService.args.wait) {
				this.closeEmptyWindowScheduler.schedule();
			}
		}

		// We update the editorpart class to indicate if an editor is opened or not
		// through a delay to accomodate for fast editor switching
		this.handleEditorBackground();
	}

	private handleEditorBackground(): void {
		const visibleEditors = this.editorService.getVisibleEditors().length;

		const editorContainer = this.editorPart.getContainer();
		if (visibleEditors === 0) {
			this.editorsVisibleContext.reset();
			this.editorBackgroundDelayer.trigger(() => DOM.addClass(editorContainer, 'empty'));
		} else {
			this.editorsVisibleContext.set(true);
			this.editorBackgroundDelayer.trigger(() => DOM.removeClass(editorContainer, 'empty'));
		}
	}

	private onAllEditorsClosed(): void {
		const visibleEditors = this.editorService.getVisibleEditors().length;
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
	}

	private createWorkbenchLayout(): void {
		this.workbenchLayout = this.instantiationService.createInstance(
			WorkbenchLayout,
			this.container,								// Parent
			this.workbench.getHTMLElement(),			// Workbench Container
			{
				titlebar: this.titlebarPart,			// Title Bar
				activitybar: this.activitybarPart,		// Activity Bar
				editor: this.editorPart,				// Editor
				sidebar: this.sidebarPart,				// Sidebar
				panel: this.panelPart,					// Panel Part
				statusbar: this.statusbarPart,			// Statusbar
			},
			this.quickOpen,								// Quickopen
			this.quickInput,							// QuickInput
			this.notificationsCenter,					// Notifications Center
			this.notificationsToasts					// Notifications Toasts
		);
	}

	private renderWorkbench(): void {

		// Apply sidebar state as CSS class
		if (this.sideBarHidden) {
			this.workbench.addClass('nosidebar');
		}
		if (this.panelHidden) {
			this.workbench.addClass('nopanel');
		}
		if (this.statusBarHidden) {
			this.workbench.addClass('nostatusbar');
		}

		// Apply font aliasing
		this.setFontAliasing(this.fontAliasing);

		// Apply title style if shown
		const titleStyle = this.getCustomTitleBarStyle();
		if (titleStyle) {
			DOM.addClass(this.parent, `titlebar-style-${titleStyle}`);
		}

		// Apply fullscreen state
		if (browser.isFullscreen()) {
			this.workbench.addClass('fullscreen');
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

		// Add Workbench to DOM
		this.workbenchContainer.build(this.container);
	}

	private createTitlebarPart(): void {
		const titlebarContainer = $(this.workbench).div({
			'class': ['part', 'titlebar'],
			id: Identifiers.TITLEBAR_PART,
			role: 'contentinfo'
		});

		this.titlebarPart.create(titlebarContainer.getHTMLElement());
	}

	private createActivityBarPart(): void {
		const activitybarPartContainer = $(this.workbench)
			.div({
				'class': ['part', 'activitybar', this.sideBarPosition === Position.LEFT ? 'left' : 'right'],
				id: Identifiers.ACTIVITYBAR_PART,
				role: 'navigation'
			});

		this.activitybarPart.create(activitybarPartContainer.getHTMLElement());
	}

	private createSidebarPart(): void {
		const sidebarPartContainer = $(this.workbench)
			.div({
				'class': ['part', 'sidebar', this.sideBarPosition === Position.LEFT ? 'left' : 'right'],
				id: Identifiers.SIDEBAR_PART,
				role: 'complementary'
			});

		this.sidebarPart.create(sidebarPartContainer.getHTMLElement());
	}

	private createPanelPart(): void {
		const panelPartContainer = $(this.workbench)
			.div({
				'class': ['part', 'panel', this.panelPosition === Position.BOTTOM ? 'bottom' : 'right'],
				id: Identifiers.PANEL_PART,
				role: 'complementary'
			});

		this.panelPart.create(panelPartContainer.getHTMLElement());
	}

	private createEditorPart(): void {
		const editorContainer = $(this.workbench)
			.div({
				'class': ['part', 'editor', 'empty'],
				id: Identifiers.EDITOR_PART,
				role: 'main'
			});

		this.editorPart.create(editorContainer.getHTMLElement());
	}

	private createStatusbarPart(): void {
		const statusbarContainer = $(this.workbench).div({
			'class': ['part', 'statusbar'],
			id: Identifiers.STATUSBAR_PART,
			role: 'contentinfo'
		});

		this.statusbarPart.create(statusbarContainer.getHTMLElement());
	}

	private createNotificationsHandlers(): void {

		// Notifications Center
		this.notificationsCenter = this.instantiationService.createInstance(NotificationsCenter, this.workbench.getHTMLElement(), this.notificationService.model);
		this.toUnbind.push(this.notificationsCenter);

		// Notifications Toasts
		this.notificationsToasts = this.instantiationService.createInstance(NotificationsToasts, this.workbench.getHTMLElement(), this.notificationService.model);
		this.toUnbind.push(this.notificationsToasts);

		// Notifications Alerts
		const notificationsAlerts = this.instantiationService.createInstance(NotificationsAlerts, this.notificationService.model);
		this.toUnbind.push(notificationsAlerts);

		// Notifications Status
		const notificationsStatus = this.instantiationService.createInstance(NotificationsStatus, this.notificationService.model);

		// Eventing
		this.toUnbind.push(this.notificationsCenter.onDidChangeVisibility(() => {

			// Update status
			notificationsStatus.update(this.notificationsCenter.isVisible);

			// Update toasts
			this.notificationsToasts.update(this.notificationsCenter.isVisible);
		}));

		// Register Commands
		registerNotificationCommands(this.notificationsCenter, this.notificationsToasts);
	}

	public getInstantiationService(): IInstantiationService {
		return this.instantiationService;
	}

	public addClass(clazz: string): void {
		if (this.workbench) {
			this.workbench.addClass(clazz);
		}
	}

	public removeClass(clazz: string): void {
		if (this.workbench) {
			this.workbench.removeClass(clazz);
		}
	}

	public getWorkbenchElementId(): string {
		return Identifiers.WORKBENCH_CONTAINER;
	}

	public toggleZenMode(skipLayout?: boolean): void {
		this.zenMode.active = !this.zenMode.active;

		// Check if zen mode transitioned to full screen and if now we are out of zen mode -> we need to go out of full screen
		let toggleFullScreen = false;
		// Same goes for the centered editor layout
		if (this.zenMode.active) {
			const config = this.configurationService.getValue<IZenModeSettings>('zenMode');
			toggleFullScreen = !browser.isFullscreen() && config.fullScreen;
			this.zenMode.transitionedToFullScreen = toggleFullScreen;
			this.zenMode.transitionedToCenteredEditorLayout = !this.isEditorLayoutCentered() && config.centerLayout;
			this.zenMode.wasSideBarVisible = this.isVisible(Parts.SIDEBAR_PART);
			this.zenMode.wasPanelVisible = this.isVisible(Parts.PANEL_PART);
			this.setPanelHidden(true, true).done(void 0, errors.onUnexpectedError);
			this.setSideBarHidden(true, true).done(void 0, errors.onUnexpectedError);

			if (config.hideActivityBar) {
				this.setActivityBarHidden(true, true);
			}

			if (config.hideStatusBar) {
				this.setStatusBarHidden(true, true);
			}

			if (config.hideTabs) {
				this.editorPart.hideTabs(true);
			}

			if (config.centerLayout) {
				this.centerEditorLayout(true, true);
			}
		} else {
			if (this.zenMode.wasPanelVisible) {
				this.setPanelHidden(false, true).done(void 0, errors.onUnexpectedError);
			}
			if (this.zenMode.wasSideBarVisible) {
				this.setSideBarHidden(false, true).done(void 0, errors.onUnexpectedError);
			}
			if (this.zenMode.transitionedToCenteredEditorLayout) {
				this.centerEditorLayout(false, true);
			}

			// Status bar and activity bar visibility come from settings -> update their visibility.
			this.onDidUpdateConfiguration(true);
			this.editorPart.hideTabs(false);
			const activeEditor = this.editorPart.getActiveEditor();
			if (activeEditor) {
				activeEditor.focus();
			}

			toggleFullScreen = this.zenMode.transitionedToFullScreen && browser.isFullscreen();
		}

		this.inZenMode.set(this.zenMode.active);

		if (!skipLayout) {
			this.layout();
		}

		if (toggleFullScreen) {
			this.windowService.toggleFullScreen().done(void 0, errors.onUnexpectedError);
		}
	}

	public isEditorLayoutCentered(): boolean {
		return this.centeredEditorLayoutActive;
	}

	public centerEditorLayout(active: boolean, skipLayout?: boolean): void {
		this.centeredEditorLayoutActive = active;
		this.storageService.store(Workbench.centeredEditorLayoutActiveStorageKey, this.centeredEditorLayoutActive, StorageScope.GLOBAL);

		if (!skipLayout) {
			this.layout();
		}
	}

	// Resize requested part along the main axis
	// layout will do all the math for us and adjusts the other Parts
	public resizePart(part: Parts, sizeChange: number): void {
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


	private shouldRestoreLastOpenedViewlet(): boolean {
		if (!this.environmentService.isBuilt) {
			return true; // always restore sidebar when we are in development mode
		}

		const restore = this.storageService.getBoolean(Workbench.sidebarRestoreStorageKey, StorageScope.WORKSPACE);
		if (restore) {
			this.storageService.remove(Workbench.sidebarRestoreStorageKey, StorageScope.WORKSPACE); // only support once
		}

		return restore;
	}
}
