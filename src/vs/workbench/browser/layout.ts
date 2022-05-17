/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { EventType, addDisposableListener, getClientArea, Dimension, position, size, IDimension, isAncestorUsingFlowTo } from 'vs/base/browser/dom';
import { onDidChangeFullscreen, isFullscreen } from 'vs/base/browser/browser';
import { IWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';
import { isWindows, isLinux, isMacintosh, isWeb, isNative, isIOS } from 'vs/base/common/platform';
import { IUntypedEditorInput, pathsToEditors } from 'vs/workbench/common/editor';
import { SideBySideEditorInput } from 'vs/workbench/common/editor/sideBySideEditorInput';
import { SidebarPart } from 'vs/workbench/browser/parts/sidebar/sidebarPart';
import { PanelPart } from 'vs/workbench/browser/parts/panel/panelPart';
import { Position, Parts, PanelOpensMaximizedOptions, IWorkbenchLayoutService, positionFromString, positionToString, panelOpensMaximizedFromString, PanelAlignment } from 'vs/workbench/services/layout/browser/layoutService';
import { isTemporaryWorkspace, IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IStorageService, StorageScope, WillSaveStateReason } from 'vs/platform/storage/common/storage';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITitleService } from 'vs/workbench/services/title/common/titleService';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { StartupKind, ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { getTitleBarStyle, getMenuBarVisibility, IPath } from 'vs/platform/window/common/window';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IEditor } from 'vs/editor/common/editorCommon';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { SerializableGrid, ISerializableView, ISerializedGrid, Orientation, ISerializedNode, ISerializedLeafNode, Direction, IViewSize, Sizing } from 'vs/base/browser/ui/grid/grid';
import { Part } from 'vs/workbench/browser/part';
import { IStatusbarService } from 'vs/workbench/services/statusbar/browser/statusbar';
import { IFileService } from 'vs/platform/files/common/files';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { coalesce } from 'vs/base/common/arrays';
import { assertIsDefined, isNumber } from 'vs/base/common/types';
import { INotificationService, NotificationsFilter } from 'vs/platform/notification/common/notification';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { WINDOW_ACTIVE_BORDER, WINDOW_INACTIVE_BORDER } from 'vs/workbench/common/theme';
import { LineNumbersType } from 'vs/editor/common/config/editorOptions';
import { URI } from 'vs/base/common/uri';
import { IViewDescriptorService, ViewContainerLocation } from 'vs/workbench/common/views';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { mark } from 'vs/base/common/performance';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { DeferredPromise, Promises } from 'vs/base/common/async';
import { IBannerService } from 'vs/workbench/services/banner/browser/bannerService';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { ActivitybarPart } from 'vs/workbench/browser/parts/activitybar/activitybarPart';
import { AuxiliaryBarPart } from 'vs/workbench/browser/parts/auxiliarybar/auxiliaryBarPart';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { LayoutStateKeys, LayoutStateModel, WorkbenchLayoutSettings } from 'vs/workbench/browser/layoutState';

interface IWorkbenchLayoutWindowRuntimeState {
	fullscreen: boolean;
	maximized: boolean;
	hasFocus: boolean;
	windowBorder: boolean;
	menuBar: {
		toggled: boolean;
	};
	zenMode: {
		transitionDisposables: DisposableStore;
	};
}

interface IWorkbenchLayoutWindowInitializationState {
	views: {
		defaults: string[] | undefined;
		containerToRestore: {
			sideBar?: string;
			panel?: string;
			auxiliaryBar?: string;
		};
	};
	editor: {
		restoreEditors: boolean;
		editorsToOpen: Promise<IUntypedEditorInput[]> | IUntypedEditorInput[];
	};
}

interface IWorkbenchLayoutWindowState {
	runtime: IWorkbenchLayoutWindowRuntimeState;
	initialization: IWorkbenchLayoutWindowInitializationState;
}

enum WorkbenchLayoutClasses {
	SIDEBAR_HIDDEN = 'nosidebar',
	EDITOR_HIDDEN = 'noeditorarea',
	PANEL_HIDDEN = 'nopanel',
	AUXILIARYBAR_HIDDEN = 'noauxiliarybar',
	STATUSBAR_HIDDEN = 'nostatusbar',
	FULLSCREEN = 'fullscreen',
	MAXIMIZED = 'maximized',
	WINDOW_BORDER = 'border'
}

interface IInitialFilesToOpen {
	filesToOpenOrCreate?: IPath[];
	filesToDiff?: IPath[];
}

export abstract class Layout extends Disposable implements IWorkbenchLayoutService {

	declare readonly _serviceBrand: undefined;

	//#region Events

	private readonly _onDidChangeZenMode = this._register(new Emitter<boolean>());
	readonly onDidChangeZenMode = this._onDidChangeZenMode.event;

	private readonly _onDidChangeFullscreen = this._register(new Emitter<boolean>());
	readonly onDidChangeFullscreen = this._onDidChangeFullscreen.event;

	private readonly _onDidChangeCenteredLayout = this._register(new Emitter<boolean>());
	readonly onDidChangeCenteredLayout = this._onDidChangeCenteredLayout.event;

	private readonly _onDidChangePanelAlignment = this._register(new Emitter<PanelAlignment>());
	readonly onDidChangePanelAlignment = this._onDidChangePanelAlignment.event;

	private readonly _onDidChangeWindowMaximized = this._register(new Emitter<boolean>());
	readonly onDidChangeWindowMaximized = this._onDidChangeWindowMaximized.event;

	private readonly _onDidChangePanelPosition = this._register(new Emitter<string>());
	readonly onDidChangePanelPosition = this._onDidChangePanelPosition.event;

	private readonly _onDidChangePartVisibility = this._register(new Emitter<void>());
	readonly onDidChangePartVisibility = this._onDidChangePartVisibility.event;

	private readonly _onDidChangeNotificationsVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeNotificationsVisibility = this._onDidChangeNotificationsVisibility.event;

	private readonly _onDidLayout = this._register(new Emitter<IDimension>());
	readonly onDidLayout = this._onDidLayout.event;

	//#endregion

	//#region Properties

	readonly hasContainer = true;
	readonly container = document.createElement('div');

	private _dimension!: IDimension;
	get dimension(): IDimension { return this._dimension; }

	get offset() {
		let top = 0;
		let quickPickTop = 0;
		if (this.isVisible(Parts.TITLEBAR_PART)) {
			top = this.getPart(Parts.TITLEBAR_PART).maximumHeight;
			quickPickTop = this.titleService.titleMenuVisible ? 0 : top;
		}
		return { top, quickPickTop };
	}

	//#endregion

	private readonly parts = new Map<string, Part>();

	private initialized = false;
	private workbenchGrid!: SerializableGrid<ISerializableView>;

	private titleBarPartView!: ISerializableView;
	private bannerPartView!: ISerializableView;
	private activityBarPartView!: ISerializableView;
	private sideBarPartView!: ISerializableView;
	private panelPartView!: ISerializableView;
	private auxiliaryBarPartView!: ISerializableView;
	private editorPartView!: ISerializableView;
	private statusBarPartView!: ISerializableView;

	private environmentService!: IBrowserWorkbenchEnvironmentService;
	private extensionService!: IExtensionService;
	private configurationService!: IConfigurationService;
	private storageService!: IStorageService;
	private hostService!: IHostService;
	private editorService!: IEditorService;
	private editorGroupService!: IEditorGroupsService;
	private paneCompositeService!: IPaneCompositePartService;
	private titleService!: ITitleService;
	private viewDescriptorService!: IViewDescriptorService;
	private contextService!: IWorkspaceContextService;
	private workingCopyBackupService!: IWorkingCopyBackupService;
	private notificationService!: INotificationService;
	private themeService!: IThemeService;
	private statusBarService!: IStatusbarService;
	private logService!: ILogService;
	private telemetryService!: ITelemetryService;

	private windowState!: IWorkbenchLayoutWindowState;
	private stateModel!: LayoutStateModel;

	private disposed = false;

	constructor(
		protected readonly parent: HTMLElement
	) {
		super();
	}

	protected initLayout(accessor: ServicesAccessor): void {

		// Services
		this.environmentService = accessor.get(IBrowserWorkbenchEnvironmentService);
		this.configurationService = accessor.get(IConfigurationService);
		this.hostService = accessor.get(IHostService);
		this.contextService = accessor.get(IWorkspaceContextService);
		this.storageService = accessor.get(IStorageService);
		this.workingCopyBackupService = accessor.get(IWorkingCopyBackupService);
		this.themeService = accessor.get(IThemeService);
		this.extensionService = accessor.get(IExtensionService);
		this.logService = accessor.get(ILogService);
		this.telemetryService = accessor.get(ITelemetryService);

		// Parts
		this.editorService = accessor.get(IEditorService);
		this.editorGroupService = accessor.get(IEditorGroupsService);
		this.paneCompositeService = accessor.get(IPaneCompositePartService);
		this.viewDescriptorService = accessor.get(IViewDescriptorService);
		this.titleService = accessor.get(ITitleService);
		this.notificationService = accessor.get(INotificationService);
		this.statusBarService = accessor.get(IStatusbarService);
		accessor.get(IBannerService);

		// Listeners
		this.registerLayoutListeners();

		// State
		this.initLayoutState(accessor.get(ILifecycleService), accessor.get(IFileService));
	}

