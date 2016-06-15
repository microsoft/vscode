/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import platform = require('vs/base/common/platform');
import URI from 'vs/base/common/uri';
import DOM = require('vs/base/browser/dom');
import workbenchEditorCommon = require('vs/workbench/common/editor');
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IEventService} from 'vs/platform/event/common/event';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';

import {ipcRenderer as ipc, shell, remote} from 'electron';

const dialog = remote.dialog;

export interface IWindowConfiguration {
	window: {
		openFilesInNewWindow: boolean;
		reopenFolders: string;
		restoreFullscreen: boolean;
		zoomLevel: number;
	};
}

export class ElectronWindow {
	private win: Electron.BrowserWindow;
	private windowId: number;

	constructor(
		win: Electron.BrowserWindow,
		shellContainer: HTMLElement,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEventService private eventService: IEventService,
		@IStorageService private storageService: IStorageService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IViewletService private viewletService: IViewletService
	) {
		this.win = win;
		this.windowId = win.id;
		this.registerListeners();
	}

	private registerListeners(): void {

		// React to editor input changes (Mac only)
		if (platform.platform === platform.Platform.Mac) {
			this.editorGroupService.onEditorsChanged(() => {
				let fileInput = workbenchEditorCommon.asFileEditorInput(this.editorService.getActiveEditorInput(), true);
				let representedFilename = '';
				if (fileInput) {
					representedFilename = fileInput.getResource().fsPath;
				}

				ipc.send('vscode:setRepresentedFilename', this.windowId, representedFilename);
			});
		}

		// Prevent a dropped file from opening as application
		window.document.body.addEventListener(DOM.EventType.DRAG_OVER, (e: DragEvent) => {
			DOM.EventHelper.stop(e);
		});

		// Handle window.open() calls
		(<any>window).open = function (url: string, target: string, features: string, replace: boolean) {
			shell.openExternal(url);

			return null;
		};

		// Patch focus to also focus the entire window
		const originalFocus = window.focus;
		const $this = this;
		window.focus = function () {
			originalFocus.call(this, arguments);
			$this.focus();
		};
	}

	public open(pathsToOpen: string[]): void;
	public open(fileResource: URI): void;
	public open(pathToOpen: string): void;
	public open(arg1: any): void {
		let pathsToOpen: string[];
		if (Array.isArray(arg1)) {
			pathsToOpen = arg1;
		} else if (typeof arg1 === 'string') {
			pathsToOpen = [arg1];
		} else {
			pathsToOpen = [(<URI>arg1).fsPath];
		}

		ipc.send('vscode:windowOpen', pathsToOpen); // handled from browser process
	}

	public openNew(): void {
		ipc.send('vscode:openNewWindow'); // handled from browser process
	}

	public close(): void {
		this.win.close();
	}

	public reload(): void {
		ipc.send('vscode:reloadWindow', this.windowId);
	}

	public showMessageBox(options: Electron.Dialog.ShowMessageBoxOptions): number {
		return dialog.showMessageBox(this.win, options);
	}

	public showSaveDialog(options: Electron.Dialog.SaveDialogOptions, callback?: (fileName: string) => void): string {
		if (callback) {
			return dialog.showSaveDialog(this.win, options, callback);
		}

		return dialog.showSaveDialog(this.win, options); // https://github.com/electron/electron/issues/4936
	}

	public setFullScreen(fullscreen: boolean): void {
		ipc.send('vscode:setFullScreen', this.windowId, fullscreen); // handled from browser process
	}

	public openDevTools(): void {
		ipc.send('vscode:openDevTools', this.windowId); // handled from browser process
	}

	public setMenuBarVisibility(visible: boolean): void {
		ipc.send('vscode:setMenuBarVisibility', this.windowId, visible); // handled from browser process
	}

	public focus(): void {
		ipc.send('vscode:focusWindow', this.windowId); // handled from browser process
	}

	public flashFrame(): void {
		ipc.send('vscode:flashFrame', this.windowId); // handled from browser process
	}
}