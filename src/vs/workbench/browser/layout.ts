/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { EventType, addDisposableListener, addClass, removeClass, isAncestor, getClientArea, position, size, EventHelper, Dimension } from 'vs/base/browser/dom';
import { onDidChangeFullscreen, isFullscreen, getZoomFactor } from 'vs/base/browser/browser';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { Registry } from 'vs/platform/registry/common/platform';
import { isWindows, isLinux, isMacintosh, isWeb, isNative } from 'vs/base/common/platform';
import { pathsToEditors } from 'vs/workbench/common/editor';
import { SidebarPart } from 'vs/workbench/browser/parts/sidebar/sidebarPart';
import { PanelPart } from 'vs/workbench/browser/parts/panel/panelPart';
import { PanelRegistry, Extensions as PanelExtensions } from 'vs/workbench/browser/panel';
import { Position, Parts, IWorkbenchLayoutService, ILayoutOptions } from 'vs/workbench/services/layout/browser/layoutService';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IStorageService, StorageScope, WillSaveStateReason } from 'vs/platform/storage/common/storage';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { ITitleService } from 'vs/workbench/services/title/common/titleService';
import { IInstantiationService, ServicesAccessor, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { LifecyclePhase, StartupKind, ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IWindowService, MenuBarVisibility, getTitleBarStyle } from 'vs/platform/windows/common/windows';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IEditorService, IResourceEditor } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { Grid, SerializableGrid, ISerializableView, ISerializedGrid, Orientation, ISerializedNode, ISerializedLeafNode, Direction } from 'vs/base/browser/ui/grid/grid';
import { WorkbenchLegacyLayout } from 'vs/workbench/browser/legacyLayout';
import { IDimension } from 'vs/platform/layout/browser/layoutService';
import { Part } from 'vs/workbench/browser/part';
import { IStatusbarService } from 'vs/platform/statusbar/common/statusbar';
import { IActivityBarService } from 'vs/workbench/services/activityBar/browser/activityBarService';
import { IFileService } from 'vs/platform/files/common/files';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { coalesce } from 'vs/base/common/arrays';

enum Settings {
	MENUBAR_VISIBLE = 'window.menuBarVisibility',
	ACTIVITYBAR_VISIBLE = 'workbench.activityBar.visible',
	STATUSBAR_VISIBLE = 'workbench.statusBar.visible',

	SIDEBAR_POSITION = 'workbench.sideBar.location',
	PANEL_POSITION = 'workbench.panel.defaultLocation',

	ZEN_MODE_RESTORE = 'zenMode.restore',

	// TODO @misolori update this when finished
	OCTICONS_UPDATE_ENABLED = 'workbench.octiconsUpdate.enabled',
}

enum Storage {
	SIDEBAR_HIDDEN = 'workbench.sidebar.hidden',
	SIDEBAR_SIZE = 'workbench.sidebar.size',

	PANEL_HIDDEN = 'workbench.panel.hidden',
	PANEL_POSITION = 'workbench.panel.location',
	PANEL_SIZE = 'workbench.panel.size',
	PANEL_SIZE_BEFORE_MAXIMIZED = 'workbench.panel.sizeBeforeMaximized',

	ZEN_MODE_ENABLED = 'workbench.zenmode.active',
	CENTERED_LAYOUT_ENABLED = 'workbench.centerededitorlayout.active',

	GRID_LAYOUT = 'workbench.grid.layout',
	GRID_WIDTH = 'workbench.grid.width',
	GRID_HEIGHT = 'workbench.grid.height'
}

enum Classes {
	SIDEBAR_HIDDEN = 'nosidebar',
	EDITOR_HIDDEN = 'noeditorarea',
	PANEL_HIDDEN = 'nopanel',
	STATUSBAR_HIDDEN = 'nostatusbar',
	FULLSCREEN = 'fullscreen'
}

export abstract class Layout extends Disposable implements IWorkbenchLayoutService {

	_serviceBrand!: ServiceIdentifier<any>;

	private readonly _onTitleBarVisibilityChange: Emitter<void> = this._register(new Emitter<void>());
	readonly onTitleBarVisibilityChange: Event<void> = this._onTitleBarVisibilityChange.event;

	private readonly _onZenModeChange: Emitter<boolean> = this._register(new Emitter<boolean>());
	readonly onZenModeChange: Event<boolean> = this._onZenModeChange.event;

