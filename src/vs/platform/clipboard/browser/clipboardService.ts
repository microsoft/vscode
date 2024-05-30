/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isSafari, isWebkitWebView } from 'vs/base/browser/browser';
import { $, addDisposableListener, getActiveDocument, getActiveWindow, isHTMLElement, onDidRegisterWindow } from 'vs/base/browser/dom';
import { mainWindow } from 'vs/base/browser/window';
import { DeferredPromise } from 'vs/base/common/async';
import { Event } from 'vs/base/common/event';
import { hash } from 'vs/base/common/hash';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { ILogService } from 'vs/platform/log/common/log';

export class BrowserClipboardService extends Disposable implements IClipboardService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ILayoutService private readonly layoutService: ILayoutService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		if (isSafari || isWebkitWebView) {
			this.installWebKitWriteTextWorkaround();
		}

		// Keep track of copy operations to reset our set of
		// copied resources: since we keep resources in memory
		// and not in the clipboard, we have to invalidate
		// that state when the user copies other data.
		this._register(Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => {
			disposables.add(addDisposableListener(window.document, 'copy', () => this.clearResources()));
		}, { window: mainWindow, disposables: this._store }));
	}

	private webKitPendingClipboardWritePromise: DeferredPromise<string> | undefined;

	// In Safari, it has the following note:
	//
	// "The request to write to the clipboard must be triggered during a user gesture.
	// A call to clipboard.write or clipboard.writeText outside the scope of a user
	// gesture(such as "click" or "touch" event handlers) will result in the immediate
	// rejection of the promise returned by the API call."
	// From: https://webkit.org/blog/10855/async-clipboard-api/
	//
	// Since extensions run in a web worker, and handle gestures in an asynchronous way,
	// they are not classified by Safari as "in response to a user gesture" and will reject.
	//
	// This function sets up some handlers to work around that behavior.
	private installWebKitWriteTextWorkaround(): void {
		const handler = () => {
			const currentWritePromise = new DeferredPromise<string>();

			// Cancel the previous promise since we just created a new one in response to this new event
			if (this.webKitPendingClipboardWritePromise && !this.webKitPendingClipboardWritePromise.isSettled) {
				this.webKitPendingClipboardWritePromise.cancel();
			}
			this.webKitPendingClipboardWritePromise = currentWritePromise;

			// The ctor of ClipboardItem allows you to pass in a promise that will resolve to a string.
			// This allows us to pass in a Promise that will either be cancelled by another event or
			// resolved with the contents of the first call to this.writeText.
			// see https://developer.mozilla.org/en-US/docs/Web/API/ClipboardItem/ClipboardItem#parameters
			getActiveWindow().navigator.clipboard.write([new ClipboardItem({
				'text/plain': currentWritePromise.p,
			})]).catch(async err => {
				if (!(err instanceof Error) || err.name !== 'NotAllowedError' || !currentWritePromise.isRejected) {
					this.logService.error(err);
				}
			});
		};

		this._register(Event.runAndSubscribe(this.layoutService.onDidAddContainer, ({ container, disposables }) => {
			disposables.add(addDisposableListener(container, 'click', handler));
			disposables.add(addDisposableListener(container, 'keydown', handler));
		}, { container: this.layoutService.mainContainer, disposables: this._store }));
	}

	private readonly mapTextToType = new Map<string, string>(); // unsupported in web (only in-memory)

	async writeText(text: string, type?: string): Promise<void> {

		// Clear resources given we are writing text
		this.writeResources([]);

		// With type: only in-memory is supported
		if (type) {
			this.mapTextToType.set(type, text);

			return;
		}

		if (this.webKitPendingClipboardWritePromise) {
			// For Safari, we complete this Promise which allows the call to `navigator.clipboard.write()`
			// above to resolve and successfully copy to the clipboard. If we let this continue, Safari
			// would throw an error because this call stack doesn't appear to originate from a user gesture.
			return this.webKitPendingClipboardWritePromise.complete(text);
		}

		// Guard access to navigator.clipboard with try/catch
		// as we have seen DOMExceptions in certain browsers
		// due to security policies.
		try {
			return await getActiveWindow().navigator.clipboard.writeText(text);
		} catch (error) {
			console.error(error);
		}

		// Fallback to textarea and execCommand solution
		this.fallbackWriteText(text);
	}

	private fallbackWriteText(text: string): void {
		const activeDocument = getActiveDocument();
		const activeElement = activeDocument.activeElement;

		const textArea: HTMLTextAreaElement = activeDocument.body.appendChild($('textarea', { 'aria-hidden': true }));
		textArea.style.height = '1px';
		textArea.style.width = '1px';
		textArea.style.position = 'absolute';

		textArea.value = text;
		textArea.focus();
		textArea.select();

		activeDocument.execCommand('copy');

		if (isHTMLElement(activeElement)) {
			activeElement.focus();
		}

		activeDocument.body.removeChild(textArea);
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
			return await getActiveWindow().navigator.clipboard.readText();
		} catch (error) {
			console.error(error);
		}

		return '';
	}

	private findText = ''; // unsupported in web (only in-memory)

	async readFindText(): Promise<string> {
		return this.findText;
	}

	async writeFindText(text: string): Promise<void> {
		this.findText = text;
	}

	private resources: URI[] = []; // unsupported in web (only in-memory)
	private resourcesStateHash: number | undefined = undefined;

	private static readonly MAX_RESOURCE_STATE_SOURCE_LENGTH = 1000;

	async writeResources(resources: URI[]): Promise<void> {
		if (resources.length === 0) {
			this.clearResources();
		} else {
			this.resources = resources;
			this.resourcesStateHash = await this.computeResourcesStateHash();
		}
	}

	async readResources(): Promise<URI[]> {
		const resourcesStateHash = await this.computeResourcesStateHash();
		if (this.resourcesStateHash !== resourcesStateHash) {
			this.clearResources(); // state mismatch, resources no longer valid
		}

		return this.resources;
	}

	private async computeResourcesStateHash(): Promise<number | undefined> {
		if (this.resources.length === 0) {
			return undefined; // no resources, no hash needed
		}

		// Resources clipboard is managed in-memory only and thus
		// fails to invalidate when clipboard data is changing.
		// As such, we compute the hash of the current clipboard
		// and use that to later validate the resources clipboard.

		const clipboardText = await this.readText();
		return hash(clipboardText.substring(0, BrowserClipboardService.MAX_RESOURCE_STATE_SOURCE_LENGTH));
	}

	async hasResources(): Promise<boolean> {
		return this.resources.length > 0;
	}

	private clearResources(): void {
		this.resources = [];
		this.resourcesStateHash = undefined;
	}
}
