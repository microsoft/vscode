/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/workbench';

import { localize } from 'vs/nls';
import { TPromise, ValueCallback } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Event, { Emitter, chain } from 'vs/base/common/event';
import DOM = require('vs/base/browser/dom');
import { Builder, $ } from 'vs/base/browser/builder';
import { Delayer, RunOnceScheduler } from 'vs/base/common/async';
import * as browser from 'vs/base/browser/browser';
import assert = require('vs/base/common/assert');
import { StopWatch } from 'vs/base/common/stopwatch';
import { startTimer } from 'vs/base/node/startupTimers';
import errors = require('vs/base/common/errors');
import { BackupFileService } from 'vs/workbench/services/backup/node/backupFileService';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Registry } from 'vs/platform/registry/common/platform';
import { isWindows, isLinux, isMacintosh } from 'vs/base/common/platform';
import { Position as EditorPosition, IResourceDiffInput, IUntitledResourceInput, IEditor, IResourceInput } from 'vs/platform/editor/common/editor';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/common/editor';
import { HistoryService } from 'vs/workbench/services/history/browser/history';
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
import { getServices } from 'vs/platform/instantiation/common/extensions';
import { WorkbenchEditorService } from 'vs/workbench/services/editor/browser/editorService';
import { Position, Parts, IPartService, ILayoutOptions } from 'vs/workbench/services/part/common/partService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ContextMenuService } from 'vs/workbench/services/contextview/electron-browser/contextmenuService';
import { WorkbenchKeybindingService } from 'vs/workbench/services/keybinding/electron-browser/keybindingService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { WorkspaceService } from 'vs/workbench/services/configuration/node/configuration';
import { IConfigurationEditingService } from 'vs/workbench/services/configuration/common/configurationEditing';
import { ConfigurationEditingService } from 'vs/workbench/services/configuration/node/configurationEditingService';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { JSONEditingService } from 'vs/workbench/services/configuration/node/jsonEditingService';
import { ContextKeyService } from 'vs/platform/contextkey/browser/contextKeyService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IKeybindingEditingService, KeybindingsEditingService } from 'vs/workbench/services/keybinding/common/keybindingEditing';
import { ContextKeyExpr, RawContextKey, IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IActivityBarService } from 'vs/workbench/services/activity/common/activityBarService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { ViewletService } from 'vs/workbench/services/viewlet/browser/viewletService';
// import { FileService } from 'vs/workbench/services/files/electron-browser/fileService';
import { RemoteFileService } from 'vs/workbench/services/files/electron-browser/remoteFileService';
import { IFileService } from 'vs/platform/files/common/files';
import { IListService, ListService } from 'vs/platform/list/browser/listService';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { ConfigurationResolverService } from 'vs/workbench/services/configurationResolver/node/configurationResolverService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { ITitleService } from 'vs/workbench/services/title/common/titleService';
import { WorkbenchMessageService } from 'vs/workbench/services/message/browser/messageService';
import { IWorkbenchEditorService, IResourceInputType } from 'vs/workbench/services/editor/common/editorService';
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
import { ILifecycleService, ShutdownReason, ShutdownEvent } from 'vs/platform/lifecycle/common/lifecycle';
import { IWindowService, IWindowConfiguration as IWindowSettings, IWindowConfiguration, IPath } from 'vs/platform/windows/common/windows';
import { IMessageService } from 'vs/platform/message/common/message';
import { IStatusbarService } from 'vs/platform/statusbar/common/statusbar';
import { IMenuService, SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { MenuService } from 'vs/platform/actions/common/menuService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actionRegistry';
import { OpenRecentAction, ToggleDevToolsAction, ReloadWindowAction, inRecentFilesPickerContextKey } from 'vs/workbench/electron-browser/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { getQuickNavigateHandler, inQuickOpenContext } from 'vs/workbench/browser/parts/quickopen/quickopen';
import { IWorkspaceEditingService, IWorkspaceMigrationService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { WorkspaceEditingService } from 'vs/workbench/services/workspace/node/workspaceEditingService';
import URI from 'vs/base/common/uri';
import { isWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { WorkspaceMigrationService } from 'vs/workbench/services/workspace/node/workspaceMigrationService';

export const MessagesVisibleContext = new RawContextKey<boolean>('globalMessageVisible', false);
export const EditorsVisibleContext = new RawContextKey<boolean>('editorIsOpen', false);
export const InZenModeContext = new RawContextKey<boolean>('inZenMode', false);
export const NoEditorsVisibleContext: ContextKeyExpr = EditorsVisibleContext.toNegated();

interface WorkbenchParams {
	configuration: IWindowConfiguration;
	serviceCollection: ServiceCollection;
}

interface IZenModeSettings {
	fullScreen: boolean;
	hideTabs: boolean;
	hideActivityBar: boolean;
	hideStatusBar: boolean;
	restore: boolean;
}

export interface IWorkbenchStartedInfo {
	customKeybindingsCount: number;
	restoreViewletDuration: number;
	restoreEditorsDuration: number;
	pinnedViewlets: string[];
	restoredViewlet: string;
	restoredEditors: string[];
}

export interface IWorkbenchCallbacks {
	onServicesCreated?: () => void;
	onWorkbenchStarted?: (info: IWorkbenchStartedInfo) => void;
}

const Identifiers = {
	WORKBENCH_CONTAINER: 'workbench.main.container',
	TITLEBAR_PART: 'workbench.parts.titlebar',
	ACTIVITYBAR_PART: 'workbench.parts.activitybar',
	SIDEBAR_PART: 'workbench.parts.sidebar',
	PANEL_PART: 'workbench.parts.panel',
	EDITOR_PART: 'workbench.parts.editor',
	STATUSBAR_PART: 'workbench.parts.statusbar'
};

/**
 * The workbench creates and lays out all parts that make up the workbench.
 */
export class Workbench implements IPartService {

	private static sidebarHiddenSettingKey = 'workbench.sidebar.hidden';
	private static sidebarRestoreSettingKey = 'workbench.sidebar.restore';
	private static panelHiddenSettingKey = 'workbench.panel.hidden';
	private static zenModeActiveSettingKey = 'workbench.zenmode.active';

	private static sidebarPositionConfigurationKey = 'workbench.sideBar.location';
	private static statusbarVisibleConfigurationKey = 'workbench.statusBar.visible';
	private static activityBarVisibleConfigurationKey = 'workbench.activityBar.visible';

	private static closeWhenEmptyConfigurationKey = 'window.closeWhenEmpty';

	private static fontAliasingConfigurationKey = 'workbench.fontAliasing';

	private _onTitleBarVisibilityChange: Emitter<void>;

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
	private configurationEditingService: IConfigurationEditingService;
	private workspaceMigrationService: WorkspaceMigrationService;
	private titlebarPart: TitlebarPart;
	private activitybarPart: ActivitybarPart;
	private sidebarPart: SidebarPart;
	private panelPart: PanelPart;
	private editorPart: EditorPart;
	private statusbarPart: StatusbarPart;
	private quickOpen: QuickOpenController;
	private workbenchLayout: WorkbenchLayout;
	private toDispose: IDisposable[];
	private toShutdown: { shutdown: () => void; }[];
	private callbacks: IWorkbenchCallbacks;
	private creationPromise: TPromise<boolean>;
	private creationPromiseComplete: ValueCallback;
	private sideBarHidden: boolean;
	private statusBarHidden: boolean;
	private activityBarHidden: boolean;
	private sideBarPosition: Position;
	private panelHidden: boolean;
	private editorBackgroundDelayer: Delayer<void>;
	private closeEmptyWindowScheduler: RunOnceScheduler;
	private messagesVisibleContext: IContextKey<boolean>;
	private editorsVisibleContext: IContextKey<boolean>;
	private inZenMode: IContextKey<boolean>;
	private hasFilesToCreateOpenOrDiff: boolean;
	private fontAliasing: string;
	private zenMode: {
		active: boolean;
		transitionedToFullScreen: boolean;
		wasSideBarVisible: boolean;
		wasPanelVisible: boolean;
	};

	constructor(
		parent: HTMLElement,
		container: HTMLElement,
		configuration: IWindowConfiguration,
		serviceCollection: ServiceCollection,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IStorageService private storageService: IStorageService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IMessageService private messageService: IMessageService,
		@IConfigurationService private configurationService: WorkspaceService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IWindowService private windowService: IWindowService
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

		this.toDispose = [];
		this.toShutdown = [];

		this.editorBackgroundDelayer = new Delayer<void>(50);
		this.closeEmptyWindowScheduler = new RunOnceScheduler(() => this.onAllEditorsClosed(), 50);

		this._onTitleBarVisibilityChange = new Emitter<void>();

		this.creationPromise = new TPromise<boolean>(c => {
			this.creationPromiseComplete = c;
		});
	}

	public get onTitleBarVisibilityChange(): Event<void> {
		return this._onTitleBarVisibilityChange.event;
	}

	public get onEditorLayout(): Event<void> {
		return chain(this.editorPart.onLayout)
			.map(() => void 0)
			.event;
	}

	/**
	 * Starts the workbench and creates the HTML elements on the container. A workbench can only be started
	 * once. Use the shutdown function to free up resources created by the workbench on startup.
	 */
	public startup(callbacks?: IWorkbenchCallbacks): void {
		assert.ok(!this.workbenchStarted, 'Can not start a workbench that was already started');
		assert.ok(!this.workbenchShutdown, 'Can not start a workbench that was shutdown');

		try {
			this.workbenchStarted = true;
			this.callbacks = callbacks;

			// Create Workbench
			this.createWorkbench();

			// Install some global actions
			this.createGlobalActions();

			// Services
			this.initServices();
			if (this.callbacks && this.callbacks.onServicesCreated) {
				this.callbacks.onServicesCreated();
			}

			// Contexts
			this.messagesVisibleContext = MessagesVisibleContext.bindTo(this.contextKeyService);
			this.editorsVisibleContext = EditorsVisibleContext.bindTo(this.contextKeyService);
			this.inZenMode = InZenModeContext.bindTo(this.contextKeyService);

			// Register Listeners
			this.registerListeners();

			// Settings
			this.initSettings();

			// Create Workbench and Parts
			this.renderWorkbench();

			// Workbench Layout
			this.createWorkbenchLayout();

			// Load composites and editors in parallel
			const compositeAndEditorPromises: TPromise<any>[] = [];

			// Restore last opened viewlet
			let viewletRestoreStopWatch: StopWatch;
			let viewletIdToRestore: string;
			if (!this.sideBarHidden) {

				if (this.shouldRestoreLastOpenedViewlet()) {
					viewletIdToRestore = this.storageService.get(SidebarPart.activeViewletSettingsKey, StorageScope.WORKSPACE);
				}

				if (!viewletIdToRestore) {
					viewletIdToRestore = this.viewletService.getDefaultViewletId();
				}

				viewletRestoreStopWatch = StopWatch.create();
				const viewletTimer = startTimer('restore:viewlet');
				compositeAndEditorPromises.push(viewletTimer.while(this.viewletService.openViewlet(viewletIdToRestore)).then(() => {
					viewletRestoreStopWatch.stop();
				}));
			}

			// Load Panel
			const panelRegistry = Registry.as<PanelRegistry>(PanelExtensions.Panels);
			const panelId = this.storageService.get(PanelPart.activePanelSettingsKey, StorageScope.WORKSPACE, panelRegistry.getDefaultPanelId());
			if (!this.panelHidden && !!panelId) {
				compositeAndEditorPromises.push(this.panelPart.openPanel(panelId, false));
			}

			// Load Editors
			const editorRestoreStopWatch = StopWatch.create();
			const restoredEditors: string[] = [];
			const editorsTimer = startTimer('restore:editors');
			compositeAndEditorPromises.push(editorsTimer.while(this.resolveEditorsToOpen().then(inputs => {
				let editorOpenPromise: TPromise<IEditor[]>;
				if (inputs.length) {
					editorOpenPromise = this.editorService.openEditors(inputs.map(input => { return { input, position: EditorPosition.ONE }; }));
				} else {
					editorOpenPromise = this.editorPart.restoreEditors();
				}

				return editorOpenPromise.then(editors => {
					this.handleEditorBackground(); // make sure we show the proper background in the editor area
					editorRestoreStopWatch.stop();

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
			})));

			if (this.storageService.getBoolean(Workbench.zenModeActiveSettingKey, StorageScope.WORKSPACE, false)) {
				this.toggleZenMode(true);
			}

			// Flag workbench as created once done
			const workbenchDone = (error?: Error) => {
				this.workbenchCreated = true;
				this.creationPromiseComplete(true);

				if (this.callbacks && this.callbacks.onWorkbenchStarted) {
					this.callbacks.onWorkbenchStarted({
						customKeybindingsCount: this.keybindingService.customKeybindingsCount(),
						restoreViewletDuration: viewletRestoreStopWatch ? Math.round(viewletRestoreStopWatch.elapsed()) : 0,
						restoreEditorsDuration: Math.round(editorRestoreStopWatch.elapsed()),
						pinnedViewlets: this.activitybarPart.getPinned(),
						restoredViewlet: viewletIdToRestore,
						restoredEditors
					});
				}

				if (error) {
					errors.onUnexpectedError(error);
				}
			};

			// Join viewlet, panel and editor promises
			TPromise.join(compositeAndEditorPromises).then(() => workbenchDone(), error => workbenchDone(error));
		} catch (error) {

			// Print out error
			console.error(toErrorMessage(error, true));

			// Rethrow
			throw error;
		}
	}

	private createGlobalActions(): void {
		const isDeveloping = !this.environmentService.isBuilt || this.environmentService.isExtensionDevelopment;

		// Actions registered here to adjust for developing vs built workbench
		const workbenchActionsRegistry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
		workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ReloadWindowAction, ReloadWindowAction.ID, ReloadWindowAction.LABEL, isDeveloping ? { primary: KeyMod.CtrlCmd | KeyCode.KEY_R } : void 0), 'Reload Window');
		workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(ToggleDevToolsAction, ToggleDevToolsAction.ID, ToggleDevToolsAction.LABEL, isDeveloping ? { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_I, mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_I } } : void 0), 'Developer: Toggle Developer Tools', localize('developer', "Developer"));
		workbenchActionsRegistry.registerWorkbenchAction(new SyncActionDescriptor(OpenRecentAction, OpenRecentAction.ID, OpenRecentAction.LABEL, { primary: isDeveloping ? null : KeyMod.CtrlCmd | KeyCode.KEY_R, mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_R } }), 'File: Open Recent...', localize('file', "File"));

		const recentFilesPickerContext = ContextKeyExpr.and(inQuickOpenContext, ContextKeyExpr.has(inRecentFilesPickerContextKey));

		const quickOpenNavigateNextInRecentFilesPickerId = 'workbench.action.quickOpenNavigateNextInRecentFilesPicker';
		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: quickOpenNavigateNextInRecentFilesPickerId,
			weight: KeybindingsRegistry.WEIGHT.workbenchContrib(50),
			handler: getQuickNavigateHandler(quickOpenNavigateNextInRecentFilesPickerId, true),
			when: recentFilesPickerContext,
			primary: KeyMod.CtrlCmd | KeyCode.KEY_R,
			mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_R }
		});

		const quickOpenNavigatePreviousInRecentFilesPicker = 'workbench.action.quickOpenNavigatePreviousInRecentFilesPicker';
		KeybindingsRegistry.registerCommandAndKeybindingRule({
			id: quickOpenNavigatePreviousInRecentFilesPicker,
			weight: KeybindingsRegistry.WEIGHT.workbenchContrib(50),
			handler: getQuickNavigateHandler(quickOpenNavigatePreviousInRecentFilesPicker, false),
			when: recentFilesPickerContext,
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_R,
			mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KEY_R }
		});
	}

	private resolveEditorsToOpen(): TPromise<IResourceInputType[]> {

		// Files to open, diff or create
		if (this.hasFilesToCreateOpenOrDiff) {
			const filesToCreate = this.toInputs(this.workbenchParams.configuration.filesToCreate);
			const filesToOpen = this.toInputs(this.workbenchParams.configuration.filesToOpen);
			const filesToDiff = this.toInputs(this.workbenchParams.configuration.filesToDiff);

			// Files to diff is exclusive
			if (filesToDiff && filesToDiff.length === 2) {
				return TPromise.as([<IResourceDiffInput>{
					leftResource: filesToDiff[0].resource,
					rightResource: filesToDiff[1].resource,
					options: { pinned: true }
				}]);
			}

			// Otherwise: Open/Create files
			else {
				const filesToCreateInputs: IUntitledResourceInput[] = filesToCreate.map(resourceInput => {
					return <IUntitledResourceInput>{
						filePath: resourceInput.resource.fsPath,
						options: { pinned: true }
					};
				});

				return TPromise.as([].concat(filesToOpen).concat(filesToCreateInputs));
			}
		}

		// Empty workbench
		else if (!this.contextService.hasWorkspace() && this.openUntitledFile()) {
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

	private toInputs(paths?: IPath[]): IResourceInput[] {
		if (!paths || !paths.length) {
			return [];
		}

		return paths.map(p => {
			const input = <IResourceInput>{};
			input.resource = URI.file(p.filePath);

			input.options = {
				pinned: true // opening on startup is always pinned and not preview
			};

			if (p.lineNumber) {
				input.options.selection = {
					startLineNumber: p.lineNumber,
					startColumn: p.columnNumber
				};
			}

			return input;
		});
	}

	private openUntitledFile() {
		const startupEditor = this.configurationService.lookup('workbench.startupEditor');

		// Fallback to previous workbench.welcome.enabled setting in case startupEditor is not defined
		if (!startupEditor.user && !startupEditor.workspace) {
			const welcomeEnabled = this.configurationService.lookup('workbench.welcome.enabled');
			if (typeof welcomeEnabled.value === 'boolean') {
				return !welcomeEnabled.value;
			}
		}

		return startupEditor.value === 'newUntitledFile';
	}

	private initServices(): void {
		const { serviceCollection } = this.workbenchParams;

		this.toDispose.push(this.lifecycleService.onWillShutdown(event => this.onWillShutdown(event)));
		this.toDispose.push(this.lifecycleService.onShutdown(this.shutdownComponents, this));

		// Services we contribute
		serviceCollection.set(IPartService, this);

		// Clipboard
		serviceCollection.set(IClipboardService, new ClipboardService());

		// Status bar
		this.statusbarPart = this.instantiationService.createInstance(StatusbarPart, Identifiers.STATUSBAR_PART);
		this.toDispose.push(this.statusbarPart);
		this.toShutdown.push(this.statusbarPart);
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
		this.toDispose.push(this.sidebarPart);
		this.toShutdown.push(this.sidebarPart);

		// Viewlet service
		this.viewletService = this.instantiationService.createInstance(ViewletService, this.sidebarPart);
		serviceCollection.set(IViewletService, this.viewletService);

		// Panel service (panel part)
		this.panelPart = this.instantiationService.createInstance(PanelPart, Identifiers.PANEL_PART);
		this.toDispose.push(this.panelPart);
		this.toShutdown.push(this.panelPart);
		serviceCollection.set(IPanelService, this.panelPart);

		// Activity service (activitybar part)
		this.activitybarPart = this.instantiationService.createInstance(ActivitybarPart, Identifiers.ACTIVITYBAR_PART);
		this.toDispose.push(this.activitybarPart);
		this.toShutdown.push(this.activitybarPart);
		serviceCollection.set(IActivityBarService, this.activitybarPart);

		// Editor service (editor part)
		this.editorPart = this.instantiationService.createInstance(EditorPart, Identifiers.EDITOR_PART, !this.hasFilesToCreateOpenOrDiff);
		this.toDispose.push(this.editorPart);
		this.toShutdown.push(this.editorPart);
		this.editorService = this.instantiationService.createInstance(WorkbenchEditorService, this.editorPart);
		serviceCollection.set(IWorkbenchEditorService, this.editorService);
		serviceCollection.set(IEditorGroupService, this.editorPart);

		// Title bar
		this.titlebarPart = this.instantiationService.createInstance(TitlebarPart, Identifiers.TITLEBAR_PART);
		this.toDispose.push(this.titlebarPart);
		this.toShutdown.push(this.titlebarPart);
		serviceCollection.set(ITitleService, this.titlebarPart);

		// File Service
		const fileService = this.instantiationService.createInstance(RemoteFileService);
		serviceCollection.set(IFileService, fileService);
		this.toDispose.push(fileService.onFileChanges(e => this.configurationService.handleWorkspaceFileEvents(e)));

		// History
		serviceCollection.set(IHistoryService, new SyncDescriptor(HistoryService));

		// Backup File Service
		this.backupFileService = this.instantiationService.createInstance(BackupFileService, this.workbenchParams.configuration.backupPath);
		serviceCollection.set(IBackupFileService, this.backupFileService);

		// Text File Service
		serviceCollection.set(ITextFileService, new SyncDescriptor(TextFileService));

		// SCM Service
		serviceCollection.set(ISCMService, new SyncDescriptor(SCMService));

		// Text Model Resolver Service
		serviceCollection.set(ITextModelService, new SyncDescriptor(TextModelResolverService));

		// JSON Editing
		const jsonEditingService = this.instantiationService.createInstance(JSONEditingService);
		serviceCollection.set(IJSONEditingService, jsonEditingService);

		// Configuration Editing
		this.configurationEditingService = this.instantiationService.createInstance(ConfigurationEditingService);
		serviceCollection.set(IConfigurationEditingService, this.configurationEditingService);

		// Workspace Editing
		serviceCollection.set(IWorkspaceEditingService, new SyncDescriptor(WorkspaceEditingService));

		// Keybinding Editing
		serviceCollection.set(IKeybindingEditingService, this.instantiationService.createInstance(KeybindingsEditingService));

		// Configuration Resolver
		serviceCollection.set(IConfigurationResolverService, new SyncDescriptor(ConfigurationResolverService, process.env));

		// Workspace Migrating
		this.workspaceMigrationService = this.instantiationService.createInstance(WorkspaceMigrationService);
		serviceCollection.set(IWorkspaceMigrationService, this.workspaceMigrationService);

		// Quick open service (quick open controller)
		this.quickOpen = this.instantiationService.createInstance(QuickOpenController);
		this.toDispose.push(this.quickOpen);
		this.toShutdown.push(this.quickOpen);
		serviceCollection.set(IQuickOpenService, this.quickOpen);

		// Contributed services
		const contributedServices = getServices();
		for (let contributedService of contributedServices) {
			serviceCollection.set(contributedService.id, contributedService.descriptor);
		}

		// Set the some services to registries that have been created eagerly
		Registry.as<IActionBarRegistry>(ActionBarExtensions.Actionbar).setInstantiationService(this.instantiationService);
		Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).setInstantiationService(this.instantiationService);
		Registry.as<IEditorRegistry>(EditorExtensions.Editors).setInstantiationService(this.instantiationService);
	}

	private initSettings(): void {

		// Sidebar visibility
		this.sideBarHidden = this.storageService.getBoolean(Workbench.sidebarHiddenSettingKey, StorageScope.WORKSPACE, !this.contextService.hasWorkspace());

		// Panel part visibility
		const panelRegistry = Registry.as<PanelRegistry>(PanelExtensions.Panels);
		this.panelHidden = this.storageService.getBoolean(Workbench.panelHiddenSettingKey, StorageScope.WORKSPACE, true);
		if (!panelRegistry.getDefaultPanelId()) {
			this.panelHidden = true; // we hide panel part if there is no default panel
		}

		// Sidebar position
		const sideBarPosition = this.configurationService.lookup<string>(Workbench.sidebarPositionConfigurationKey).value;
		this.sideBarPosition = (sideBarPosition === 'right') ? Position.RIGHT : Position.LEFT;

		// Statusbar visibility
		const statusBarVisible = this.configurationService.lookup<string>(Workbench.statusbarVisibleConfigurationKey).value;
		this.statusBarHidden = !statusBarVisible;

		// Activity bar visibility
		const activityBarVisible = this.configurationService.lookup<string>(Workbench.activityBarVisibleConfigurationKey).value;
		this.activityBarHidden = !activityBarVisible;

		// Font aliasing
		this.fontAliasing = this.configurationService.lookup<string>(Workbench.fontAliasingConfigurationKey).value;

		// Zen mode
		this.zenMode = {
			active: false,
			transitionedToFullScreen: false,
			wasSideBarVisible: false,
			wasPanelVisible: false
		};
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

	public joinCreation(): TPromise<boolean> {
		return this.creationPromise;
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
		let container: Builder = null;
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
		return container && container.getHTMLElement();
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

		const windowConfig = this.configurationService.getConfiguration<IWindowSettings>();
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

		// Adjust CSS
		if (hidden) {
			this.workbench.addClass('nosidebar');
		} else {
			this.workbench.removeClass('nosidebar');
		}

		// If sidebar becomes hidden, also hide the current active Viewlet if any
		let promise = TPromise.as<any>(null);
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
			const defaultHidden = !this.contextService.hasWorkspace();
			if (hidden !== defaultHidden) {
				this.storageService.store(Workbench.sidebarHiddenSettingKey, hidden ? 'true' : 'false', StorageScope.WORKSPACE);
			} else {
				this.storageService.remove(Workbench.sidebarHiddenSettingKey, StorageScope.WORKSPACE);
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
		let promise = TPromise.as<any>(null);
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
				this.storageService.store(Workbench.panelHiddenSettingKey, 'false', StorageScope.WORKSPACE);
			} else {
				this.storageService.remove(Workbench.panelHiddenSettingKey, StorageScope.WORKSPACE);
			}

			// Layout
			if (!skipLayout) {
				this.workbenchLayout.layout();
			}
		});
	}

	public toggleMaximizedPanel(): void {
		this.workbenchLayout.layout({ toggleMaximizedPanel: true });
	}

	public isPanelMaximized(): boolean {
		return this.workbenchLayout.isPanelMaximized();
	}

	public getSideBarPosition(): Position {
		return this.sideBarPosition;
	}

	private setSideBarPosition(position: Position): void {
		if (this.sideBarHidden) {
			this.setSideBarHidden(false, true /* Skip Layout */).done(undefined, errors.onUnexpectedError);
		}

		const newPositionValue = (position === Position.LEFT) ? 'left' : 'right';
		const oldPositionValue = (this.sideBarPosition === Position.LEFT) ? 'left' : 'right';
		this.sideBarPosition = position;

		// Adjust CSS
		this.activitybarPart.getContainer().removeClass(oldPositionValue);
		this.sidebarPart.getContainer().removeClass(oldPositionValue);
		this.activitybarPart.getContainer().addClass(newPositionValue);
		this.sidebarPart.getContainer().addClass(newPositionValue);

		// Update Styles
		this.activitybarPart.updateStyles();
		this.sidebarPart.updateStyles();

		// Layout
		this.workbenchLayout.layout();
	}

	private setFontAliasing(aliasing: string) {
		this.fontAliasing = aliasing;

		document.body.style['-webkit-font-smoothing'] = (aliasing === 'default' ? '' : aliasing);
	}

	public dispose(): void {
		if (this.isStarted()) {
			this.shutdownComponents();
			this.workbenchShutdown = true;
		}

		this.toDispose = dispose(this.toDispose);
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

	private onWillShutdown(event: ShutdownEvent): void {

		if (event.reason === ShutdownReason.RELOAD) {
			const workspace = event.payload;

			// We are transitioning into a workspace from an empty workspace or workspace, and
			// as such we want to migrate UI state from the current workspace to the new one.
			if (isWorkspaceIdentifier(workspace)) {
				event.veto(this.instantiationService.createInstance(WorkspaceMigrationService).migrate(workspace).then(() => false, () => false));
			}
		}
	}

	private shutdownComponents(reason = ShutdownReason.QUIT): void {

		// Restore sidebar if we are being shutdown as a matter of a reload
		if (reason === ShutdownReason.RELOAD) {
			this.storageService.store(Workbench.sidebarRestoreSettingKey, 'true', StorageScope.WORKSPACE);
		}

		// Preserve zen mode only on reload. Real quit gets out of zen mode so novice users do not get stuck in zen mode.
		const zenConfig = this.configurationService.getConfiguration<IZenModeSettings>('zenMode');
		const zenModeActive = (zenConfig.restore || reason === ShutdownReason.RELOAD) && this.zenMode.active;
		if (zenModeActive) {
			this.storageService.store(Workbench.zenModeActiveSettingKey, true, StorageScope.WORKSPACE);
		} else {
			this.storageService.remove(Workbench.zenModeActiveSettingKey, StorageScope.WORKSPACE);
		}

		// Pass shutdown on to each participant
		this.toShutdown.forEach(s => s.shutdown());
	}

	private registerListeners(): void {

		// Listen to editor changes
		this.toDispose.push(this.editorPart.onEditorsChanged(() => this.onEditorsChanged()));

		// Handle message service and quick open events
		this.toDispose.push((<WorkbenchMessageService>this.messageService).onMessagesShowing(() => this.messagesVisibleContext.set(true)));
		this.toDispose.push((<WorkbenchMessageService>this.messageService).onMessagesCleared(() => this.messagesVisibleContext.reset()));

		this.toDispose.push(this.quickOpen.onShow(() => (<WorkbenchMessageService>this.messageService).suspend())); // when quick open is open, don't show messages behind
		this.toDispose.push(this.quickOpen.onHide(() => (<WorkbenchMessageService>this.messageService).resume()));  // resume messages once quick open is closed again

		// Configuration changes
		this.toDispose.push(this.configurationService.onDidUpdateConfiguration(() => this.onDidUpdateConfiguration()));

		// Fullscreen changes
		this.toDispose.push(browser.onDidChangeFullscreen(() => this.onFullscreenChanged()));
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

	private onEditorsChanged(): void {
		const visibleEditors = this.editorService.getVisibleEditors().length;

		// Close when empty: check if we should close the window based on the setting
		// Overruled by: window has a workspace opened or this window is for extension development
		// or setting is disabled. Also enabled when running with --wait from the command line.
		if (visibleEditors === 0 && !this.contextService.hasWorkspace() && !this.environmentService.isExtensionDevelopment) {
			const closeWhenEmpty = this.configurationService.lookup<boolean>(Workbench.closeWhenEmptyConfigurationKey).value;
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
			this.editorBackgroundDelayer.trigger(() => editorContainer.addClass('empty'));
		} else {
			this.editorsVisibleContext.set(true);
			this.editorBackgroundDelayer.trigger(() => editorContainer.removeClass('empty'));
		}
	}

	private onAllEditorsClosed(): void {
		const visibleEditors = this.editorService.getVisibleEditors().length;
		if (visibleEditors === 0) {
			this.windowService.closeWindow();
		}
	}

	private onDidUpdateConfiguration(skipLayout?: boolean): void {
		const newSidebarPositionValue = this.configurationService.lookup<string>(Workbench.sidebarPositionConfigurationKey).value;
		const newSidebarPosition = (newSidebarPositionValue === 'right') ? Position.RIGHT : Position.LEFT;
		if (newSidebarPosition !== this.getSideBarPosition()) {
			this.setSideBarPosition(newSidebarPosition);
		}

		const fontAliasing = this.configurationService.lookup<string>(Workbench.fontAliasingConfigurationKey).value;
		if (fontAliasing !== this.fontAliasing) {
			this.setFontAliasing(fontAliasing);
		}

		if (!this.zenMode.active) {
			const newStatusbarHiddenValue = !this.configurationService.lookup<boolean>(Workbench.statusbarVisibleConfigurationKey).value;
			if (newStatusbarHiddenValue !== this.statusBarHidden) {
				this.setStatusBarHidden(newStatusbarHiddenValue, skipLayout);
			}

			const newActivityBarHiddenValue = !this.configurationService.lookup<boolean>(Workbench.activityBarVisibleConfigurationKey).value;
			if (newActivityBarHiddenValue !== this.activityBarHidden) {
				this.setActivityBarHidden(newActivityBarHiddenValue, skipLayout);
			}
		}
	}

	private createWorkbenchLayout(): void {
		this.workbenchLayout = this.instantiationService.createInstance(WorkbenchLayout,
			$(this.container),							// Parent
			this.workbench,								// Workbench Container
			{
				titlebar: this.titlebarPart,			// Title Bar
				activitybar: this.activitybarPart,		// Activity Bar
				editor: this.editorPart,				// Editor
				sidebar: this.sidebarPart,				// Sidebar
				panel: this.panelPart,					// Panel Part
				statusbar: this.statusbarPart,			// Statusbar
			},
			this.quickOpen								// Quickopen
		);

		this.toDispose.push(this.workbenchLayout);
	}

	private createWorkbench(): void {

		// Create Workbench DIV Off-DOM
		this.workbenchContainer = $('.monaco-workbench-container');
		this.workbench = $().div({ 'class': 'monaco-workbench ' + (isWindows ? 'windows' : isLinux ? 'linux' : 'mac'), id: Identifiers.WORKBENCH_CONTAINER }).appendTo(this.workbenchContainer);
	}

	private renderWorkbench(): void {

		// Apply sidebar state as CSS class
		if (this.sideBarHidden) {
			this.workbench.addClass('nosidebar');
		}
		if (this.panelHidden) {
			this.workbench.addClass('nopanel');
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

		// Add Workbench to DOM
		this.workbenchContainer.build(this.container);
	}

	private createTitlebarPart(): void {
		const titlebarContainer = $(this.workbench).div({
			'class': ['part', 'titlebar'],
			id: Identifiers.TITLEBAR_PART,
			role: 'contentinfo'
		});

		this.titlebarPart.create(titlebarContainer);
	}

	private createActivityBarPart(): void {
		const activitybarPartContainer = $(this.workbench)
			.div({
				'class': ['part', 'activitybar', this.sideBarPosition === Position.LEFT ? 'left' : 'right'],
				id: Identifiers.ACTIVITYBAR_PART,
				role: 'navigation'
			});

		this.activitybarPart.create(activitybarPartContainer);
	}

	private createSidebarPart(): void {
		const sidebarPartContainer = $(this.workbench)
			.div({
				'class': ['part', 'sidebar', this.sideBarPosition === Position.LEFT ? 'left' : 'right'],
				id: Identifiers.SIDEBAR_PART,
				role: 'complementary'
			});

		this.sidebarPart.create(sidebarPartContainer);
	}

	private createPanelPart(): void {
		const panelPartContainer = $(this.workbench)
			.div({
				'class': ['part', 'panel'],
				id: Identifiers.PANEL_PART,
				role: 'complementary'
			});

		this.panelPart.create(panelPartContainer);
	}

	private createEditorPart(): void {
		const editorContainer = $(this.workbench)
			.div({
				'class': ['part', 'editor', 'empty'],
				id: Identifiers.EDITOR_PART,
				role: 'main'
			});

		this.editorPart.create(editorContainer);
	}

	private createStatusbarPart(): void {
		const statusbarContainer = $(this.workbench).div({
			'class': ['part', 'statusbar'],
			id: Identifiers.STATUSBAR_PART,
			role: 'contentinfo'
		});

		this.statusbarPart.create(statusbarContainer);
	}

	public getEditorPart(): EditorPart {
		assert.ok(this.workbenchStarted, 'Workbench is not started. Call startup() first.');

		return this.editorPart;
	}

	public getSidebarPart(): SidebarPart {
		assert.ok(this.workbenchStarted, 'Workbench is not started. Call startup() first.');

		return this.sidebarPart;
	}

	public getPanelPart(): PanelPart {
		assert.ok(this.workbenchStarted, 'Workbench is not started. Call startup() first.');

		return this.panelPart;
	}

	public getInstantiationService(): IInstantiationService {
		assert.ok(this.workbenchStarted, 'Workbench is not started. Call startup() first.');

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
		if (this.zenMode.active) {
			const config = this.configurationService.getConfiguration<IZenModeSettings>('zenMode');
			toggleFullScreen = !browser.isFullscreen() && config.fullScreen;
			this.zenMode.transitionedToFullScreen = toggleFullScreen;
			this.zenMode.wasSideBarVisible = this.isVisible(Parts.SIDEBAR_PART);
			this.zenMode.wasPanelVisible = this.isVisible(Parts.PANEL_PART);
			this.setPanelHidden(true, true).done(undefined, errors.onUnexpectedError);
			this.setSideBarHidden(true, true).done(undefined, errors.onUnexpectedError);

			if (config.hideActivityBar) {
				this.setActivityBarHidden(true, true);
			}
			if (config.hideStatusBar) {
				this.setStatusBarHidden(true, true);
			}
			if (config.hideTabs) {
				this.editorPart.hideTabs(true);
			}
		} else {
			if (this.zenMode.wasPanelVisible) {
				this.setPanelHidden(false, true).done(undefined, errors.onUnexpectedError);
			}
			if (this.zenMode.wasSideBarVisible) {
				this.setSideBarHidden(false, true).done(undefined, errors.onUnexpectedError);
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
			this.windowService.toggleFullScreen().done(undefined, errors.onUnexpectedError);
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

		const restore = this.storageService.getBoolean(Workbench.sidebarRestoreSettingKey, StorageScope.WORKSPACE);
		if (restore) {
			this.storageService.remove(Workbench.sidebarRestoreSettingKey, StorageScope.WORKSPACE); // only support once
		}

		return restore;
	}
}
