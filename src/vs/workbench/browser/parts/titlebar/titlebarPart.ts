/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/titlebarpart';
import { dirname, posix } from 'vs/base/common/path';
import * as resources from 'vs/base/common/resources';
import { Part } from 'vs/workbench/browser/part';
import { ITitleService, ITitleProperties } from 'vs/workbench/services/title/common/titleService';
import { getZoomFactor } from 'vs/base/browser/browser';
import { IWindowService, IWindowsService, MenuBarVisibility, getTitleBarStyle } from 'vs/platform/windows/common/windows';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { IAction, Action } from 'vs/base/common/actions';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { DisposableStore } from 'vs/base/common/lifecycle';
import * as nls from 'vs/nls';
import { EditorInput, toResource, Verbosity, SideBySideEditor } from 'vs/workbench/common/editor';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { TITLE_BAR_ACTIVE_BACKGROUND, TITLE_BAR_ACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_BACKGROUND, TITLE_BAR_BORDER } from 'vs/workbench/common/theme';
import { isMacintosh, isWindows, isLinux, isWeb } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { Color } from 'vs/base/common/color';
import { trim } from 'vs/base/common/strings';
import { EventType, EventHelper, Dimension, isAncestor, hide, show, removeClass, addClass, append, $, addDisposableListener, runAtThisOrScheduleAtNextAnimationFrame } from 'vs/base/browser/dom';
import { CustomMenubarControl } from 'vs/workbench/browser/parts/titlebar/menubarControl';
import { IInstantiationService, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { template, getBaseLabel } from 'vs/base/common/labels';
import { ILabelService } from 'vs/platform/label/common/label';
import { Event, Emitter } from 'vs/base/common/event';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Parts, IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { RunOnceScheduler } from 'vs/base/common/async';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Schemas } from 'vs/base/common/network';

export class TitlebarPart extends Part implements ITitleService {

	private static readonly NLS_UNSUPPORTED = nls.localize('patchedWindowTitle', "[Unsupported]");
	private static readonly NLS_USER_IS_ADMIN = isWindows ? nls.localize('userIsAdmin', "[Administrator]") : nls.localize('userIsSudo', "[Superuser]");
	private static readonly NLS_EXTENSION_HOST = nls.localize('devExtensionWindowTitlePrefix', "[Extension Development Host]");
	private static readonly TITLE_DIRTY = '\u25cf ';
	private static readonly TITLE_SEPARATOR = isMacintosh ? ' — ' : ' - '; // macOS uses special - separator

	//#region IView

	readonly minimumWidth: number = 0;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	get minimumHeight(): number { return isMacintosh && !isWeb ? 22 / getZoomFactor() : (30 / (this.configurationService.getValue<MenuBarVisibility>('window.menuBarVisibility') === 'hidden' ? getZoomFactor() : 1)); }
	get maximumHeight(): number { return isMacintosh && !isWeb ? 22 / getZoomFactor() : (30 / (this.configurationService.getValue<MenuBarVisibility>('window.menuBarVisibility') === 'hidden' ? getZoomFactor() : 1)); }

	//#endregion

	private _onMenubarVisibilityChange = this._register(new Emitter<boolean>());
	readonly onMenubarVisibilityChange: Event<boolean> = this._onMenubarVisibilityChange.event;

	_serviceBrand!: ServiceIdentifier<any>;

	private title: HTMLElement;
	private dragRegion: HTMLElement;
	private windowControls: HTMLElement;
	private maxRestoreControl: HTMLElement;
	private appIcon: HTMLElement;
	private customMenubar: CustomMenubarControl | undefined;
	private menubar: HTMLElement;
	private resizer: HTMLElement;
	private lastLayoutDimensions: Dimension;

	private pendingTitle: string;
	private representedFileName: string;

	private isInactive: boolean;