	private readonly _onFullscreenChange: Emitter<boolean> = this._register(new Emitter<boolean>());
	readonly onFullscreenChange: Event<boolean> = this._onFullscreenChange.event;

	private readonly _onCenteredLayoutChange: Emitter<boolean> = this._register(new Emitter<boolean>());
	readonly onCenteredLayoutChange: Event<boolean> = this._onCenteredLayoutChange.event;

	private readonly _onPanelPositionChange: Emitter<string> = this._register(new Emitter<string>());
	readonly onPanelPositionChange: Event<string> = this._onPanelPositionChange.event;

	private readonly _onLayout = this._register(new Emitter<IDimension>());
	readonly onLayout: Event<IDimension> = this._onLayout.event;

	private _dimension: IDimension;
	get dimension(): IDimension { return this._dimension; }

	private _container: HTMLElement = document.createElement('div');
	get container(): HTMLElement { return this._container; }

	private parts: Map<string, Part> = new Map<string, Part>();

	private workbenchGrid: SerializableGrid<ISerializableView> | WorkbenchLegacyLayout;

	private disposed: boolean;

	private titleBarPartView: ISerializableView;
	private activityBarPartView: ISerializableView;
	private sideBarPartView: ISerializableView;
	private panelPartView: ISerializableView;
	private editorPartView: ISerializableView;
	private statusBarPartView: ISerializableView;

	private environmentService: IWorkbenchEnvironmentService;
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

	protected readonly state = {
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
			sizeBeforeMaximize: 0,
			position: Position.BOTTOM,
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
			transitionDisposables: new DisposableStore()
		},

