/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import platform = require('vs/base/common/platform');
import paths = require('vs/base/common/paths');
import uri from 'vs/base/common/uri';
import {Identifiers} from 'vs/workbench/common/constants';
import {EventType, EditorEvent} from 'vs/workbench/common/events';
import workbenchEditorCommon = require('vs/workbench/common/editor');
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import dom = require('vs/base/browser/dom');
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IEventService} from 'vs/platform/event/common/event';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

import {ipcRenderer as ipc, shell, remote} from 'electron';

const dialog = remote.dialog;

export interface IWindowConfiguration {
	window: {
		openFilesInNewWindow: boolean;
		reopenFolders: string;
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
		@IViewletService private viewletService: IViewletService
	) {
		this.win = win;
		this.windowId = win.id;
		this.registerListeners();
	}

	private registerListeners(): void {

		// React to editor input changes (Mac only)
		if (platform.platform === platform.Platform.Mac) {
			this.eventService.addListener(EventType.EDITOR_INPUT_CHANGED, (e: EditorEvent) => {
				let fileInput = workbenchEditorCommon.asFileEditorInput(e.editorInput, true);
				let representedFilename = '';
				if (fileInput) {
					representedFilename = fileInput.getResource().fsPath;
				}

				ipc.send('vscode:setRepresentedFilename', this.windowId, representedFilename);
			});
		}

		// Prevent a dropped file from opening as nw application
		window.document.body.addEventListener('dragover', (e: DragEvent) => {
			e.preventDefault();
		});

		// Let a dropped file open inside Monaco (only if dropped over editor area)
		window.document.body.addEventListener('drop', (e: DragEvent) => {
			e.preventDefault();

			let editorArea = window.document.getElementById(Identifiers.EDITOR_PART);
			if (dom.isAncestor(e.toElement, editorArea)) {
				let pathsOpened = false;

				// Check for native file transfer
				if (e.dataTransfer && e.dataTransfer.files) {
					let thepaths: string[] = [];
					for (let i = 0; i < e.dataTransfer.files.length; i++) {
						if (e.dataTransfer.files[i] && (<any>e.dataTransfer.files[i]).path) {
							thepaths.push((<any>e.dataTransfer.files[i]).path);
						}
					}

					if (thepaths.length) {
						pathsOpened = true;
						this.focus(); // make sure this window has focus so that the open call reaches the right window!
						this.open(thepaths);
					}
				}

				// Otherwise check for special webkit transfer
				if (!pathsOpened && e.dataTransfer && (<any>e).dataTransfer.items) {
					let items: { getAsString: (clb: (str: string) => void) => void; }[] = (<any>e).dataTransfer.items;
					if (items.length && typeof items[0].getAsString === 'function') {
						items[0].getAsString((str) => {
							try {
								let resource = uri.parse(str);
								if (resource.scheme === 'file') {

									// Do not allow to drop a child of the currently active workspace. This prevents an issue
									// where one would drop a folder from the explorer by accident into the editor area and
									// loose all the context.
									let workspace = this.contextService.getWorkspace();
									if (workspace && paths.isEqualOrParent(resource.fsPath, workspace.resource.fsPath)) {
										return;
									}

									this.focus(); // make sure this window has focus so that the open call reaches the right window!
									this.open([decodeURIComponent(resource.fsPath)]);
								}
							} catch (error) {
								// not a resource
							}
						});
					}
				}
			}
		});

		// Handle window.open() calls
		(<any>window).open = function(url: string, target: string, features: string, replace: boolean) {
			shell.openExternal(url);

			return null;
		};
	}

	public open(pathsToOpen: string[]): void;
	public open(fileResource: uri): void;
	public open(pathToOpen: string): void;
	public open(arg1: any): void {
		let pathsToOpen: string[];
		if (Array.isArray(arg1)) {
			pathsToOpen = arg1;
		} else if (typeof arg1 === 'string') {
			pathsToOpen = [arg1];
		} else {
			pathsToOpen = [(<uri>arg1).fsPath];
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
		return dialog.showSaveDialog(this.win, options, callback);
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