/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/titlebarpart';
import * as resources from 'vs/base/common/resources';
import { Part } from 'vs/workbench/browser/part';
import { ITitleService, ITitleProperties } from 'vs/workbench/services/title/common/titleService';
import { getZoomFactor } from 'vs/base/browser/browser';
import { MenuBarVisibility, getTitleBarStyle, getMenuBarVisibility } from 'vs/platform/windows/common/windows';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { IAction } from 'vs/base/common/actions';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { DisposableStore, dispose } from 'vs/base/common/lifecycle';
import * as nls from 'vs/nls';
import { EditorInput, toResource, Verbosity, SideBySideEditor } from 'vs/workbench/common/editor';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IWorkspaceContextService, WorkbenchState, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { TITLE_BAR_ACTIVE_BACKGROUND, TITLE_BAR_ACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_BACKGROUND, TITLE_BAR_BORDER, WORKBENCH_BACKGROUND } from 'vs/workbench/common/theme';
import { isMacintosh, isWindows, isLinux, isWeb } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { Color } from 'vs/base/common/color';
import { trim } from 'vs/base/common/strings';
import { EventType, EventHelper, Dimension, isAncestor, hide, show, removeClass, addClass, append, $, addDisposableListener, runAtThisOrScheduleAtNextAnimationFrame, removeNode } from 'vs/base/browser/dom';
import { CustomMenubarControl } from 'vs/workbench/browser/parts/titlebar/menubarControl';
import { IInstantiationService, optional } from 'vs/platform/instantiation/common/instantiation';
import { template } from 'vs/base/common/labels';
import { ILabelService } from 'vs/platform/label/common/label';
import { Event, Emitter } from 'vs/base/common/event';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Parts, IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { RunOnceScheduler } from 'vs/base/common/async';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuService, IMenu, MenuId } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IProductService } from 'vs/platform/product/common/productService';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';

// TODO@sbatten https://github.com/microsoft/vscode/issues/81360
// tslint:disable-next-line: import-patterns layering
import { IElectronService } from 'vs/platform/electron/node/electron';

export class TitlebarPart extends Part implements ITitleService {

	private static readonly NLS_UNSUPPORTED = nls.localize('patchedWindowTitle', "[Unsupported]");
	private static readonly NLS_USER_IS_ADMIN = isWindows ? nls.localize('userIsAdmin', "[Administrator]") : nls.localize('userIsSudo', "[Superuser]");
	private static readonly NLS_EXTENSION_HOST = nls.localize('devExtensionWindowTitlePrefix', "[Extension Development Host]");
	private static readonly TITLE_DIRTY = '\u25cf ';
	private static readonly TITLE_SEPARATOR = isMacintosh ? ' — ' : ' - '; // macOS uses special - separator

	//#region IView

	readonly minimumWidth: number = 0;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	get minimumHeight(): number { return isMacintosh && !isWeb ? 22 / getZoomFactor() : (30 / (this.currentMenubarVisibility === 'hidden' ? getZoomFactor() : 1)); }
	get maximumHeight(): number { return isMacintosh && !isWeb ? 22 / getZoomFactor() : (30 / (this.currentMenubarVisibility === 'hidden' ? getZoomFactor() : 1)); }

	//#endregion

	private _onMenubarVisibilityChange = this._register(new Emitter<boolean>());
	readonly onMenubarVisibilityChange: Event<boolean> = this._onMenubarVisibilityChange.event;

	_serviceBrand: undefined;

	private title!: HTMLElement;
	private dragRegion: HTMLElement | undefined;
	private windowControls: HTMLElement | undefined;
	private maxRestoreControl: HTMLElement | undefined;
	private appIcon: HTMLElement | undefined;
	private customMenubar: CustomMenubarControl | undefined;
	private menubar?: HTMLElement;
	private resizer: HTMLElement | undefined;
	private lastLayoutDimensions: Dimension | undefined;
	private titleBarStyle: 'native' | 'custom';

	private pendingTitle: string | undefined;

	private isInactive: boolean = false;

	private readonly properties: ITitleProperties = { isPure: true, isAdmin: false };
	private readonly activeEditorListeners = this._register(new DisposableStore());

	private titleUpdater: RunOnceScheduler = this._register(new RunOnceScheduler(() => this.doUpdateTitle(), 0));

	private contextMenu: IMenu;

	constructor(
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@ILabelService private readonly labelService: ILabelService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHostService private readonly hostService: IHostService,
		@IProductService private readonly productService: IProductService,
		@optional(IElectronService) private electronService: IElectronService
	) {
		super(Parts.TITLEBAR_PART, { hasTitle: false }, themeService, storageService, layoutService);

		this.contextMenu = this._register(menuService.createMenu(MenuId.TitleBarContext, contextKeyService));

		this.titleBarStyle = getTitleBarStyle(this.configurationService, this.environmentService);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.hostService.onDidChangeFocus(focused => focused ? this.onFocus() : this.onBlur()));
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

