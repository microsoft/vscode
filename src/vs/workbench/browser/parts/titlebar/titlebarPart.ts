/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import 'vs/css!./media/titlebarpart';
import 'vs/workbench/browser/parts/menubar/menubar.contribution';
import { TPromise } from 'vs/base/common/winjs.base';
import { Builder, $ } from 'vs/base/browser/builder';
import * as paths from 'vs/base/common/paths';
import { Part } from 'vs/workbench/browser/part';
import { ITitleService, ITitleProperties } from 'vs/workbench/services/title/common/titleService';
import { getZoomFactor } from 'vs/base/browser/browser';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import * as errors from 'vs/base/common/errors';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { IAction, Action } from 'vs/base/common/actions';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import * as nls from 'vs/nls';
import * as labels from 'vs/base/common/labels';
import { EditorInput, toResource } from 'vs/workbench/common/editor';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { Verbosity } from 'vs/platform/editor/common/editor';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TITLE_BAR_ACTIVE_BACKGROUND, TITLE_BAR_ACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_BACKGROUND, TITLE_BAR_BORDER } from 'vs/workbench/common/theme';
import { isMacintosh, isWindows } from 'vs/base/common/platform';
import URI from 'vs/base/common/uri';
import { Color } from 'vs/base/common/color';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { trim } from 'vs/base/common/strings';
import { addDisposableListener, EventType, EventHelper, Dimension } from 'vs/base/browser/dom';
import { IMenuService, MenuId, IMenu } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';

interface Menu {
	title: string;
	element: Builder;
	menuItemsElement: Builder;
	actions?: IAction[];
}


export class TitlebarPart extends Part implements ITitleService {

	public _serviceBrand: any;

	private static readonly NLS_UNSUPPORTED = nls.localize('patchedWindowTitle', "[Unsupported]");
	private static readonly NLS_USER_IS_ADMIN = isWindows ? nls.localize('userIsAdmin', "[Administrator]") : nls.localize('userIsSudo', "[Superuser]");
	private static readonly NLS_EXTENSION_HOST = nls.localize('devExtensionWindowTitlePrefix', "[Extension Development Host]");
	private static readonly TITLE_DIRTY = '\u25cf ';
	private static readonly TITLE_SEPARATOR = isMacintosh ? ' — ' : ' - '; // macOS uses special - separator

	private titleContainer: Builder;
	private menubarContainer: Builder;
	private title: Builder;
	private pendingTitle: string;
	private initialTitleFontSize: number;
	private representedFileName: string;

	private isInactive: boolean;

	private properties: ITitleProperties;
	private activeEditorListeners: IDisposable[];

	private menus: {
		[title: string]: Menu;
	} = {};



	constructor(
		id: string,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IWindowService private windowService: IWindowService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWindowsService private windowsService: IWindowsService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IThemeService themeService: IThemeService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IMenuService private menuService: IMenuService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super(id, { hasTitle: false }, themeService);

		this.properties = { isPure: true, isAdmin: false };
		this.activeEditorListeners = [];

		this.init();

		this.registerListeners();
	}

	private init(): void {
		// Initial window title when loading is done
		this.lifecycleService.when(LifecyclePhase.Running).then(() => this.setTitle(this.getWindowTitle()));
	}

	private registerListeners(): void {
		this.toUnbind.push(addDisposableListener(window, EventType.BLUR, () => this.onBlur()));
		this.toUnbind.push(addDisposableListener(window, EventType.FOCUS, () => this.onFocus()));
		this.toUnbind.push(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationChanged(e)));
		this.toUnbind.push(this.editorGroupService.onEditorsChanged(() => this.onEditorsChanged()));
		this.toUnbind.push(this.contextService.onDidChangeWorkspaceFolders(() => this.setTitle(this.getWindowTitle())));
		this.toUnbind.push(this.contextService.onDidChangeWorkbenchState(() => this.setTitle(this.getWindowTitle())));
		this.toUnbind.push(this.contextService.onDidChangeWorkspaceName(() => this.setTitle(this.getWindowTitle())));
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

