/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/titlebarpart';
import { TPromise } from 'vs/base/common/winjs.base';
import { Builder, $ } from 'vs/base/browser/builder';
import * as paths from 'vs/base/common/paths';
import { Part } from 'vs/workbench/browser/part';
import { ITitleService, ITitleProperties } from 'vs/workbench/services/title/common/titleService';
import { getZoomFactor } from 'vs/base/browser/browser';
import { IWindowService, IWindowsService, MenuBarVisibility } from 'vs/platform/windows/common/windows';
import * as errors from 'vs/base/common/errors';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { IAction, Action } from 'vs/base/common/actions';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import * as nls from 'vs/nls';
import { EditorInput, toResource, Verbosity } from 'vs/workbench/common/editor';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { TITLE_BAR_ACTIVE_BACKGROUND, TITLE_BAR_ACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_BACKGROUND, TITLE_BAR_BORDER } from 'vs/workbench/common/theme';
import { isMacintosh, isWindows, isLinux } from 'vs/base/common/platform';
import URI from 'vs/base/common/uri';
import { Color } from 'vs/base/common/color';
import { trim } from 'vs/base/common/strings';
import { addDisposableListener, EventType, EventHelper, Dimension, isAncestor } from 'vs/base/browser/dom';
import { MenubarControl } from 'vs/workbench/browser/parts/titlebar/menubarControl';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { template, getBaseLabel } from 'vs/base/common/labels';
import { ILabelService } from 'vs/platform/label/common/label';
import { Event } from 'vs/base/common/event';

export class TitlebarPart extends Part implements ITitleService {

	_serviceBrand: any;

	private static readonly NLS_UNSUPPORTED = nls.localize('patchedWindowTitle', "[Unsupported]");
	private static readonly NLS_USER_IS_ADMIN = isWindows ? nls.localize('userIsAdmin', "[Administrator]") : nls.localize('userIsSudo', "[Superuser]");
	private static readonly NLS_EXTENSION_HOST = nls.localize('devExtensionWindowTitlePrefix', "[Extension Development Host]");
	private static readonly TITLE_DIRTY = '\u25cf ';
	private static readonly TITLE_SEPARATOR = isMacintosh ? ' — ' : ' - '; // macOS uses special - separator

	private titleContainer: Builder;
	private title: Builder;
	private dragRegion: Builder;
	private windowControls: Builder;
	private maxRestoreControl: Builder;
	private appIcon: Builder;
	private menubarPart: MenubarControl;
	private menubar: Builder;
	private resizer: Builder;

	private pendingTitle: string;
	private representedFileName: string;

	private initialSizing: {
		titleFontSize?: number;
		titlebarHeight?: number;
		controlsWidth?: number;
		appIconSize?: number;
		appIconWidth?: number;
	} = Object.create(null);

	private isInactive: boolean;

	private properties: ITitleProperties;
	private activeEditorListeners: IDisposable[];