		// TODO @misolori update this when finished
		octiconsUpdate: {
			enabled: false
		}
	};

	constructor(
		protected readonly parent: HTMLElement
	) {
		super();
	}

	protected initLayout(accessor: ServicesAccessor): void {

		// Services
		this.environmentService = accessor.get(IWorkbenchEnvironmentService);
		this.configurationService = accessor.get(IConfigurationService);
		this.lifecycleService = accessor.get(ILifecycleService);
		this.windowService = accessor.get(IWindowService);
		this.contextService = accessor.get(IWorkspaceContextService);
		this.storageService = accessor.get(IStorageService);
		this.backupFileService = accessor.get(IBackupFileService);

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
		this.initLayoutState(accessor.get(ILifecycleService), accessor.get(IFileService));
	}

	private registerLayoutListeners(): void {

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
		this._register(addDisposableListener(this.container, EventType.SCROLL, () => this.container.scrollTop = 0));

		// Prevent native context menus in web #73781
		if (isWeb) {
			this._register(addDisposableListener(this.container, EventType.CONTEXT_MENU, (e) => EventHelper.stop(e, true)));
		}

		// Menubar visibility changes
		if ((isWindows || isLinux || isWeb) && getTitleBarStyle(this.configurationService, this.environmentService) === 'custom') {
			this._register(this.titleService.onMenubarVisibilityChange(visible => this.onMenubarToggled(visible)));
		}
	}

	private onMenubarToggled(visible: boolean) {
		if (visible !== this.state.menuBar.toggled) {
			this.state.menuBar.toggled = visible;

			if (this.state.fullscreen && (this.state.menuBar.visibility === 'toggle' || this.state.menuBar.visibility === 'default')) {
				this._onTitleBarVisibilityChange.fire();

				if (this.workbenchGrid instanceof SerializableGrid) {
					this.workbenchGrid.setViewVisible(this.titleBarPartView, this.isVisible(Parts.TITLEBAR_PART));
				}

				this.layout();
			}
		}
	}

	private onFullscreenChanged(): void {
		this.state.fullscreen = isFullscreen();

		// Apply as CSS class
		if (this.state.fullscreen) {
			addClass(this.container, Classes.FULLSCREEN);
		} else {
			removeClass(this.container, Classes.FULLSCREEN);

			if (this.state.zenMode.transitionedToFullScreen && this.state.zenMode.active) {
				this.toggleZenMode();
			}
		}

		// Changing fullscreen state of the window has an impact on custom title bar visibility, so we need to update
		if (getTitleBarStyle(this.configurationService, this.environmentService) === 'custom') {
			this._onTitleBarVisibilityChange.fire();

			if (this.workbenchGrid instanceof SerializableGrid) {
				this.workbenchGrid.setViewVisible(this.titleBarPartView, this.isVisible(Parts.TITLEBAR_PART));
			}

			this.layout(); // handle title bar when fullscreen changes
		}

		this._onFullscreenChange.fire(this.state.fullscreen);
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

		// TODO @misolori update this when finished
		const newOcticonsUpdate = this.configurationService.getValue<boolean>(Settings.OCTICONS_UPDATE_ENABLED);
		this.setOcticonsUpdate(newOcticonsUpdate);

	}

	private setSideBarPosition(position: Position): void {
		const activityBar = this.getPart(Parts.ACTIVITYBAR_PART);
		const sideBar = this.getPart(Parts.SIDEBAR_PART);
		const wasHidden = this.state.sideBar.hidden;
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
				this.state.sideBar.width = this.workbenchGrid.getViewSize(this.sideBarPartView).width;
			}

			if (position === Position.LEFT) {
				this.workbenchGrid.moveViewTo(this.activityBarPartView, [1, 0]);
				this.workbenchGrid.moveViewTo(this.sideBarPartView, [1, 1]);
			} else {
				this.workbenchGrid.moveViewTo(this.sideBarPartView, [1, 4]);
				this.workbenchGrid.moveViewTo(this.activityBarPartView, [1, 4]);
			}

			this.layout();
		} else {
			this.workbenchGrid.layout();
		}
	}

	private initLayoutState(lifecycleService: ILifecycleService, fileService: IFileService): void {

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
		this.state.editor.editorsToOpen = this.resolveEditorsToOpen(fileService);

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

		// Panel size before maximized
		this.state.panel.sizeBeforeMaximize = this.storageService.getNumber(Storage.PANEL_SIZE_BEFORE_MAXIMIZED, StorageScope.GLOBAL, 0);

		// Statusbar visibility
		this.state.statusBar.hidden = !this.configurationService.getValue<string>(Settings.STATUSBAR_VISIBLE);

		// Zen mode enablement
		this.state.zenMode.restore = this.storageService.getBoolean(Storage.ZEN_MODE_ENABLED, StorageScope.WORKSPACE, false) && this.configurationService.getValue(Settings.ZEN_MODE_RESTORE);

		// TODO @misolori update this when finished
		this.state.octiconsUpdate.enabled = this.configurationService.getValue<boolean>(Settings.OCTICONS_UPDATE_ENABLED);
		this.setOcticonsUpdate(this.state.octiconsUpdate.enabled);

	}

	private resolveEditorsToOpen(fileService: IFileService): Promise<IResourceEditor[]> | IResourceEditor[] {
		const configuration = this.environmentService.configuration;
		const hasInitialFilesToOpen = this.hasInitialFilesToOpen();

		// Only restore editors if we are not instructed to open files initially
		this.state.editor.restoreEditors = !hasInitialFilesToOpen;

		// Files to open, diff or create
		if (hasInitialFilesToOpen) {

			// Files to diff is exclusive
			return pathsToEditors(configuration.filesToDiff, fileService).then(filesToDiff => {
				if (filesToDiff && filesToDiff.length === 2) {
					return [{
						leftResource: filesToDiff[0].resource,
						rightResource: filesToDiff[1].resource,
						options: { pinned: true },
						forceFile: true
					}];
				}

				// Otherwise: Open/Create files
				return pathsToEditors(configuration.filesToOpenOrCreate, fileService);
			});
		}

		// Empty workbench
		else if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY && this.configurationService.inspect('workbench.startupEditor').value === 'newUntitledFile') {
			if (this.editorGroupService.willRestoreEditors) {
				return []; // do not open any empty untitled file if we restored editors from previous session
			}

			return this.backupFileService.hasBackups().then(hasBackups => {
				if (hasBackups) {
					return []; // do not open any empty untitled file if we have backups to restore
				}

				return [Object.create(null)]; // open empty untitled file
			});
		}

		return [];
	}

	private hasInitialFilesToOpen(): boolean {
		const configuration = this.environmentService.configuration;

		return !!(
			(configuration.filesToOpenOrCreate && configuration.filesToOpenOrCreate.length > 0) ||
			(configuration.filesToDiff && configuration.filesToDiff.length > 0)
		);
	}

	private updatePanelPosition() {
		const defaultPanelPosition = this.configurationService.getValue<string>(Settings.PANEL_POSITION);
		const panelPosition = this.storageService.get(Storage.PANEL_POSITION, StorageScope.WORKSPACE, defaultPanelPosition);

		this.state.panel.position = (panelPosition === 'right') ? Position.RIGHT : Position.BOTTOM;
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
				} else if (isMacintosh && isNative) {
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

	getDimension(part: Parts): Dimension {
		return this.getPart(part).dimension;
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

	getWorkbenchContainer(): HTMLElement {
		return this.parent;
	}

	getWorkbenchElement(): HTMLElement {
		return this.container;
	}

	toggleZenMode(skipLayout?: boolean, restoring = false): void {
		this.state.zenMode.active = !this.state.zenMode.active;
		this.state.zenMode.transitionDisposables.clear();

		const setLineNumbers = (lineNumbers?: any) => this.editorService.visibleTextEditorWidgets.forEach(editor => {
			// To properly reset line numbers we need to read the configuration for each editor respecting it's uri.
			if (!lineNumbers && isCodeEditor(editor) && editor.hasModel()) {
				const model = editor.getModel();
				this.configurationService.getValue('editor.lineNumbers', { resource: model.uri });
			} else {
				editor.updateOptions({ lineNumbers });
			}
		});

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
				this.state.zenMode.transitionDisposables.add(this.editorService.onDidVisibleEditorsChange(() => setLineNumbers('off')));
			}

			if (config.hideTabs && this.editorGroupService.partOptions.showTabs) {
				this.state.zenMode.transitionDisposables.add(this.editorGroupService.enforcePartOptions({ showTabs: false }));
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

			setLineNumbers();

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
		this._onZenModeChange.fire(this.state.zenMode.active);

		// State
		if (this.state.zenMode.active) {
			this.storageService.store(Storage.ZEN_MODE_ENABLED, true, StorageScope.WORKSPACE);

			// Exit zen mode on shutdown unless configured to keep
			this.state.zenMode.transitionDisposables.add(this.storageService.onWillSaveState(e => {
				if (e.reason === WillSaveStateReason.SHUTDOWN && this.state.zenMode.active) {
					if (!this.configurationService.getValue(Settings.ZEN_MODE_RESTORE)) {
						this.toggleZenMode(true); // We will not restore zen mode, need to clear all zen mode state changes
					}
				}
			}));
		} else {
			this.storageService.remove(Storage.ZEN_MODE_ENABLED, StorageScope.WORKSPACE);
		}
	}

	private setStatusBarHidden(hidden: boolean, skipLayout?: boolean): void {
		this.state.statusBar.hidden = hidden;

		// Adjust CSS
		if (hidden) {
			addClass(this.container, Classes.STATUSBAR_HIDDEN);
		} else {
			removeClass(this.container, Classes.STATUSBAR_HIDDEN);
		}

		// Propagate to grid
		if (this.workbenchGrid instanceof Grid) {
			this.workbenchGrid.setViewVisible(this.statusBarPartView, !hidden);
		}

		// Layout
		if (!skipLayout) {
			if (!(this.workbenchGrid instanceof Grid)) {
				this.workbenchGrid.layout();
			}
		}
	}

	// TODO @misolori update this when finished
	private setOcticonsUpdate(enabled: boolean): void {
		this.state.octiconsUpdate.enabled = enabled;

		// Update DOM
		if (enabled) {
			document.body.dataset.octiconsUpdate = 'enabled';
		} else {
			document.body.dataset.octiconsUpdate = '';
		}

	}

	protected createWorkbenchLayout(instantiationService: IInstantiationService): void {
		const titleBar = this.getPart(Parts.TITLEBAR_PART);
		const editorPart = this.getPart(Parts.EDITOR_PART);
		const activityBar = this.getPart(Parts.ACTIVITYBAR_PART);
		const panelPart = this.getPart(Parts.PANEL_PART);
		const sideBar = this.getPart(Parts.SIDEBAR_PART);
		const statusBar = this.getPart(Parts.STATUSBAR_PART);

		if (this.configurationService.getValue('workbench.useExperimentalGridLayout')) {

			// View references for all parts
			this.titleBarPartView = titleBar;
			this.sideBarPartView = sideBar;
			this.activityBarPartView = activityBar;
			this.editorPartView = editorPart;
			this.panelPartView = panelPart;
			this.statusBarPartView = statusBar;

			const viewMap = {
				[Parts.ACTIVITYBAR_PART]: this.activityBarPartView,
				[Parts.TITLEBAR_PART]: this.titleBarPartView,
				[Parts.EDITOR_PART]: this.editorPartView,
				[Parts.PANEL_PART]: this.panelPartView,
				[Parts.SIDEBAR_PART]: this.sideBarPartView,
				[Parts.STATUSBAR_PART]: this.statusBarPartView
			};

			const fromJSON = ({ type }: { type: Parts }) => viewMap[type];
			const workbenchGrid = SerializableGrid.deserialize(
				this.createGridDescriptor(),
				{ fromJSON },
				{ proportionalLayout: false }
			);

			this.container.prepend(workbenchGrid.element);
			this.workbenchGrid = workbenchGrid;

			this._register((this.sideBarPartView as SidebarPart).onDidVisibilityChange((visible) => {
				this.setSideBarHidden(!visible, true);
			}));

			this._register((this.panelPartView as PanelPart).onDidVisibilityChange((visible) => {
				this.setPanelHidden(!visible, true);
			}));

			this._register((this.editorPartView as PanelPart).onDidVisibilityChange((visible) => {
				this.setEditorHidden(!visible, true);
			}));

			this._register(this.storageService.onWillSaveState(() => {
				const grid = this.workbenchGrid as SerializableGrid<ISerializableView>;

				const sideBarSize = this.state.sideBar.hidden
					? grid.getViewCachedVisibleSize(this.sideBarPartView)
					: grid.getViewSize(this.sideBarPartView).width;

				this.storageService.store(Storage.SIDEBAR_SIZE, sideBarSize, StorageScope.GLOBAL);

				const panelSize = this.state.panel.hidden
					? grid.getViewCachedVisibleSize(this.panelPartView)
					: (this.state.panel.position === Position.BOTTOM ? grid.getViewSize(this.panelPartView).height : grid.getViewSize(this.panelPartView).width);

				this.storageService.store(Storage.PANEL_SIZE, panelSize, StorageScope.GLOBAL);

				const gridSize = grid.getViewSize();
				this.storageService.store(Storage.GRID_WIDTH, gridSize.width, StorageScope.GLOBAL);
				this.storageService.store(Storage.GRID_HEIGHT, gridSize.height, StorageScope.GLOBAL);
			}));
		} else {
			this.workbenchGrid = instantiationService.createInstance(
				WorkbenchLegacyLayout,
				this.parent,
				this.container,
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
				position(this.container, 0, 0, 0, 0, 'relative');
				size(this.container, this._dimension.width, this._dimension.height);

				// Layout the grid widget
				this.workbenchGrid.layout(this._dimension.width, this._dimension.height);
			} else {
				this.workbenchGrid.layout(options);
			}

			// Emit as event
			this._onLayout.fire(this._dimension);
		}
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

		this._onCenteredLayoutChange.fire(this.state.editor.centered);
	}

	resizePart(part: Parts, sizeChange: number): void {
		if (this.workbenchGrid instanceof Grid) {
			let viewSize;
			const sizeChangePxWidth = this.workbenchGrid.width * sizeChange / 100;
			const sizeChangePxHeight = this.workbenchGrid.height * sizeChange / 100;

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
				case Parts.EDITOR_PART:
					viewSize = this.workbenchGrid.getViewSize(this.editorPartView);

					// Single Editor Group
					if (this.editorGroupService.count === 1) {
						if (this.isVisible(Parts.SIDEBAR_PART)) {
							this.workbenchGrid.resizeView(this.editorPartView,
								{
									width: viewSize.width + sizeChangePxWidth,
									height: viewSize.height
								});
						} else if (this.isVisible(Parts.PANEL_PART)) {
							this.workbenchGrid.resizeView(this.editorPartView,
								{
									width: viewSize.width + (this.getPanelPosition() !== Position.BOTTOM ? sizeChangePxWidth : 0),
									height: viewSize.height + (this.getPanelPosition() !== Position.BOTTOM ? 0 : sizeChangePxHeight)
								});
						}
					} else {
						const activeGroup = this.editorGroupService.activeGroup;

						const { width, height } = this.editorGroupService.getSize(activeGroup);
						this.editorGroupService.setSize(activeGroup, { width: width + sizeChangePxWidth, height: height + sizeChangePxHeight });
					}

					break;
				default:
					return; // Cannot resize other parts
			}
		} else {
			// Legacy Layout
			this.workbenchGrid.resizePart(part, sizeChange);
		}
	}

	setActivityBarHidden(hidden: boolean, skipLayout?: boolean): void {
		this.state.activityBar.hidden = hidden;

		// Propagate to grid
		if (this.workbenchGrid instanceof Grid) {
			this.workbenchGrid.setViewVisible(this.activityBarPartView, !hidden);
		}

		// Layout
		if (!skipLayout) {
			if (!(this.workbenchGrid instanceof Grid)) {
				this.workbenchGrid.layout();
			}
		}
	}

	setEditorHidden(hidden: boolean, skipLayout?: boolean): void {
		if (!(this.workbenchGrid instanceof Grid)) {
			return;
		}

		this.state.editor.hidden = hidden;

		// Adjust CSS
		if (hidden) {
			addClass(this.container, Classes.EDITOR_HIDDEN);
		} else {
			removeClass(this.container, Classes.EDITOR_HIDDEN);
		}

		// Propagate to grid
		this.workbenchGrid.setViewVisible(this.editorPartView, !hidden);

		// The editor and panel cannot be hidden at the same time
		if (hidden && this.state.panel.hidden) {
			this.setPanelHidden(false, true);
		}
	}

	getLayoutClasses(): string[] {
		return coalesce([
			this.state.sideBar.hidden ? Classes.SIDEBAR_HIDDEN : undefined,
			this.state.editor.hidden ? Classes.EDITOR_HIDDEN : undefined,
			this.state.panel.hidden ? Classes.PANEL_HIDDEN : undefined,
			this.state.statusBar.hidden ? Classes.STATUSBAR_HIDDEN : undefined,
			this.state.fullscreen ? Classes.FULLSCREEN : undefined
		]);
	}

	setSideBarHidden(hidden: boolean, skipLayout?: boolean): void {
		this.state.sideBar.hidden = hidden;

		// Adjust CSS
		if (hidden) {
			addClass(this.container, Classes.SIDEBAR_HIDDEN);
		} else {
			removeClass(this.container, Classes.SIDEBAR_HIDDEN);
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

		// Propagate to grid
		if (this.workbenchGrid instanceof Grid) {
			this.workbenchGrid.setViewVisible(this.sideBarPartView, !hidden);
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
			if (!(this.workbenchGrid instanceof Grid)) {
				this.workbenchGrid.layout();
			}
		}
	}

	setPanelHidden(hidden: boolean, skipLayout?: boolean): void {
		this.state.panel.hidden = hidden;

		// Adjust CSS
		if (hidden) {
			addClass(this.container, Classes.PANEL_HIDDEN);
		} else {
			removeClass(this.container, Classes.PANEL_HIDDEN);
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

		// Propagate to grid
		if (this.workbenchGrid instanceof Grid) {
			this.workbenchGrid.setViewVisible(this.panelPartView, !hidden);
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
			if (!(this.workbenchGrid instanceof Grid)) {
				this.workbenchGrid.layout();
			}
		}
	}

	toggleMaximizedPanel(): void {
		if (this.workbenchGrid instanceof Grid) {
			const size = this.workbenchGrid.getViewSize(this.panelPartView);
			if (!this.isPanelMaximized()) {
				this.state.panel.sizeBeforeMaximize = this.state.panel.position === Position.BOTTOM ? size.height : size.width;
				this.storageService.store(Storage.PANEL_SIZE_BEFORE_MAXIMIZED, this.state.panel.sizeBeforeMaximize, StorageScope.GLOBAL);
				this.setEditorHidden(true);
			} else {
				this.setEditorHidden(false);
				this.workbenchGrid.resizeView(this.panelPartView, { width: this.state.panel.position === Position.BOTTOM ? size.width : this.state.panel.sizeBeforeMaximize, height: this.state.panel.position === Position.BOTTOM ? this.state.panel.sizeBeforeMaximize : size.height });
			}
		} else {
			this.workbenchGrid.layout({ toggleMaximizedPanel: true, source: Parts.PANEL_PART });
		}
	}

	isPanelMaximized(): boolean {
		if (!this.workbenchGrid) {
			return false;
		}

		if (this.workbenchGrid instanceof Grid) {
			return this.state.editor.hidden;
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
					this.workbenchGrid.setViewVisible(this.titleBarPartView, this.isVisible(Parts.TITLEBAR_PART));
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

	setPanelPosition(position: Position.BOTTOM | Position.RIGHT): void {
		if (this.state.panel.hidden) {
			this.setPanelHidden(false);
		}

		const panelPart = this.getPart(Parts.PANEL_PART);
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
			const size = this.workbenchGrid.getViewSize(this.panelPartView);
			const sideBarSize = this.workbenchGrid.getViewSize(this.sideBarPartView);

			if (position === Position.BOTTOM) {
				this.workbenchGrid.moveView(this.panelPartView, this.state.editor.hidden ? size.height : size.width, this.editorPartView, Direction.Down);
			} else {
				this.workbenchGrid.moveView(this.panelPartView, this.state.editor.hidden ? size.width : size.height, this.editorPartView, Direction.Right);
			}

			// Reset sidebar to original size before shifting the panel
			this.workbenchGrid.resizeView(this.sideBarPartView, sideBarSize);
		} else {
			this.workbenchGrid.layout();
		}

		this._onPanelPositionChange.fire(positionToString(this.state.panel.position));
	}

	private createGridDescriptor(): ISerializedGrid {
		const workbenchDimensions = getClientArea(this.parent);
		const width = this.storageService.getNumber(Storage.GRID_WIDTH, StorageScope.GLOBAL, workbenchDimensions.width);
		const height = this.storageService.getNumber(Storage.GRID_HEIGHT, StorageScope.GLOBAL, workbenchDimensions.height);
		// At some point, we will not fall back to old keys from legacy layout, but for now, let's migrate the keys
		const sideBarSize = this.storageService.getNumber(Storage.SIDEBAR_SIZE, StorageScope.GLOBAL, this.storageService.getNumber('workbench.sidebar.width', StorageScope.GLOBAL, Math.min(workbenchDimensions.width / 4, 300))!);
		const panelSize = this.storageService.getNumber(Storage.PANEL_SIZE, StorageScope.GLOBAL, this.storageService.getNumber(this.state.panel.position === Position.BOTTOM ? 'workbench.panel.height' : 'workbench.panel.width', StorageScope.GLOBAL, workbenchDimensions.height / 3));

		const titleBarHeight = this.titleBarPartView.minimumHeight;
		const statusBarHeight = this.statusBarPartView.minimumHeight;
		const activityBarWidth = this.activityBarPartView.minimumWidth;
		const middleSectionHeight = height - titleBarHeight - statusBarHeight;
		const editorSectionWidth = width - (this.state.activityBar.hidden ? 0 : activityBarWidth) - (this.state.sideBar.hidden ? 0 : sideBarSize);

		const activityBarNode: ISerializedLeafNode = {
			type: 'leaf',
			data: { type: Parts.ACTIVITYBAR_PART },
			size: activityBarWidth,
			visible: !this.state.activityBar.hidden
		};

		const sideBarNode: ISerializedLeafNode = {
			type: 'leaf',
			data: { type: Parts.SIDEBAR_PART },
			size: sideBarSize,
			visible: !this.state.sideBar.hidden
		};

		const editorNode: ISerializedLeafNode = {
			type: 'leaf',
			data: { type: Parts.EDITOR_PART },
			size: this.state.panel.position === Position.BOTTOM ? middleSectionHeight - (this.state.panel.hidden ? 0 : panelSize) : editorSectionWidth - (this.state.panel.hidden ? 0 : panelSize)
		};

		const panelNode: ISerializedLeafNode = {
			type: 'leaf',
			data: { type: Parts.PANEL_PART },
			size: panelSize,
			visible: !this.state.panel.hidden
		};

		const editorSectionNode: ISerializedNode[] = this.state.panel.position === Position.BOTTOM
			? [{ type: 'branch', data: [editorNode, panelNode], size: editorSectionWidth }]
			: [editorNode, panelNode];

		const middleSection: ISerializedNode[] = this.state.sideBar.position === Position.LEFT
			? [activityBarNode, sideBarNode, ...editorSectionNode]
			: [...editorSectionNode, sideBarNode, activityBarNode];

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
						type: 'branch',
						data: middleSection,
						size: middleSectionHeight
					},
					{
						type: 'leaf',
						data: { type: Parts.STATUSBAR_PART },
						size: statusBarHeight,
						visible: !this.state.statusBar.hidden
					}
				]
			},
			orientation: Orientation.VERTICAL,
			width,
			height
		};

		return result;
	}

	dispose(): void {
		super.dispose();

		this.disposed = true;
	}
}