	private registerLayoutListeners(): void {

		// Restore editor if hidden
		const showEditorIfHidden = () => {
			if (!this.isVisible(Parts.EDITOR_PART)) {
				this.toggleMaximizedPanel();
			}
		};

		// Wait to register these listeners after the editor group service
		// is ready to avoid conflicts on startup
		this.editorGroupService.whenRestored.then(() => {

			// Restore editor part on any editor change
			this._register(this.editorService.onDidVisibleEditorsChange(showEditorIfHidden));
			this._register(this.editorGroupService.onDidActivateGroup(showEditorIfHidden));
		});

		// Revalidate center layout when active editor changes: diff editor quits centered mode.
		this._register(this.editorService.onDidActiveEditorChange(() => this.centerEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.EDITOR_CENTERED))));

		// Configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(() => this.doUpdateLayoutConfiguration()));

		// Fullscreen changes
		this._register(onDidChangeFullscreen(() => this.onFullscreenChanged()));

		// Group changes
		this._register(this.editorGroupService.onDidAddGroup(() => this.centerEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.EDITOR_CENTERED))));
		this._register(this.editorGroupService.onDidRemoveGroup(() => this.centerEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.EDITOR_CENTERED))));

		// Prevent workbench from scrolling #55456
		this._register(addDisposableListener(this.container, EventType.SCROLL, () => this.container.scrollTop = 0));

		// Menubar visibility changes
		if ((isWindows || isLinux || isWeb) && getTitleBarStyle(this.configurationService) === 'custom') {
			this._register(this.titleService.onMenubarVisibilityChange(visible => this.onMenubarToggled(visible)));
		}

		// Title Menu changes
		this._register(this.titleService.onDidChangeTitleMenuVisibility(() => this._onDidLayout.fire(this._dimension)));

		// Theme changes
		this._register(this.themeService.onDidColorThemeChange(() => this.updateStyles()));

		// Window focus changes
		this._register(this.hostService.onDidChangeFocus(e => this.onWindowFocusChanged(e)));
	}

	private onMenubarToggled(visible: boolean) {
		if (visible !== this.windowState.runtime.menuBar.toggled) {
			this.windowState.runtime.menuBar.toggled = visible;

			const menuBarVisibility = getMenuBarVisibility(this.configurationService);

			// The menu bar toggles the title bar in web because it does not need to be shown for window controls only
			if (isWeb && menuBarVisibility === 'toggle') {
				this.workbenchGrid.setViewVisible(this.titleBarPartView, this.shouldShowTitleBar());
			}

			// The menu bar toggles the title bar in full screen for toggle and classic settings
			else if (this.windowState.runtime.fullscreen && (menuBarVisibility === 'toggle' || menuBarVisibility === 'classic')) {
				this.workbenchGrid.setViewVisible(this.titleBarPartView, this.shouldShowTitleBar());
			}

			// Move layout call to any time the menubar
			// is toggled to update consumers of offset
			// see issue #115267
			this._onDidLayout.fire(this._dimension);
		}
	}

	private onFullscreenChanged(): void {
		this.windowState.runtime.fullscreen = isFullscreen();

		// Apply as CSS class
		if (this.windowState.runtime.fullscreen) {
			this.container.classList.add(WorkbenchLayoutClasses.FULLSCREEN);
		} else {
			this.container.classList.remove(WorkbenchLayoutClasses.FULLSCREEN);

			const zenModeExitInfo = this.stateModel.getRuntimeValue(LayoutStateKeys.ZEN_MODE_EXIT_INFO);
			const zenModeActive = this.stateModel.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE);
			if (zenModeExitInfo.transitionedToFullScreen && zenModeActive) {
				this.toggleZenMode();
			}
		}

		// Change edge snapping accordingly
		this.workbenchGrid.edgeSnapping = this.windowState.runtime.fullscreen;

		// Changing fullscreen state of the window has an impact on custom title bar visibility, so we need to update
		if (getTitleBarStyle(this.configurationService) === 'custom') {

			// Propagate to grid
			this.workbenchGrid.setViewVisible(this.titleBarPartView, this.shouldShowTitleBar());

			this.updateWindowBorder(true);
		}

		this._onDidChangeFullscreen.fire(this.windowState.runtime.fullscreen);
	}

	private onWindowFocusChanged(hasFocus: boolean): void {
		if (this.windowState.runtime.hasFocus === hasFocus) {
			return;
		}

		this.windowState.runtime.hasFocus = hasFocus;
		this.updateWindowBorder();
	}

	private doUpdateLayoutConfiguration(skipLayout?: boolean): void {

		// Menubar visibility
		this.updateMenubarVisibility(!!skipLayout);

		// Centered Layout
		this.centerEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.EDITOR_CENTERED), skipLayout);
	}

	private setSideBarPosition(position: Position): void {
		const activityBar = this.getPart(Parts.ACTIVITYBAR_PART);
		const sideBar = this.getPart(Parts.SIDEBAR_PART);
		const auxiliaryBar = this.getPart(Parts.AUXILIARYBAR_PART);
		const newPositionValue = (position === Position.LEFT) ? 'left' : 'right';
		const oldPositionValue = (position === Position.RIGHT) ? 'left' : 'right';
		const panelAlignment = this.getPanelAlignment();
		const panelPosition = this.getPanelPosition();

		this.stateModel.setRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON, position);

		// Adjust CSS
		const activityBarContainer = assertIsDefined(activityBar.getContainer());
		const sideBarContainer = assertIsDefined(sideBar.getContainer());
		const auxiliaryBarContainer = assertIsDefined(auxiliaryBar.getContainer());
		activityBarContainer.classList.remove(oldPositionValue);
		sideBarContainer.classList.remove(oldPositionValue);
		activityBarContainer.classList.add(newPositionValue);
		sideBarContainer.classList.add(newPositionValue);

		// Auxiliary Bar has opposite values
		auxiliaryBarContainer.classList.remove(newPositionValue);
		auxiliaryBarContainer.classList.add(oldPositionValue);

		// Update Styles
		activityBar.updateStyles();
		sideBar.updateStyles();
		auxiliaryBar.updateStyles();

		// Move activity bar and side bars
		this.adjustPartPositions(position, panelAlignment, panelPosition);
	}

	private updateWindowBorder(skipLayout: boolean = false) {
		if (isWeb || getTitleBarStyle(this.configurationService) !== 'custom') {
			return;
		}

		const theme = this.themeService.getColorTheme();

		const activeBorder = theme.getColor(WINDOW_ACTIVE_BORDER);
		const inactiveBorder = theme.getColor(WINDOW_INACTIVE_BORDER);

		let windowBorder = false;
		if (!this.windowState.runtime.fullscreen && !this.windowState.runtime.maximized && (activeBorder || inactiveBorder)) {
			windowBorder = true;

			// If the inactive color is missing, fallback to the active one
			const borderColor = this.windowState.runtime.hasFocus ? activeBorder : inactiveBorder ?? activeBorder;
			this.container.style.setProperty('--window-border-color', borderColor?.toString() ?? 'transparent');
		}

		if (windowBorder === this.windowState.runtime.windowBorder) {
			return;
		}

		this.windowState.runtime.windowBorder = windowBorder;

		this.container.classList.toggle(WorkbenchLayoutClasses.WINDOW_BORDER, windowBorder);

		if (!skipLayout) {
			this.layout();
		}
	}

	private updateStyles() {
		this.updateWindowBorder();
	}

	private initLayoutState(lifecycleService: ILifecycleService, fileService: IFileService): void {
		this.stateModel = new LayoutStateModel(this.storageService, this.configurationService, this.contextService, this.parent);
		this.stateModel.load();

		// Both editor and panel should not be hidden on startup
		if (this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN) && this.stateModel.getRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN)) {
			this.stateModel.setRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN, false);
		}

		this.stateModel.onDidChangeState(change => {
			if (change.key === LayoutStateKeys.ACTIVITYBAR_HIDDEN) {
				this.setActivityBarHidden(change.value as boolean);
			}

			if (change.key === LayoutStateKeys.STATUSBAR_HIDDEN) {
				this.setStatusBarHidden(change.value as boolean);
			}

			if (change.key === LayoutStateKeys.SIDEBAR_POSITON) {
				this.setSideBarPosition(change.value as Position);
			}

			if (change.key === LayoutStateKeys.PANEL_POSITION) {
				this.setPanelPosition(change.value as Position);
			}

			if (change.key === LayoutStateKeys.PANEL_ALIGNMENT) {
				this.setPanelAlignment(change.value as PanelAlignment);
			}

			this.doUpdateLayoutConfiguration();
		});

		// Window Initialization State
		const initialFilesToOpen = this.getInitialFilesToOpen();
		const windowInitializationState: IWorkbenchLayoutWindowInitializationState = {
			editor: {
				restoreEditors: this.shouldRestoreEditors(this.contextService, initialFilesToOpen),
				editorsToOpen: this.resolveEditorsToOpen(fileService, initialFilesToOpen)
			},
			views: {
				defaults: this.getDefaultLayoutViews(this.environmentService, this.storageService),
				containerToRestore: {}
			}
		};

		// Window Runtime State
		const windowRuntimeState: IWorkbenchLayoutWindowRuntimeState = {
			fullscreen: isFullscreen(),
			hasFocus: this.hostService.hasFocus,
			maximized: false,
			windowBorder: false,
			menuBar: {
				toggled: false,
			},
			zenMode: {
				transitionDisposables: new DisposableStore(),
			}
		};

		this.windowState = {
			initialization: windowInitializationState,
			runtime: windowRuntimeState,
		};

		// Sidebar View Container To Restore
		if (this.isVisible(Parts.SIDEBAR_PART)) {

			// Only restore last viewlet if window was reloaded or we are in development mode
			let viewContainerToRestore: string | undefined;
			if (!this.environmentService.isBuilt || lifecycleService.startupKind === StartupKind.ReloadedWindow || isWeb) {
				viewContainerToRestore = this.storageService.get(SidebarPart.activeViewletSettingsKey, StorageScope.WORKSPACE, this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.Sidebar)?.id);
			} else {
				viewContainerToRestore = this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.Sidebar)?.id;
			}

			if (viewContainerToRestore) {
				this.windowState.initialization.views.containerToRestore.sideBar = viewContainerToRestore;
			} else {
				this.stateModel.setRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN, true);
			}
		}

		// Panel View Container To Restore
		if (this.isVisible(Parts.PANEL_PART)) {
			let viewContainerToRestore = this.storageService.get(PanelPart.activePanelSettingsKey, StorageScope.WORKSPACE, this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.Panel)?.id);

			if (viewContainerToRestore) {
				this.windowState.initialization.views.containerToRestore.panel = viewContainerToRestore;
			} else {
				this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_HIDDEN, true);
			}
		}

		// Auxiliary Panel to restore
		if (this.isVisible(Parts.AUXILIARYBAR_PART)) {
			let viewContainerToRestore = this.storageService.get(AuxiliaryBarPart.activePanelSettingsKey, StorageScope.WORKSPACE, this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.AuxiliaryBar)?.id);

			if (viewContainerToRestore) {
				this.windowState.initialization.views.containerToRestore.auxiliaryBar = viewContainerToRestore;
			} else {
				this.stateModel.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN, true);
			}
		}

		// Window border
		this.updateWindowBorder(true);
	}

	private getDefaultLayoutViews(environmentService: IBrowserWorkbenchEnvironmentService, storageService: IStorageService): string[] | undefined {
		const defaultLayout = environmentService.options?.defaultLayout;
		if (!defaultLayout) {
			return undefined;
		}

		if (!defaultLayout.force && !storageService.isNew(StorageScope.WORKSPACE)) {
			return undefined;
		}

		const { views } = defaultLayout;
		if (views?.length) {
			return views.map(view => view.id);
		}

		return undefined;
	}

	private shouldRestoreEditors(contextService: IWorkspaceContextService, initialFilesToOpen: IInitialFilesToOpen | undefined): boolean {

		// Restore editors based on a set of rules:
		// - never when running on temporary workspace
		// - not when we have files to open, unless:
		// - always when `window.restoreWindows: preserve`

		if (isTemporaryWorkspace(contextService.getWorkspace())) {
			return false;
		}

		const forceRestoreEditors = this.configurationService.getValue<string>('window.restoreWindows') === 'preserve';
		return !!forceRestoreEditors || initialFilesToOpen === undefined;
	}

	protected willRestoreEditors(): boolean {
		return this.windowState.initialization.editor.restoreEditors;
	}

	private resolveEditorsToOpen(fileService: IFileService, initialFilesToOpen: IInitialFilesToOpen | undefined): Promise<IUntypedEditorInput[]> | IUntypedEditorInput[] {

		// Files to open, diff or create
		if (initialFilesToOpen) {

			// Files to diff is exclusive
			return pathsToEditors(initialFilesToOpen.filesToDiff, fileService).then(filesToDiff => {
				if (filesToDiff.length === 2) {
					const diffEditorInput: IUntypedEditorInput[] = [{
						original: { resource: filesToDiff[0].resource },
						modified: { resource: filesToDiff[1].resource },
						options: { pinned: true }
					}];

					return diffEditorInput;
				}

				// Otherwise: Open/Create files
				return pathsToEditors(initialFilesToOpen.filesToOpenOrCreate, fileService);
			});
		}

		// Empty workbench configured to open untitled file if empty
		else if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY && this.configurationService.getValue('workbench.startupEditor') === 'newUntitledFile') {
			if (this.editorGroupService.hasRestorableState) {
				return []; // do not open any empty untitled file if we restored groups/editors from previous session
			}

			return this.workingCopyBackupService.hasBackups().then(hasBackups => {
				if (hasBackups) {
					return []; // do not open any empty untitled file if we have backups to restore
				}

				return [{ resource: undefined }]; // open empty untitled file
			});
		}

		return [];
	}

	private _openedDefaultEditors: boolean = false;
	get openedDefaultEditors() { return this._openedDefaultEditors; }

	private getInitialFilesToOpen(): IInitialFilesToOpen | undefined {

		// Check for editors from `defaultLayout` options first
		const defaultLayout = this.environmentService.options?.defaultLayout;
		if (defaultLayout?.editors?.length && (defaultLayout.force || this.storageService.isNew(StorageScope.WORKSPACE))) {
			this._openedDefaultEditors = true;

			return {
				filesToOpenOrCreate: defaultLayout.editors.map<IPath>(file => {
					const legacyOverride = file.openWith;
					const legacySelection = file.selection && file.selection.start && isNumber(file.selection.start.line) ? {
						startLineNumber: file.selection.start.line,
						startColumn: isNumber(file.selection.start.column) ? file.selection.start.column : 1,
						endLineNumber: isNumber(file.selection.end.line) ? file.selection.end.line : undefined,
						endColumn: isNumber(file.selection.end.line) ? (isNumber(file.selection.end.column) ? file.selection.end.column : 1) : undefined,
					} : undefined;

					return {
						fileUri: URI.revive(file.uri),
						openOnlyIfExists: file.openOnlyIfExists,
						options: {
							selection: legacySelection,
							override: legacyOverride,
							...file.options // keep at the end to override legacy selection/override that may be `undefined`
						}
					};
				})
			};
		}

		// Then check for files to open, create or diff from main side
		const { filesToOpenOrCreate, filesToDiff } = this.environmentService;
		if (filesToOpenOrCreate || filesToDiff) {
			return { filesToOpenOrCreate, filesToDiff };
		}

		return undefined;
	}

	private readonly whenReadyPromise = new DeferredPromise<void>();
	protected readonly whenReady = this.whenReadyPromise.p;

	private readonly whenRestoredPromise = new DeferredPromise<void>();
	readonly whenRestored = this.whenRestoredPromise.p;
	private restored = false;

	isRestored(): boolean {
		return this.restored;
	}

	protected restoreParts(): void {

		// distinguish long running restore operations that
		// are required for the layout to be ready from those
		// that are needed to signal restoring is done
		const layoutReadyPromises: Promise<unknown>[] = [];
		const layoutRestoredPromises: Promise<unknown>[] = [];

		// Restore editors
		layoutReadyPromises.push((async () => {
			mark('code/willRestoreEditors');

			// first ensure the editor part is ready
			await this.editorGroupService.whenReady;

			// then see for editors to open as instructed
			// it is important that we trigger this from
			// the overall restore flow to reduce possible
			// flicker on startup: we want any editor to
			// open to get a chance to open first before
			// signaling that layout is restored, but we do
			// not need to await the editors from having
			// fully loaded.
			let editors: IUntypedEditorInput[];
			if (Array.isArray(this.windowState.initialization.editor.editorsToOpen)) {
				editors = this.windowState.initialization.editor.editorsToOpen;
			} else {
				editors = await this.windowState.initialization.editor.editorsToOpen;
			}

			let openEditorsPromise: Promise<unknown> | undefined = undefined;
			if (editors.length) {
				openEditorsPromise = this.editorService.openEditors(editors, undefined, { validateTrust: true });
			}

			// do not block the overall layout ready flow from potentially
			// slow editors to resolve on startup
			layoutRestoredPromises.push(
				Promise.all([
					openEditorsPromise,
					this.editorGroupService.whenRestored
				]).finally(() => {
					// the `code/didRestoreEditors` perf mark is specifically
					// for when visible editors have resolved, so we only mark
					// if when editor group service has restored.
					mark('code/didRestoreEditors');
				})
			);
		})());

		// Restore default views (only when `IDefaultLayout` is provided)
		const restoreDefaultViewsPromise = (async () => {
			if (this.windowState.initialization.views.defaults?.length) {
				mark('code/willOpenDefaultViews');

				const locationsRestored: { id: string; order: number }[] = [];

				const tryOpenView = (view: { id: string; order: number }): boolean => {
					const location = this.viewDescriptorService.getViewLocationById(view.id);
					if (location !== null) {
						const container = this.viewDescriptorService.getViewContainerByViewId(view.id);
						if (container) {
							if (view.order >= (locationsRestored?.[location]?.order ?? 0)) {
								locationsRestored[location] = { id: container.id, order: view.order };
							}

							const containerModel = this.viewDescriptorService.getViewContainerModel(container);
							containerModel.setCollapsed(view.id, false);
							containerModel.setVisible(view.id, true);

							return true;
						}
					}

					return false;
				};

				const defaultViews = [...this.windowState.initialization.views.defaults].reverse().map((v, index) => ({ id: v, order: index }));

				let i = defaultViews.length;
				while (i) {
					i--;
					if (tryOpenView(defaultViews[i])) {
						defaultViews.splice(i, 1);
					}
				}

				// If we still have views left over, wait until all extensions have been registered and try again
				if (defaultViews.length) {
					await this.extensionService.whenInstalledExtensionsRegistered();

					let i = defaultViews.length;
					while (i) {
						i--;
						if (tryOpenView(defaultViews[i])) {
							defaultViews.splice(i, 1);
						}
					}
				}

				// If we opened a view in the sidebar, stop any restore there
				if (locationsRestored[ViewContainerLocation.Sidebar]) {
					this.windowState.initialization.views.containerToRestore.sideBar = locationsRestored[ViewContainerLocation.Sidebar].id;
				}

				// If we opened a view in the panel, stop any restore there
				if (locationsRestored[ViewContainerLocation.Panel]) {
					this.windowState.initialization.views.containerToRestore.panel = locationsRestored[ViewContainerLocation.Panel].id;
				}

				// If we opened a view in the auxiliary bar, stop any restore there
				if (locationsRestored[ViewContainerLocation.AuxiliaryBar]) {
					this.windowState.initialization.views.containerToRestore.auxiliaryBar = locationsRestored[ViewContainerLocation.AuxiliaryBar].id;
				}

				mark('code/didOpenDefaultViews');
			}
		})();
		layoutReadyPromises.push(restoreDefaultViewsPromise);

		// Restore Sidebar
		layoutReadyPromises.push((async () => {

			// Restoring views could mean that sidebar already
			// restored, as such we need to test again
			await restoreDefaultViewsPromise;
			if (!this.windowState.initialization.views.containerToRestore.sideBar) {
				return;
			}

			mark('code/willRestoreViewlet');

			const viewlet = await this.paneCompositeService.openPaneComposite(this.windowState.initialization.views.containerToRestore.sideBar, ViewContainerLocation.Sidebar);
			if (!viewlet) {
				await this.paneCompositeService.openPaneComposite(this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.Sidebar)?.id, ViewContainerLocation.Sidebar); // fallback to default viewlet as needed
			}

			mark('code/didRestoreViewlet');
		})());

		// Restore Panel
		layoutReadyPromises.push((async () => {

			// Restoring views could mean that panel already
			// restored, as such we need to test again
			await restoreDefaultViewsPromise;
			if (!this.windowState.initialization.views.containerToRestore.panel) {
				return;
			}

			mark('code/willRestorePanel');

			const panel = await this.paneCompositeService.openPaneComposite(this.windowState.initialization.views.containerToRestore.panel, ViewContainerLocation.Panel);
			if (!panel) {
				await this.paneCompositeService.openPaneComposite(this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.Panel)?.id, ViewContainerLocation.Panel); // fallback to default panel as needed
			}

			mark('code/didRestorePanel');
		})());

		// Restore Auxiliary Bar
		layoutReadyPromises.push((async () => {

			// Restoring views could mean that panel already
			// restored, as such we need to test again
			await restoreDefaultViewsPromise;
			if (!this.windowState.initialization.views.containerToRestore.auxiliaryBar) {
				return;
			}

			mark('code/willRestoreAuxiliaryBar');

			const panel = await this.paneCompositeService.openPaneComposite(this.windowState.initialization.views.containerToRestore.auxiliaryBar, ViewContainerLocation.AuxiliaryBar);
			if (!panel) {
				await this.paneCompositeService.openPaneComposite(this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.AuxiliaryBar)?.id, ViewContainerLocation.AuxiliaryBar); // fallback to default panel as needed
			}

			mark('code/didRestoreAuxiliaryBar');
		})());

		// Restore Zen Mode
		const zenModeWasActive = this.stateModel.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE);
		const restoreZenMode = getZenModeConfiguration(this.configurationService).restore;

		if (zenModeWasActive) {
			this.stateModel.setRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE, !restoreZenMode);
			this.toggleZenMode(false, true);
		}

		// Restore Editor Center Mode
		if (this.stateModel.getRuntimeValue(LayoutStateKeys.EDITOR_CENTERED)) {
			this.centerEditorLayout(true, true);
		}

		// Await for promises that we recorded to update
		// our ready and restored states properly.
		Promises.settled(layoutReadyPromises).finally(() => {
			this.whenReadyPromise.complete();

			Promises.settled(layoutRestoredPromises).finally(() => {
				this.restored = true;
				this.whenRestoredPromise.complete();
			});
		});
	}

	registerPart(part: Part): void {
		this.parts.set(part.getId(), part);
	}

	protected getPart(key: Parts): Part {
		const part = this.parts.get(key);
		if (!part) {
			throw new Error(`Unknown part ${key}`);
		}

		return part;
	}

	registerNotifications(delegate: { onDidChangeNotificationsVisibility: Event<boolean> }): void {
		this._register(delegate.onDidChangeNotificationsVisibility(visible => this._onDidChangeNotificationsVisibility.fire(visible)));
	}

	hasFocus(part: Parts): boolean {
		const activeElement = document.activeElement;
		if (!activeElement) {
			return false;
		}

		const container = this.getContainer(part);

		return !!container && isAncestorUsingFlowTo(activeElement, container);
	}

	focusPart(part: Parts): void {
		switch (part) {
			case Parts.EDITOR_PART:
				this.editorGroupService.activeGroup.focus();
				break;
			case Parts.PANEL_PART: {
				const activePanel = this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel);
				if (activePanel) {
					activePanel.focus();
				}
				break;
			}
			case Parts.SIDEBAR_PART: {
				const activeViewlet = this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar);
				if (activeViewlet) {
					activeViewlet.focus();
				}
				break;
			}
			case Parts.ACTIVITYBAR_PART:
				(this.getPart(Parts.ACTIVITYBAR_PART) as ActivitybarPart).focus();
				break;
			case Parts.STATUSBAR_PART:
				this.statusBarService.focus();
			default: {
				// Title Bar & Banner simply pass focus to container
				const container = this.getContainer(part);
				if (container) {
					container.focus();
				}
			}
		}
	}

	getContainer(part: Parts): HTMLElement | undefined {
		if (!this.parts.get(part)) {
			return undefined;
		}

		return this.getPart(part).getContainer();
	}

	isVisible(part: Parts): boolean {
		if (this.initialized) {
			switch (part) {
				case Parts.TITLEBAR_PART:
					return this.workbenchGrid.isViewVisible(this.titleBarPartView);
				case Parts.SIDEBAR_PART:
					return !this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN);
				case Parts.PANEL_PART:
					return !this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN);
				case Parts.AUXILIARYBAR_PART:
					return !this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN);
				case Parts.STATUSBAR_PART:
					return !this.stateModel.getRuntimeValue(LayoutStateKeys.STATUSBAR_HIDDEN);
				case Parts.ACTIVITYBAR_PART:
					return !this.stateModel.getRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN);
				case Parts.EDITOR_PART:
					return !this.stateModel.getRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN);
				default:
					return false; // any other part cannot be hidden
			}
		}

		switch (part) {
			case Parts.TITLEBAR_PART:
				return this.shouldShowTitleBar();
			case Parts.SIDEBAR_PART:
				return !this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN);
			case Parts.PANEL_PART:
				return !this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN);
			case Parts.AUXILIARYBAR_PART:
				return !this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN);
			case Parts.STATUSBAR_PART:
				return !this.stateModel.getRuntimeValue(LayoutStateKeys.STATUSBAR_HIDDEN);
			case Parts.ACTIVITYBAR_PART:
				return !this.stateModel.getRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN);
			case Parts.EDITOR_PART:
				return !this.stateModel.getRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN);
			default:
				return false; // any other part cannot be hidden
		}
	}

	private shouldShowTitleBar(): boolean {

		// Using the native title bar, don't ever show the custom one
		if (getTitleBarStyle(this.configurationService) === 'native') {
			return false;
		}

		// macOS desktop does not need a title bar when full screen
		if (isMacintosh && isNative) {
			return !this.windowState.runtime.fullscreen;
		}

		// non-fullscreen native must show the title bar
		if (isNative && !this.windowState.runtime.fullscreen) {
			return true;
		}

		// remaining behavior is based on menubar visibility
		switch (getMenuBarVisibility(this.configurationService)) {
			case 'classic':
				return !this.windowState.runtime.fullscreen || this.windowState.runtime.menuBar.toggled;
			case 'compact':
			case 'hidden':
				return false;
			case 'toggle':
				return this.windowState.runtime.menuBar.toggled;
			case 'visible':
				return true;
			default:
				return isWeb ? false : !this.windowState.runtime.fullscreen || this.windowState.runtime.menuBar.toggled;
		}
	}

	focus(): void {
		this.focusPart(Parts.EDITOR_PART);
	}

	getDimension(part: Parts): Dimension | undefined {
		return this.getPart(part).dimension;
	}

	getMaximumEditorDimensions(): Dimension {
		const panelPosition = this.getPanelPosition();
		const isColumn = panelPosition === Position.RIGHT || panelPosition === Position.LEFT;
		const takenWidth =
			(this.isVisible(Parts.ACTIVITYBAR_PART) ? this.activityBarPartView.minimumWidth : 0) +
			(this.isVisible(Parts.SIDEBAR_PART) ? this.sideBarPartView.minimumWidth : 0) +
			(this.isVisible(Parts.PANEL_PART) && isColumn ? this.panelPartView.minimumWidth : 0) +
			(this.isVisible(Parts.AUXILIARYBAR_PART) ? this.auxiliaryBarPartView.minimumWidth : 0);

		const takenHeight =
			(this.isVisible(Parts.TITLEBAR_PART) ? this.titleBarPartView.minimumHeight : 0) +
			(this.isVisible(Parts.STATUSBAR_PART) ? this.statusBarPartView.minimumHeight : 0) +
			(this.isVisible(Parts.PANEL_PART) && !isColumn ? this.panelPartView.minimumHeight : 0);

		const availableWidth = this.dimension.width - takenWidth;
		const availableHeight = this.dimension.height - takenHeight;

		return new Dimension(availableWidth, availableHeight);
	}

	toggleZenMode(skipLayout?: boolean, restoring = false): void {
		this.stateModel.setRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE, !this.stateModel.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE));
		this.windowState.runtime.zenMode.transitionDisposables.clear();

		const setLineNumbers = (lineNumbers?: LineNumbersType) => {
			const setEditorLineNumbers = (editor: IEditor) => {

				// To properly reset line numbers we need to read the configuration for each editor respecting it's uri.
				if (!lineNumbers && isCodeEditor(editor) && editor.hasModel()) {
					const model = editor.getModel();
					lineNumbers = this.configurationService.getValue('editor.lineNumbers', { resource: model.uri, overrideIdentifier: model.getLanguageId() });
				}
				if (!lineNumbers) {
					lineNumbers = this.configurationService.getValue('editor.lineNumbers');
				}

				editor.updateOptions({ lineNumbers });
			};

			if (!lineNumbers) {
				// Reset line numbers on all editors visible and non-visible
				for (const editorControl of this.editorService.visibleTextEditorControls) {
					setEditorLineNumbers(editorControl);
				}
			} else {
				for (const editorControl of this.editorService.visibleTextEditorControls) {
					setEditorLineNumbers(editorControl);
				}
			}
		};

		// Check if zen mode transitioned to full screen and if now we are out of zen mode
		// -> we need to go out of full screen (same goes for the centered editor layout)
		let toggleFullScreen = false;
		const config = getZenModeConfiguration(this.configurationService);
		const zenModeExitInfo = this.stateModel.getRuntimeValue(LayoutStateKeys.ZEN_MODE_EXIT_INFO);

		// Zen Mode Active
		if (this.stateModel.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE)) {

			toggleFullScreen = !this.windowState.runtime.fullscreen && config.fullScreen && !isIOS;

			if (!restoring) {
				zenModeExitInfo.transitionedToFullScreen = toggleFullScreen;
				zenModeExitInfo.transitionedToCenteredEditorLayout = !this.isEditorLayoutCentered() && config.centerLayout;
				zenModeExitInfo.wasVisible.sideBar = this.isVisible(Parts.SIDEBAR_PART);
				zenModeExitInfo.wasVisible.panel = this.isVisible(Parts.PANEL_PART);
				zenModeExitInfo.wasVisible.auxiliaryBar = this.isVisible(Parts.AUXILIARYBAR_PART);
				this.stateModel.setRuntimeValue(LayoutStateKeys.ZEN_MODE_EXIT_INFO, zenModeExitInfo);
			}

			this.setPanelHidden(true, true);
			this.setAuxiliaryBarHidden(true, true);
			this.setSideBarHidden(true, true);

			if (config.hideActivityBar) {
				this.setActivityBarHidden(true, true);
			}

			if (config.hideStatusBar) {
				this.setStatusBarHidden(true, true);
			}

			if (config.hideLineNumbers) {
				setLineNumbers('off');
				this.windowState.runtime.zenMode.transitionDisposables.add(this.editorService.onDidVisibleEditorsChange(() => setLineNumbers('off')));
			}

			if (config.hideTabs && this.editorGroupService.partOptions.showTabs) {
				this.windowState.runtime.zenMode.transitionDisposables.add(this.editorGroupService.enforcePartOptions({ showTabs: false }));
			}

			if (config.silentNotifications) {
				this.notificationService.setFilter(NotificationsFilter.ERROR);
			}
			this.windowState.runtime.zenMode.transitionDisposables.add(this.configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(WorkbenchLayoutSettings.ZEN_MODE_SILENT_NOTIFICATIONS)) {
					const filter = this.configurationService.getValue(WorkbenchLayoutSettings.ZEN_MODE_SILENT_NOTIFICATIONS) ? NotificationsFilter.ERROR : NotificationsFilter.OFF;
					this.notificationService.setFilter(filter);
				}
			}));

			if (config.centerLayout) {
				this.centerEditorLayout(true, true);
			}
		}

		// Zen Mode Inactive
		else {
			if (zenModeExitInfo.wasVisible.panel) {
				this.setPanelHidden(false, true);
			}

			if (zenModeExitInfo.wasVisible.auxiliaryBar) {
				this.setAuxiliaryBarHidden(false, true);
			}

			if (zenModeExitInfo.wasVisible.sideBar) {
				this.setSideBarHidden(false, true);
			}

			if (!this.stateModel.getRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN, true)) {
				this.setActivityBarHidden(false, true);
			}

			if (!this.stateModel.getRuntimeValue(LayoutStateKeys.STATUSBAR_HIDDEN, true)) {
				this.setStatusBarHidden(false, true);
			}

			if (zenModeExitInfo.transitionedToCenteredEditorLayout) {
				this.centerEditorLayout(false, true);
			}

			setLineNumbers();

			this.focus();

			// Clear notifications filter
			this.notificationService.setFilter(NotificationsFilter.OFF);

			toggleFullScreen = zenModeExitInfo.transitionedToFullScreen && this.windowState.runtime.fullscreen;
		}

		if (!skipLayout) {
			this.layout();
		}

		if (toggleFullScreen) {
			this.hostService.toggleFullScreen();
		}

		// Event
		this._onDidChangeZenMode.fire(this.stateModel.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE));
	}

	private setStatusBarHidden(hidden: boolean, skipLayout?: boolean): void {
		this.stateModel.setRuntimeValue(LayoutStateKeys.STATUSBAR_HIDDEN, hidden);

		// Adjust CSS
		if (hidden) {
			this.container.classList.add(WorkbenchLayoutClasses.STATUSBAR_HIDDEN);
		} else {
			this.container.classList.remove(WorkbenchLayoutClasses.STATUSBAR_HIDDEN);
		}

		// Propagate to grid
		this.workbenchGrid.setViewVisible(this.statusBarPartView, !hidden);
	}

	protected createWorkbenchLayout(): void {
		const titleBar = this.getPart(Parts.TITLEBAR_PART);
		const bannerPart = this.getPart(Parts.BANNER_PART);
		const editorPart = this.getPart(Parts.EDITOR_PART);
		const activityBar = this.getPart(Parts.ACTIVITYBAR_PART);
		const panelPart = this.getPart(Parts.PANEL_PART);
		const auxiliaryBarPart = this.getPart(Parts.AUXILIARYBAR_PART);
		const sideBar = this.getPart(Parts.SIDEBAR_PART);
		const statusBar = this.getPart(Parts.STATUSBAR_PART);

		// View references for all parts
		this.titleBarPartView = titleBar;
		this.bannerPartView = bannerPart;
		this.sideBarPartView = sideBar;
		this.activityBarPartView = activityBar;
		this.editorPartView = editorPart;
		this.panelPartView = panelPart;
		this.auxiliaryBarPartView = auxiliaryBarPart;
		this.statusBarPartView = statusBar;

		const viewMap = {
			[Parts.ACTIVITYBAR_PART]: this.activityBarPartView,
			[Parts.BANNER_PART]: this.bannerPartView,
			[Parts.TITLEBAR_PART]: this.titleBarPartView,
			[Parts.EDITOR_PART]: this.editorPartView,
			[Parts.PANEL_PART]: this.panelPartView,
			[Parts.SIDEBAR_PART]: this.sideBarPartView,
			[Parts.STATUSBAR_PART]: this.statusBarPartView,
			[Parts.AUXILIARYBAR_PART]: this.auxiliaryBarPartView
		};

		const fromJSON = ({ type }: { type: Parts }) => viewMap[type];
		const workbenchGrid = SerializableGrid.deserialize(
			this.createGridDescriptor(),
			{ fromJSON },
			{ proportionalLayout: false }
		);

		this.container.prepend(workbenchGrid.element);
		this.container.setAttribute('role', 'application');
		this.workbenchGrid = workbenchGrid;
		this.workbenchGrid.edgeSnapping = this.windowState.runtime.fullscreen;

		for (const part of [titleBar, editorPart, activityBar, panelPart, sideBar, statusBar, auxiliaryBarPart]) {
			this._register(part.onDidVisibilityChange((visible) => {
				if (part === sideBar) {
					this.setSideBarHidden(!visible, true);
				} else if (part === panelPart) {
					this.setPanelHidden(!visible, true);
				} else if (part === auxiliaryBarPart) {
					this.setAuxiliaryBarHidden(!visible, true);
				} else if (part === editorPart) {
					this.setEditorHidden(!visible, true);
				}
				this._onDidChangePartVisibility.fire();
			}));
		}

		this._register(this.storageService.onWillSaveState(willSaveState => {
			if (willSaveState.reason === WillSaveStateReason.SHUTDOWN) {
				// Side Bar Size
				const sideBarSize = this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN)
					? this.workbenchGrid.getViewCachedVisibleSize(this.sideBarPartView)
					: this.workbenchGrid.getViewSize(this.sideBarPartView).width;
				this.stateModel.setInitializationValue(LayoutStateKeys.SIDEBAR_SIZE, sideBarSize as number);

				// Panel Size
				const panelSize = this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN)
					? this.workbenchGrid.getViewCachedVisibleSize(this.panelPartView)
					: (this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_POSITION) === Position.BOTTOM ? this.workbenchGrid.getViewSize(this.panelPartView).height : this.workbenchGrid.getViewSize(this.panelPartView).width);
				this.stateModel.setInitializationValue(LayoutStateKeys.PANEL_SIZE, panelSize as number);

				// Auxiliary Bar Size
				const auxiliaryBarSize = this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN)
					? this.workbenchGrid.getViewCachedVisibleSize(this.auxiliaryBarPartView)
					: this.workbenchGrid.getViewSize(this.auxiliaryBarPartView).width;
				this.stateModel.setInitializationValue(LayoutStateKeys.AUXILIARYBAR_SIZE, auxiliaryBarSize as number);

				this.stateModel.save(true, true);
			}
		}));
	}

	private getClientArea(): Dimension {
		return getClientArea(this.parent);
	}

	layout(): void {
		if (!this.disposed) {
			this._dimension = this.getClientArea();
			this.logService.trace(`Layout#layout, height: ${this._dimension.height}, width: ${this._dimension.width}`);

			position(this.container, 0, 0, 0, 0, 'relative');
			size(this.container, this._dimension.width, this._dimension.height);

			// Layout the grid widget
			this.workbenchGrid.layout(this._dimension.width, this._dimension.height);
			this.initialized = true;

			// Emit as event
			this._onDidLayout.fire(this._dimension);
		}
	}

	isEditorLayoutCentered(): boolean {
		return this.stateModel.getRuntimeValue(LayoutStateKeys.EDITOR_CENTERED);
	}

	centerEditorLayout(active: boolean, skipLayout?: boolean): void {
		this.stateModel.setRuntimeValue(LayoutStateKeys.EDITOR_CENTERED, active);

		let smartActive = active;
		const activeEditor = this.editorService.activeEditor;

		let isEditorSplit = false;
		if (activeEditor instanceof DiffEditorInput) {
			isEditorSplit = this.configurationService.getValue('diffEditor.renderSideBySide');
		} else if (activeEditor instanceof SideBySideEditorInput) {
			isEditorSplit = true;
		}

		const isCenteredLayoutAutoResizing = this.configurationService.getValue('workbench.editor.centeredLayoutAutoResize');
		if (
			isCenteredLayoutAutoResizing &&
			(this.editorGroupService.groups.length > 1 || isEditorSplit)
		) {
			smartActive = false;
		}

		// Enter Centered Editor Layout
		if (this.editorGroupService.isLayoutCentered() !== smartActive) {
			this.editorGroupService.centerLayout(smartActive);

			if (!skipLayout) {
				this.layout();
			}
		}

		this._onDidChangeCenteredLayout.fire(this.stateModel.getRuntimeValue(LayoutStateKeys.EDITOR_CENTERED));
	}

	resizePart(part: Parts, sizeChangeWidth: number, sizeChangeHeight: number): void {
		const sizeChangePxWidth = this.workbenchGrid.width * sizeChangeWidth / 100;
		const sizeChangePxHeight = this.workbenchGrid.height * sizeChangeHeight / 100;

		let viewSize: IViewSize;

		switch (part) {
			case Parts.SIDEBAR_PART:
				viewSize = this.workbenchGrid.getViewSize(this.sideBarPartView);
				this.workbenchGrid.resizeView(this.sideBarPartView,
					{
						width: viewSize.width + sizeChangePxWidth,
						height: viewSize.height
					});

				break;
			case Parts.PANEL_PART:
				viewSize = this.workbenchGrid.getViewSize(this.panelPartView);

				this.workbenchGrid.resizeView(this.panelPartView,
					{
						width: viewSize.width + (this.getPanelPosition() !== Position.BOTTOM ? sizeChangePxWidth : 0),
						height: viewSize.height + (this.getPanelPosition() !== Position.BOTTOM ? 0 : sizeChangePxHeight)
					});

				break;
			case Parts.AUXILIARYBAR_PART:
				viewSize = this.workbenchGrid.getViewSize(this.auxiliaryBarPartView);
				this.workbenchGrid.resizeView(this.auxiliaryBarPartView,
					{
						width: viewSize.width + sizeChangePxWidth,
						height: viewSize.height
					});
				break;
			case Parts.EDITOR_PART:
				viewSize = this.workbenchGrid.getViewSize(this.editorPartView);

				// Single Editor Group
				if (this.editorGroupService.count === 1) {
					this.workbenchGrid.resizeView(this.editorPartView,
						{
							width: viewSize.width + sizeChangePxWidth,
							height: viewSize.height + sizeChangePxHeight
						});
				} else {
					const activeGroup = this.editorGroupService.activeGroup;

					const { width, height } = this.editorGroupService.getSize(activeGroup);
					this.editorGroupService.setSize(activeGroup, { width: width + sizeChangePxWidth, height: height + sizeChangePxHeight });

					// After resizing the editor group
					// if it does not change in either direction
					// try resizing the full editor part
					const { width: newWidth, height: newHeight } = this.editorGroupService.getSize(activeGroup);
					if ((sizeChangePxHeight && height === newHeight) || (sizeChangePxWidth && width === newWidth)) {
						this.workbenchGrid.resizeView(this.editorPartView,
							{
								width: viewSize.width + (sizeChangePxWidth && width === newWidth ? sizeChangePxWidth : 0),
								height: viewSize.height + (sizeChangePxHeight && height === newHeight ? sizeChangePxHeight : 0)
							});
					}
				}

				break;
			default:
				return; // Cannot resize other parts
		}
	}

	private setActivityBarHidden(hidden: boolean, skipLayout?: boolean): void {
		// Propagate to grid
		this.stateModel.setRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN, hidden);
		this.workbenchGrid.setViewVisible(this.activityBarPartView, !hidden);
	}

	private setBannerHidden(hidden: boolean): void {
		this.workbenchGrid.setViewVisible(this.bannerPartView, !hidden);
	}

	private setEditorHidden(hidden: boolean, skipLayout?: boolean): void {
		this.stateModel.setRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN, hidden);

		// Adjust CSS
		if (hidden) {
			this.container.classList.add(WorkbenchLayoutClasses.EDITOR_HIDDEN);
		} else {
			this.container.classList.remove(WorkbenchLayoutClasses.EDITOR_HIDDEN);
		}

		// Propagate to grid
		this.workbenchGrid.setViewVisible(this.editorPartView, !hidden);

		// The editor and panel cannot be hidden at the same time
		if (hidden && !this.isVisible(Parts.PANEL_PART)) {
			this.setPanelHidden(false, true);
		}
	}

	getLayoutClasses(): string[] {
		return coalesce([
			!this.isVisible(Parts.SIDEBAR_PART) ? WorkbenchLayoutClasses.SIDEBAR_HIDDEN : undefined,
			!this.isVisible(Parts.EDITOR_PART) ? WorkbenchLayoutClasses.EDITOR_HIDDEN : undefined,
			!this.isVisible(Parts.PANEL_PART) ? WorkbenchLayoutClasses.PANEL_HIDDEN : undefined,
			!this.isVisible(Parts.AUXILIARYBAR_PART) ? WorkbenchLayoutClasses.AUXILIARYBAR_HIDDEN : undefined,
			!this.isVisible(Parts.STATUSBAR_PART) ? WorkbenchLayoutClasses.STATUSBAR_HIDDEN : undefined,
			this.windowState.runtime.fullscreen ? WorkbenchLayoutClasses.FULLSCREEN : undefined
		]);
	}

	private setSideBarHidden(hidden: boolean, skipLayout?: boolean): void {
		this.stateModel.setRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN, hidden);

		// Adjust CSS
		if (hidden) {
			this.container.classList.add(WorkbenchLayoutClasses.SIDEBAR_HIDDEN);
		} else {
			this.container.classList.remove(WorkbenchLayoutClasses.SIDEBAR_HIDDEN);
		}

		// If sidebar becomes hidden, also hide the current active Viewlet if any
		if (hidden && this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar)) {
			this.paneCompositeService.hideActivePaneComposite(ViewContainerLocation.Sidebar);

			// Pass Focus to Editor or Panel if Sidebar is now hidden
			const activePanel = this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel);
			if (this.hasFocus(Parts.PANEL_PART) && activePanel) {
				activePanel.focus();
			} else {
				this.focus();
			}
		}

		// If sidebar becomes visible, show last active Viewlet or default viewlet
		else if (!hidden && !this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar)) {
			const viewletToOpen = this.paneCompositeService.getLastActivePaneCompositeId(ViewContainerLocation.Sidebar);
			if (viewletToOpen) {
				const viewlet = this.paneCompositeService.openPaneComposite(viewletToOpen, ViewContainerLocation.Sidebar, true);
				if (!viewlet) {
					this.paneCompositeService.openPaneComposite(this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.Sidebar)?.id, ViewContainerLocation.Sidebar, true);
				}
			}
		}

		// Propagate to grid
		this.workbenchGrid.setViewVisible(this.sideBarPartView, !hidden);
	}

	private hasViews(id: string): boolean {
		const viewContainer = this.viewDescriptorService.getViewContainerById(id);
		if (!viewContainer) {
			return false;
		}

		const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
		if (!viewContainerModel) {
			return false;
		}

		return viewContainerModel.activeViewDescriptors.length >= 1;
	}

	private adjustPartPositions(sideBarPosition: Position, panelAlignment: PanelAlignment, panelPosition: Position): void {

		// Move activity bar and side bars
		const sideBarSiblingToEditor = panelPosition !== Position.BOTTOM || !(panelAlignment === 'center' || (sideBarPosition === Position.LEFT && panelAlignment === 'right') || (sideBarPosition === Position.RIGHT && panelAlignment === 'left'));
		const auxiliaryBarSiblingToEditor = panelPosition !== Position.BOTTOM || !(panelAlignment === 'center' || (sideBarPosition === Position.RIGHT && panelAlignment === 'right') || (sideBarPosition === Position.LEFT && panelAlignment === 'left'));
		const preMovePanelWidth = !this.isVisible(Parts.PANEL_PART) ? Sizing.Invisible(this.workbenchGrid.getViewCachedVisibleSize(this.panelPartView) ?? this.panelPartView.minimumWidth) : this.workbenchGrid.getViewSize(this.panelPartView).width;
		const preMovePanelHeight = !this.isVisible(Parts.PANEL_PART) ? Sizing.Invisible(this.workbenchGrid.getViewCachedVisibleSize(this.panelPartView) ?? this.panelPartView.minimumHeight) : this.workbenchGrid.getViewSize(this.panelPartView).height;
		const preMoveSideBarSize = !this.isVisible(Parts.SIDEBAR_PART) ? Sizing.Invisible(this.workbenchGrid.getViewCachedVisibleSize(this.sideBarPartView) ?? this.sideBarPartView.minimumWidth) : this.workbenchGrid.getViewSize(this.sideBarPartView).width;
		const preMoveAuxiliaryBarSize = !this.isVisible(Parts.AUXILIARYBAR_PART) ? Sizing.Invisible(this.workbenchGrid.getViewCachedVisibleSize(this.auxiliaryBarPartView) ?? this.auxiliaryBarPartView.minimumWidth) : this.workbenchGrid.getViewSize(this.auxiliaryBarPartView).width;

		if (sideBarPosition === Position.LEFT) {
			this.workbenchGrid.moveViewTo(this.activityBarPartView, [2, 0]);
			this.workbenchGrid.moveView(this.sideBarPartView, preMoveSideBarSize, sideBarSiblingToEditor ? this.editorPartView : this.activityBarPartView, sideBarSiblingToEditor ? Direction.Left : Direction.Right);
			if (auxiliaryBarSiblingToEditor) {
				this.workbenchGrid.moveView(this.auxiliaryBarPartView, preMoveAuxiliaryBarSize, this.editorPartView, Direction.Right);
			} else {
				this.workbenchGrid.moveViewTo(this.auxiliaryBarPartView, [2, -1]);
			}
		} else {
			this.workbenchGrid.moveViewTo(this.activityBarPartView, [2, -1]);
			this.workbenchGrid.moveView(this.sideBarPartView, preMoveSideBarSize, sideBarSiblingToEditor ? this.editorPartView : this.activityBarPartView, sideBarSiblingToEditor ? Direction.Right : Direction.Left);
			if (auxiliaryBarSiblingToEditor) {
				this.workbenchGrid.moveView(this.auxiliaryBarPartView, preMoveAuxiliaryBarSize, this.editorPartView, Direction.Left);
			} else {
				this.workbenchGrid.moveViewTo(this.auxiliaryBarPartView, [2, 0]);
			}
		}

		// We moved all the side parts based on the editor and ignored the panel
		// Now, we need to put the panel back in the right position when it is next to the editor
		if (panelPosition !== Position.BOTTOM) {
			this.workbenchGrid.moveView(this.panelPartView, preMovePanelWidth, this.editorPartView, panelPosition === Position.LEFT ? Direction.Left : Direction.Right);
			this.workbenchGrid.resizeView(this.panelPartView, {
				height: preMovePanelHeight as number,
				width: preMovePanelWidth as number
			});
		}

		// Moving views in the grid can cause them to re-distribute sizing unnecessarily
		// Resize visible parts to the width they were before the operation
		if (this.isVisible(Parts.SIDEBAR_PART)) {
			this.workbenchGrid.resizeView(this.sideBarPartView, {
				height: this.workbenchGrid.getViewSize(this.sideBarPartView).height,
				width: preMoveSideBarSize as number
			});
		}

		if (this.isVisible(Parts.AUXILIARYBAR_PART)) {
			this.workbenchGrid.resizeView(this.auxiliaryBarPartView, {
				height: this.workbenchGrid.getViewSize(this.auxiliaryBarPartView).height,
				width: preMoveAuxiliaryBarSize as number
			});
		}
	}

	setPanelAlignment(alignment: PanelAlignment, skipLayout?: boolean): void {

		// Panel alignment only applies to a panel in the bottom position
		if (this.getPanelPosition() !== Position.BOTTOM) {
			this.setPanelPosition(Position.BOTTOM);
		}

		// the workbench grid currently prevents us from supporting panel maximization with non-center panel alignment
		if (alignment !== 'center' && this.isPanelMaximized()) {
			this.toggleMaximizedPanel();
		}

		this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_ALIGNMENT, alignment);

		this.adjustPartPositions(this.getSideBarPosition(), alignment, this.getPanelPosition());

		this._onDidChangePanelAlignment.fire(alignment);
	}

	private setPanelHidden(hidden: boolean, skipLayout?: boolean): void {

		// Return if not initialized fully #105480
		if (!this.workbenchGrid) {
			return;
		}

		const wasHidden = !this.isVisible(Parts.PANEL_PART);

		this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_HIDDEN, hidden);

		const isPanelMaximized = this.isPanelMaximized();
		const panelOpensMaximized = this.panelOpensMaximized();

		// Adjust CSS
		if (hidden) {
			this.container.classList.add(WorkbenchLayoutClasses.PANEL_HIDDEN);
		} else {
			this.container.classList.remove(WorkbenchLayoutClasses.PANEL_HIDDEN);
		}

		// If panel part becomes hidden, also hide the current active panel if any
		let focusEditor = false;
		if (hidden && this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel)) {
			this.paneCompositeService.hideActivePaneComposite(ViewContainerLocation.Panel);
			focusEditor = isIOS ? false : true; // Do not auto focus on ios #127832
		}

		// If panel part becomes visible, show last active panel or default panel
		else if (!hidden && !this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel)) {
			let panelToOpen: string | undefined = this.paneCompositeService.getLastActivePaneCompositeId(ViewContainerLocation.Panel);

			// verify that the panel we try to open has views before we default to it
			// otherwise fall back to any view that has views still refs #111463
			if (!panelToOpen || !this.hasViews(panelToOpen)) {
				panelToOpen = this.viewDescriptorService
					.getViewContainersByLocation(ViewContainerLocation.Panel)
					.find(viewContainer => this.hasViews(viewContainer.id))?.id;
			}

			if (panelToOpen) {
				const focus = !skipLayout;
				this.paneCompositeService.openPaneComposite(panelToOpen, ViewContainerLocation.Panel, focus);
			}
		}

		// If maximized and in process of hiding, unmaximize before hiding to allow caching of non-maximized size
		if (hidden && isPanelMaximized) {
			this.toggleMaximizedPanel();
		}

		// Don't proceed if we have already done this before
		if (wasHidden === hidden) {
			return;
		}

		// Propagate layout changes to grid
		this.workbenchGrid.setViewVisible(this.panelPartView, !hidden);

		// If in process of showing, toggle whether or not panel is maximized
		if (!hidden) {
			if (!skipLayout && isPanelMaximized !== panelOpensMaximized) {
				this.toggleMaximizedPanel();
			}
		}
		else {
			// If in process of hiding, remember whether the panel is maximized or not
			this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_WAS_LAST_MAXIMIZED, isPanelMaximized);
		}

		if (focusEditor) {
			this.editorGroupService.activeGroup.focus(); // Pass focus to editor group if panel part is now hidden
		}
	}

	toggleMaximizedPanel(): void {
		const size = this.workbenchGrid.getViewSize(this.panelPartView);
		const panelPosition = this.getPanelPosition();
		const isMaximized = this.isPanelMaximized();
		if (!isMaximized) {
			if (this.isVisible(Parts.PANEL_PART)) {
				if (panelPosition === Position.BOTTOM) {
					this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT, size.height);
				} else {
					this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_WIDTH, size.width);
				}
			}

			this.setEditorHidden(true);
		} else {
			this.setEditorHidden(false);
			this.workbenchGrid.resizeView(this.panelPartView, {
				width: panelPosition === Position.BOTTOM ? size.width : this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_WIDTH),
				height: panelPosition === Position.BOTTOM ? this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT) : size.height
			});
		}
		this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_WAS_LAST_MAXIMIZED, !isMaximized);
	}

	/**
	 * Returns whether or not the panel opens maximized
	 */
	private panelOpensMaximized(): boolean {

		// The workbench grid currently prevents us from supporting panel maximization with non-center panel alignment
		if (this.getPanelAlignment() !== 'center' && this.getPanelPosition() === Position.BOTTOM) {
			return false;
		}

		const panelOpensMaximized = panelOpensMaximizedFromString(this.configurationService.getValue<string>(WorkbenchLayoutSettings.PANEL_OPENS_MAXIMIZED));
		const panelLastIsMaximized = this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_WAS_LAST_MAXIMIZED);

		return panelOpensMaximized === PanelOpensMaximizedOptions.ALWAYS || (panelOpensMaximized === PanelOpensMaximizedOptions.REMEMBER_LAST && panelLastIsMaximized);
	}

	private setAuxiliaryBarHidden(hidden: boolean, skipLayout?: boolean): void {
		this.stateModel.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN, hidden);

		// Adjust CSS
		if (hidden) {
			this.container.classList.add(WorkbenchLayoutClasses.AUXILIARYBAR_HIDDEN);
		} else {
			this.container.classList.remove(WorkbenchLayoutClasses.AUXILIARYBAR_HIDDEN);
		}

		// If auxiliary bar becomes hidden, also hide the current active pane composite if any
		if (hidden && this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)) {
			this.paneCompositeService.hideActivePaneComposite(ViewContainerLocation.AuxiliaryBar);

			// Pass Focus to Editor or Panel if Auxiliary Bar is now hidden
			const activePanel = this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel);
			if (this.hasFocus(Parts.PANEL_PART) && activePanel) {
				activePanel.focus();
			} else {
				this.focus();
			}
		}

		// If auxiliary bar becomes visible, show last active pane composite or default pane composite
		else if (!hidden && !this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)) {
			let panelToOpen: string | undefined = this.paneCompositeService.getLastActivePaneCompositeId(ViewContainerLocation.AuxiliaryBar);

			// verify that the panel we try to open has views before we default to it
			// otherwise fall back to any view that has views still refs #111463
			if (!panelToOpen || !this.hasViews(panelToOpen)) {
				panelToOpen = this.viewDescriptorService
					.getViewContainersByLocation(ViewContainerLocation.AuxiliaryBar)
					.find(viewContainer => this.hasViews(viewContainer.id))?.id;
			}

			if (panelToOpen) {
				const focus = !skipLayout;
				this.paneCompositeService.openPaneComposite(panelToOpen, ViewContainerLocation.AuxiliaryBar, focus);
			}
		}

		// Propagate to grid
		this.workbenchGrid.setViewVisible(this.auxiliaryBarPartView, !hidden);
	}

	setPartHidden(hidden: boolean, part: Parts): void {
		switch (part) {
			case Parts.ACTIVITYBAR_PART:
				return this.setActivityBarHidden(hidden);
			case Parts.SIDEBAR_PART:
				return this.setSideBarHidden(hidden);
			case Parts.EDITOR_PART:
				return this.setEditorHidden(hidden);
			case Parts.BANNER_PART:
				return this.setBannerHidden(hidden);
			case Parts.AUXILIARYBAR_PART:
				return this.setAuxiliaryBarHidden(hidden);
			case Parts.PANEL_PART:
				return this.setPanelHidden(hidden);
		}
	}

	hasWindowBorder(): boolean {
		return this.windowState.runtime.windowBorder;
	}

	getWindowBorderWidth(): number {
		return this.windowState.runtime.windowBorder ? 2 : 0;
	}

	getWindowBorderRadius(): string | undefined {
		return this.windowState.runtime.windowBorder && isMacintosh ? '5px' : undefined;
	}

	isPanelMaximized(): boolean {

		// the workbench grid currently prevents us from supporting panel maximization with non-center panel alignment
		return (this.getPanelAlignment() === 'center' || this.getPanelPosition() !== Position.BOTTOM) && !this.isVisible(Parts.EDITOR_PART);
	}

	getSideBarPosition(): Position {
		return this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON);
	}

	getPanelAlignment(): PanelAlignment {
		return this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_ALIGNMENT);
	}

	updateMenubarVisibility(skipLayout: boolean): void {
		const shouldShowTitleBar = this.shouldShowTitleBar();
		if (!skipLayout && this.workbenchGrid && shouldShowTitleBar !== this.isVisible(Parts.TITLEBAR_PART)) {
			this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowTitleBar);
		}
	}

	toggleMenuBar(): void {
		let currentVisibilityValue = getMenuBarVisibility(this.configurationService);
		if (typeof currentVisibilityValue !== 'string') {
			currentVisibilityValue = 'classic';
		}

		let newVisibilityValue: string;
		if (currentVisibilityValue === 'visible' || currentVisibilityValue === 'classic') {
			newVisibilityValue = getTitleBarStyle(this.configurationService) === 'native' ? 'toggle' : 'compact';
		} else {
			newVisibilityValue = 'classic';
		}

		this.configurationService.updateValue('window.menuBarVisibility', newVisibilityValue);
	}

	getPanelPosition(): Position {
		return this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_POSITION);
	}

	setPanelPosition(position: Position): void {
		if (!this.isVisible(Parts.PANEL_PART)) {
			this.setPanelHidden(false);
		}

		const panelPart = this.getPart(Parts.PANEL_PART);
		const oldPositionValue = positionToString(this.getPanelPosition());
		const newPositionValue = positionToString(position);

		// Adjust CSS
		const panelContainer = assertIsDefined(panelPart.getContainer());
		panelContainer.classList.remove(oldPositionValue);
		panelContainer.classList.add(newPositionValue);

		// Update Styles
		panelPart.updateStyles();

		// Layout
		const size = this.workbenchGrid.getViewSize(this.panelPartView);
		const sideBarSize = this.workbenchGrid.getViewSize(this.sideBarPartView);
		const auxiliaryBarSize = this.workbenchGrid.getViewSize(this.auxiliaryBarPartView);

		let editorHidden = !this.isVisible(Parts.EDITOR_PART);

		// Save last non-maximized size for panel before move
		if (newPositionValue !== oldPositionValue && !editorHidden) {

			// Save the current size of the panel for the new orthogonal direction
			// If moving down, save the width of the panel
			// Otherwise, save the height of the panel
			if (position === Position.BOTTOM) {
				this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_WIDTH, size.width);
			} else if (positionFromString(oldPositionValue) === Position.BOTTOM) {
				this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT, size.height);
			}
		}

		if (position === Position.BOTTOM && this.getPanelAlignment() !== 'center' && editorHidden) {
			this.toggleMaximizedPanel();
			editorHidden = false;
		}

		this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_POSITION, position);

		const sideBarVisible = this.isVisible(Parts.SIDEBAR_PART);
		const auxiliaryBarVisible = this.isVisible(Parts.AUXILIARYBAR_PART);

		if (position === Position.BOTTOM) {
			this.workbenchGrid.moveView(this.panelPartView, editorHidden ? size.height : this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT), this.editorPartView, Direction.Down);
		} else if (position === Position.RIGHT) {
			this.workbenchGrid.moveView(this.panelPartView, editorHidden ? size.width : this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_WIDTH), this.editorPartView, Direction.Right);
		} else {
			this.workbenchGrid.moveView(this.panelPartView, editorHidden ? size.width : this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_WIDTH), this.editorPartView, Direction.Left);
		}

		// Reset sidebar to original size before shifting the panel
		this.workbenchGrid.resizeView(this.sideBarPartView, sideBarSize);
		if (!sideBarVisible) {
			this.setSideBarHidden(true);
		}

		this.workbenchGrid.resizeView(this.auxiliaryBarPartView, auxiliaryBarSize);
		if (!auxiliaryBarVisible) {
			this.setAuxiliaryBarHidden(true);
		}

		if (position === Position.BOTTOM) {
			this.adjustPartPositions(this.getSideBarPosition(), this.getPanelAlignment(), position);
		}

		this._onDidChangePanelPosition.fire(newPositionValue);
	}

	isWindowMaximized() {
		return this.windowState.runtime.maximized;
	}

	updateWindowMaximizedState(maximized: boolean) {
		this.container.classList.toggle(WorkbenchLayoutClasses.MAXIMIZED, maximized);

		if (this.windowState.runtime.maximized === maximized) {
			return;
		}

		this.windowState.runtime.maximized = maximized;

		this.updateWindowBorder();
		this._onDidChangeWindowMaximized.fire(maximized);
	}

	getVisibleNeighborPart(part: Parts, direction: Direction): Parts | undefined {
		if (!this.workbenchGrid) {
			return undefined;
		}

		if (!this.isVisible(part)) {
			return undefined;
		}

		const neighborViews = this.workbenchGrid.getNeighborViews(this.getPart(part), direction, false);

		if (!neighborViews) {
			return undefined;
		}

		for (const neighborView of neighborViews) {
			const neighborPart =
				[Parts.ACTIVITYBAR_PART, Parts.EDITOR_PART, Parts.PANEL_PART, Parts.AUXILIARYBAR_PART, Parts.SIDEBAR_PART, Parts.STATUSBAR_PART, Parts.TITLEBAR_PART]
					.find(partId => this.getPart(partId) === neighborView && this.isVisible(partId));

			if (neighborPart !== undefined) {
				return neighborPart;
			}
		}

		return undefined;
	}

	private arrangeEditorNodes(nodes: { editor: ISerializedNode; sideBar?: ISerializedNode; auxiliaryBar?: ISerializedNode }, availableHeight: number, availableWidth: number): ISerializedNode {
		if (!nodes.sideBar && !nodes.auxiliaryBar) {
			nodes.editor.size = availableHeight;
			return nodes.editor;
		}

		const result = [nodes.editor];
		nodes.editor.size = availableWidth;
		if (nodes.sideBar) {
			if (this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON) === Position.LEFT) {
				result.splice(0, 0, nodes.sideBar);
			} else {
				result.push(nodes.sideBar);
			}

			nodes.editor.size -= this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN) ? 0 : nodes.sideBar.size;
		}

		if (nodes.auxiliaryBar) {
			if (this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON) === Position.RIGHT) {
				result.splice(0, 0, nodes.auxiliaryBar);
			} else {
				result.push(nodes.auxiliaryBar);
			}

			nodes.editor.size -= this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN) ? 0 : nodes.auxiliaryBar.size;
		}

		return {
			type: 'branch',
			data: result,
			size: availableHeight
		};
	}

	private arrangeMiddleSectionNodes(nodes: { editor: ISerializedNode; panel: ISerializedNode; activityBar: ISerializedNode; sideBar: ISerializedNode; auxiliaryBar: ISerializedNode }, availableWidth: number, availableHeight: number): ISerializedNode[] {
		const activityBarSize = this.stateModel.getRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN) ? 0 : nodes.activityBar.size;
		const sideBarSize = this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN) ? 0 : nodes.sideBar.size;
		const auxiliaryBarSize = this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN) ? 0 : nodes.auxiliaryBar.size;
		const panelSize = this.stateModel.getInitializationValue(LayoutStateKeys.PANEL_SIZE) ? 0 : nodes.panel.size;

		const result = [] as ISerializedNode[];
		if (this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_POSITION) !== Position.BOTTOM) {
			result.push(nodes.editor);
			nodes.editor.size = availableWidth - activityBarSize - sideBarSize - panelSize - auxiliaryBarSize;
			if (this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_POSITION) === Position.RIGHT) {
				result.push(nodes.panel);
			} else {
				result.splice(0, 0, nodes.panel);
			}

			if (this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON) === Position.LEFT) {
				result.push(nodes.auxiliaryBar);
				result.splice(0, 0, nodes.sideBar);
				result.splice(0, 0, nodes.activityBar);
			} else {
				result.splice(0, 0, nodes.auxiliaryBar);
				result.push(nodes.sideBar);
				result.push(nodes.activityBar);
			}
		} else {
			const panelAlignment = this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_ALIGNMENT);
			const sideBarPosition = this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON);
			const sideBarNextToEditor = !(panelAlignment === 'center' || (sideBarPosition === Position.LEFT && panelAlignment === 'right') || (sideBarPosition === Position.RIGHT && panelAlignment === 'left'));
			const auxiliaryBarNextToEditor = !(panelAlignment === 'center' || (sideBarPosition === Position.RIGHT && panelAlignment === 'right') || (sideBarPosition === Position.LEFT && panelAlignment === 'left'));

			const editorSectionWidth = availableWidth - activityBarSize - (sideBarNextToEditor ? 0 : sideBarSize) - (auxiliaryBarNextToEditor ? 0 : auxiliaryBarSize);
			result.push({
				type: 'branch',
				data: [this.arrangeEditorNodes({
					editor: nodes.editor,
					sideBar: sideBarNextToEditor ? nodes.sideBar : undefined,
					auxiliaryBar: auxiliaryBarNextToEditor ? nodes.auxiliaryBar : undefined
				}, availableHeight - panelSize, editorSectionWidth), nodes.panel],
				size: editorSectionWidth
			});

			if (!sideBarNextToEditor) {
				if (sideBarPosition === Position.LEFT) {
					result.splice(0, 0, nodes.sideBar);
				} else {
					result.push(nodes.sideBar);
				}
			}

			if (!auxiliaryBarNextToEditor) {
				if (sideBarPosition === Position.RIGHT) {
					result.splice(0, 0, nodes.auxiliaryBar);
				} else {
					result.push(nodes.auxiliaryBar);
				}
			}

			if (sideBarPosition === Position.LEFT) {
				result.splice(0, 0, nodes.activityBar);
			} else {
				result.push(nodes.activityBar);
			}
		}

		return result;
	}

	private createGridDescriptor(): ISerializedGrid {
		const { width, height } = this.stateModel.getInitializationValue(LayoutStateKeys.GRID_SIZE);
		const sideBarSize = this.stateModel.getInitializationValue(LayoutStateKeys.SIDEBAR_SIZE);
		const auxiliaryBarPartSize = this.stateModel.getInitializationValue(LayoutStateKeys.AUXILIARYBAR_SIZE);
		const panelSize = this.stateModel.getInitializationValue(LayoutStateKeys.PANEL_SIZE);

		const titleBarHeight = this.titleBarPartView.minimumHeight;
		const bannerHeight = this.bannerPartView.minimumHeight;
		const statusBarHeight = this.statusBarPartView.minimumHeight;
		const activityBarWidth = this.activityBarPartView.minimumWidth;
		const middleSectionHeight = height - titleBarHeight - statusBarHeight;

		const activityBarNode: ISerializedLeafNode = {
			type: 'leaf',
			data: { type: Parts.ACTIVITYBAR_PART },
			size: activityBarWidth,
			visible: !this.stateModel.getRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN)
		};

		const sideBarNode: ISerializedLeafNode = {
			type: 'leaf',
			data: { type: Parts.SIDEBAR_PART },
			size: sideBarSize,
			visible: !this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN)
		};

		const auxiliaryBarNode: ISerializedLeafNode = {
			type: 'leaf',
			data: { type: Parts.AUXILIARYBAR_PART },
			size: auxiliaryBarPartSize,
			visible: this.isVisible(Parts.AUXILIARYBAR_PART)
		};

		const editorNode: ISerializedLeafNode = {
			type: 'leaf',
			data: { type: Parts.EDITOR_PART },
			size: 0, // Update based on sibling sizes
			visible: !this.stateModel.getRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN)
		};

		const panelNode: ISerializedLeafNode = {
			type: 'leaf',
			data: { type: Parts.PANEL_PART },
			size: panelSize,
			visible: !this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN)
		};


		const middleSection: ISerializedNode[] = this.arrangeMiddleSectionNodes({
			activityBar: activityBarNode,
			auxiliaryBar: auxiliaryBarNode,
			editor: editorNode,
			panel: panelNode,
			sideBar: sideBarNode
		}, width, middleSectionHeight);

		const result: ISerializedGrid = {
			root: {
				type: 'branch',
				size: width,
				data: [
					{
						type: 'leaf',
						data: { type: Parts.TITLEBAR_PART },
						size: titleBarHeight,
						visible: this.isVisible(Parts.TITLEBAR_PART)
					},
					{
						type: 'leaf',
						data: { type: Parts.BANNER_PART },
						size: bannerHeight,
						visible: false
					},
					{
						type: 'branch',
						data: middleSection,
						size: middleSectionHeight
					},
					{
						type: 'leaf',
						data: { type: Parts.STATUSBAR_PART },
						size: statusBarHeight,
						visible: !this.stateModel.getRuntimeValue(LayoutStateKeys.STATUSBAR_HIDDEN)
					}
				]
			},
			orientation: Orientation.VERTICAL,
			width,
			height
		};

		type StartupLayoutEvent = {
			activityBarVisible: boolean;
			sideBarVisible: boolean;
			auxiliaryBarVisible: boolean;
			panelVisible: boolean;
			statusbarVisible: boolean;
			sideBarPosition: string;
			panelPosition: string;
		};

		type StartupLayoutEventClassification = {
			owner: 'sbatten';
			comment: 'Information about the layout of the workbench during statup';
			activityBarVisible: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether or the not the activity bar is visible' };
			sideBarVisible: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether or the not the primary side bar is visible' };
			auxiliaryBarVisible: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether or the not the secondary side bar is visible' };
			panelVisible: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether or the not the panel is visible' };
			statusbarVisible: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether or the not the status bar is visible' };
			sideBarPosition: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the primary side bar is on the left or right' };
			panelPosition: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the panel is on the bottom, left, or right' };
		};

		const layoutDescriptor: StartupLayoutEvent = {
			activityBarVisible: !this.stateModel.getRuntimeValue(LayoutStateKeys.ACTIVITYBAR_HIDDEN),
			sideBarVisible: !this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN),
			auxiliaryBarVisible: !this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN),
			panelVisible: !this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN),
			statusbarVisible: !this.stateModel.getRuntimeValue(LayoutStateKeys.STATUSBAR_HIDDEN),
			sideBarPosition: positionToString(this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON)),
			panelPosition: positionToString(this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_POSITION)),
		};

		this.telemetryService.publicLog2<StartupLayoutEvent, StartupLayoutEventClassification>('startupLayout', layoutDescriptor);

		return result;
	}

	override dispose(): void {
		super.dispose();

		this.disposed = true;
	}
}

type ZenModeConfiguration = {
	centerLayout: boolean;
	fullScreen: boolean;
	hideActivityBar: boolean;
	hideLineNumbers: boolean;
	hideStatusBar: boolean;
	hideTabs: boolean;
	restore: boolean;
	silentNotifications: boolean;
};

function getZenModeConfiguration(configurationService: IConfigurationService): ZenModeConfiguration {
	return configurationService.getValue<ZenModeConfiguration>(WorkbenchLayoutSettings.ZEN_MODE_CONFIG);
}
