/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from 'vs/base/browser/dom';
import Severity from 'vs/base/common/severity';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IOpenerService } from 'vs/platform/opener/common/opener';

export class BrowserClipboardService implements IClipboardService {

	constructor(
		@IDialogService private readonly dialogService: IDialogService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ILogService private readonly logService: ILogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
	) { }

	declare readonly _serviceBrand: undefined;

	private readonly mapTextToType = new Map<string, string>(); // unsupported in web (only in-memory)

	// Guard access to navigator.clipboard with try/catch
	// as we have seen DOMExceptions in certain browsers
	// due to security policies. For example, in Safari,
	// it has the following message:
	//
	// "The request to write to the clipboard must be triggered during a user gesture.
	// A call to clipboard.write or clipboard.writeText outside the scope of a user
	// gesture(such as "click" or "touch" event handlers) will result in the immediate
	// rejection of the promise returned by the API call."
	// From: https://webkit.org/blog/10855/async-clipboard-api/
	//
	// A similar limitation is there for Read. This is why this function later calls for a modal to be shown.
	protected async doClipboardAction(action: 'write', text: string): Promise<void>;
	protected async doClipboardAction(action: 'read'): Promise<string>;
	protected async doClipboardAction(action: 'write' | 'read', text?: string) {
		const isWrite = action === 'write';

		try {
			return isWrite ? await navigator.clipboard.writeText(text!) : await navigator.clipboard.readText();
		} catch (error) {
			// do not ask for input in tests (https://github.com/microsoft/vscode/issues/112264)
			if (!!this.environmentService.extensionTestsLocationURI) {
				throw error;
			}
		}

		const modalText = isWrite
			? localize('unableToWrite', "The browser interrupted the writing of text to the clipboard. Press 'Copy' to copy it anyway.")
			: localize('unableToRead', "The browser interrupted the reading of text from the clipboard. Press 'Read' to read it anyway.");
		const showResult = await this.dialogService.show(
			Severity.Warning,
			modalText,
			[
				isWrite ? localize('copy', "Copy") : localize('read', "Read"),
				localize('learnMore', "Learn More"),
				localize('cancel', "Cancel")
			],
			{
				cancelId: 2,
				detail: text
			}
		);

		switch (showResult.choice) {
			case 0:
				return isWrite ? await navigator.clipboard.writeText(text!) : await navigator.clipboard.readText();
			case 1:
				await this.openerService.open(URI.parse('https://go.microsoft.com/fwlink/?linkid=2151362'));
				return;
			default:
				return;
		}
	}

	async writeText(text: string, type?: string): Promise<void> {

		// With type: only in-memory is supported
		if (type) {
			this.mapTextToType.set(type, text);

			return;
		}

		try {
			return await this.doClipboardAction('write', text);
		} catch (error) {
			this.logService.error(error);

			// Fallback to textarea and execCommand solution

			const activeElement = document.activeElement;

			const textArea: HTMLTextAreaElement = document.body.appendChild($('textarea', { 'aria-hidden': true }));
			textArea.style.height = '1px';
			textArea.style.width = '1px';
			textArea.style.position = 'absolute';

			textArea.value = text;
			textArea.focus();
			textArea.select();

			document.execCommand('copy');

			if (activeElement instanceof HTMLElement) {
				activeElement.focus();
			}

			document.body.removeChild(textArea);

			return;
		}
	}

	async readText(type?: string): Promise<string> {

		// With type: only in-memory is supported
		if (type) {
			return this.mapTextToType.get(type) || '';
		}

		try {
			return await this.doClipboardAction('read');
		} catch (error) {
			this.logService.error(error);

			return '';
		}
	}

	private findText = ''; // unsupported in web (only in-memory)

	async readFindText(): Promise<string> {
		return this.findText;
	}

	async writeFindText(text: string): Promise<void> {
		this.findText = text;
	}

	private resources: URI[] = []; // unsupported in web (only in-memory)

	async writeResources(resources: URI[]): Promise<void> {
		this.resources = resources;
	}

	async readResources(): Promise<URI[]> {
		return this.resources;
	}

	async hasResources(): Promise<boolean> {
		return this.resources.length > 0;
	}
}

registerSingleton(IClipboardService, BrowserClipboardService, true);
