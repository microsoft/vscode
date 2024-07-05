/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { BrowserClipboardService as BaseBrowserClipboardService } from 'vs/platform/clipboard/browser/clipboardService';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ILogService } from 'vs/platform/log/common/log';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { getActiveWindow } from 'vs/base/browser/dom';

export class BrowserClipboardService extends BaseBrowserClipboardService {

	constructor(
		@INotificationService private readonly notificationService: INotificationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@ILogService logService: ILogService,
		@ILayoutService layoutService: ILayoutService
	) {
		super(layoutService, logService);
	}

	override async writeText(text: string, type?: string): Promise<void> {
		if (!!this.environmentService.extensionTestsLocationURI && typeof type !== 'string') {
			type = 'vscode-tests'; // force in-memory clipboard for tests to avoid permission issues
		}

		return super.writeText(text, type);
	}

	override async readText(type?: string): Promise<string> {
		if (!!this.environmentService.extensionTestsLocationURI && typeof type !== 'string') {
			type = 'vscode-tests'; // force in-memory clipboard for tests to avoid permission issues
		}

		if (type) {
			return super.readText(type);
		}

		try {
			return await getActiveWindow().navigator.clipboard.readText();
		} catch (error) {
			return new Promise<string>(resolve => {

				// Inform user about permissions problem (https://github.com/microsoft/vscode/issues/112089)
				const listener = new DisposableStore();
				const handle = this.notificationService.prompt(
					Severity.Error,
					localize('clipboardError', "Unable to read from the browser's clipboard. Please make sure you have granted access for this website to read from the clipboard."),
					[{
						label: localize('retry', "Retry"),
						run: async () => {
							listener.dispose();
							resolve(await this.readText(type));
						}
					}, {
						label: localize('learnMore', "Learn More"),
						run: () => this.openerService.open('https://go.microsoft.com/fwlink/?linkid=2151362')
					}],
					{
						sticky: true
					}
				);

				// Always resolve the promise once the notification closes
				listener.add(Event.once(handle.onDidClose)(() => resolve('')));
			});
		}
	}
}

registerSingleton(IClipboardService, BrowserClipboardService, InstantiationType.Delayed);