	private readonly properties: ITitleProperties = { isPure: true, isAdmin: false };
	private readonly activeEditorListeners = this._register(new DisposableStore());

	private titleUpdater: RunOnceScheduler = this._register(new RunOnceScheduler(() => this.doUpdateTitle(), 0));

	constructor(
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IWindowService private readonly windowService: IWindowService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWindowsService private readonly windowsService: IWindowsService,
		@IEditorService private readonly editorService: IEditorService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@ILabelService private readonly labelService: ILabelService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService
	) {
		super(Parts.TITLEBAR_PART, { hasTitle: false }, themeService, storageService, layoutService);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.windowService.onDidChangeFocus(focused => focused ? this.onFocus() : this.onBlur()));
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationChanged(e)));
		this._register(this.editorService.onDidActiveEditorChange(() => this.onActiveEditorChange()));
		this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.titleUpdater.schedule()));
		this._register(this.contextService.onDidChangeWorkbenchState(() => this.titleUpdater.schedule()));
		this._register(this.contextService.onDidChangeWorkspaceName(() => this.titleUpdater.schedule()));
		this._register(this.labelService.onDidChangeFormatters(() => this.titleUpdater.schedule()));
	}

	private onBlur(): void {
		this.isInactive = true;
		this.updateStyles();
	}

	private onFocus(): void {
		this.isInactive = false;
		this.updateStyles();
	}

	private onConfigurationChanged(event: IConfigurationChangeEvent): void {
		if (event.affectsConfiguration('window.title')) {
			this.titleUpdater.schedule();
		}

		if (event.affectsConfiguration('window.doubleClickIconToClose')) {
			if (this.appIcon) {
				this.onUpdateAppIconDragBehavior();
			}
		}
	}

	private onMenubarVisibilityChanged(visible: boolean) {
		if (isWeb || isWindows || isLinux) {
			// Hide title when toggling menu bar
			if (!isWeb && this.configurationService.getValue<MenuBarVisibility>('window.menuBarVisibility') === 'toggle' && visible) {
				// Hack to fix issue #52522 with layered webkit-app-region elements appearing under cursor
				hide(this.dragRegion);
				setTimeout(() => show(this.dragRegion), 50);
			}

			this.adjustTitleMarginToCenter();

			this._onMenubarVisibilityChange.fire(visible);
		}
	}

	private onMenubarFocusChanged(focused: boolean) {
		if (!isWeb && (isWindows || isLinux)) {
			if (focused) {
				hide(this.dragRegion);
			} else {
				show(this.dragRegion);
			}
		}
	}

	private onActiveEditorChange(): void {

		// Dispose old listeners
		this.activeEditorListeners.clear();

		// Calculate New Window Title
		this.titleUpdater.schedule();

		// Apply listener for dirty and label changes
		const activeEditor = this.editorService.activeEditor;
		if (activeEditor instanceof EditorInput) {
			this.activeEditorListeners.add(activeEditor.onDidChangeDirty(() => this.titleUpdater.schedule()));
			this.activeEditorListeners.add(activeEditor.onDidChangeLabel(() => this.titleUpdater.schedule()));
		}

		// Represented File Name
		this.updateRepresentedFilename();
	}

	private updateRepresentedFilename(): void {
		const file = toResource(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.MASTER, filterByScheme: Schemas.file });
		const path = file ? file.fsPath : '';

		// Apply to window
		this.windowService.setRepresentedFilename(path);

		// Keep for context menu
		this.representedFileName = path;
	}

	private doUpdateTitle(): void {
		const title = this.getWindowTitle();

		// Always set the native window title to identify us properly to the OS
		let nativeTitle = title;
		if (!trim(nativeTitle)) {
			nativeTitle = this.environmentService.appNameLong;
		}
		window.document.title = nativeTitle;

		// Apply custom title if we can
		if (this.title) {
			this.title.innerText = title;
		} else {
			this.pendingTitle = title;
		}

		if ((isWeb || isWindows || isLinux) && this.title) {
			if (this.lastLayoutDimensions) {
				this.updateLayout(this.lastLayoutDimensions);
			}
		}
	}

	private getWindowTitle(): string {
		let title = this.doGetWindowTitle();

		if (this.properties.isAdmin) {
			title = `${title || this.environmentService.appNameLong} ${TitlebarPart.NLS_USER_IS_ADMIN}`;
		}

		if (!this.properties.isPure) {
			title = `${title || this.environmentService.appNameLong} ${TitlebarPart.NLS_UNSUPPORTED}`;
		}

		if (this.environmentService.isExtensionDevelopment) {
			title = `${TitlebarPart.NLS_EXTENSION_HOST} - ${title || this.environmentService.appNameLong}`;
		}

		return title;
	}

	updateProperties(properties: ITitleProperties): void {
		const isAdmin = typeof properties.isAdmin === 'boolean' ? properties.isAdmin : this.properties.isAdmin;
		const isPure = typeof properties.isPure === 'boolean' ? properties.isPure : this.properties.isPure;

		if (isAdmin !== this.properties.isAdmin || isPure !== this.properties.isPure) {
			this.properties.isAdmin = isAdmin;
			this.properties.isPure = isPure;

			this.titleUpdater.schedule();
		}
	}

	/**
	 * Possible template values:
	 *
	 * {activeEditorLong}: e.g. /Users/Development/myFolder/myFileFolder/myFile.txt
	 * {activeEditorMedium}: e.g. myFolder/myFileFolder/myFile.txt
	 * {activeEditorShort}: e.g. myFile.txt
	 * {activeFolderLong}: e.g. /Users/Development/myFolder/myFileFolder
	 * {activeFolderMedium}: e.g. myFolder/myFileFolder
	 * {activeFolderShort}: e.g. myFileFolder
	 * {rootName}: e.g. myFolder1, myFolder2, myFolder3
	 * {rootPath}: e.g. /Users/Development
	 * {folderName}: e.g. myFolder
	 * {folderPath}: e.g. /Users/Development/myFolder
	 * {appName}: e.g. VS Code
	 * {dirty}: indicator
	 * {separator}: conditional separator
	 */
	private doGetWindowTitle(): string {
		const editor = this.editorService.activeEditor;
		const workspace = this.contextService.getWorkspace();

		// Compute root
		let root: URI | undefined;
		if (workspace.configuration) {
			root = workspace.configuration;
		} else if (workspace.folders.length) {
			root = workspace.folders[0].uri;
		}

		// Compute active editor folder
		const editorResource = editor ? toResource(editor) : undefined;
		let editorFolderResource = editorResource ? resources.dirname(editorResource) : undefined;
		if (editorFolderResource && editorFolderResource.path === '.') {
			editorFolderResource = undefined;
		}

		// Compute folder resource
		// Single Root Workspace: always the root single workspace in this case
		// Otherwise: root folder of the currently active file if any
		const folder = this.contextService.getWorkbenchState() === WorkbenchState.FOLDER ? workspace.folders[0] : this.contextService.getWorkspaceFolder(toResource(editor, { supportSideBySide: SideBySideEditor.MASTER })!);

		// Variables
		const activeEditorShort = editor ? editor.getTitle(Verbosity.SHORT) : '';
		const activeEditorMedium = editor ? editor.getTitle(Verbosity.MEDIUM) : activeEditorShort;
		const activeEditorLong = editor ? editor.getTitle(Verbosity.LONG) : activeEditorMedium;
		const activeFolderShort = editorFolderResource ? resources.basename(editorFolderResource) : '';
		const activeFolderMedium = editorFolderResource ? this.labelService.getUriLabel(editorFolderResource, { relative: true }) : '';
		const activeFolderLong = editorFolderResource ? this.labelService.getUriLabel(editorFolderResource) : '';
		const rootName = this.labelService.getWorkspaceLabel(workspace);
		const rootPath = root ? this.labelService.getUriLabel(root) : '';
		const folderName = folder ? folder.name : '';
		const folderPath = folder ? this.labelService.getUriLabel(folder.uri) : '';
		const dirty = editor && editor.isDirty() ? TitlebarPart.TITLE_DIRTY : '';
		const appName = this.environmentService.appNameLong;
		const separator = TitlebarPart.TITLE_SEPARATOR;
		const titleTemplate = this.configurationService.getValue<string>('window.title');

		return template(titleTemplate, {
			activeEditorShort,
			activeEditorLong,
			activeEditorMedium,
			activeFolderShort,
			activeFolderMedium,
			activeFolderLong,
			rootName,
			rootPath,
			folderName,
			folderPath,
			dirty,
			appName,
			separator: { label: separator }
		});
	}

	createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;

		// Draggable region that we can manipulate for #52522
		if (!isWeb) {
			this.dragRegion = append(this.element, $('div.titlebar-drag-region'));
		}

		// App Icon (Native Windows/Linux)
		if (!isMacintosh && !isWeb) {
			this.appIcon = append(this.element, $('div.window-appicon'));
			this.onUpdateAppIconDragBehavior();

			this._register(addDisposableListener(this.appIcon, EventType.DBLCLICK, (e => {
				this.windowService.closeWindow();
			})));
		}

		// Menubar: install a custom menu bar depending on configuration
		if (getTitleBarStyle(this.configurationService, this.environmentService) !== 'native' && (!isMacintosh || isWeb)) {
			this.customMenubar = this._register(this.instantiationService.createInstance(CustomMenubarControl));
			this.menubar = append(this.element, $('div.menubar'));
			this.menubar.setAttribute('role', 'menubar');

			this.customMenubar.create(this.menubar);

			this._register(this.customMenubar.onVisibilityChange(e => this.onMenubarVisibilityChanged(e)));
			this._register(this.customMenubar.onFocusStateChange(e => this.onMenubarFocusChanged(e)));
		}

		// Title
		this.title = append(this.element, $('div.window-title'));
		if (this.pendingTitle) {
			this.title.innerText = this.pendingTitle;
		} else {
			this.titleUpdater.schedule();
		}

		// Maximize/Restore on doubleclick
		if (isMacintosh && !isWeb) {
			this._register(addDisposableListener(this.element, EventType.DBLCLICK, e => {
				EventHelper.stop(e);

				this.onTitleDoubleclick();
			}));
		}

		// Context menu on title
		[EventType.CONTEXT_MENU, EventType.MOUSE_DOWN].forEach(event => {
			this._register(addDisposableListener(this.title, event, e => {
				if (e.type === EventType.CONTEXT_MENU || e.metaKey) {
					EventHelper.stop(e);

					this.onContextMenu(e);
				}
			}));
		});

		// Window Controls (Native Windows/Linux)
		if (!isMacintosh && !isWeb) {
			this.windowControls = append(this.element, $('div.window-controls-container'));


			// Minimize
			const minimizeIconContainer = append(this.windowControls, $('div.window-icon-bg'));
			const minimizeIcon = append(minimizeIconContainer, $('div.window-icon'));
			addClass(minimizeIcon, 'window-minimize');
			this._register(addDisposableListener(minimizeIcon, EventType.CLICK, e => {
				this.windowService.minimizeWindow();
			}));

			// Restore
			const restoreIconContainer = append(this.windowControls, $('div.window-icon-bg'));
			this.maxRestoreControl = append(restoreIconContainer, $('div.window-icon'));
			addClass(this.maxRestoreControl, 'window-max-restore');
			this._register(addDisposableListener(this.maxRestoreControl, EventType.CLICK, async e => {
				const maximized = await this.windowService.isMaximized();
				if (maximized) {
					return this.windowService.unmaximizeWindow();
				}

				return this.windowService.maximizeWindow();
			}));

			// Close
			const closeIconContainer = append(this.windowControls, $('div.window-icon-bg'));
			addClass(closeIconContainer, 'window-close-bg');
			const closeIcon = append(closeIconContainer, $('div.window-icon'));
			addClass(closeIcon, 'window-close');
			this._register(addDisposableListener(closeIcon, EventType.CLICK, e => {
				this.windowService.closeWindow();
			}));

			// Resizer
			this.resizer = append(this.element, $('div.resizer'));

			const isMaximized = this.environmentService.configuration.maximized ? true : false;
			this.onDidChangeMaximized(isMaximized);
			this.windowService.onDidChangeMaximize(this.onDidChangeMaximized, this);
		}

		// Since the title area is used to drag the window, we do not want to steal focus from the
		// currently active element. So we restore focus after a timeout back to where it was.
		this._register(addDisposableListener(this.element, EventType.MOUSE_DOWN, e => {
			if (e.target && isAncestor(e.target as HTMLElement, this.menubar)) {
				return;
			}

			const active = document.activeElement;
			setTimeout(() => {
				if (active instanceof HTMLElement) {
					active.focus();
				}
			}, 0 /* need a timeout because we are in capture phase */);
		}, true /* use capture to know the currently active element properly */));

		this.updateStyles();

		return this.element;
	}

	private onDidChangeMaximized(maximized: boolean) {
		if (this.maxRestoreControl) {
			if (maximized) {
				removeClass(this.maxRestoreControl, 'window-maximize');
				addClass(this.maxRestoreControl, 'window-unmaximize');
			} else {
				removeClass(this.maxRestoreControl, 'window-unmaximize');
				addClass(this.maxRestoreControl, 'window-maximize');
			}
		}

		if (this.resizer) {
			if (maximized) {
				hide(this.resizer);
			} else {
				show(this.resizer);
			}
		}

		this.adjustTitleMarginToCenter();
	}

	updateStyles(): void {
		super.updateStyles();

		// Part container
		if (this.element) {
			if (this.isInactive) {
				addClass(this.element, 'inactive');
			} else {
				removeClass(this.element, 'inactive');
			}

			const titleBackground = this.getColor(this.isInactive ? TITLE_BAR_INACTIVE_BACKGROUND : TITLE_BAR_ACTIVE_BACKGROUND);
			this.element.style.backgroundColor = titleBackground;
			if (titleBackground && Color.fromHex(titleBackground).isLighter()) {
				addClass(this.element, 'light');
			} else {
				removeClass(this.element, 'light');
			}

			const titleForeground = this.getColor(this.isInactive ? TITLE_BAR_INACTIVE_FOREGROUND : TITLE_BAR_ACTIVE_FOREGROUND);
			this.element.style.color = titleForeground;

			const titleBorder = this.getColor(TITLE_BAR_BORDER);
			this.element.style.borderBottom = titleBorder ? `1px solid ${titleBorder}` : null;
		}
	}

	private onTitleDoubleclick(): void {
		this.windowService.onWindowTitleDoubleClick();
	}

	private onUpdateAppIconDragBehavior() {
		const setting = this.configurationService.getValue('window.doubleClickIconToClose');
		if (setting) {
			(this.appIcon.style as any)['-webkit-app-region'] = 'no-drag';
		} else {
			(this.appIcon.style as any)['-webkit-app-region'] = 'drag';
		}
	}

	private onContextMenu(e: MouseEvent): void {

		// Find target anchor
		const event = new StandardMouseEvent(e);
		const anchor = { x: event.posx, y: event.posy };

		// Show menu
		const actions = this.getContextMenuActions();
		if (actions.length) {
			this.contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => actions,
				onHide: () => actions.forEach(a => a.dispose())
			});
		}
	}

	private getContextMenuActions(): IAction[] {
		const actions: IAction[] = [];

		if (this.representedFileName) {
			const segments = this.representedFileName.split(posix.sep);
			for (let i = segments.length; i > 0; i--) {
				const isFile = (i === segments.length);

				let pathOffset = i;
				if (!isFile) {
					pathOffset++; // for segments which are not the file name we want to open the folder
				}

				const path = segments.slice(0, pathOffset).join(posix.sep);

				let label: string;
				if (!isFile) {
					label = getBaseLabel(dirname(path));
				} else {
					label = getBaseLabel(path);
				}

				actions.push(new ShowItemInFolderAction(path, label || posix.sep, this.windowsService));
			}
		}

		return actions;
	}

	private adjustTitleMarginToCenter(): void {
		if (this.customMenubar) {
			const leftMarker = (this.appIcon ? this.appIcon.clientWidth : 0) + this.menubar.clientWidth + 10;
			const rightMarker = this.element.clientWidth - (this.windowControls ? this.windowControls.clientWidth : 0) - 10;

			// Not enough space to center the titlebar within window,
			// Center between menu and window controls
			if (leftMarker > (this.element.clientWidth - this.title.clientWidth) / 2 ||
				rightMarker < (this.element.clientWidth + this.title.clientWidth) / 2) {
				this.title.style.position = null;
				this.title.style.left = null;
				this.title.style.transform = null;
				return;
			}
		}

		this.title.style.position = 'absolute';
		this.title.style.left = '50%';
		this.title.style.transform = 'translate(-50%, 0)';
	}

	updateLayout(dimension: Dimension): void {
		this.lastLayoutDimensions = dimension;

		if (getTitleBarStyle(this.configurationService, this.environmentService) === 'custom') {
			// Only prevent zooming behavior on macOS or when the menubar is not visible
			if ((!isWeb && isMacintosh) || this.configurationService.getValue<MenuBarVisibility>('window.menuBarVisibility') === 'hidden') {
				this.title.style.zoom = `${1 / getZoomFactor()}`;
				if (!isWeb && (isWindows || isLinux)) {
					this.appIcon.style.zoom = `${1 / getZoomFactor()}`;
					this.windowControls.style.zoom = `${1 / getZoomFactor()}`;
				}
			} else {
				this.title.style.zoom = null;
				if (!isWeb && (isWindows || isLinux)) {
					this.appIcon.style.zoom = null;
					this.windowControls.style.zoom = null;
				}
			}

			runAtThisOrScheduleAtNextAnimationFrame(() => this.adjustTitleMarginToCenter());

			if (this.customMenubar) {
				const menubarDimension = new Dimension(0, dimension.height);
				this.customMenubar.layout(menubarDimension);
			}
		}
	}

	layout(width: number, height: number): void {
		this.updateLayout(new Dimension(width, height));

		super.layoutContents(width, height);
	}

	toJSON(): object {
		return {
			type: Parts.TITLEBAR_PART
		};
	}
}

class ShowItemInFolderAction extends Action {

	constructor(private path: string, label: string, private windowsService: IWindowsService) {
		super('showItemInFolder.action.id', label);
	}

	run(): Promise<void> {
		return this.windowsService.showItemInFolder(URI.file(this.path));
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const titlebarActiveFg = theme.getColor(TITLE_BAR_ACTIVE_FOREGROUND);
	if (titlebarActiveFg) {
		collector.addRule(`
		.monaco-workbench .part.titlebar > .window-controls-container .window-icon {
			background-color: ${titlebarActiveFg};
		}
		`);
	}

	const titlebarInactiveFg = theme.getColor(TITLE_BAR_INACTIVE_FOREGROUND);
	if (titlebarInactiveFg) {
		collector.addRule(`
		.monaco-workbench .part.titlebar.inactive > .window-controls-container .window-icon {
				background-color: ${titlebarInactiveFg};
			}
		`);
	}
});

registerSingleton(ITitleService, TitlebarPart);
