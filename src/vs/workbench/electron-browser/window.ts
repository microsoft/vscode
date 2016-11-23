/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import platform = require('vs/base/common/platform');
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { stat } from 'vs/base/node/pfs';
import DOM = require('vs/base/browser/dom');
import { extractResources } from 'vs/base/browser/dnd';
import { Builder, $ } from 'vs/base/browser/builder';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { asFileEditorInput } from 'vs/workbench/common/editor';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { ITitleService } from 'vs/workbench/services/title/common/titleService';

import { remote } from 'electron';

const dialog = remote.dialog;

export class ElectronWindow {
	private win: Electron.BrowserWindow;
	private windowId: number;

	constructor(
		win: Electron.BrowserWindow,
		shellContainer: HTMLElement,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IPartService private partService: IPartService,
		@IWindowsService private windowsService: IWindowsService,
		@IWindowService private windowService: IWindowService,
		@ITitleService private titleService: ITitleService
	) {
		this.win = win;
		this.windowId = win.id;

		this.registerListeners();
	}

	private registerListeners(): void {

		// React to editor input changes (Mac only)
		if (platform.platform === platform.Platform.Mac) {
			this.editorGroupService.onEditorsChanged(() => {
				const fileInput = asFileEditorInput(this.editorService.getActiveEditorInput(), true);
				const fileName = fileInput ? fileInput.getResource().fsPath : '';

				this.titleService.setRepresentedFilename(fileName);
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
				draggedExternalResources = extractResources(e, true /* external only */).map(d => d.resource);

				// Find out if folders are dragged and show the appropiate feedback then
				this.includesFolder(draggedExternalResources).done(includesFolder => {
					if (includesFolder) {
						dropOverlay = $(window.document.getElementById(this.partService.getWorkbenchElementId()))
							.div({ id: 'monaco-workbench-drop-overlay' })
							.on(DOM.EventType.DROP, (e: DragEvent) => {
								DOM.EventHelper.stop(e, true);

								this.focus(); // make sure this window has focus so that the open call reaches the right window!
								this.windowsService.windowOpen(draggedExternalResources.map(r => r.fsPath));

								cleanUp();
							})
							.on([DOM.EventType.DRAG_LEAVE, DOM.EventType.DRAG_END], () => {
								cleanUp();
							}).once(DOM.EventType.MOUSE_OVER, () => {
								// Under some circumstances we have seen reports where the drop overlay is not being
								// cleaned up and as such the editor area remains under the overlay so that you cannot
								// type into the editor anymore. This seems related to using VMs and DND via host and
								// guest OS, though some users also saw it without VMs.
								// To protect against this issue we always destroy the overlay as soon as we detect a
								// mouse event over it. The delay is used to guarantee we are not interfering with the
								// actual DROP event that can also trigger a mouse over event.
								// See also: https://github.com/Microsoft/vscode/issues/10970
								setTimeout(() => {
									cleanUp();
								}, 300);
							});
					}
				});
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
		const $this = this;
		(<any>window).open = function (url: string, target: string, features: string, replace: boolean) {
			$this.windowsService.openExternal(url);
			return null;
		};
	}

	private includesFolder(resources: URI[]): TPromise<boolean> {
		return TPromise.join(resources.map(resource => {
			return stat(resource.fsPath).then(stats => stats.isDirectory() ? true : false, error => false);
		})).then(res => res.some(res => !!res));
	}

	public close(): void {
		this.win.close();
	}

	public showMessageBox(options: Electron.ShowMessageBoxOptions): number {
		return dialog.showMessageBox(this.win, options);
	}

	public showSaveDialog(options: Electron.SaveDialogOptions, callback?: (fileName: string) => void): string {
		if (callback) {
			return dialog.showSaveDialog(this.win, options, callback);
		}

		return dialog.showSaveDialog(this.win, options); // https://github.com/electron/electron/issues/4936
	}

	public focus(): TPromise<void> {
		return this.windowService.focusWindow();
	}
}