	private onEditorsChanged(): void {

		// Dispose old listeners
		dispose(this.activeEditorListeners);
		this.activeEditorListeners = [];

		const activeEditor = this.editorService.getActiveEditor();
		const activeInput = activeEditor ? activeEditor.input : void 0;

		// Calculate New Window Title
		this.setTitle(this.getWindowTitle());

		// Apply listener for dirty and label changes
		if (activeInput instanceof EditorInput) {
			this.activeEditorListeners.push(activeInput.onDidChangeDirty(() => {
				this.setTitle(this.getWindowTitle());
			}));

			this.activeEditorListeners.push(activeInput.onDidChangeLabel(() => {
				this.setTitle(this.getWindowTitle());
			}));
		}
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

	public updateProperties(properties: ITitleProperties): void {
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
		const input = this.editorService.getActiveEditorInput();
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
		let folder = this.contextService.getWorkbenchState() === WorkbenchState.FOLDER ? workspace.folders[0] : this.contextService.getWorkspaceFolder(toResource(input, { supportSideBySide: true }));

		// Variables
		const activeEditorShort = input ? input.getTitle(Verbosity.SHORT) : '';
		const activeEditorMedium = input ? input.getTitle(Verbosity.MEDIUM) : activeEditorShort;
		const activeEditorLong = input ? input.getTitle(Verbosity.LONG) : activeEditorMedium;
		const rootName = workspace.name;
		const rootPath = root ? labels.getPathLabel(root, void 0, this.environmentService) : '';
		const folderName = folder ? folder.name : '';
		const folderPath = folder ? labels.getPathLabel(folder.uri, void 0, this.environmentService) : '';
		const dirty = input && input.isDirty() ? TitlebarPart.TITLE_DIRTY : '';
		const appName = this.environmentService.appNameLong;
		const separator = TitlebarPart.TITLE_SEPARATOR;
		const titleTemplate = this.configurationService.getValue<string>('window.title');

		return labels.template(titleTemplate, {
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


	private addMenu(menuTitle: string, menuId: MenuId): void {
		if (this.menus[menuTitle]) {
			throw new Error(`Menu ${menuTitle} already exists.`);
		}

		const menu: IMenu = this.menuService.createMenu(menuId, this.contextKeyService);

		console.log(menu);

		let menuElement = $(this.menubarContainer).div({ class: 'menubar-menu-button' });
		$(menuElement).div({ class: 'menubar-menu-title' }).text(menuTitle);
		let menuItemsHolder = $(menuElement).div({ class: 'menubar-menu-items-holder' });

		this.menus[menuTitle] = {
			title: menuTitle,
			element: menuElement,
			menuItemsElement: menuItemsHolder
		};

		const updateActions = () => {
			this.menus[menuTitle].actions = [];
			let groups = menu.getActions();
			for (let group of groups) {
				const [, actions] = group;
				this.menus[menuTitle].actions.push(...actions);
				this.menus[menuTitle].actions.push(new Separator());
			}

			this.menus[menuTitle].actions.pop();

			this.menus[menuTitle].actions.forEach((action: IAction) => {
				this.addMenuItem(action.label, menuTitle, action);
			});
		};

		menu.onDidChange(updateActions, null);
		updateActions();

		this.menus[menuTitle].element.on(EventType.CLICK, () => {
			console.log('element clicked');
			this.showMenu(menuTitle);
		});
	}

	private showMenu(title: string): void {
		this.menus[title].menuItemsElement.addClass('menubar-menu-items-holder-open');

		let boundingRect = this.menus[title].element.getHTMLElement().getBoundingClientRect();
		console.log(this.menus[title].actions);

		this.contextMenuService.showContextMenu({
			getAnchor: () => ({ x: boundingRect.left, y: boundingRect.bottom }),
			getActions: () => TPromise.as(
				this.menus[title].actions
			)
		});
	}

	private addMenuItem(title: string, parent: string, action: IAction): void {
		if (!this.menus[parent]) {
			throw new Error(`Menu ${parent} does not exist.`);
		}

		let menuitem = $(this.menus[parent].menuItemsElement).div({ class: 'menubar-menu-item' });
		menuitem.text(title);
	}

	public createContentArea(parent: HTMLElement): HTMLElement {
		const SVGNS = 'http://www.w3.org/2000/svg';
		this.titleContainer = $(parent);

		if (!isMacintosh) {
			$(this.titleContainer).img({
				class: 'window-appicon',
				src: path.join(this.environmentService.appRoot, 'resources/linux/code.png')
			}).on(EventType.DBLCLICK, (e) => {
				EventHelper.stop(e, true);
				this.windowService.closeWindow().then(null, errors.onUnexpectedError);
			});

			this.menubarContainer = $(this.titleContainer).div({ class: 'menubar-container' });
		}

		// Title
		this.title = $(this.titleContainer).div({ class: 'window-title' });
		if (this.pendingTitle) {
			this.title.text(this.pendingTitle);
		}

		// Maximize/Restore on doubleclick
		this.titleContainer.on(EventType.DBLCLICK, (e) => {
			EventHelper.stop(e);

			this.onTitleDoubleclick();
		});

		// Context menu on title
		this.title.on([EventType.CONTEXT_MENU, EventType.MOUSE_DOWN], (e: MouseEvent) => {
			if (e.type === EventType.CONTEXT_MENU || e.metaKey) {
				EventHelper.stop(e);

				this.onContextMenu(e);
			}
		});

		const $svg = (name: string, props: { [name: string]: any }) => {
			const el = document.createElementNS(SVGNS, name);
			Object.keys(props).forEach((prop) => {
				el.setAttribute(prop, props[prop]);
			});
			return el;
		};

		if (!isMacintosh) {
			// The svgs and styles for the titlebar come from the electron-titlebar-windows package
			let windowControls = $(this.titleContainer).div({ class: 'window-controls-container' });

			$(windowControls).div({ class: 'window-icon' }, (builder) => {
				const svg = $svg('svg', { x: 0, y: 0, viewBox: '0 0 10 1' });
				svg.appendChild($svg('rect', { fill: 'currentColor', width: 10, height: 1 }));
				builder.getHTMLElement().appendChild(svg);
			}).on(EventType.CLICK, () => {
				this.windowService.minimizeWindow().then(null, errors.onUnexpectedError);
			});

			$(windowControls).div({ class: 'window-icon' }, (builder) => {
				const svgf = $svg('svg', { class: 'window-maximize', x: 0, y: 0, viewBox: '0 0 10 10' });
				svgf.appendChild($svg('path', { fill: 'currentColor', d: 'M 0 0 L 0 10 L 10 10 L 10 0 L 0 0 z M 1 1 L 9 1 L 9 9 L 1 9 L 1 1 z' }));
				builder.getHTMLElement().appendChild(svgf);

				const svgm = $svg('svg', { class: 'window-unmaximize', x: 0, y: 0, viewBox: '0 0 10 10' });
				const mask = $svg('mask', { id: 'Mask' });
				mask.appendChild($svg('rect', { fill: '#fff', width: 10, height: 10 }));
				mask.appendChild($svg('path', { fill: '#000', d: 'M 3 1 L 9 1 L 9 7 L 8 7 L 8 2 L 3 2 L 3 1 z' }));
				mask.appendChild($svg('path', { fill: '#000', d: 'M 1 3 L 7 3 L 7 9 L 1 9 L 1 3 z' }));
				svgm.appendChild(mask);
				svgm.appendChild($svg('path', { fill: 'currentColor', d: 'M 2 0 L 10 0 L 10 8 L 8 8 L 8 10 L 0 10 L 0 2 L 2 2 L 2 0 z', mask: 'url(#Mask)' }));
				builder.getHTMLElement().appendChild(svgm);
			}).on(EventType.CLICK, () => {
				this.windowService.isMaximized().then((maximized) => {
					if (maximized) {
						return this.windowService.unmaximizeWindow();
					} else {
						return this.windowService.maximizeWindow();
					}
				}).then(null, errors.onUnexpectedError);
			});

			$(windowControls).div({ class: 'window-icon window-close' }, (builder) => {
				const svg = $svg('svg', { x: '0', y: '0', viewBox: '0 0 10 10' });
				svg.appendChild($svg('polygon', { fill: 'currentColor', points: '10,1 9,0 5,4 1,0 0,1 4,5 0,9 1,10 5,6 9,10 10,9 6,5' }));
				builder.getHTMLElement().appendChild(svg);
			}).on(EventType.CLICK, () => {
				this.windowService.closeWindow().then(null, errors.onUnexpectedError);
			});

			this.windowService.isMaximized().then((max) => this.onDidChangeMaximized(max), errors.onUnexpectedError);
			this.windowService.onDidChangeMaximize(this.onDidChangeMaximized, this);
		}

		// Build the menubar
		if (this.menubarContainer) {

			// let menuTitles = ['File', 'Edit'];
			// let menuIds = [ MenuId.MenubarFileMenu, MenuId.MenubarEditMenu ];

			// let menuTitles = ['File', 'Edit', 'Selection', 'View', 'Go', 'Debug', 'Tasks', 'Help'];
			// menuTitles.forEach(menuTitle => {
			// 	this.addMenu(menuTitle);
			// });

			this.addMenu('File', MenuId.MenubarFileMenu);
			this.addMenu('Edit', MenuId.MenubarEditMenu);

			/**
			 * File
			 */

			// this.addMenuItem('New File', 'File');
			// this.addMenuItem('New Window', 'File');
			// this.addMenuItem('Open File...', 'File');
			// this.addMenuItem('Exit', 'File');

			/**
			 * Edit
			 */

			// this.addMenuItem('Undo', 'Edit');
			// this.addMenuItem('Redo', 'Edit');
			// this.addMenuItem('Cut', 'Edit');
			// this.addMenuItem('Copy', 'Edit');
			// this.addMenuItem('Paste', 'Edit');
		}

		// Since the title area is used to drag the window, we do not want to steal focus from the
		// currently active element. So we restore focus after a timeout back to where it was.
		this.titleContainer.on([EventType.MOUSE_DOWN], () => {
			const active = document.activeElement;
			setTimeout(() => {
				if (active instanceof HTMLElement) {
					active.focus();
				}
			}, 0 /* need a timeout because we are in capture phase */);
		}, void 0, true /* use capture to know the currently active element properly */);

		// Now that there exists a titelbar, we don't need the whole page to be a drag region anymore
		(document.documentElement.style as any).webkitAppRegion = '';
		document.documentElement.style.height = '';

		return this.titleContainer.getHTMLElement();
	}

	private onDidChangeMaximized(maximized: boolean) {
		($(this.titleContainer).getHTMLElement().querySelector('.window-maximize') as SVGElement).style.display = maximized ? 'none' : 'inline';
		($(this.titleContainer).getHTMLElement().querySelector('.window-unmaximize') as SVGElement).style.display = maximized ? 'inline' : 'none';
		// $(this.titleContainer).getHTMLElement().style.paddingLeft = maximized ? '0.15em' : '0.5em';
		// $(this.titleContainer).getHTMLElement().style.paddingRight = maximized ? 'calc(2em / 12)' : '0';
	}

	protected updateStyles(): void {
		super.updateStyles();

		// Part container
		if (this.titleContainer) {
			const bgColor = this.getColor(this.isInactive ? TITLE_BAR_INACTIVE_BACKGROUND : TITLE_BAR_ACTIVE_BACKGROUND);
			this.titleContainer.style('color', this.getColor(this.isInactive ? TITLE_BAR_INACTIVE_FOREGROUND : TITLE_BAR_ACTIVE_FOREGROUND));
			this.titleContainer.style('background-color', bgColor);
			this.titleContainer.getHTMLElement().classList.toggle('light', Color.fromHex(bgColor).isLighter());

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
					label = labels.getBaseLabel(paths.dirname(path));
				} else {
					label = labels.getBaseLabel(path);
				}

				actions.push(new ShowItemInFolderAction(path, label || paths.sep, this.windowsService));
			}
		}

		return actions;
	}

	public setTitle(title: string): void {

		// Always set the native window title to identify us properly to the OS
		window.document.title = title;

		// Apply if we can
		if (this.title) {
			this.title.text(title);
		} else {
			this.pendingTitle = title;
		}
	}

	public setRepresentedFilename(path: string): void {

		// Apply to window
		this.windowService.setRepresentedFilename(path);

		// Keep for context menu
		this.representedFileName = path;
	}

	public layout(dimension: Dimension): Dimension[] {

		// To prevent zooming we need to adjust the font size with the zoom factor
		if (typeof this.initialTitleFontSize !== 'number') {
			this.initialTitleFontSize = parseInt(this.titleContainer.getComputedStyle().fontSize, 10);
		}
		this.titleContainer.style({ fontSize: `${this.initialTitleFontSize / getZoomFactor()}px` });

		return super.layout(dimension);
	}
}

class ShowItemInFolderAction extends Action {

	constructor(private path: string, label: string, private windowsService: IWindowsService) {
		super('showItemInFolder.action.id', label);
	}

	public run(): TPromise<void> {
		return this.windowsService.showItemInFolder(this.path);
	}
}
