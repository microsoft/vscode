/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { BrowserClipboardService as BaseBrowserClipboardService } from '../../../../platform/clipboard/browser/clipboardService.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { getActiveWindow } from '../../../../base/browser/dom.js';
import { isSafari } from '../../../../base/browser/browser.js';
import { promiseWithResolvers, timeout } from '../../../../base/common/async.js';

const READ_TEXT_FROM_SAFARI_CLIPBOARD_TIMEOUT = 200;

export class BrowserClipboardService extends BaseBrowserClipboardService {

	constructor(
		@INotificationService private readonly notificationService: INotificationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@ILogService logService: ILogService,
		@ILayoutService layoutService: ILayoutService
	) {
		super(layoutService, logService);
		if (isSafari) {
			// Webkit browsers (Safari) require a user gesture to read from the clipboard.
			// https://webkit.org/blog/10855/async-clipboard-api/
			window.addEventListener('keydown', () => this.resolveReadTextPromise())
		}
	}

	override async writeText(text: string, type?: string): Promise<void> {
		if (!!this.environmentService.extensionTestsLocationURI && typeof type !== 'string') {
			type = 'vscode-tests'; // force in-memory clipboard for tests to avoid permission issues
		}

		return super.writeText(text, type);
	}

	private async resolveReadTextPromise() {
		// try to wait readText request for 3 times with 20ms timeout each
		for (let i = 0; i < 3; i++) {
			await timeout(20);
			const reader = this.readTextPromise
			this.readTextPromise = undefined
			if (reader) {
				const text = await getActiveWindow().navigator.clipboard.readText()
				reader.resolve(text);
				return
			}
		}
	}

	private readTextPromise?: ReturnType<typeof promiseWithResolvers<string | undefined>>

	private async readTextByLastUserEvent(): Promise<string | undefined> {
		if (!this.readTextPromise) {
			const resolvers = promiseWithResolvers<string | undefined>();
			const timer = setTimeout(() => resolvers.resolve(undefined), READ_TEXT_FROM_SAFARI_CLIPBOARD_TIMEOUT);
			resolvers.promise.finally(() => clearTimeout(timer))

			this.readTextPromise = resolvers
		}

		const text = await this.readTextPromise.promise
		this.readTextPromise = undefined;
		return text
	}

	override async readText(type?: string): Promise<string> {
		if (!!this.environmentService.extensionTestsLocationURI && typeof type !== 'string') {
			type = 'vscode-tests'; // force in-memory clipboard for tests to avoid permission issues
		}

		if (type) {
			return super.readText(type);
		}

		try {
			// Try to read clipboard text from the last user event in for webkit browsers (Safari).
			if (isSafari) {
				const text = await this.readTextByLastUserEvent();
				if (text !== undefined) return text;
			}

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
