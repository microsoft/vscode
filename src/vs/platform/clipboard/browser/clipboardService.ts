/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isSafari } from 'vs/base/browser/browser';
import { $, addDisposableListener } from 'vs/base/browser/dom';
import { DeferredPromise } from 'vs/base/common/async';
import { URI } from 'vs/base/common/uri';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';

export class BrowserClipboardService implements IClipboardService {

	declare readonly _serviceBrand: undefined;

	private readonly mapTextToType = new Map<string, string>(); // unsupported in web (only in-memory)

	constructor() {
		if (isSafari) {
			this.installSafariWriteTextWorkaround();
		}
	}

	private safariPendingClipboardWritePromise: DeferredPromise<string | undefined> | undefined;

	private installSafariWriteTextWorkaround(): void {


		const handler = () => {
			console.log('HERE, getting promise READY');
			const myWritePromise = new DeferredPromise<string | undefined>();

			this.safariPendingClipboardWritePromise?.complete(undefined);
			this.safariPendingClipboardWritePromise = myWritePromise;

			navigator.clipboard.write([new ClipboardItem({
				'text/plain': (<Promise<string>>myWritePromise.p) // evil cast
			})]).catch(async err => {
				if (!(err instanceof Error) || err.name !== 'NotAllowedError' || (await myWritePromise!.p) !== undefined) {
					console.error(err);
				}
			});
		};

		// todo leaks!
		// todo use ILayoutService#body
		addDisposableListener(document.body, 'click', handler);
		addDisposableListener(document.body, 'keydown', handler);
	}

	async writeText(text: string, type?: string): Promise<void> {

		// With type: only in-memory is supported
		if (type) {
			this.mapTextToType.set(type, text);

			return;
		}

		// SAFARI
		if (this.safariPendingClipboardWritePromise) {
			console.log('HERE, resolving promise');
			this.safariPendingClipboardWritePromise.complete(text);
			return;
		}

		// Guard access to navigator.clipboard with try/catch
		// as we have seen DOMExceptions in certain browsers
		// due to security policies.
		try {
			return await navigator.clipboard.writeText(text);
		} catch (error) {
			console.error(error);
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
