/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isSafari } from 'vs/base/browser/browser';
import { $ } from 'vs/base/browser/dom';
import Severity from 'vs/base/common/severity';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';

export class BrowserClipboardService implements IClipboardService {

	constructor(@IDialogService private readonly dialogService: IDialogService) { }

	declare readonly _serviceBrand: undefined;

	private readonly mapTextToType = new Map<string, string>(); // unsupported in web (only in-memory)

	async writeText(text: string, type?: string): Promise<void> {

		// With type: only in-memory is supported
		if (type) {
			this.mapTextToType.set(type, text);

			return;
		}

		// Guard access to navigator.clipboard with try/catch
		// as we have seen DOMExceptions in certain browsers
		// due to security policies.
		try {
			return await navigator.clipboard.writeText(text);
		} catch (error) {
			if (!isSafari) {
				console.error(error);
			} else {
				const showResult = await this.dialogService.show(
					Severity.Warning,
					localize('unableToCopy', "The browser interrupted the copying of text to the clipboard. Press 'Copy' to copy it anyway."),
					[
						localize('copy', "Copy"),
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
						try {
							return await navigator.clipboard.writeText(text);
						} catch (error) {
							console.error(error);
						}
						break;

					case 1:
						// await this.openerService.open(URI.parse('https://aka.ms/allow-vscode-popup'));
						break;

					default:
						break;
				}
			}

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

		// Guard access to navigator.clipboard with try/catch
		// as we have seen DOMExceptions in certain browsers
		// due to security policies.
		try {
			return await navigator.clipboard.readText();
		} catch (error) {
			console.error(error);

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
