/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createFileDataTransferItem, createStringDataTransferItem, IReadonlyVSDataTransfer, VSDataTransfer } from '../../../base/common/dataTransfer.js';

const customFormatPrefix = 'web ';
const standardFormats = new Set(['text/plain', 'text/html', 'image/png']);

export function supportsClipboardData(clipboard: Clipboard | undefined, clipboardItem: typeof ClipboardItem | undefined): boolean {
	return typeof clipboard?.read === 'function'
		&& typeof clipboard.write === 'function'
		&& !!clipboardItem?.supports?.(`${customFormatPrefix}application/octet-stream`);
}

export async function readClipboardData(clipboard: Clipboard): Promise<VSDataTransfer> {
	const data = new VSDataTransfer();
	for (const item of await clipboard.read()) {
		for (const format of item.types) {
			const blob = await item.getType(format);
			const isCustomFormat = format.startsWith(customFormatPrefix);
			const mime = isCustomFormat ? format.substring(customFormatPrefix.length) : format;
			if (isCustomFormat || mime.startsWith('text/')) {
				data.append(mime, createStringDataTransferItem(await blob.text()));
			} else {
				const name = blob instanceof File ? blob.name : `image.${mime.substring(mime.indexOf('/') + 1)}`;
				data.append(mime, createFileDataTransferItem(name, undefined, async () => new Uint8Array(await blob.arrayBuffer())));
			}
		}
	}
	return data;
}

export function writeClipboardData(clipboard: Clipboard, data: IReadonlyVSDataTransfer, clipboardItem: typeof ClipboardItem = ClipboardItem): Promise<void> {
	const items: Record<string, Promise<Blob>> = {};
	for (const [mime, item] of data) {
		const format = standardFormats.has(mime) ? mime : `${customFormatPrefix}${mime}`;
		const file = item.asFile();
		items[format] = file
			? file.data().then(bytes => new Blob([new Uint8Array(bytes)], { type: mime }))
			: Promise.resolve(item.asString()).then(text => new Blob([text], { type: mime }));
	}
	// Start the write before awaiting the data to retain the initiating user gesture.
	return clipboard.write(Object.keys(items).length ? [new clipboardItem(items)] : []);
}
