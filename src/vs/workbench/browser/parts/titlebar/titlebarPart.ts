/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/titlebarpart';
import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Builder, $, Dimension } from 'vs/base/browser/builder';
import { Part } from 'vs/workbench/browser/part';
import { ITitleService } from 'vs/workbench/services/title/common/titleService';
import { getZoomFactor } from 'vs/base/browser/browser';
import { Action } from 'vs/base/common/actions';
import { IMessageService, Severity, IMessageWithAction } from 'vs/platform/message/common/message';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { isMacintosh } from 'vs/base/common/platform';

export class TitlebarPart extends Part implements ITitleService {

	public _serviceBrand: any;

	private titleContainer: Builder;
	private title: Builder;
	private pendingTitle: string;
	private initialTitleFontSize: number;

	constructor(
		id: string,
		@IMessageService private messageService: IMessageService,
		@IStorageService private storageService: IStorageService
	) {
		super(id);

		this.informUser(); // TODO@Ben remove me
	}

	private informUser(): void {
		if (isMacintosh && !this.storageService.getBoolean('customTitleBarInformUser', StorageScope.GLOBAL)) {
			this.storageService.store('customTitleBarInformUser', true, StorageScope.GLOBAL);

			const okAction = new Action(
				'customTitle.ok',
				nls.localize('customTitle.ok', "OK"),
				null,
				true,
				() => TPromise.as(true)
			);

			const moreInfoAction = new Action(
				'customTitle.moreInfo',
				nls.localize('customTitle.moreInfo', "More information"),
				null,
				true,
				() => {
					window.open('https://github.com/Microsoft/vscode/issues/15098');

					return TPromise.as(true);
				}
			);

			this.messageService.show(Severity.Info, <IMessageWithAction>{
				message: nls.localize('customTitleBarInformUser', "We have enabled a new custom title bar style on Mac. The related setting is called **window.titleBarStyle**."),
				actions: [
					okAction,
					moreInfoAction
				]
			});
		}
	}

	public createContentArea(parent: Builder): Builder {
		this.titleContainer = $(parent);

		// Title
		this.title = $(this.titleContainer).div({ class: 'window-title' });
		if (this.pendingTitle) {
			this.title.text(this.pendingTitle);
		}

		return this.titleContainer;
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