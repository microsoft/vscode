/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import platform = require('vs/base/common/platform');
import paths = require('vs/base/common/paths');
import uri from 'vs/base/common/uri';
import {Identifiers} from 'vs/workbench/common/constants';
import {EventType, EditorEvent} from 'vs/workbench/browser/events';
import workbenchEditorCommon = require('vs/workbench/common/editor');
import {IViewletService} from 'vs/workbench/services/viewlet/common/viewletService';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import dom = require('vs/base/browser/dom');
import {AnchorAlignment, ContextView} from 'vs/base/browser/ui/contextview/contextview';
import {IDisposable} from 'vs/base/common/lifecycle';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IEventService} from 'vs/platform/event/common/event';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

import remote = require('remote');
import ipc = require('ipc');

const Shell = remote.require('shell');
const Dialog = remote.require('dialog');

export class ElectronWindow {
	private win: remote.BrowserWindow;

	constructor(
		win: remote.BrowserWindow,
		shellContainer: HTMLElement,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEventService private eventService: IEventService,
		@IStorageService private storageService: IStorageService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IViewletService private viewletService: IViewletService
	) {
		this.win = win;
		this.registerListeners();
	}

	private registerListeners(): void {

		// React to editor input changes (Mac only)
		if (platform.platform === platform.Platform.Mac) {
			this.eventService.addListener(EventType.EDITOR_INPUT_CHANGED, (e: EditorEvent) => {
				// if we dont use setTimeout() here for some reason there is an issue when switching between 2 files side by side
				// with the mac trackpad where the editor would think the user wants to select. to reproduce, have 2 files, click
				// into the non-focussed one and move the mouse down and see the editor starts to select lines.
				setTimeout(() => {
					let fileInput = workbenchEditorCommon.asFileEditorInput(e.editorInput, true);
					if (fileInput) {
						this.win.setRepresentedFilename(fileInput.getResource().fsPath);
					} else {
						this.win.setRepresentedFilename('');
					}
				}, 0);

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
		window.open = function(url: string, target: string, features: string, replace: boolean) {
			Shell.openExternal(url);

			return <Window>null;
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

	public showMessageBox(options: remote.IMessageBoxOptions): number {
		return Dialog.showMessageBox(this.win, options);
	}

	public setFullScreen(fullscreen: boolean): void {
		this.win.setFullScreen(fullscreen);
	}

	public openDevTools(): void {
		this.win.openDevTools();
	}

	public isFullScreen(): boolean {
		return this.win.isFullScreen();
	}

	public setMenuBarVisibility(visible: boolean): void {
		this.win.setMenuBarVisibility(visible);
	}

	public focus(): void {
		if (!this.win.isFocused()) {
			if (platform.isWindows || platform.isLinux) {
				this.win.show(); // Windows & Linux sometimes cannot bring the window to the front when it is in the background
			} else {
				this.win.focus();
			}
		}
	}

	public flashFrame(): void {
		this.win.flashFrame(!this.win.isFocused());
	}
}