/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { assertNever } from '../../../../base/common/assert.js';
import { ClipboardTarget, IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { BrowserClipboardService as BaseBrowserClipboardService } from '../../../../platform/clipboard/browser/clipboardService.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { getActiveWindow } from '../../../../base/browser/dom.js';

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

	// Extension tests run without a user gesture and without clipboard permissions, so
	// their reads and writes are kept in memory rather than reaching the host clipboard.
	private readonly inMemoryClipboard = new Map<ClipboardTarget, string>();

	private get useInMemoryClipboard(): boolean {
		return !!this.environmentService.extensionTestsLocationURI;
	}

	override async writeText(text: string, target: ClipboardTarget = 'system'): Promise<void> {
		this.logService.trace('BrowserClipboardService#writeText called with target:', target, ' with text.length:', text.length);
		if (this.useInMemoryClipboard) {
			// Match the base service: writing text invalidates any copied resources.
			this.clearResourcesState();
			this.inMemoryClipboard.set(target, text);
			return;
		}
		this.logService.trace('BrowserClipboardService#super.writeText');
		return super.writeText(text, target);
	}

	override async readText(target: ClipboardTarget = 'system'): Promise<string> {
		this.logService.trace('BrowserClipboardService#readText called with target:', target);
		if (this.useInMemoryClipboard) {
			return this.inMemoryClipboard.get(target) ?? '';
		}

		switch (target) {
			case 'primary':
				this.logService.trace('BrowserClipboardService#super.readText');
				return super.readText(target);
			case 'system':
				return this.readSystemClipboardWithPrompt();
			default:
				assertNever(target);
		}
	}

	private async readSystemClipboardWithPrompt(): Promise<string> {
		try {
			const readText = await getActiveWindow().navigator.clipboard.readText();
			this.logService.trace('BrowserClipboardService#readText with readText.length:', readText.length);
			return readText;
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
							resolve(await this.readSystemClipboardWithPrompt());
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
