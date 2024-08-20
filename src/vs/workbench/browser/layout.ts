/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { EventType, addDisposableListener, getClientArea, position, size, IDimension, isAncestorUsingFlowTo, computeScreenAwareSize, getActiveDocument, getWindows, getActiveWindow, isActiveDocument, getWindow, getWindowId, getActiveElement } from 'vs/base/browser/dom';
import { onDidChangeFullscreen, isFullscreen, isWCOEnabled } from 'vs/base/browser/browser';
import { IWorkingCopyBackupService } from 'vs/workbench/services/workingCopy/common/workingCopyBackup';
import { isWindows, isLinux, isMacintosh, isWeb, isIOS } from 'vs/base/common/platform';
import { EditorInputCapabilities, GroupIdentifier, isResourceEditorInput, IUntypedEditorInput, pathsToEditors } from 'vs/workbench/common/editor';
import { SidebarPart } from 'vs/workbench/browser/parts/sidebar/sidebarPart';
import { PanelPart } from 'vs/workbench/browser/parts/panel/panelPart';
import { Position, Parts, PanelOpensMaximizedOptions, IWorkbenchLayoutService, positionFromString, positionToString, panelOpensMaximizedFromString, PanelAlignment, ActivityBarPosition, LayoutSettings, MULTI_WINDOW_PARTS, SINGLE_WINDOW_PARTS, ZenModeSettings, EditorTabsMode, EditorActionsLocation, shouldShowCustomTitleBar, isHorizontal } from 'vs/workbench/services/layout/browser/layoutService';
import { isTemporaryWorkspace, IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IConfigurationChangeEvent, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITitleService } from 'vs/workbench/services/title/browser/titleService';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { StartupKind, ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { getMenuBarVisibility, IPath, hasNativeTitlebar, hasCustomTitlebar, TitleBarSetting, CustomTitleBarVisibility, useWindowControlsOverlay } from 'vs/platform/window/common/window';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { EditorGroupLayout, GroupsOrder, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { SerializableGrid, ISerializableView, ISerializedGrid, Orientation, ISerializedNode, ISerializedLeafNode, Direction, IViewSize, Sizing } from 'vs/base/browser/ui/grid/grid';
import { Part } from 'vs/workbench/browser/part';
import { IStatusbarService } from 'vs/workbench/services/statusbar/browser/statusbar';
import { IFileService } from 'vs/platform/files/common/files';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { coalesce } from 'vs/base/common/arrays';
import { assertIsDefined } from 'vs/base/common/types';
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
import { AuxiliaryBarPart } from 'vs/workbench/browser/parts/auxiliarybar/auxiliaryBarPart';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IAuxiliaryWindowService } from 'vs/workbench/services/auxiliaryWindow/browser/auxiliaryWindowService';
import { CodeWindow, mainWindow } from 'vs/base/browser/window';

//#region Layout Implementation

interface ILayoutRuntimeState {
	activeContainerId: number;
	mainWindowFullscreen: boolean;
	readonly maximized: Set<number>;
	hasFocus: boolean;
	mainWindowBorder: boolean;
	readonly menuBar: {
		toggled: boolean;
	};
	readonly zenMode: {
		readonly transitionDisposables: DisposableMap<string, IDisposable>;
	};
}

interface IEditorToOpen {
	readonly editor: IUntypedEditorInput;
	readonly viewColumn?: number;
}

interface ILayoutInitializationState {
	readonly views: {
		readonly defaults: string[] | undefined;
		readonly containerToRestore: {
			sideBar?: string;
			panel?: string;
			auxiliaryBar?: string;
		};
	};
	readonly editor: {
		readonly restoreEditors: boolean;
		readonly editorsToOpen: Promise<IEditorToOpen[]>;
	};
	readonly layout?: {
		readonly editors?: EditorGroupLayout;
	};
}

interface ILayoutState {
	readonly runtime: ILayoutRuntimeState;
	readonly initialization: ILayoutInitializationState;
}

enum LayoutClasses {
	SIDEBAR_HIDDEN = 'nosidebar',
	MAIN_EDITOR_AREA_HIDDEN = 'nomaineditorarea',
	PANEL_HIDDEN = 'nopanel',
	AUXILIARYBAR_HIDDEN = 'noauxiliarybar',
	STATUSBAR_HIDDEN = 'nostatusbar',
	FULLSCREEN = 'fullscreen',
	MAXIMIZED = 'maximized',
	WINDOW_BORDER = 'border'
}

interface IPathToOpen extends IPath {
	readonly viewColumn?: number;
}

interface IInitialEditorsState {
	readonly filesToOpenOrCreate?: IPathToOpen[];
	readonly filesToDiff?: IPathToOpen[];
	readonly filesToMerge?: IPathToOpen[];

	readonly layout?: EditorGroupLayout;
}

export const TITLE_BAR_SETTINGS = [
	LayoutSettings.ACTIVITY_BAR_LOCATION,
	LayoutSettings.COMMAND_CENTER,
	LayoutSettings.EDITOR_ACTIONS_LOCATION,
	LayoutSettings.LAYOUT_ACTIONS,
	'window.menuBarVisibility',
	TitleBarSetting.TITLE_BAR_STYLE,
	TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY,
];

export abstract class Layout extends Disposable implements IWorkbenchLayoutService {

	declare readonly _serviceBrand: undefined;

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

	private readonly _onDidChangePartVisibility = this._register(new Emitter<void>());
	readonly onDidChangePartVisibility = this._onDidChangePartVisibility.event;

	private readonly _onDidChangeNotificationsVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeNotificationsVisibility = this._onDidChangeNotificationsVisibility.event;

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
	get activeContainer() { return this.getContainerFromDocument(getActiveDocument()); }
	get containers(): Iterable<HTMLElement> {
		const containers: HTMLElement[] = [];
		for (const { window } of getWindows()) {
			containers.push(this.getContainerFromDocument(window.document));
		}

		return containers;
	}

	private getContainerFromDocument(targetDocument: Document): HTMLElement {
		if (targetDocument === this.mainContainer.ownerDocument) {
			// main window
			return this.mainContainer;
		} else {
			// auxiliary window
			return targetDocument.body.getElementsByClassName('monaco-workbench')[0] as HTMLElement;
		}
	}

	private readonly containerStylesLoaded = new Map<number /* window ID */, Promise<void>>();
	whenContainerStylesLoaded(window: CodeWindow): Promise<void> | undefined {
		return this.containerStylesLoaded.get(window.vscodeWindowId);
	}

	private _mainContainerDimension!: IDimension;
	get mainContainerDimension(): IDimension { return this._mainContainerDimension; }

	get activeContainerDimension(): IDimension {
		return this.getContainerDimension(this.activeContainer);
	}

	private getContainerDimension(container: HTMLElement): IDimension {
		if (container === this.mainContainer) {
			return this.mainContainerDimension; // main window
		} else {
			return getClientArea(container); 	// auxiliary window
		}
	}

	get mainContainerOffset() {
		return this.computeContainerOffset(mainWindow);
	}

	get activeContainerOffset() {
		return this.computeContainerOffset(getWindow(this.activeContainer));
	}

	private computeContainerOffset(targetWindow: Window) {
		let top = 0;
		let quickPickTop = 0;

		if (this.isVisible(Parts.BANNER_PART)) {
			top = this.getPart(Parts.BANNER_PART).maximumHeight;
			quickPickTop = top;
		}

		const titlebarVisible = this.isVisible(Parts.TITLEBAR_PART, targetWindow);
		if (titlebarVisible) {
			top += this.getPart(Parts.TITLEBAR_PART).maximumHeight;
			quickPickTop = top;
		}

		const isCommandCenterVisible = titlebarVisible && this.configurationService.getValue<boolean>(LayoutSettings.COMMAND_CENTER) !== false;
		if (isCommandCenterVisible) {
			// If the command center is visible then the quickinput
			// should go over the title bar and the banner
			quickPickTop = 6;
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
	private mainPartEditorService!: IEditorService;
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
	private auxiliaryWindowService!: IAuxiliaryWindowService;

	private state!: ILayoutState;
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
		this.auxiliaryWindowService = accessor.get(IAuxiliaryWindowService);

		// Parts
		this.editorService = accessor.get(IEditorService);
		this.mainPartEditorService = this.editorService.createScoped('main', this._store);
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
			if (!this.isVisible(Parts.EDITOR_PART, mainWindow)) {
				this.toggleMaximizedPanel();
			}
		};

		// Wait to register these listeners after the editor group service
		// is ready to avoid conflicts on startup
		this.editorGroupService.whenRestored.then(() => {

			// Restore main editor part on any editor change in main part
			this._register(this.mainPartEditorService.onDidVisibleEditorsChange(showEditorIfHidden));
			this._register(this.editorGroupService.mainPart.onDidActivateGroup(showEditorIfHidden));

			// Revalidate center layout when active editor changes: diff editor quits centered mode.
			this._register(this.mainPartEditorService.onDidActiveEditorChange(() => this.centerMainEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED))));
		});

		// Configuration changes
		this._register(this.configurationService.onDidChangeConfiguration((e) => {
			if ([
				...TITLE_BAR_SETTINGS,
				LegacyWorkbenchLayoutSettings.SIDEBAR_POSITION,
				LegacyWorkbenchLayoutSettings.STATUSBAR_VISIBLE,
			].some(setting => e.affectsConfiguration(setting))) {
				// Show Custom TitleBar if actions moved to the titlebar
				const editorActionsMovedToTitlebar = e.affectsConfiguration(LayoutSettings.EDITOR_ACTIONS_LOCATION) && this.configurationService.getValue<EditorActionsLocation>(LayoutSettings.EDITOR_ACTIONS_LOCATION) === EditorActionsLocation.TITLEBAR;

				let activityBarMovedToTopOrBottom = false;
				if (e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION)) {
					const activityBarPosition = this.configurationService.getValue<ActivityBarPosition>(LayoutSettings.ACTIVITY_BAR_LOCATION);
					activityBarMovedToTopOrBottom = activityBarPosition === ActivityBarPosition.TOP || activityBarPosition === ActivityBarPosition.BOTTOM;
				}

				if (activityBarMovedToTopOrBottom || editorActionsMovedToTitlebar) {
					if (this.configurationService.getValue<CustomTitleBarVisibility>(TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY) === CustomTitleBarVisibility.NEVER) {
						this.configurationService.updateValue(TitleBarSetting.CUSTOM_TITLE_BAR_VISIBILITY, CustomTitleBarVisibility.AUTO);
					}
				}

				this.doUpdateLayoutConfiguration();
			}
		}));

		// Fullscreen changes
		this._register(onDidChangeFullscreen(windowId => this.onFullscreenChanged(windowId)));

		// Group changes
		this._register(this.editorGroupService.mainPart.onDidAddGroup(() => this.centerMainEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED))));
		this._register(this.editorGroupService.mainPart.onDidRemoveGroup(() => this.centerMainEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED))));
		this._register(this.editorGroupService.mainPart.onDidChangeGroupMaximized(() => this.centerMainEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED))));

		// Prevent workbench from scrolling #55456
		this._register(addDisposableListener(this.mainContainer, EventType.SCROLL, () => this.mainContainer.scrollTop = 0));

		// Menubar visibility changes
		const showingCustomMenu = (isWindows || isLinux || isWeb) && !hasNativeTitlebar(this.configurationService);
		if (showingCustomMenu) {
			this._register(this.titleService.onMenubarVisibilityChange(visible => this.onMenubarToggled(visible)));
		}

		// Theme changes
		this._register(this.themeService.onDidColorThemeChange(() => this.updateWindowsBorder()));

		// Window active / focus changes
		this._register(this.hostService.onDidChangeFocus(focused => this.onWindowFocusChanged(focused)));
		this._register(this.hostService.onDidChangeActiveWindow(() => this.onActiveWindowChanged()));

		// WCO changes
		if (isWeb && typeof (navigator as any).windowControlsOverlay === 'object') {
			this._register(addDisposableListener((navigator as any).windowControlsOverlay, 'geometrychange', () => this.onDidChangeWCO()));
		}

		// Auxiliary windows
		this._register(this.auxiliaryWindowService.onDidOpenAuxiliaryWindow(({ window, disposables }) => {
			const windowId = window.window.vscodeWindowId;
			this.containerStylesLoaded.set(windowId, window.whenStylesHaveLoaded);
			window.whenStylesHaveLoaded.then(() => this.containerStylesLoaded.delete(windowId));
			disposables.add(toDisposable(() => this.containerStylesLoaded.delete(windowId)));

			const eventDisposables = disposables.add(new DisposableStore());
			this._onDidAddContainer.fire({ container: window.container, disposables: eventDisposables });

			disposables.add(window.onDidLayout(dimension => this.handleContainerDidLayout(window.container, dimension)));
		}));
	}

	private onMenubarToggled(visible: boolean): void {
		if (visible !== this.state.runtime.menuBar.toggled) {
			this.state.runtime.menuBar.toggled = visible;

			const menuBarVisibility = getMenuBarVisibility(this.configurationService);

			// The menu bar toggles the title bar in web because it does not need to be shown for window controls only
			if (isWeb && menuBarVisibility === 'toggle') {
				this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled, this.isZenModeActive()));
			}

			// The menu bar toggles the title bar in full screen for toggle and classic settings
			else if (this.state.runtime.mainWindowFullscreen && (menuBarVisibility === 'toggle' || menuBarVisibility === 'classic')) {
				this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled, this.isZenModeActive()));
			}

			// Move layout call to any time the menubar
			// is toggled to update consumers of offset
			// see issue #115267
			this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
		}
	}

	private handleContainerDidLayout(container: HTMLElement, dimension: IDimension): void {
		if (container === this.mainContainer) {
			this._onDidLayoutMainContainer.fire(dimension);
		}

		if (isActiveDocument(container)) {
			this._onDidLayoutActiveContainer.fire(dimension);
		}

		this._onDidLayoutContainer.fire({ container, dimension });
	}

	private onFullscreenChanged(windowId: number): void {
		if (windowId !== mainWindow.vscodeWindowId) {
			return; // ignore all but main window
		}

		this.state.runtime.mainWindowFullscreen = isFullscreen(mainWindow);

		// Apply as CSS class
		if (this.state.runtime.mainWindowFullscreen) {
			this.mainContainer.classList.add(LayoutClasses.FULLSCREEN);
		} else {
			this.mainContainer.classList.remove(LayoutClasses.FULLSCREEN);

			const zenModeExitInfo = this.stateModel.getRuntimeValue(LayoutStateKeys.ZEN_MODE_EXIT_INFO);
			if (zenModeExitInfo.transitionedToFullScreen && this.isZenModeActive()) {
				this.toggleZenMode();
			}
		}

		// Change edge snapping accordingly
		this.workbenchGrid.edgeSnapping = this.state.runtime.mainWindowFullscreen;

		// Changing fullscreen state of the main window has an impact
		// on custom title bar visibility, so we need to update
		if (hasCustomTitlebar(this.configurationService)) {

			// Propagate to grid
			this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled, this.isZenModeActive()));

			this.updateWindowsBorder(true);
		}
	}

	private onActiveWindowChanged(): void {
		const activeContainerId = this.getActiveContainerId();
		if (this.state.runtime.activeContainerId !== activeContainerId) {
			this.state.runtime.activeContainerId = activeContainerId;

			// Indicate active window border
			this.updateWindowsBorder();

			this._onDidChangeActiveContainer.fire();
		}
	}

	private onWindowFocusChanged(hasFocus: boolean): void {
		if (this.state.runtime.hasFocus !== hasFocus) {
			this.state.runtime.hasFocus = hasFocus;
			this.updateWindowsBorder();
		}
	}

	private getActiveContainerId(): number {
		const activeContainer = this.activeContainer;

		return getWindow(activeContainer).vscodeWindowId;
	}

	private doUpdateLayoutConfiguration(skipLayout?: boolean): void {

		// Custom Titlebar visibility with native titlebar
		this.updateCustomTitleBarVisibility();

		// Menubar visibility
		this.updateMenubarVisibility(!!skipLayout);

		// Centered Layout
		this.editorGroupService.whenRestored.then(() => {
			this.centerMainEditorLayout(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED), skipLayout);
		});
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

	private updateWindowsBorder(skipLayout = false) {
		if (
			isWeb ||
			isWindows || 											// not working well with zooming (border often not visible)
			useWindowControlsOverlay(this.configurationService) || 	// not working with WCO (border cannot draw over the overlay)
			hasNativeTitlebar(this.configurationService)
		) {
			return;
		}

		const theme = this.themeService.getColorTheme();

		const activeBorder = theme.getColor(WINDOW_ACTIVE_BORDER);
		const inactiveBorder = theme.getColor(WINDOW_INACTIVE_BORDER);

		const didHaveMainWindowBorder = this.hasMainWindowBorder();

		for (const container of this.containers) {
			const isMainContainer = container === this.mainContainer;
			const isActiveContainer = this.activeContainer === container;
			const containerWindowId = getWindowId(getWindow(container));

			let windowBorder = false;
			if (!this.state.runtime.mainWindowFullscreen && !this.state.runtime.maximized.has(containerWindowId) && (activeBorder || inactiveBorder)) {
				windowBorder = true;

				// If the inactive color is missing, fallback to the active one
				const borderColor = isActiveContainer && this.state.runtime.hasFocus ? activeBorder : inactiveBorder ?? activeBorder;
				container.style.setProperty('--window-border-color', borderColor?.toString() ?? 'transparent');
			}

			if (isMainContainer) {
				this.state.runtime.mainWindowBorder = windowBorder;
			}

			container.classList.toggle(LayoutClasses.WINDOW_BORDER, windowBorder);
		}

		if (!skipLayout && didHaveMainWindowBorder !== this.hasMainWindowBorder()) {
			this.layout();
		}
	}

	private initLayoutState(lifecycleService: ILifecycleService, fileService: IFileService): void {
		this.stateModel = new LayoutStateModel(this.storageService, this.configurationService, this.contextService, this.parent);
		this.stateModel.load();

		// Both editor and panel should not be hidden on startup
		if (this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN) && this.stateModel.getRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN)) {
			this.stateModel.setRuntimeValue(LayoutStateKeys.EDITOR_HIDDEN, false);
		}

		this._register(this.stateModel.onDidChangeState(change => {
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
		}));

		// Layout Initialization State
		const initialEditorsState = this.getInitialEditorsState();
		if (initialEditorsState) {
			this.logService.trace('Initial editor state', initialEditorsState);
		}
		const initialLayoutState: ILayoutInitializationState = {
			layout: {
				editors: initialEditorsState?.layout
			},
			editor: {
				restoreEditors: this.shouldRestoreEditors(this.contextService, initialEditorsState),
				editorsToOpen: this.resolveEditorsToOpen(fileService, initialEditorsState),
			},
			views: {
				defaults: this.getDefaultLayoutViews(this.environmentService, this.storageService),
				containerToRestore: {}
			}
		};

		// Layout Runtime State
		const layoutRuntimeState: ILayoutRuntimeState = {
			activeContainerId: this.getActiveContainerId(),
			mainWindowFullscreen: isFullscreen(mainWindow),
			hasFocus: this.hostService.hasFocus,
			maximized: new Set<number>(),
			mainWindowBorder: false,
			menuBar: {
				toggled: false,
			},
			zenMode: {
				transitionDisposables: new DisposableMap(),
			}
		};

		this.state = {
			initialization: initialLayoutState,
			runtime: layoutRuntimeState,
		};

		// Sidebar View Container To Restore
		if (this.isVisible(Parts.SIDEBAR_PART)) {

			// Only restore last viewlet if window was reloaded or we are in development mode
			let viewContainerToRestore: string | undefined;
			if (
				!this.environmentService.isBuilt ||
				lifecycleService.startupKind === StartupKind.ReloadedWindow ||
				this.environmentService.isExtensionDevelopment && !this.environmentService.extensionTestsLocationURI
			) {
				viewContainerToRestore = this.storageService.get(SidebarPart.activeViewletSettingsKey, StorageScope.WORKSPACE, this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.Sidebar)?.id);
			} else {
				viewContainerToRestore = this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.Sidebar)?.id;
			}

			if (viewContainerToRestore) {
				this.state.initialization.views.containerToRestore.sideBar = viewContainerToRestore;
			} else {
				this.stateModel.setRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN, true);
			}
		}

		// Panel View Container To Restore
		if (this.isVisible(Parts.PANEL_PART)) {
			const viewContainerToRestore = this.storageService.get(PanelPart.activePanelSettingsKey, StorageScope.WORKSPACE, this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.Panel)?.id);

			if (viewContainerToRestore) {
				this.state.initialization.views.containerToRestore.panel = viewContainerToRestore;
			} else {
				this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_HIDDEN, true);
			}
		}

		// Auxiliary Panel to restore
		if (this.isVisible(Parts.AUXILIARYBAR_PART)) {
			const viewContainerToRestore = this.storageService.get(AuxiliaryBarPart.activePanelSettingsKey, StorageScope.WORKSPACE, this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.AuxiliaryBar)?.id);

			if (viewContainerToRestore) {
				this.state.initialization.views.containerToRestore.auxiliaryBar = viewContainerToRestore;
			} else {
				this.stateModel.setRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN, true);
			}
		}

		// Window border
		this.updateWindowsBorder(true);
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

	private shouldRestoreEditors(contextService: IWorkspaceContextService, initialEditorsState: IInitialEditorsState | undefined): boolean {

		// Restore editors based on a set of rules:
		// - never when running on temporary workspace
		// - not when we have files to open, unless:
		// - always when `window.restoreWindows: preserve`

		if (isTemporaryWorkspace(contextService.getWorkspace())) {
			return false;
		}

		const forceRestoreEditors = this.configurationService.getValue<string>('window.restoreWindows') === 'preserve';
		return !!forceRestoreEditors || initialEditorsState === undefined;
	}

	protected willRestoreEditors(): boolean {
		return this.state.initialization.editor.restoreEditors;
	}

	private async resolveEditorsToOpen(fileService: IFileService, initialEditorsState: IInitialEditorsState | undefined): Promise<IEditorToOpen[]> {
		if (initialEditorsState) {

			// Merge editor (single)
			const filesToMerge = coalesce(await pathsToEditors(initialEditorsState.filesToMerge, fileService, this.logService));
			if (filesToMerge.length === 4 && isResourceEditorInput(filesToMerge[0]) && isResourceEditorInput(filesToMerge[1]) && isResourceEditorInput(filesToMerge[2]) && isResourceEditorInput(filesToMerge[3])) {
				return [{
					editor: {
						input1: { resource: filesToMerge[0].resource },
						input2: { resource: filesToMerge[1].resource },
						base: { resource: filesToMerge[2].resource },
						result: { resource: filesToMerge[3].resource },
						options: { pinned: true }
					}
				}];
			}

			// Diff editor (single)
			const filesToDiff = coalesce(await pathsToEditors(initialEditorsState.filesToDiff, fileService, this.logService));
			if (filesToDiff.length === 2) {
				return [{
					editor: {
						original: { resource: filesToDiff[0].resource },
						modified: { resource: filesToDiff[1].resource },
						options: { pinned: true }
					}
				}];
			}

			// Normal editor (multiple)
			const filesToOpenOrCreate: IEditorToOpen[] = [];
			const resolvedFilesToOpenOrCreate = await pathsToEditors(initialEditorsState.filesToOpenOrCreate, fileService, this.logService);
			for (let i = 0; i < resolvedFilesToOpenOrCreate.length; i++) {
				const resolvedFileToOpenOrCreate = resolvedFilesToOpenOrCreate[i];
				if (resolvedFileToOpenOrCreate) {
					filesToOpenOrCreate.push({
						editor: resolvedFileToOpenOrCreate,
						viewColumn: initialEditorsState.filesToOpenOrCreate?.[i].viewColumn // take over `viewColumn` from initial state
					});
				}
			}

			return filesToOpenOrCreate;
		}

		// Empty workbench configured to open untitled file if empty
		else if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY && this.configurationService.getValue('workbench.startupEditor') === 'newUntitledFile') {
			if (this.editorGroupService.hasRestorableState) {
				return []; // do not open any empty untitled file if we restored groups/editors from previous session
			}

			const hasBackups = await this.workingCopyBackupService.hasBackups();
			if (hasBackups) {
				return []; // do not open any empty untitled file if we have backups to restore
			}

			return [{
				editor: { resource: undefined } // open empty untitled file
			}];
		}

		return [];
	}

	private _openedDefaultEditors: boolean = false;
	get openedDefaultEditors() { return this._openedDefaultEditors; }

	private getInitialEditorsState(): IInitialEditorsState | undefined {

		// Check for editors / editor layout from `defaultLayout` options first
		const defaultLayout = this.environmentService.options?.defaultLayout;
		if ((defaultLayout?.editors?.length || defaultLayout?.layout?.editors) && (defaultLayout.force || this.storageService.isNew(StorageScope.WORKSPACE))) {
			this._openedDefaultEditors = true;

			return {
				layout: defaultLayout.layout?.editors,
				filesToOpenOrCreate: defaultLayout?.editors?.map(editor => {
					return {
						viewColumn: editor.viewColumn,
						fileUri: URI.revive(editor.uri),
						openOnlyIfExists: editor.openOnlyIfExists,
						options: editor.options
					};
				})
			};
		}

		// Then check for files to open, create or diff/merge from main side
		const { filesToOpenOrCreate, filesToDiff, filesToMerge } = this.environmentService;
		if (filesToOpenOrCreate || filesToDiff || filesToMerge) {
			return { filesToOpenOrCreate, filesToDiff, filesToMerge };
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
			mark('code/restoreEditors/editorGroupsReady');

			// apply editor layout if any
			if (this.state.initialization.layout?.editors) {
				this.editorGroupService.mainPart.applyLayout(this.state.initialization.layout.editors);
			}

			// then see for editors to open as instructed
			// it is important that we trigger this from
			// the overall restore flow to reduce possible
			// flicker on startup: we want any editor to
			// open to get a chance to open first before
			// signaling that layout is restored, but we do
			// not need to await the editors from having
			// fully loaded.

			const editors = await this.state.initialization.editor.editorsToOpen;
			mark('code/restoreEditors/editorsToOpenResolved');

			let openEditorsPromise: Promise<unknown> | undefined = undefined;
			if (editors.length) {

				// we have to map editors to their groups as instructed
				// by the input. this is important to ensure that we open
				// the editors in the groups they belong to.

				const editorGroupsInVisualOrder = this.editorGroupService.mainPart.getGroups(GroupsOrder.GRID_APPEARANCE);
				const mapEditorsToGroup = new Map<GroupIdentifier, Set<IUntypedEditorInput>>();

				for (const editor of editors) {
					const group = editorGroupsInVisualOrder[(editor.viewColumn ?? 1) - 1]; // viewColumn is index+1 based

					let editorsByGroup = mapEditorsToGroup.get(group.id);
					if (!editorsByGroup) {
						editorsByGroup = new Set<IUntypedEditorInput>();
						mapEditorsToGroup.set(group.id, editorsByGroup);
					}

					editorsByGroup.add(editor.editor);
				}

				openEditorsPromise = Promise.all(Array.from(mapEditorsToGroup).map(async ([groupId, editors]) => {
					try {
						await this.editorService.openEditors(Array.from(editors), groupId, { validateTrust: true });
					} catch (error) {
						this.logService.error(error);
					}
				}));
			}

			// do not block the overall layout ready flow from potentially
			// slow editors to resolve on startup
			layoutRestoredPromises.push(
				Promise.all([
					openEditorsPromise?.finally(() => mark('code/restoreEditors/editorsOpened')),
					this.editorGroupService.whenRestored.finally(() => mark('code/restoreEditors/editorGroupsRestored'))
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
			if (this.state.initialization.views.defaults?.length) {
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

				const defaultViews = [...this.state.initialization.views.defaults].reverse().map((v, index) => ({ id: v, order: index }));

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
					this.state.initialization.views.containerToRestore.sideBar = locationsRestored[ViewContainerLocation.Sidebar].id;
				}

				// If we opened a view in the panel, stop any restore there
				if (locationsRestored[ViewContainerLocation.Panel]) {
					this.state.initialization.views.containerToRestore.panel = locationsRestored[ViewContainerLocation.Panel].id;
				}

				// If we opened a view in the auxiliary bar, stop any restore there
				if (locationsRestored[ViewContainerLocation.AuxiliaryBar]) {
					this.state.initialization.views.containerToRestore.auxiliaryBar = locationsRestored[ViewContainerLocation.AuxiliaryBar].id;
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
			if (!this.state.initialization.views.containerToRestore.sideBar) {
				return;
			}

			mark('code/willRestoreViewlet');

			const viewlet = await this.paneCompositeService.openPaneComposite(this.state.initialization.views.containerToRestore.sideBar, ViewContainerLocation.Sidebar);
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
			if (!this.state.initialization.views.containerToRestore.panel) {
				return;
			}

			mark('code/willRestorePanel');

			const panel = await this.paneCompositeService.openPaneComposite(this.state.initialization.views.containerToRestore.panel, ViewContainerLocation.Panel);
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
			if (!this.state.initialization.views.containerToRestore.auxiliaryBar) {
				return;
			}

			mark('code/willRestoreAuxiliaryBar');

			const panel = await this.paneCompositeService.openPaneComposite(this.state.initialization.views.containerToRestore.auxiliaryBar, ViewContainerLocation.AuxiliaryBar);
			if (!panel) {
				await this.paneCompositeService.openPaneComposite(this.viewDescriptorService.getDefaultViewContainer(ViewContainerLocation.AuxiliaryBar)?.id, ViewContainerLocation.AuxiliaryBar); // fallback to default panel as needed
			}

			mark('code/didRestoreAuxiliaryBar');
		})());

		// Restore Zen Mode
		const zenModeWasActive = this.isZenModeActive();
		const restoreZenMode = getZenModeConfiguration(this.configurationService).restore;

		if (zenModeWasActive) {
			this.setZenModeActive(!restoreZenMode);
			this.toggleZenMode(false, true);
		}

		// Restore Main Editor Center Mode
		if (this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED)) {
			this.centerMainEditorLayout(true, true);
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

	registerPart(part: Part): IDisposable {
		const id = part.getId();
		this.parts.set(id, part);

		return toDisposable(() => this.parts.delete(id));
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
		const container = this.getContainer(getActiveWindow(), part);
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
		const container = this.getContainer(targetWindow, part) ?? this.mainContainer;

		switch (part) {
			case Parts.EDITOR_PART:
				this.editorGroupService.getPart(container).activeGroup.focus();
				break;
			case Parts.PANEL_PART: {
				this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel)?.focus();
				break;
			}
			case Parts.SIDEBAR_PART: {
				this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar)?.focus();
				break;
			}
			case Parts.AUXILIARYBAR_PART: {
				this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)?.focus();
				break;
			}
			case Parts.ACTIVITYBAR_PART:
				(this.getPart(Parts.SIDEBAR_PART) as SidebarPart).focusActivityBar();
				break;
			case Parts.STATUSBAR_PART:
				this.statusBarService.getPart(container).focus();
				break;
			default: {
				container?.focus();
			}
		}
	}

	getContainer(targetWindow: Window): HTMLElement;
	getContainer(targetWindow: Window, part: Parts): HTMLElement | undefined;
	getContainer(targetWindow: Window, part?: Parts): HTMLElement | undefined {
		if (typeof part === 'undefined') {
			return this.getContainerFromDocument(targetWindow.document);
		}

		if (targetWindow === mainWindow) {
			return this.getPart(part).getContainer();
		}

		// Only some parts are supported for auxiliary windows
		let partCandidate: unknown;
		if (part === Parts.EDITOR_PART) {
			partCandidate = this.editorGroupService.getPart(this.getContainerFromDocument(targetWindow.document));
		} else if (part === Parts.STATUSBAR_PART) {
			partCandidate = this.statusBarService.getPart(this.getContainerFromDocument(targetWindow.document));
		} else if (part === Parts.TITLEBAR_PART) {
			partCandidate = this.titleService.getPart(this.getContainerFromDocument(targetWindow.document));
		}

		if (partCandidate instanceof Part) {
			return partCandidate.getContainer();
		}

		return undefined;
	}

	isVisible(part: MULTI_WINDOW_PARTS, targetWindow: Window): boolean;
	isVisible(part: SINGLE_WINDOW_PARTS): boolean;
	isVisible(part: Parts, targetWindow?: Window): boolean;
	isVisible(part: Parts, targetWindow: Window = mainWindow): boolean {
		if (targetWindow !== mainWindow && part === Parts.EDITOR_PART) {
			return true; // cannot hide editor part in auxiliary windows
		}

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
				case Parts.BANNER_PART:
					return this.workbenchGrid.isViewVisible(this.bannerPartView);
				default:
					return false; // any other part cannot be hidden
			}
		}

		switch (part) {
			case Parts.TITLEBAR_PART:
				return shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled, this.isZenModeActive());
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

	private shouldShowBannerFirst(): boolean {
		return isWeb && !isWCOEnabled();
	}

	focus(): void {
		this.focusPart(Parts.EDITOR_PART, getWindow(this.activeContainer));
	}

	private focusPanelOrEditor(): void {
		const activePanel = this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel);
		if ((this.hasFocus(Parts.PANEL_PART) || !this.isVisible(Parts.EDITOR_PART)) && activePanel) {
			activePanel.focus(); // prefer panel if it has focus or editor is hidden
		} else {
			this.focus(); // otherwise focus editor
		}
	}

	getMaximumEditorDimensions(container: HTMLElement): IDimension {
		const targetWindow = getWindow(container);
		const containerDimension = this.getContainerDimension(container);

		if (container === this.mainContainer) {
			const isPanelHorizontal = isHorizontal(this.getPanelPosition());
			const takenWidth =
				(this.isVisible(Parts.ACTIVITYBAR_PART) ? this.activityBarPartView.minimumWidth : 0) +
				(this.isVisible(Parts.SIDEBAR_PART) ? this.sideBarPartView.minimumWidth : 0) +
				(this.isVisible(Parts.PANEL_PART) && !isPanelHorizontal ? this.panelPartView.minimumWidth : 0) +
				(this.isVisible(Parts.AUXILIARYBAR_PART) ? this.auxiliaryBarPartView.minimumWidth : 0);

			const takenHeight =
				(this.isVisible(Parts.TITLEBAR_PART, targetWindow) ? this.titleBarPartView.minimumHeight : 0) +
				(this.isVisible(Parts.STATUSBAR_PART, targetWindow) ? this.statusBarPartView.minimumHeight : 0) +
				(this.isVisible(Parts.PANEL_PART) && isPanelHorizontal ? this.panelPartView.minimumHeight : 0);

			const availableWidth = containerDimension.width - takenWidth;
			const availableHeight = containerDimension.height - takenHeight;

			return { width: availableWidth, height: availableHeight };
		} else {
			const takenHeight =
				(this.isVisible(Parts.TITLEBAR_PART, targetWindow) ? this.titleBarPartView.minimumHeight : 0) +
				(this.isVisible(Parts.STATUSBAR_PART, targetWindow) ? this.statusBarPartView.minimumHeight : 0);

			return { width: containerDimension.width, height: containerDimension.height - takenHeight };
		}
	}

	private isZenModeActive(): boolean {
		return this.stateModel.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE);
	}

	private setZenModeActive(active: boolean) {
		this.stateModel.setRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE, active);
	}

	toggleZenMode(skipLayout?: boolean, restoring = false): void {
		this.setZenModeActive(!this.isZenModeActive());
		this.state.runtime.zenMode.transitionDisposables.clearAndDisposeAll();

		const setLineNumbers = (lineNumbers?: LineNumbersType) => {
			for (const editor of this.mainPartEditorService.visibleTextEditorControls) {

				// To properly reset line numbers we need to read the configuration for each editor respecting it's uri.
				if (!lineNumbers && isCodeEditor(editor) && editor.hasModel()) {
					const model = editor.getModel();
					lineNumbers = this.configurationService.getValue('editor.lineNumbers', { resource: model.uri, overrideIdentifier: model.getLanguageId() });
				}
				if (!lineNumbers) {
					lineNumbers = this.configurationService.getValue('editor.lineNumbers');
				}

				editor.updateOptions({ lineNumbers });
			}
		};

		// Check if zen mode transitioned to full screen and if now we are out of zen mode
		// -> we need to go out of full screen (same goes for the centered editor layout)
		let toggleMainWindowFullScreen = false;
		const config = getZenModeConfiguration(this.configurationService);
		const zenModeExitInfo = this.stateModel.getRuntimeValue(LayoutStateKeys.ZEN_MODE_EXIT_INFO);

		// Zen Mode Active
		if (this.isZenModeActive()) {

			toggleMainWindowFullScreen = !this.state.runtime.mainWindowFullscreen && config.fullScreen && !isIOS;

			if (!restoring) {
				zenModeExitInfo.transitionedToFullScreen = toggleMainWindowFullScreen;
				zenModeExitInfo.transitionedToCenteredEditorLayout = !this.isMainEditorLayoutCentered() && config.centerLayout;
				zenModeExitInfo.handleNotificationsDoNotDisturbMode = this.notificationService.getFilter() === NotificationsFilter.OFF;
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
				this.state.runtime.zenMode.transitionDisposables.set(ZenModeSettings.HIDE_LINENUMBERS, this.mainPartEditorService.onDidVisibleEditorsChange(() => setLineNumbers('off')));
			}

			if (config.showTabs !== this.editorGroupService.partOptions.showTabs) {
				this.state.runtime.zenMode.transitionDisposables.set(ZenModeSettings.SHOW_TABS, this.editorGroupService.mainPart.enforcePartOptions({ showTabs: config.showTabs }));
			}

			if (config.silentNotifications && zenModeExitInfo.handleNotificationsDoNotDisturbMode) {
				this.notificationService.setFilter(NotificationsFilter.ERROR);
			}

			if (config.centerLayout) {
				this.centerMainEditorLayout(true, true);
			}

			// Zen Mode Configuration Changes
			this.state.runtime.zenMode.transitionDisposables.set('configurationChange', this.configurationService.onDidChangeConfiguration(e => {
				// Activity Bar
				if (e.affectsConfiguration(ZenModeSettings.HIDE_ACTIVITYBAR)) {
					const zenModeHideActivityBar = this.configurationService.getValue<boolean>(ZenModeSettings.HIDE_ACTIVITYBAR);
					this.setActivityBarHidden(zenModeHideActivityBar, true);
				}

				// Status Bar
				if (e.affectsConfiguration(ZenModeSettings.HIDE_STATUSBAR)) {
					const zenModeHideStatusBar = this.configurationService.getValue<boolean>(ZenModeSettings.HIDE_STATUSBAR);
					this.setStatusBarHidden(zenModeHideStatusBar, true);
				}

				// Center Layout
				if (e.affectsConfiguration(ZenModeSettings.CENTER_LAYOUT)) {
					const zenModeCenterLayout = this.configurationService.getValue<boolean>(ZenModeSettings.CENTER_LAYOUT);
					this.centerMainEditorLayout(zenModeCenterLayout, true);
				}

				// Show Tabs
				if (e.affectsConfiguration(ZenModeSettings.SHOW_TABS)) {
					const zenModeShowTabs = this.configurationService.getValue<EditorTabsMode | undefined>(ZenModeSettings.SHOW_TABS) ?? 'multiple';
					this.state.runtime.zenMode.transitionDisposables.set(ZenModeSettings.SHOW_TABS, this.editorGroupService.mainPart.enforcePartOptions({ showTabs: zenModeShowTabs }));
				}

				// Notifications
				if (e.affectsConfiguration(ZenModeSettings.SILENT_NOTIFICATIONS)) {
					const zenModeSilentNotifications = !!this.configurationService.getValue(ZenModeSettings.SILENT_NOTIFICATIONS);
					if (zenModeExitInfo.handleNotificationsDoNotDisturbMode) {
						this.notificationService.setFilter(zenModeSilentNotifications ? NotificationsFilter.ERROR : NotificationsFilter.OFF);
					}
				}

				// Center Layout
				if (e.affectsConfiguration(ZenModeSettings.HIDE_LINENUMBERS)) {
					const lineNumbersType = this.configurationService.getValue<boolean>(ZenModeSettings.HIDE_LINENUMBERS) ? 'off' : undefined;
					setLineNumbers(lineNumbersType);
					this.state.runtime.zenMode.transitionDisposables.set(ZenModeSettings.HIDE_LINENUMBERS, this.mainPartEditorService.onDidVisibleEditorsChange(() => setLineNumbers(lineNumbersType)));
				}
			}));
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
				this.centerMainEditorLayout(false, true);
			}

			if (zenModeExitInfo.handleNotificationsDoNotDisturbMode) {
				this.notificationService.setFilter(NotificationsFilter.OFF);
			}

			setLineNumbers();

			this.focus();

			toggleMainWindowFullScreen = zenModeExitInfo.transitionedToFullScreen && this.state.runtime.mainWindowFullscreen;
		}

		if (!skipLayout) {
			this.layout();
		}

		if (toggleMainWindowFullScreen) {
			this.hostService.toggleFullScreen(mainWindow);
		}

		// Event
		this._onDidChangeZenMode.fire(this.isZenModeActive());
	}

	private setStatusBarHidden(hidden: boolean, skipLayout?: boolean): void {
		this.stateModel.setRuntimeValue(LayoutStateKeys.STATUSBAR_HIDDEN, hidden);

		// Adjust CSS
		if (hidden) {
			this.mainContainer.classList.add(LayoutClasses.STATUSBAR_HIDDEN);
		} else {
			this.mainContainer.classList.remove(LayoutClasses.STATUSBAR_HIDDEN);
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

		this.mainContainer.prepend(workbenchGrid.element);
		this.mainContainer.setAttribute('role', 'application');
		this.workbenchGrid = workbenchGrid;
		this.workbenchGrid.edgeSnapping = this.state.runtime.mainWindowFullscreen;

		for (const part of [titleBar, editorPart, activityBar, panelPart, sideBar, statusBar, auxiliaryBarPart, bannerPart]) {
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
				this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
			}));
		}

		this._register(this.storageService.onWillSaveState(e => {

			// Side Bar Size
			const sideBarSize = this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN)
				? this.workbenchGrid.getViewCachedVisibleSize(this.sideBarPartView)
				: this.workbenchGrid.getViewSize(this.sideBarPartView).width;
			this.stateModel.setInitializationValue(LayoutStateKeys.SIDEBAR_SIZE, sideBarSize as number);

			// Panel Size
			const panelSize = this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_HIDDEN)
				? this.workbenchGrid.getViewCachedVisibleSize(this.panelPartView)
				: isHorizontal(this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_POSITION))
					? this.workbenchGrid.getViewSize(this.panelPartView).height
					: this.workbenchGrid.getViewSize(this.panelPartView).width;
			this.stateModel.setInitializationValue(LayoutStateKeys.PANEL_SIZE, panelSize as number);

			// Auxiliary Bar Size
			const auxiliaryBarSize = this.stateModel.getRuntimeValue(LayoutStateKeys.AUXILIARYBAR_HIDDEN)
				? this.workbenchGrid.getViewCachedVisibleSize(this.auxiliaryBarPartView)
				: this.workbenchGrid.getViewSize(this.auxiliaryBarPartView).width;
			this.stateModel.setInitializationValue(LayoutStateKeys.AUXILIARYBAR_SIZE, auxiliaryBarSize as number);

			this.stateModel.save(true, true);
		}));
	}

	layout(): void {
		if (!this.disposed) {
			this._mainContainerDimension = getClientArea(this.state.runtime.mainWindowFullscreen ?
				mainWindow.document.body : 	// in fullscreen mode, make sure to use <body> element because
				this.parent					// in that case the workbench will span the entire site
			);
			this.logService.trace(`Layout#layout, height: ${this._mainContainerDimension.height}, width: ${this._mainContainerDimension.width}`);

			position(this.mainContainer, 0, 0, 0, 0, 'relative');
			size(this.mainContainer, this._mainContainerDimension.width, this._mainContainerDimension.height);

			// Layout the grid widget
			this.workbenchGrid.layout(this._mainContainerDimension.width, this._mainContainerDimension.height);
			this.initialized = true;

			// Emit as event
			this.handleContainerDidLayout(this.mainContainer, this._mainContainerDimension);
		}
	}

	isMainEditorLayoutCentered(): boolean {
		return this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED);
	}

	centerMainEditorLayout(active: boolean, skipLayout?: boolean): void {
		this.stateModel.setRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED, active);

		const activeMainEditor = this.mainPartEditorService.activeEditor;

		let isEditorComplex = false;
		if (activeMainEditor instanceof DiffEditorInput) {
			isEditorComplex = this.configurationService.getValue('diffEditor.renderSideBySide');
		} else if (activeMainEditor?.hasCapability(EditorInputCapabilities.MultipleEditors)) {
			isEditorComplex = true;
		}

		const isCenteredLayoutAutoResizing = this.configurationService.getValue('workbench.editor.centeredLayoutAutoResize');
		if (
			isCenteredLayoutAutoResizing &&
			((this.editorGroupService.mainPart.groups.length > 1 && !this.editorGroupService.mainPart.hasMaximizedGroup()) || isEditorComplex)
		) {
			active = false; // disable centered layout for complex editors or when there is more than one group
		}

		if (this.editorGroupService.mainPart.isLayoutCentered() !== active) {
			this.editorGroupService.mainPart.centerLayout(active);

			if (!skipLayout) {
				this.layout();
			}
		}

		this._onDidChangeMainEditorCenteredLayout.fire(this.stateModel.getRuntimeValue(LayoutStateKeys.MAIN_EDITOR_CENTERED));
	}

	resizePart(part: Parts, sizeChangeWidth: number, sizeChangeHeight: number): void {
		const sizeChangePxWidth = Math.sign(sizeChangeWidth) * computeScreenAwareSize(getActiveWindow(), Math.abs(sizeChangeWidth));
		const sizeChangePxHeight = Math.sign(sizeChangeHeight) * computeScreenAwareSize(getActiveWindow(), Math.abs(sizeChangeHeight));

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
						width: viewSize.width + (isHorizontal(this.getPanelPosition()) ? 0 : sizeChangePxWidth),
						height: viewSize.height + (isHorizontal(this.getPanelPosition()) ? sizeChangePxHeight : 0)
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
				if (this.editorGroupService.mainPart.count === 1) {
					this.workbenchGrid.resizeView(this.editorPartView,
						{
							width: viewSize.width + sizeChangePxWidth,
							height: viewSize.height + sizeChangePxHeight
						});
				} else {
					const activeGroup = this.editorGroupService.mainPart.activeGroup;

					const { width, height } = this.editorGroupService.mainPart.getSize(activeGroup);
					this.editorGroupService.mainPart.setSize(activeGroup, { width: width + sizeChangePxWidth, height: height + sizeChangePxHeight });

					// After resizing the editor group
					// if it does not change in either direction
					// try resizing the full editor part
					const { width: newWidth, height: newHeight } = this.editorGroupService.mainPart.getSize(activeGroup);
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
			this.mainContainer.classList.add(LayoutClasses.MAIN_EDITOR_AREA_HIDDEN);
		} else {
			this.mainContainer.classList.remove(LayoutClasses.MAIN_EDITOR_AREA_HIDDEN);
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
			!this.isVisible(Parts.SIDEBAR_PART) ? LayoutClasses.SIDEBAR_HIDDEN : undefined,
			!this.isVisible(Parts.EDITOR_PART, mainWindow) ? LayoutClasses.MAIN_EDITOR_AREA_HIDDEN : undefined,
			!this.isVisible(Parts.PANEL_PART) ? LayoutClasses.PANEL_HIDDEN : undefined,
			!this.isVisible(Parts.AUXILIARYBAR_PART) ? LayoutClasses.AUXILIARYBAR_HIDDEN : undefined,
			!this.isVisible(Parts.STATUSBAR_PART) ? LayoutClasses.STATUSBAR_HIDDEN : undefined,
			this.state.runtime.mainWindowFullscreen ? LayoutClasses.FULLSCREEN : undefined
		]);
	}

	private setSideBarHidden(hidden: boolean, skipLayout?: boolean): void {
		this.stateModel.setRuntimeValue(LayoutStateKeys.SIDEBAR_HIDDEN, hidden);

		// Adjust CSS
		if (hidden) {
			this.mainContainer.classList.add(LayoutClasses.SIDEBAR_HIDDEN);
		} else {
			this.mainContainer.classList.remove(LayoutClasses.SIDEBAR_HIDDEN);
		}

		// If sidebar becomes hidden, also hide the current active Viewlet if any
		if (hidden && this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar)) {
			this.paneCompositeService.hideActivePaneComposite(ViewContainerLocation.Sidebar);
			this.focusPanelOrEditor();
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
		const isPanelVertical = !isHorizontal(panelPosition);
		const sideBarSiblingToEditor = isPanelVertical || !(panelAlignment === 'center' || (sideBarPosition === Position.LEFT && panelAlignment === 'right') || (sideBarPosition === Position.RIGHT && panelAlignment === 'left'));
		const auxiliaryBarSiblingToEditor = isPanelVertical || !(panelAlignment === 'center' || (sideBarPosition === Position.RIGHT && panelAlignment === 'right') || (sideBarPosition === Position.LEFT && panelAlignment === 'left'));
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
		if (isPanelVertical) {
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

		// Panel alignment only applies to a panel in the top/bottom position
		if (!isHorizontal(this.getPanelPosition())) {
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
			this.mainContainer.classList.add(LayoutClasses.PANEL_HIDDEN);
		} else {
			this.mainContainer.classList.remove(LayoutClasses.PANEL_HIDDEN);
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
		} else {
			// If in process of hiding, remember whether the panel is maximized or not
			this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_WAS_LAST_MAXIMIZED, isPanelMaximized);
		}

		if (focusEditor) {
			this.editorGroupService.mainPart.activeGroup.focus(); // Pass focus to editor group if panel part is now hidden
		}
	}

	toggleMaximizedPanel(): void {
		const size = this.workbenchGrid.getViewSize(this.panelPartView);
		const panelPosition = this.getPanelPosition();
		const isMaximized = this.isPanelMaximized();
		if (!isMaximized) {
			if (this.isVisible(Parts.PANEL_PART)) {
				if (isHorizontal(panelPosition)) {
					this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT, size.height);
				} else {
					this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_WIDTH, size.width);
				}
			}

			this.setEditorHidden(true);
		} else {
			this.setEditorHidden(false);
			this.workbenchGrid.resizeView(this.panelPartView, {
				width: isHorizontal(panelPosition) ? size.width : this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_WIDTH),
				height: isHorizontal(panelPosition) ? this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT) : size.height
			});
		}

		this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_WAS_LAST_MAXIMIZED, !isMaximized);
	}

	private panelOpensMaximized(): boolean {

		// The workbench grid currently prevents us from supporting panel maximization with non-center panel alignment
		if (this.getPanelAlignment() !== 'center' && isHorizontal(this.getPanelPosition())) {
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
			this.mainContainer.classList.add(LayoutClasses.AUXILIARYBAR_HIDDEN);
		} else {
			this.mainContainer.classList.remove(LayoutClasses.AUXILIARYBAR_HIDDEN);
		}

		// If auxiliary bar becomes hidden, also hide the current active pane composite if any
		if (hidden && this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.AuxiliaryBar)) {
			this.paneCompositeService.hideActivePaneComposite(ViewContainerLocation.AuxiliaryBar);
			this.focusPanelOrEditor();
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

	setPartHidden(hidden: boolean, part: Exclude<SINGLE_WINDOW_PARTS, Parts.STATUSBAR_PART | Parts.TITLEBAR_PART>): void;
	setPartHidden(hidden: boolean, part: Exclude<MULTI_WINDOW_PARTS, Parts.STATUSBAR_PART | Parts.TITLEBAR_PART>, targetWindow: Window): void;
	setPartHidden(hidden: boolean, part: Parts, targetWindow: Window = mainWindow): void {
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

	hasMainWindowBorder(): boolean {
		return this.state.runtime.mainWindowBorder;
	}

	getMainWindowBorderRadius(): string | undefined {
		return this.state.runtime.mainWindowBorder && isMacintosh ? '5px' : undefined;
	}

	isPanelMaximized(): boolean {

		// the workbench grid currently prevents us from supporting panel maximization with non-center panel alignment
		return (this.getPanelAlignment() === 'center' || !isHorizontal(this.getPanelPosition())) && !this.isVisible(Parts.EDITOR_PART, mainWindow);
	}

	getSideBarPosition(): Position {
		return this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON);
	}

	getPanelAlignment(): PanelAlignment {
		return this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_ALIGNMENT);
	}

	updateMenubarVisibility(skipLayout: boolean): void {
		const shouldShowTitleBar = shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled, this.isZenModeActive());
		if (!skipLayout && this.workbenchGrid && shouldShowTitleBar !== this.isVisible(Parts.TITLEBAR_PART, mainWindow)) {
			this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowTitleBar);
		}
	}

	updateCustomTitleBarVisibility(): void {
		const shouldShowTitleBar = shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled, this.isZenModeActive());
		const titlebarVisible = this.isVisible(Parts.TITLEBAR_PART);
		if (shouldShowTitleBar !== titlebarVisible) {
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
			newVisibilityValue = hasNativeTitlebar(this.configurationService) ? 'toggle' : 'compact';
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

		let editorHidden = !this.isVisible(Parts.EDITOR_PART, mainWindow);

		// Save last non-maximized size for panel before move
		if (newPositionValue !== oldPositionValue && !editorHidden) {

			// Save the current size of the panel for the new orthogonal direction
			// If moving down, save the width of the panel
			// Otherwise, save the height of the panel
			if (isHorizontal(position)) {
				this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_WIDTH, size.width);
			} else if (isHorizontal(positionFromString(oldPositionValue))) {
				this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT, size.height);
			}
		}

		if (isHorizontal(position) && this.getPanelAlignment() !== 'center' && editorHidden) {
			this.toggleMaximizedPanel();
			editorHidden = false;
		}

		this.stateModel.setRuntimeValue(LayoutStateKeys.PANEL_POSITION, position);

		const sideBarVisible = this.isVisible(Parts.SIDEBAR_PART);
		const auxiliaryBarVisible = this.isVisible(Parts.AUXILIARYBAR_PART);

		if (position === Position.BOTTOM) {
			this.workbenchGrid.moveView(this.panelPartView, editorHidden ? size.height : this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT), this.editorPartView, Direction.Down);
		} else if (position === Position.TOP) {
			this.workbenchGrid.moveView(this.panelPartView, editorHidden ? size.height : this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_LAST_NON_MAXIMIZED_HEIGHT), this.editorPartView, Direction.Up);
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

		if (isHorizontal(position)) {
			this.adjustPartPositions(this.getSideBarPosition(), this.getPanelAlignment(), position);
		}

		this._onDidChangePanelPosition.fire(newPositionValue);
	}

	isWindowMaximized(targetWindow: Window): boolean {
		return this.state.runtime.maximized.has(getWindowId(targetWindow));
	}

	updateWindowMaximizedState(targetWindow: Window, maximized: boolean) {
		this.mainContainer.classList.toggle(LayoutClasses.MAXIMIZED, maximized);

		const targetWindowId = getWindowId(targetWindow);
		if (maximized === this.state.runtime.maximized.has(targetWindowId)) {
			return;
		}

		if (maximized) {
			this.state.runtime.maximized.add(targetWindowId);
		} else {
			this.state.runtime.maximized.delete(targetWindowId);
		}

		this.updateWindowsBorder();
		this._onDidChangeWindowMaximized.fire({ windowId: targetWindowId, maximized });
	}

	getVisibleNeighborPart(part: Parts, direction: Direction): Parts | undefined {
		if (!this.workbenchGrid) {
			return undefined;
		}

		if (!this.isVisible(part, mainWindow)) {
			return undefined;
		}

		const neighborViews = this.workbenchGrid.getNeighborViews(this.getPart(part), direction, false);

		if (!neighborViews) {
			return undefined;
		}

		for (const neighborView of neighborViews) {
			const neighborPart =
				[Parts.ACTIVITYBAR_PART, Parts.EDITOR_PART, Parts.PANEL_PART, Parts.AUXILIARYBAR_PART, Parts.SIDEBAR_PART, Parts.STATUSBAR_PART, Parts.TITLEBAR_PART]
					.find(partId => this.getPart(partId) === neighborView && this.isVisible(partId, mainWindow));

			if (neighborPart !== undefined) {
				return neighborPart;
			}
		}

		return undefined;
	}

	private onDidChangeWCO(): void {
		const bannerFirst = this.workbenchGrid.getNeighborViews(this.titleBarPartView, Direction.Up, false).length > 0;
		const shouldBannerBeFirst = this.shouldShowBannerFirst();

		if (bannerFirst !== shouldBannerBeFirst) {
			this.workbenchGrid.moveView(this.bannerPartView, Sizing.Distribute, this.titleBarPartView, shouldBannerBeFirst ? Direction.Up : Direction.Down);
		}

		this.workbenchGrid.setViewVisible(this.titleBarPartView, shouldShowCustomTitleBar(this.configurationService, mainWindow, this.state.runtime.menuBar.toggled, this.isZenModeActive()));
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

		const panelPostion = this.stateModel.getRuntimeValue(LayoutStateKeys.PANEL_POSITION);
		const sideBarPosition = this.stateModel.getRuntimeValue(LayoutStateKeys.SIDEBAR_POSITON);

		const result = [] as ISerializedNode[];
		if (!isHorizontal(panelPostion)) {
			result.push(nodes.editor);
			nodes.editor.size = availableWidth - activityBarSize - sideBarSize - panelSize - auxiliaryBarSize;
			if (panelPostion === Position.RIGHT) {
				result.push(nodes.panel);
			} else {
				result.splice(0, 0, nodes.panel);
			}

			if (sideBarPosition === Position.LEFT) {
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
			const sideBarNextToEditor = !(panelAlignment === 'center' || (sideBarPosition === Position.LEFT && panelAlignment === 'right') || (sideBarPosition === Position.RIGHT && panelAlignment === 'left'));
			const auxiliaryBarNextToEditor = !(panelAlignment === 'center' || (sideBarPosition === Position.RIGHT && panelAlignment === 'right') || (sideBarPosition === Position.LEFT && panelAlignment === 'left'));

			const editorSectionWidth = availableWidth - activityBarSize - (sideBarNextToEditor ? 0 : sideBarSize) - (auxiliaryBarNextToEditor ? 0 : auxiliaryBarSize);

			const editorNodes = this.arrangeEditorNodes({
				editor: nodes.editor,
				sideBar: sideBarNextToEditor ? nodes.sideBar : undefined,
				auxiliaryBar: auxiliaryBarNextToEditor ? nodes.auxiliaryBar : undefined
			}, availableHeight - panelSize, editorSectionWidth);

			result.push({
				type: 'branch',
				data: panelPostion === Position.BOTTOM ? [editorNodes, nodes.panel] : [nodes.panel, editorNodes],
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

		const titleAndBanner: ISerializedNode[] = [
			{
				type: 'leaf',
				data: { type: Parts.TITLEBAR_PART },
				size: titleBarHeight,
				visible: this.isVisible(Parts.TITLEBAR_PART, mainWindow)
			},
			{
				type: 'leaf',
				data: { type: Parts.BANNER_PART },
				size: bannerHeight,
				visible: false
			}
		];

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
					...(this.shouldShowBannerFirst() ? titleAndBanner.reverse() : titleAndBanner),
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
			activityBarVisible: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether or the not the activity bar is visible' };
			sideBarVisible: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether or the not the primary side bar is visible' };
			auxiliaryBarVisible: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether or the not the secondary side bar is visible' };
			panelVisible: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether or the not the panel is visible' };
			statusbarVisible: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether or the not the status bar is visible' };
			sideBarPosition: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the primary side bar is on the left or right' };
			panelPosition: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the panel is on the top, bottom, left, or right' };
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
	showTabs: 'multiple' | 'single' | 'none';
	restore: boolean;
	silentNotifications: boolean;
};

function getZenModeConfiguration(configurationService: IConfigurationService): ZenModeConfiguration {
	return configurationService.getValue<ZenModeConfiguration>(WorkbenchLayoutSettings.ZEN_MODE_CONFIG);
}

//#endregion

//#region Layout State Model

interface IWorkbenchLayoutStateKey {
	readonly name: string;
	readonly runtime: boolean;
	readonly defaultValue: unknown;
	readonly scope: StorageScope;
	readonly target: StorageTarget;
	readonly zenModeIgnore?: boolean;
}

type StorageKeyType = string | boolean | number | object;

abstract class WorkbenchLayoutStateKey<T extends StorageKeyType> implements IWorkbenchLayoutStateKey {

	abstract readonly runtime: boolean;

	constructor(readonly name: string, readonly scope: StorageScope, readonly target: StorageTarget, public defaultValue: T) { }
}

class RuntimeStateKey<T extends StorageKeyType> extends WorkbenchLayoutStateKey<T> {

	readonly runtime = true;

	constructor(name: string, scope: StorageScope, target: StorageTarget, defaultValue: T, readonly zenModeIgnore?: boolean) {
		super(name, scope, target, defaultValue);
	}
}

class InitializationStateKey<T extends StorageKeyType> extends WorkbenchLayoutStateKey<T> {
	readonly runtime = false;
}

const LayoutStateKeys = {

	// Editor
	MAIN_EDITOR_CENTERED: new RuntimeStateKey<boolean>('editor.centered', StorageScope.WORKSPACE, StorageTarget.MACHINE, false),

	// Zen Mode
	ZEN_MODE_ACTIVE: new RuntimeStateKey<boolean>('zenMode.active', StorageScope.WORKSPACE, StorageTarget.MACHINE, false),
	ZEN_MODE_EXIT_INFO: new RuntimeStateKey('zenMode.exitInfo', StorageScope.WORKSPACE, StorageTarget.MACHINE, {
		transitionedToCenteredEditorLayout: false,
		transitionedToFullScreen: false,
		handleNotificationsDoNotDisturbMode: false,
		wasVisible: {
			auxiliaryBar: false,
			panel: false,
			sideBar: false,
		},
	}),

	// Part Sizing
	GRID_SIZE: new InitializationStateKey('grid.size', StorageScope.PROFILE, StorageTarget.MACHINE, { width: 800, height: 600 }),
	SIDEBAR_SIZE: new InitializationStateKey<number>('sideBar.size', StorageScope.PROFILE, StorageTarget.MACHINE, 200),
	AUXILIARYBAR_SIZE: new InitializationStateKey<number>('auxiliaryBar.size', StorageScope.PROFILE, StorageTarget.MACHINE, 200),
	PANEL_SIZE: new InitializationStateKey<number>('panel.size', StorageScope.PROFILE, StorageTarget.MACHINE, 300),

	PANEL_LAST_NON_MAXIMIZED_HEIGHT: new RuntimeStateKey<number>('panel.lastNonMaximizedHeight', StorageScope.PROFILE, StorageTarget.MACHINE, 300),
	PANEL_LAST_NON_MAXIMIZED_WIDTH: new RuntimeStateKey<number>('panel.lastNonMaximizedWidth', StorageScope.PROFILE, StorageTarget.MACHINE, 300),
	PANEL_WAS_LAST_MAXIMIZED: new RuntimeStateKey<boolean>('panel.wasLastMaximized', StorageScope.WORKSPACE, StorageTarget.MACHINE, false),

	// Part Positions
	SIDEBAR_POSITON: new RuntimeStateKey<Position>('sideBar.position', StorageScope.WORKSPACE, StorageTarget.MACHINE, Position.LEFT),
	PANEL_POSITION: new RuntimeStateKey<Position>('panel.position', StorageScope.WORKSPACE, StorageTarget.MACHINE, Position.BOTTOM),
	PANEL_ALIGNMENT: new RuntimeStateKey<PanelAlignment>('panel.alignment', StorageScope.PROFILE, StorageTarget.USER, 'center'),

	// Part Visibility
	ACTIVITYBAR_HIDDEN: new RuntimeStateKey<boolean>('activityBar.hidden', StorageScope.WORKSPACE, StorageTarget.MACHINE, false, true),
	SIDEBAR_HIDDEN: new RuntimeStateKey<boolean>('sideBar.hidden', StorageScope.WORKSPACE, StorageTarget.MACHINE, false),
	EDITOR_HIDDEN: new RuntimeStateKey<boolean>('editor.hidden', StorageScope.WORKSPACE, StorageTarget.MACHINE, false),
	PANEL_HIDDEN: new RuntimeStateKey<boolean>('panel.hidden', StorageScope.WORKSPACE, StorageTarget.MACHINE, true),
	AUXILIARYBAR_HIDDEN: new RuntimeStateKey<boolean>('auxiliaryBar.hidden', StorageScope.WORKSPACE, StorageTarget.MACHINE, true),
	STATUSBAR_HIDDEN: new RuntimeStateKey<boolean>('statusBar.hidden', StorageScope.WORKSPACE, StorageTarget.MACHINE, false, true)

} as const;

interface ILayoutStateChangeEvent<T extends StorageKeyType> {
	readonly key: RuntimeStateKey<T>;
	readonly value: T;
}

enum WorkbenchLayoutSettings {
	PANEL_POSITION = 'workbench.panel.defaultLocation',
	PANEL_OPENS_MAXIMIZED = 'workbench.panel.opensMaximized',
	ZEN_MODE_CONFIG = 'zenMode',
	EDITOR_CENTERED_LAYOUT_AUTO_RESIZE = 'workbench.editor.centeredLayoutAutoResize',
}

enum LegacyWorkbenchLayoutSettings {
	STATUSBAR_VISIBLE = 'workbench.statusBar.visible', // Deprecated to UI State
	SIDEBAR_POSITION = 'workbench.sideBar.location', // Deprecated to UI State
}

class LayoutStateModel extends Disposable {

	static readonly STORAGE_PREFIX = 'workbench.';

	private readonly _onDidChangeState = this._register(new Emitter<ILayoutStateChangeEvent<StorageKeyType>>());
	readonly onDidChangeState = this._onDidChangeState.event;

	private readonly stateCache = new Map<string, unknown>();

	constructor(
		private readonly storageService: IStorageService,
		private readonly configurationService: IConfigurationService,
		private readonly contextService: IWorkspaceContextService,
		private readonly container: HTMLElement
	) {
		super();

		this._register(this.configurationService.onDidChangeConfiguration(configurationChange => this.updateStateFromLegacySettings(configurationChange)));
	}

	private updateStateFromLegacySettings(configurationChangeEvent: IConfigurationChangeEvent): void {
		if (configurationChangeEvent.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION)) {
			this.setRuntimeValueAndFire(LayoutStateKeys.ACTIVITYBAR_HIDDEN, this.isActivityBarHidden());
		}

		if (configurationChangeEvent.affectsConfiguration(LegacyWorkbenchLayoutSettings.STATUSBAR_VISIBLE)) {
			this.setRuntimeValueAndFire(LayoutStateKeys.STATUSBAR_HIDDEN, !this.configurationService.getValue(LegacyWorkbenchLayoutSettings.STATUSBAR_VISIBLE));
		}

		if (configurationChangeEvent.affectsConfiguration(LegacyWorkbenchLayoutSettings.SIDEBAR_POSITION)) {
			this.setRuntimeValueAndFire(LayoutStateKeys.SIDEBAR_POSITON, positionFromString(this.configurationService.getValue(LegacyWorkbenchLayoutSettings.SIDEBAR_POSITION) ?? 'left'));
		}
	}

	private updateLegacySettingsFromState<T extends StorageKeyType>(key: RuntimeStateKey<T>, value: T): void {
		const isZenMode = this.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE);
		if (key.zenModeIgnore && isZenMode) {
			return;
		}

		if (key === LayoutStateKeys.ACTIVITYBAR_HIDDEN) {
			this.configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, value ? ActivityBarPosition.HIDDEN : undefined);
		} else if (key === LayoutStateKeys.STATUSBAR_HIDDEN) {
			this.configurationService.updateValue(LegacyWorkbenchLayoutSettings.STATUSBAR_VISIBLE, !value);
		} else if (key === LayoutStateKeys.SIDEBAR_POSITON) {
			this.configurationService.updateValue(LegacyWorkbenchLayoutSettings.SIDEBAR_POSITION, positionToString(value as Position));
		}
	}

	load(): void {
		let key: keyof typeof LayoutStateKeys;

		// Load stored values for all keys
		for (key in LayoutStateKeys) {
			const stateKey = LayoutStateKeys[key] as WorkbenchLayoutStateKey<StorageKeyType>;
			const value = this.loadKeyFromStorage(stateKey);

			if (value !== undefined) {
				this.stateCache.set(stateKey.name, value);
			}
		}

		// Apply legacy settings
		this.stateCache.set(LayoutStateKeys.ACTIVITYBAR_HIDDEN.name, this.isActivityBarHidden());
		this.stateCache.set(LayoutStateKeys.STATUSBAR_HIDDEN.name, !this.configurationService.getValue(LegacyWorkbenchLayoutSettings.STATUSBAR_VISIBLE));
		this.stateCache.set(LayoutStateKeys.SIDEBAR_POSITON.name, positionFromString(this.configurationService.getValue(LegacyWorkbenchLayoutSettings.SIDEBAR_POSITION) ?? 'left'));

		// Set dynamic defaults: part sizing and side bar visibility
		const workbenchDimensions = getClientArea(this.container);
		LayoutStateKeys.PANEL_POSITION.defaultValue = positionFromString(this.configurationService.getValue(WorkbenchLayoutSettings.PANEL_POSITION) ?? 'bottom');
		LayoutStateKeys.GRID_SIZE.defaultValue = { height: workbenchDimensions.height, width: workbenchDimensions.width };
		LayoutStateKeys.SIDEBAR_SIZE.defaultValue = Math.min(300, workbenchDimensions.width / 4);
		LayoutStateKeys.AUXILIARYBAR_SIZE.defaultValue = Math.min(300, workbenchDimensions.width / 4);
		LayoutStateKeys.PANEL_SIZE.defaultValue = (this.stateCache.get(LayoutStateKeys.PANEL_POSITION.name) ?? isHorizontal(LayoutStateKeys.PANEL_POSITION.defaultValue)) ? workbenchDimensions.height / 3 : workbenchDimensions.width / 4;
		LayoutStateKeys.SIDEBAR_HIDDEN.defaultValue = this.contextService.getWorkbenchState() === WorkbenchState.EMPTY;

		// Apply all defaults
		for (key in LayoutStateKeys) {
			const stateKey = LayoutStateKeys[key];
			if (this.stateCache.get(stateKey.name) === undefined) {
				this.stateCache.set(stateKey.name, stateKey.defaultValue);
			}
		}

		// Register for runtime key changes
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this._register(new DisposableStore()))(storageChangeEvent => {
			let key: keyof typeof LayoutStateKeys;
			for (key in LayoutStateKeys) {
				const stateKey = LayoutStateKeys[key] as WorkbenchLayoutStateKey<StorageKeyType>;
				if (stateKey instanceof RuntimeStateKey && stateKey.scope === StorageScope.PROFILE && stateKey.target === StorageTarget.USER) {
					if (`${LayoutStateModel.STORAGE_PREFIX}${stateKey.name}` === storageChangeEvent.key) {
						const value = this.loadKeyFromStorage(stateKey) ?? stateKey.defaultValue;
						if (this.stateCache.get(stateKey.name) !== value) {
							this.stateCache.set(stateKey.name, value);
							this._onDidChangeState.fire({ key: stateKey, value });
						}
					}
				}
			}
		}));
	}

	save(workspace: boolean, global: boolean): void {
		let key: keyof typeof LayoutStateKeys;

		const isZenMode = this.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE);

		for (key in LayoutStateKeys) {
			const stateKey = LayoutStateKeys[key] as WorkbenchLayoutStateKey<StorageKeyType>;
			if ((workspace && stateKey.scope === StorageScope.WORKSPACE) ||
				(global && stateKey.scope === StorageScope.PROFILE)) {
				if (isZenMode && stateKey instanceof RuntimeStateKey && stateKey.zenModeIgnore) {
					continue; // Don't write out specific keys while in zen mode
				}

				this.saveKeyToStorage(stateKey);
			}
		}
	}

	getInitializationValue<T extends StorageKeyType>(key: InitializationStateKey<T>): T {
		return this.stateCache.get(key.name) as T;
	}

	setInitializationValue<T extends StorageKeyType>(key: InitializationStateKey<T>, value: T): void {
		this.stateCache.set(key.name, value);
	}

	getRuntimeValue<T extends StorageKeyType>(key: RuntimeStateKey<T>, fallbackToSetting?: boolean): T {
		if (fallbackToSetting) {
			switch (key) {
				case LayoutStateKeys.ACTIVITYBAR_HIDDEN:
					this.stateCache.set(key.name, this.isActivityBarHidden());
					break;
				case LayoutStateKeys.STATUSBAR_HIDDEN:
					this.stateCache.set(key.name, !this.configurationService.getValue(LegacyWorkbenchLayoutSettings.STATUSBAR_VISIBLE));
					break;
				case LayoutStateKeys.SIDEBAR_POSITON:
					this.stateCache.set(key.name, this.configurationService.getValue(LegacyWorkbenchLayoutSettings.SIDEBAR_POSITION) ?? 'left');
					break;
			}
		}

		return this.stateCache.get(key.name) as T;
	}

	setRuntimeValue<T extends StorageKeyType>(key: RuntimeStateKey<T>, value: T): void {
		this.stateCache.set(key.name, value);
		const isZenMode = this.getRuntimeValue(LayoutStateKeys.ZEN_MODE_ACTIVE);

		if (key.scope === StorageScope.PROFILE) {
			if (!isZenMode || !key.zenModeIgnore) {
				this.saveKeyToStorage<T>(key);
				this.updateLegacySettingsFromState(key, value);
			}
		}
	}

	private isActivityBarHidden(): boolean {
		const oldValue = this.configurationService.getValue<boolean | undefined>('workbench.activityBar.visible');
		if (oldValue !== undefined) {
			return !oldValue;
		}

		return this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION) !== ActivityBarPosition.DEFAULT;
	}

	private setRuntimeValueAndFire<T extends StorageKeyType>(key: RuntimeStateKey<T>, value: T): void {
		const previousValue = this.stateCache.get(key.name);
		if (previousValue === value) {
			return;
		}

		this.setRuntimeValue(key, value);
		this._onDidChangeState.fire({ key, value });
	}

	private saveKeyToStorage<T extends StorageKeyType>(key: WorkbenchLayoutStateKey<T>): void {
		const value = this.stateCache.get(key.name) as T;
		this.storageService.store(`${LayoutStateModel.STORAGE_PREFIX}${key.name}`, typeof value === 'object' ? JSON.stringify(value) : value, key.scope, key.target);
	}

	private loadKeyFromStorage<T extends StorageKeyType>(key: WorkbenchLayoutStateKey<T>): T | undefined {
		let value: any = this.storageService.get(`${LayoutStateModel.STORAGE_PREFIX}${key.name}`, key.scope);

		if (value !== undefined) {
			switch (typeof key.defaultValue) {
				case 'boolean': value = value === 'true'; break;
				case 'number': value = parseInt(value); break;
				case 'object': value = JSON.parse(value); break;
			}
		}

		return value as T | undefined;
	}
}

//#endregion
