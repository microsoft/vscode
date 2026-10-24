/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createFileDataTransferItem, createStringDataTransferItem, IReadonlyVSDataTransfer, VSDataTransfer } from '../common/dataTransfer.js';
import { getActiveWindow } from './dom.js';

/**
 * The Async Clipboard API requires "web " on custom-format keys, even when VS Code both writes and reads the data.
 * Chromium enforces this in browsers and Electron renderers; unprefixed custom keys can cause the write to be rejected.
 * @see https://developer.chrome.com/blog/web-custom-formats-for-the-async-clipboard-api/#writing-web-custom-formats-to-the-clipboard
 */
const customFormatPrefix = 'web ';
const standardFormats = new Set(['text/plain', 'text/html', 'image/png']);

/**
 * Requires both rich read/write APIs, not just text-only support; this does not check permissions.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Clipboard#instance_methods
 */
export function supportsClipboardData(): boolean {
	const clipboard = getActiveWindow().navigator.clipboard;
	return clipboard !== undefined
		&& typeof clipboard.read === 'function'
		&& typeof clipboard.write === 'function';
}

/**
 * Reads each item's MIME representations, normalizing custom keys and exposing binary data as lazy file items.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/read#description
 */
export async function readClipboardData(): Promise<VSDataTransfer> {
	const clipboard = getActiveWindow().navigator.clipboard;
	const data = new VSDataTransfer();
	for (const item of await clipboard.read()) {
		for (const format of item.types) {
			const blob = await item.getType(format);
			const isCustomFormat = format.startsWith(customFormatPrefix);
			const mime = isCustomFormat ? format.substring(customFormatPrefix.length) : format;
			if (isCustomFormat || mime.startsWith('text/')) {
				data.append(mime, createStringDataTransferItem(await blob.text()));
			} else {
				// Plain blobs have no filename; derive one from the MIME type (e.g. image.png) so paste providers can save images.
				const name = blob instanceof File ? blob.name : `image.${mime.substring(mime.indexOf('/') + 1)}`;
				data.append(mime, createFileDataTransferItem(name, undefined, async () => new Uint8Array(await blob.arrayBuffer())));
			}
		}
	}
	return data;
}

/**
 * Writes MIME representations together as one item, using standard keys or prefixed custom keys.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/ClipboardItem/ClipboardItem
 * @see https://webkit.org/blog/10855/async-clipboard-api/
 */
export function writeClipboardData(data: IReadonlyVSDataTransfer): Promise<void> {
	const clipboard = getActiveWindow().navigator.clipboard;
	const items: Record<string, Promise<Blob>> = {};
	for (const [mime, item] of data) {
		// These mandatory formats need no custom prefix; all other formats use the web custom-format mechanism.
		const format = standardFormats.has(mime) ? mime : `${customFormatPrefix}${mime}`;
		const file = item.asFile();
		items[format] = file
			? file.data().then(bytes => new Blob([new Uint8Array(bytes)], { type: mime }))
			: Promise.resolve(item.asString()).then(text => new Blob([text], { type: mime }));
	}
	return clipboard.write(Object.keys(items).length ? [new ClipboardItem(items)] : []);
}
