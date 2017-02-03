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
import { ITitleService } from 'vs/workbench/services/title/common/titleService';
import { getZoomFactor } from 'vs/base/browser/browser';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import * as errors from 'vs/base/common/errors';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { IAction, Action } from 'vs/base/common/actions';

export class TitlebarPart extends Part implements ITitleService {

	public _serviceBrand: any;

	private titleContainer: Builder;
	private title: Builder;
	private pendingTitle: string;
	private initialTitleFontSize: number;
	private representedFileName: string;

	constructor(
		id: string,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IWindowService private windowService: IWindowService,
		@IWindowsService private windowsService: IWindowsService
	) {
		super(id, { hasTitle: false });

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toUnbind.push(DOM.addDisposableListener(window, DOM.EventType.BLUR, () => { if (this.titleContainer) { this.titleContainer.addClass('blurred'); } }));
		this.toUnbind.push(DOM.addDisposableListener(window, DOM.EventType.FOCUS, () => { if (this.titleContainer) { this.titleContainer.removeClass('blurred'); } }));
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

		return this.titleContainer;
	}

	private onTitleDoubleclick(): void {
		this.windowService.isMaximized().then(maximized => {
			if (maximized) {
				this.windowService.unmaximizeWindow().done(null, errors.onUnexpectedError);
			} else {
				this.windowService.maximizeWindow().done(null, errors.onUnexpectedError);
			}
		}, errors.onUnexpectedError);
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

				let label = paths.basename(path);
				if (!isFile) {
					label = paths.basename(paths.dirname(path));
				}

				actions.push(new ShowItemInFolderAction(path, label || paths.sep, this.windowsService));
			}
		}

		return actions;
	}

	public updateTitle(title: string): void {

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