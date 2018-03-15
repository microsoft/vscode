/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/titlebarpart';
import { TPromise } from 'vs/base/common/winjs.base';
import { Builder, $, Dimension } from 'vs/base/browser/builder';
import * as DOM from 'vs/base/browser/dom';
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
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { trim } from 'vs/base/common/strings';

export class TitlebarPart extends Part implements ITitleService {

	public _serviceBrand: any;

	private static readonly NLS_UNSUPPORTED = nls.localize('patchedWindowTitle', "[Unsupported]");
	private static readonly NLS_USER_IS_ADMIN = isWindows ? nls.localize('userIsAdmin', "[Administrator]") : nls.localize('userIsSudo', "[Superuser]");
	private static readonly NLS_EXTENSION_HOST = nls.localize('devExtensionWindowTitlePrefix', "[Extension Development Host]");
	private static readonly TITLE_DIRTY = '\u25cf ';
	private static readonly TITLE_SEPARATOR = isMacintosh ? ' — ' : ' - '; // macOS uses special - separator

	private titleContainer: Builder;
	private title: Builder;
	private pendingTitle: string;
	private initialTitleFontSize: number;
	private representedFileName: string;

	private isInactive: boolean;

	private properties: ITitleProperties;
	private activeEditorListeners: IDisposable[];

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
		@ILifecycleService private lifecycleService: ILifecycleService
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
		this.toUnbind.push(DOM.addDisposableListener(window, DOM.EventType.BLUR, () => this.onBlur()));
		this.toUnbind.push(DOM.addDisposableListener(window, DOM.EventType.FOCUS, () => this.onFocus()));
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

	public createContentArea(parent: Builder): Builder {
		this.titleContainer = $(parent);

		// Title
		this.title = $(this.titleContainer).div({ class: 'window-title' });
		if (this.pendingTitle) {
			this.title.text(this.pendingTitle);
		}

		// Maximize/Restore on doubleclick
		this.titleContainer.on(DOM.EventType.DBLCLICK, (e) => {
			DOM.EventHelper.stop(e);

			this.onTitleDoubleclick();
		});

		// Context menu on title
		this.title.on([DOM.EventType.CONTEXT_MENU, DOM.EventType.MOUSE_DOWN], (e: MouseEvent) => {
			if (e.type === DOM.EventType.CONTEXT_MENU || e.metaKey) {
				DOM.EventHelper.stop(e);

				this.onContextMenu(e);
			}
		});

		// Since the title area is used to drag the window, we do not want to steal focus from the
		// currently active element. So we restore focus after a timeout back to where it was.
		this.titleContainer.on([DOM.EventType.MOUSE_DOWN], () => {
			const active = document.activeElement;
			setTimeout(() => {
				if (active instanceof HTMLElement) {
					active.focus();
				}
			}, 0 /* need a timeout because we are in capture phase */);
		}, void 0, true /* use capture to know the currently active element properly */);

		return this.titleContainer;
	}

	protected updateStyles(): void {
		super.updateStyles();

		// Part container
		const container = this.getContainer();
		if (container) {
			container.style('color', this.getColor(this.isInactive ? TITLE_BAR_INACTIVE_FOREGROUND : TITLE_BAR_ACTIVE_FOREGROUND));
			container.style('background-color', this.getColor(this.isInactive ? TITLE_BAR_INACTIVE_BACKGROUND : TITLE_BAR_ACTIVE_BACKGROUND));

			const titleBorder = this.getColor(TITLE_BAR_BORDER);
			container.style('border-bottom', titleBorder ? `1px solid ${titleBorder}` : null);
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