/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import platform = require('vs/base/common/platform');
import URI from 'vs/base/common/uri';
import DOM = require('vs/base/browser/dom');
import DND = require('vs/base/browser/dnd');
import {Builder, $} from 'vs/base/browser/builder';
import {Identifiers} from 'vs/workbench/common/constants';
import {asFileEditorInput} from 'vs/workbench/common/editor';
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IEventService} from 'vs/platform/event/common/event';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';

import {ipcRenderer as ipc, shell, remote} from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const dialog = remote.dialog;

export interface IWindowConfiguration {
	window: {
		openFilesInNewWindow: boolean;
		reopenFolders: string;
		restoreFullscreen: boolean;
		zoomLevel: number;
	};
}

enum DraggedFileType {
	UNKNOWN,
	FILE,
	EXTENSION,
	FOLDER
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
				let fileInput = asFileEditorInput(this.editorService.getActiveEditorInput(), true);
				let representedFilename = '';
				if (fileInput) {
					representedFilename = fileInput.getResource().fsPath;
				}

				ipc.send('vscode:setRepresentedFilename', this.windowId, representedFilename);
			});
		}

		let draggedExternalResources: URI[];
		let dropOverlay: Builder;

		function cleanUp(): void {
			draggedExternalResources = void 0;
			if (dropOverlay) {
				dropOverlay.destroy();
				dropOverlay = void 0;
			}
		}

		// Detect resources dropped into Code from outside
		window.document.body.addEventListener(DOM.EventType.DRAG_OVER, (e: DragEvent) => {
			DOM.EventHelper.stop(e);

			if (!draggedExternalResources) {
				draggedExternalResources = DND.extractResources(e, true /* external only */);

				// Show Code wide overlay if we detect a Folder or Extension to be dragged
				if (draggedExternalResources.some(r => {
					const kind = this.getFileKind(r);

					return kind === DraggedFileType.FOLDER || kind === DraggedFileType.EXTENSION;
				})) {
					dropOverlay = $(window.document.getElementById(Identifiers.WORKBENCH_CONTAINER))
						.div({ id: 'monaco-workbench-drop-overlay' })
						.on(DOM.EventType.DROP, (e: DragEvent) => {
							DOM.EventHelper.stop(e, true);

							this.focus(); // make sure this window has focus so that the open call reaches the right window!
							ipc.send('vscode:windowOpen', draggedExternalResources.map(r => r.fsPath)); // handled from browser process

							cleanUp();
						})
						.on([DOM.EventType.DRAG_LEAVE, DOM.EventType.DRAG_END], () => {
							cleanUp();
						});
				}
			}
		});

		// Clear our map and overlay on any finish of DND outside the overlay
		[DOM.EventType.DROP, DOM.EventType.DRAG_END].forEach(event => {
			window.document.body.addEventListener(event, (e: DragEvent) => {
				if (!dropOverlay || e.target !== dropOverlay.getHTMLElement()) {
					cleanUp(); // only run cleanUp() if we are not over the overlay (because we are being called in capture phase)
				}
			}, true /* use capture because components within may preventDefault() when they accept the drop */);
		});

		// prevent opening a real URL inside the shell
		window.document.body.addEventListener(DOM.EventType.DROP, (e: DragEvent) => {
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

	private getFileKind(resource: URI): DraggedFileType {
		if (path.extname(resource.fsPath) === '.vsix') {
			return DraggedFileType.EXTENSION;
		}

		let kind = DraggedFileType.UNKNOWN;
		try {
			kind = fs.statSync(resource.fsPath).isDirectory() ? DraggedFileType.FOLDER : DraggedFileType.FILE;
		} catch (error) {
			// Do not fail in DND handler
		}

		return kind;
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