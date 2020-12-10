/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { BrowserClipboardService as BaseBrowserClipboardService } from 'vs/platform/clipboard/browser/clipboardService';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IOpenerService } from 'vs/platform/opener/common/opener';

export class BrowserClipboardService extends BaseBrowserClipboardService {

	constructor(
		@INotificationService private readonly notificationService: INotificationService,
		@IOpenerService private readonly openerService: IOpenerService
	) {
		super();
	}

	async readText(type?: string): Promise<string> {
		if (type) {
			return super.readText(type);
		}

		try {
			return await navigator.clipboard.readText();
		} catch (error) {

			// Inform user about permissions problem
			// (https://github.com/microsoft/vscode/issues/112089)
			this.notificationService.prompt(
				Severity.Error,
				localize('clipboardError', "Unable to read from the browser's clipboard. Please make sure you have granted access for this website to read from the clipboard."),
				[{
					label: localize('learnMode', "Learn More"),
					run: () => this.openerService.open('https://go.microsoft.com/fwlink/?linkid=2151362')
				}],
				{
					sticky: true
				}
			);

			return '';
		}
	}
}

registerSingleton(IClipboardService, BrowserClipboardService, true);