	constructor(
		id: string,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IWindowService private windowService: IWindowService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWindowsService private windowsService: IWindowsService,
		@IEditorService private editorService: IEditorService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@ILabelService private labelService: ILabelService
	) {
		super(id, { hasTitle: false }, themeService);

		this.properties = { isPure: true, isAdmin: false };
		this.activeEditorListeners = [];

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(addDisposableListener(window, EventType.BLUR, () => this.onBlur()));
		this._register(addDisposableListener(window, EventType.FOCUS, () => this.onFocus()));
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationChanged(e)));
		this._register(this.editorService.onDidActiveEditorChange(() => this.onActiveEditorChange()));
		this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.setTitle(this.getWindowTitle())));
		this._register(this.contextService.onDidChangeWorkbenchState(() => this.setTitle(this.getWindowTitle())));
		this._register(this.contextService.onDidChangeWorkspaceName(() => this.setTitle(this.getWindowTitle())));
		this._register(this.labelService.onDidRegisterFormatter(() => this.setTitle(this.getWindowTitle())));
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
			this.setTitle(this.getWindowTitle());
		}
	}

	private onMenubarVisibilityChanged(visible: boolean) {
		if (isWindows || isLinux) {
			// Hide title when toggling menu bar
			if (this.configurationService.getValue<MenuBarVisibility>('window.menuBarVisibility') === 'toggle' && visible) {
				this.title.style('visibility', 'hidden');

				// Hack to fix issue #52522 with layered webkit-app-region elements appearing under cursor
				this.dragRegion.hide();
				this.dragRegion.showDelayed(50);
			} else {
				this.title.style('visibility', null);
			}
		}
	}

	onMenubarVisibilityChange(): Event<boolean> {
		return this.menubarPart.onVisibilityChange;
	}

	private onActiveEditorChange(): void {

		// Dispose old listeners
		dispose(this.activeEditorListeners);
		this.activeEditorListeners = [];

		// Calculate New Window Title
		this.setTitle(this.getWindowTitle());

		// Apply listener for dirty and label changes
		const activeEditor = this.editorService.activeEditor;
		if (activeEditor instanceof EditorInput) {
			this.activeEditorListeners.push(activeEditor.onDidChangeDirty(() => {
				this.setTitle(this.getWindowTitle());
			}));

			this.activeEditorListeners.push(activeEditor.onDidChangeLabel(() => {
				this.setTitle(this.getWindowTitle());
			}));
		}

		// Represented File Name
		this.updateRepresentedFilename();
	}

	private updateRepresentedFilename(): void {
		const file = toResource(this.editorService.activeEditor, { supportSideBySide: true, filter: 'file' });
		const path = file ? file.fsPath : '';

		// Apply to window
		this.windowService.setRepresentedFilename(path);

		// Keep for context menu
		this.representedFileName = path;
	}

	private getWindowTitle(): string {
		let title = this.doGetWindowTitle();
		if (!trim(title)) {
			title = this.environmentService.appNameLong;
		}

		if (this.properties.isAdmin) {
			title = `${title} ${TitlebarPart.NLS_USER_IS_ADMIN}`;
		}

		if (!this.properties.isPure) {
			title = `${title} ${TitlebarPart.NLS_UNSUPPORTED}`;
		}

		// Extension Development Host gets a special title to identify itself
		if (this.environmentService.isExtensionDevelopment) {
			title = `${TitlebarPart.NLS_EXTENSION_HOST} - ${title}`;
		}

		return title;
	}

	updateProperties(properties: ITitleProperties): void {
		const isAdmin = typeof properties.isAdmin === 'boolean' ? properties.isAdmin : this.properties.isAdmin;
		const isPure = typeof properties.isPure === 'boolean' ? properties.isPure : this.properties.isPure;

		if (isAdmin !== this.properties.isAdmin || isPure !== this.properties.isPure) {
			this.properties.isAdmin = isAdmin;
			this.properties.isPure = isPure;

			this.setTitle(this.getWindowTitle());
		}
	}

	/**
	 * Possible template values:
	 *
	 * {activeEditorLong}: e.g. /Users/Development/myProject/myFolder/myFile.txt
	 * {activeEditorMedium}: e.g. myFolder/myFile.txt
	 * {activeEditorShort}: e.g. myFile.txt
	 * {rootName}: e.g. myFolder1, myFolder2, myFolder3
	 * {rootPath}: e.g. /Users/Development/myProject
	 * {folderName}: e.g. myFolder
	 * {folderPath}: e.g. /Users/Development/myFolder
	 * {appName}: e.g. VS Code
	 * {dirty}: indiactor
	 * {separator}: conditional separator
	 */
	private doGetWindowTitle(): string {
		const editor = this.editorService.activeEditor;
		const workspace = this.contextService.getWorkspace();

		let root: URI;
		if (workspace.configuration) {
			root = workspace.configuration;
		} else if (workspace.folders.length) {
			root = workspace.folders[0].uri;
		}

		// Compute folder resource
		// Single Root Workspace: always the root single workspace in this case
		// Otherwise: root folder of the currently active file if any
		let folder = this.contextService.getWorkbenchState() === WorkbenchState.FOLDER ? workspace.folders[0] : this.contextService.getWorkspaceFolder(toResource(editor, { supportSideBySide: true }));

		// Variables
		const activeEditorShort = editor ? editor.getTitle(Verbosity.SHORT) : '';
		const activeEditorMedium = editor ? editor.getTitle(Verbosity.MEDIUM) : activeEditorShort;
		const activeEditorLong = editor ? editor.getTitle(Verbosity.LONG) : activeEditorMedium;
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
		this.titleContainer = $(parent);

		// Draggable region that we can manipulate for #52522
		this.dragRegion = $(this.titleContainer).div({ class: 'titlebar-drag-region' });

		// App Icon (Windows/Linux)
		if (!isMacintosh) {
			this.appIcon = $(this.titleContainer).div({ class: 'window-appicon' });
		}

		// Menubar: the menubar part which is responsible for populating both the custom and native menubars
		this.menubarPart = this.instantiationService.createInstance(MenubarControl, 'workbench.parts.titlebar.menubar');
		this.menubar = $(this.titleContainer).div({
			'class': ['menubar'],
			id: 'workbench.parts.titlebar.menubar',
			role: 'menubar'
		});

		this.menubarPart.create(this.menubar.getHTMLElement());

		if (!isMacintosh) {
			this._register(this.menubarPart.onVisibilityChange(e => this.onMenubarVisibilityChanged(e)));
		}

		// Title
		this.title = $(this.titleContainer).div({ class: 'window-title' });
		if (this.pendingTitle) {
			this.title.text(this.pendingTitle);
		} else {
			this.setTitle(this.getWindowTitle());
		}

		// Maximize/Restore on doubleclick
		if (isMacintosh) {
			this.titleContainer.on(EventType.DBLCLICK, (e) => {
				EventHelper.stop(e);

				this.onTitleDoubleclick();
			});
		}

		// Context menu on title
		this.title.on([EventType.CONTEXT_MENU, EventType.MOUSE_DOWN], (e: MouseEvent) => {
			if (e.type === EventType.CONTEXT_MENU || e.metaKey) {
				EventHelper.stop(e);

				this.onContextMenu(e);
			}
		});

		// Window Controls (Windows/Linux)
		if (!isMacintosh) {
			this.windowControls = $(this.titleContainer).div({ class: 'window-controls-container' });

			// Minimize
			$($(this.windowControls).div({ class: 'window-icon-bg' })).div({ class: 'window-icon window-minimize' }).on(EventType.CLICK, () => {
				this.windowService.minimizeWindow().then(null, errors.onUnexpectedError);
			});

			// Restore
			this.maxRestoreControl = $($(this.windowControls).div({ class: 'window-icon-bg' })).div({ class: 'window-icon window-max-restore' }).on(EventType.CLICK, () => {
				this.windowService.isMaximized().then((maximized) => {
					if (maximized) {
						return this.windowService.unmaximizeWindow();
					}

					return this.windowService.maximizeWindow();
				}).then(null, errors.onUnexpectedError);
			});

			// Close
			$($(this.windowControls).div({ class: 'window-icon-bg window-close-bg' })).div({ class: 'window-icon window-close' }).on(EventType.CLICK, () => {
				this.windowService.closeWindow().then(null, errors.onUnexpectedError);
			});

			// Resizer
			this.resizer = $(this.titleContainer).div({ class: 'resizer' });

			const isMaximized = this.windowService.getConfiguration().maximized ? true : false;
			this.onDidChangeMaximized(isMaximized);
			this.windowService.onDidChangeMaximize(this.onDidChangeMaximized, this);
		}

		// Since the title area is used to drag the window, we do not want to steal focus from the
		// currently active element. So we restore focus after a timeout back to where it was.
		this.titleContainer.on([EventType.MOUSE_DOWN], (e) => {
			if (e.target && isAncestor(e.target as HTMLElement, this.menubar.getHTMLElement())) {
				return;
			}

			const active = document.activeElement;
			setTimeout(() => {
				if (active instanceof HTMLElement) {
					active.focus();
				}
			}, 0 /* need a timeout because we are in capture phase */);
		}, void 0, true /* use capture to know the currently active element properly */);

		return this.titleContainer.getHTMLElement();
	}

	private onDidChangeMaximized(maximized: boolean) {
		if (this.maxRestoreControl) {
			if (maximized) {
				this.maxRestoreControl.removeClass('window-maximize');
				this.maxRestoreControl.addClass('window-unmaximize');
			} else {
				this.maxRestoreControl.removeClass('window-unmaximize');
				this.maxRestoreControl.addClass('window-maximize');
			}
		}

		if (this.resizer) {
			if (maximized) {
				this.resizer.hide();
			} else {
				this.resizer.show();
			}
		}
	}

	protected updateStyles(): void {
		super.updateStyles();

		// Part container
		if (this.titleContainer) {
			if (this.isInactive) {
				this.titleContainer.addClass('inactive');
			} else {
				this.titleContainer.removeClass('inactive');
			}

			const titleBackground = this.getColor(this.isInactive ? TITLE_BAR_INACTIVE_BACKGROUND : TITLE_BAR_ACTIVE_BACKGROUND);
			this.titleContainer.style('background-color', titleBackground);
			if (Color.fromHex(titleBackground).isLighter()) {
				this.titleContainer.addClass('light');
			} else {
				this.titleContainer.removeClass('light');
			}

			const titleForeground = this.getColor(this.isInactive ? TITLE_BAR_INACTIVE_FOREGROUND : TITLE_BAR_ACTIVE_FOREGROUND);
			this.titleContainer.style('color', titleForeground);

			const titleBorder = this.getColor(TITLE_BAR_BORDER);
			this.titleContainer.style('border-bottom', titleBorder ? `1px solid ${titleBorder}` : null);
		}
	}

	private onTitleDoubleclick(): void {
		this.windowService.onWindowTitleDoubleClick().then(null, errors.onUnexpectedError);
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
				getActions: () => TPromise.as(actions),
				onHide: () => actions.forEach(a => a.dispose())
			});
		}
	}

	private getContextMenuActions(): IAction[] {
		const actions: IAction[] = [];

		if (this.representedFileName) {
			const segments = this.representedFileName.split(paths.sep);
			for (let i = segments.length; i > 0; i--) {
				const isFile = (i === segments.length);

				let pathOffset = i;
				if (!isFile) {
					pathOffset++; // for segments which are not the file name we want to open the folder
				}

				const path = segments.slice(0, pathOffset).join(paths.sep);

				let label: string;
				if (!isFile) {
					label = getBaseLabel(paths.dirname(path));
				} else {
					label = getBaseLabel(path);
				}

				actions.push(new ShowItemInFolderAction(path, label || paths.sep, this.windowsService));
			}
		}

		return actions;
	}

	setTitle(title: string): void {

		// Always set the native window title to identify us properly to the OS
		window.document.title = title;

		// Apply if we can
		if (this.title) {
			this.title.text(title);
		} else {
			this.pendingTitle = title;
		}
	}

	private updateLayout(dimension: Dimension) {
		// Store initital title sizing if we need to prevent zooming
		if (typeof this.initialSizing.titleFontSize !== 'number') {
			this.initialSizing.titleFontSize = parseInt(this.title.getComputedStyle().fontSize, 10);
		}

		if (typeof this.initialSizing.titlebarHeight !== 'number') {
			this.initialSizing.titlebarHeight = parseInt(this.title.getComputedStyle().height, 10);
		}

		// Only prevent zooming behavior on macOS or when the menubar is not visible
		if (isMacintosh || this.configurationService.getValue<MenuBarVisibility>('window.menuBarVisibility') === 'hidden') {
			// To prevent zooming we need to adjust the font size with the zoom factor
			const newHeight = this.initialSizing.titlebarHeight / getZoomFactor();
			this.title.style({
				fontSize: `${this.initialSizing.titleFontSize / getZoomFactor()}px`,
				'line-height': `${newHeight}px`
			});

			// Windows/Linux specific layout
			if (isWindows || isLinux) {
				if (typeof this.initialSizing.controlsWidth !== 'number') {
					this.initialSizing.controlsWidth = parseInt(this.windowControls.getComputedStyle().width, 10);
				}

				if (typeof this.initialSizing.appIconWidth !== 'number') {
					this.initialSizing.appIconWidth = parseInt(this.appIcon.getComputedStyle().width, 10);
				}

				if (typeof this.initialSizing.appIconSize !== 'number') {
					this.initialSizing.appIconSize = parseInt(this.appIcon.getComputedStyle().backgroundSize, 10);
				}

				const currentAppIconHeight = parseInt(this.appIcon.getComputedStyle().height, 10);
				const newControlsWidth = this.initialSizing.controlsWidth / getZoomFactor();
				const newAppIconWidth = this.initialSizing.appIconWidth / getZoomFactor();
				const newAppIconSize = this.initialSizing.appIconSize / getZoomFactor();

				// Adjust app icon mimic menubar
				this.appIcon.style({
					'width': `${newAppIconWidth}px`,
					'background-size': `${newAppIconSize}px`,
					'padding-top': `${(newHeight - currentAppIconHeight) / 2.0}px`,
					'padding-bottom': `${(newHeight - currentAppIconHeight) / 2.0}px`
				});

				// Adjust windows controls
				this.windowControls.style({
					'width': `${newControlsWidth}px`
				});
			}
		} else {
			// We need to undo zoom prevention
			this.title.style({
				fontSize: null,
				'line-height': null
			});

			this.appIcon.style({
				'width': null,
				'background-size': null,
				'padding-top': null,
				'padding-bottom': null
			});

			this.windowControls.style({
				'width': null
			});
		}

		if (this.menubarPart) {
			const menubarDimension = new Dimension(undefined, dimension.height);
			this.menubarPart.layout(menubarDimension);
		}
	}

	layout(dimension: Dimension): Dimension[] {
		this.updateLayout(dimension);

		return super.layout(dimension);
	}
}

class ShowItemInFolderAction extends Action {

	constructor(private path: string, label: string, private windowsService: IWindowsService) {
		super('showItemInFolder.action.id', label);
	}

	run(): TPromise<void> {
		return this.windowsService.showItemInFolder(this.path);
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const titlebarActiveFg = theme.getColor(TITLE_BAR_ACTIVE_FOREGROUND);
	if (titlebarActiveFg) {
		collector.addRule(`
		.monaco-workbench > .part.titlebar > .window-controls-container .window-icon {
			background-color: ${titlebarActiveFg};
		}
		`);
	}

	const titlebarInactiveFg = theme.getColor(TITLE_BAR_INACTIVE_FOREGROUND);
	if (titlebarInactiveFg) {
		collector.addRule(`
		.monaco-workbench > .part.titlebar.inactive > .window-controls-container .window-icon {
				background-color: ${titlebarInactiveFg};
			}
		`);
	}
});
