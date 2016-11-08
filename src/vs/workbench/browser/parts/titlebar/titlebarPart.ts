/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/titlebarpart';
import { Builder, $, Dimension } from 'vs/base/browser/builder';
import DOM = require('vs/base/browser/dom');
import { Part } from 'vs/workbench/browser/part';
import { ITitleService } from 'vs/workbench/services/title/common/titleService';
import { getZoomFactor } from 'vs/base/browser/browser';
import { IWindowService } from 'vs/platform/windows/common/windows';
import errors = require('vs/base/common/errors');

export class TitlebarPart extends Part implements ITitleService {

	public _serviceBrand: any;

	private titleContainer: Builder;
	private title: Builder;
	private pendingTitle: string;
	private initialTitleFontSize: number;

	constructor(
		id: string,
		@IWindowService private windowService: IWindowService
	) {
		super(id);
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

	public layout(dimension: Dimension): Dimension[] {

		// To prevent zooming we need to adjust the font size with the zoom factor
		if (typeof this.initialTitleFontSize !== 'number') {
			this.initialTitleFontSize = parseInt(this.titleContainer.getComputedStyle().fontSize, 10);
		}
		this.titleContainer.style({ fontSize: `${this.initialTitleFontSize / getZoomFactor()}px` });

		return super.layout(dimension);
	}
}