		if (this.titleBarStyle !== 'native') {
			if (event.affectsConfiguration('window.menuBarVisibility')) {
				if (this.currentMenubarVisibility === 'compact') {
					this.uninstallMenubar();
				} else {
					this.installMenubar();
				}
			}
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
			if (!isWeb && this.currentMenubarVisibility === 'toggle' && visible) {
				// Hack to fix issue #52522 with layered webkit-app-region elements appearing under cursor
				if (this.dragRegion) {
					hide(this.dragRegion);
					setTimeout(() => show(this.dragRegion!), 50);
				}
			}

			this.adjustTitleMarginToCenter();

			this._onMenubarVisibilityChange.fire(visible);
		}
	}

	private onMenubarFocusChanged(focused: boolean) {
		if (!isWeb && (isWindows || isLinux) && this.currentMenubarVisibility === 'compact' && this.dragRegion) {
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
	}

	private doUpdateTitle(): void {
		const title = this.getWindowTitle();

		// Always set the native window title to identify us properly to the OS
		let nativeTitle = title;
		if (!trim(nativeTitle)) {
			nativeTitle = this.productService.nameLong;
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
			title = `${title || this.productService.nameLong} ${TitlebarPart.NLS_USER_IS_ADMIN}`;
		}

		if (!this.properties.isPure) {
			title = `${title || this.productService.nameLong} ${TitlebarPart.NLS_UNSUPPORTED}`;
		}

		if (this.environmentService.isExtensionDevelopment) {
			title = `${TitlebarPart.NLS_EXTENSION_HOST} - ${title || this.productService.nameLong}`;
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
	 * {remoteName}: e.g. SSH
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
		if (editorFolderResource?.path === '.') {
			editorFolderResource = undefined;
		}

		// Compute folder resource
		// Single Root Workspace: always the root single workspace in this case
		// Otherwise: root folder of the currently active file if any
		let folder: IWorkspaceFolder | null = null;
		if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
			folder = workspace.folders[0];
		} else {
			const resource = toResource(editor, { supportSideBySide: SideBySideEditor.MASTER });
			if (resource) {
				folder = this.contextService.getWorkspaceFolder(resource);
			}
		}

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
		const dirty = editor?.isDirty() ? TitlebarPart.TITLE_DIRTY : '';
		const appName = this.productService.nameLong;
		const remoteName = this.labelService.getHostLabel(REMOTE_HOST_SCHEME, this.environmentService.configuration.remoteAuthority);
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
			remoteName,
			separator: { label: separator }
		});
	}

	private uninstallMenubar(): void {
		if (this.customMenubar) {
			this.customMenubar.dispose();
			this.customMenubar = undefined;
		}

		if (this.menubar) {
			removeNode(this.menubar);
			this.menubar = undefined;
		}
	}

	private installMenubar(): void {
		// If the menubar is already installed, skip
		if (this.menubar) {
			return;
		}

		this.customMenubar = this._register(this.instantiationService.createInstance(CustomMenubarControl));

		this.menubar = this.element.insertBefore($('div.menubar'), this.title);

		this.menubar.setAttribute('role', 'menubar');

		this.customMenubar.create(this.menubar);

		this._register(this.customMenubar.onVisibilityChange(e => this.onMenubarVisibilityChanged(e)));
		this._register(this.customMenubar.onFocusStateChange(e => this.onMenubarFocusChanged(e)));
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
				this.electronService.closeWindow();
			})));
		}

		// Menubar: install a custom menu bar depending on configuration
		// and when not in activity bar
		if (this.titleBarStyle !== 'native'
			&& (!isMacintosh || isWeb)
			&& this.currentMenubarVisibility !== 'compact') {
			this.installMenubar();
		}

		// Title
		this.title = append(this.element, $('div.window-title'));
		if (this.pendingTitle) {
			this.title.innerText = this.pendingTitle;
		} else {
			this.titleUpdater.schedule();
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
			const minimizeIcon = append(this.windowControls, $('div.window-icon.window-minimize.codicon.codicon-chrome-minimize'));
			this._register(addDisposableListener(minimizeIcon, EventType.CLICK, e => {
				this.electronService.minimizeWindow();
			}));

			// Restore
			this.maxRestoreControl = append(this.windowControls, $('div.window-icon.window-max-restore.codicon'));
			this._register(addDisposableListener(this.maxRestoreControl, EventType.CLICK, async e => {
				const maximized = await this.electronService.isMaximized();
				if (maximized) {
					return this.electronService.unmaximizeWindow();
				}

				return this.electronService.maximizeWindow();
			}));

			// Close
			const closeIcon = append(this.windowControls, $('div.window-icon.window-close.codicon.codicon-chrome-close'));
			this._register(addDisposableListener(closeIcon, EventType.CLICK, e => {
				this.electronService.closeWindow();
			}));

			// Resizer
			this.resizer = append(this.element, $('div.resizer'));

			this._register(this.layoutService.onMaximizeChange(maximized => this.onDidChangeMaximized(maximized)));
			this.onDidChangeMaximized(this.layoutService.isWindowMaximized());
		}

		// Since the title area is used to drag the window, we do not want to steal focus from the
		// currently active element. So we restore focus after a timeout back to where it was.
		this._register(addDisposableListener(this.element, EventType.MOUSE_DOWN, e => {
			if (e.target && this.menubar && isAncestor(e.target as HTMLElement, this.menubar)) {
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
				removeClass(this.maxRestoreControl, 'codicon-chrome-maximize');
				addClass(this.maxRestoreControl, 'codicon-chrome-restore');
			} else {
				removeClass(this.maxRestoreControl, 'codicon-chrome-restore');
				addClass(this.maxRestoreControl, 'codicon-chrome-maximize');
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

			const titleBackground = this.getColor(this.isInactive ? TITLE_BAR_INACTIVE_BACKGROUND : TITLE_BAR_ACTIVE_BACKGROUND, (color, theme) => {
				// LCD Rendering Support: the title bar part is a defining its own GPU layer.
				// To benefit from LCD font rendering, we must ensure that we always set an
				// opaque background color. As such, we compute an opaque color given we know
				// the background color is the workbench background.
				return color.isOpaque() ? color : color.makeOpaque(WORKBENCH_BACKGROUND(theme));
			}) || '';
			this.element.style.backgroundColor = titleBackground;
			if (titleBackground && Color.fromHex(titleBackground).isLighter()) {
				addClass(this.element, 'light');
			} else {
				removeClass(this.element, 'light');
			}

			const titleForeground = this.getColor(this.isInactive ? TITLE_BAR_INACTIVE_FOREGROUND : TITLE_BAR_ACTIVE_FOREGROUND);
			this.element.style.color = titleForeground;

			const titleBorder = this.getColor(TITLE_BAR_BORDER);
			this.element.style.borderBottom = titleBorder ? `1px solid ${titleBorder}` : '';
		}
	}

	private onUpdateAppIconDragBehavior() {
		const setting = this.configurationService.getValue('window.doubleClickIconToClose');
		if (setting && this.appIcon) {
			(this.appIcon.style as any)['-webkit-app-region'] = 'no-drag';
		} else if (this.appIcon) {
			(this.appIcon.style as any)['-webkit-app-region'] = 'drag';
		}
	}

	private onContextMenu(e: MouseEvent): void {

		// Find target anchor
		const event = new StandardMouseEvent(e);
		const anchor = { x: event.posx, y: event.posy };

		// Fill in contributed actions
		const actions: IAction[] = [];
		const actionsDisposable = createAndFillInContextMenuActions(this.contextMenu, undefined, actions, this.contextMenuService);

		// Show it
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
			onHide: () => dispose(actionsDisposable)
		});
	}

	private adjustTitleMarginToCenter(): void {
		if (this.customMenubar && this.menubar) {
			const leftMarker = (this.appIcon ? this.appIcon.clientWidth : 0) + this.menubar.clientWidth + 10;
			const rightMarker = this.element.clientWidth - (this.windowControls ? this.windowControls.clientWidth : 0) - 10;

			// Not enough space to center the titlebar within window,
			// Center between menu and window controls
			if (leftMarker > (this.element.clientWidth - this.title.clientWidth) / 2 ||
				rightMarker < (this.element.clientWidth + this.title.clientWidth) / 2) {
				this.title.style.position = '';
				this.title.style.left = '';
				this.title.style.transform = '';
				return;
			}
		}

		this.title.style.position = 'absolute';
		this.title.style.left = '50%';
		this.title.style.transform = 'translate(-50%, 0)';
	}

	private get currentMenubarVisibility(): MenuBarVisibility {
		return getMenuBarVisibility(this.configurationService, this.environmentService);
	}

	updateLayout(dimension: Dimension): void {
		this.lastLayoutDimensions = dimension;

		if (getTitleBarStyle(this.configurationService, this.environmentService) === 'custom') {
			// Only prevent zooming behavior on macOS or when the menubar is not visible
			if ((!isWeb && isMacintosh) || this.currentMenubarVisibility === 'hidden') {
				this.title.style.zoom = `${1 / getZoomFactor()}`;
				if (!isWeb && (isWindows || isLinux)) {
					if (this.appIcon) {
						this.appIcon.style.zoom = `${1 / getZoomFactor()}`;
					}

					if (this.windowControls) {
						this.windowControls.style.zoom = `${1 / getZoomFactor()}`;
					}
				}
			} else {
				this.title.style.zoom = null;
				if (!isWeb && (isWindows || isLinux)) {
					if (this.appIcon) {
						this.appIcon.style.zoom = null;
					}

					if (this.windowControls) {
						this.windowControls.style.zoom = null;
					}
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

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const titlebarActiveFg = theme.getColor(TITLE_BAR_ACTIVE_FOREGROUND);
	if (titlebarActiveFg) {
		collector.addRule(`
		.monaco-workbench .part.titlebar > .window-controls-container .window-icon {
			color: ${titlebarActiveFg};
		}
		`);
	}

	const titlebarInactiveFg = theme.getColor(TITLE_BAR_INACTIVE_FOREGROUND);
	if (titlebarInactiveFg) {
		collector.addRule(`
		.monaco-workbench .part.titlebar.inactive > .window-controls-container .window-icon {
				color: ${titlebarInactiveFg};
			}
		`);
	}
});

registerSingleton(ITitleService, TitlebarPart);
