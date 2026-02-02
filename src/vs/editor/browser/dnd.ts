/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DataTransfers } from 'vs/base/browser/dnd';
import { createFileDataTransferItem, createStringDataTransferItem, IDataTransferItem, UriList, VSDataTransfer } from 'vs/base/common/dataTransfer';
import { Mimes } from 'vs/base/common/mime';
import { URI } from 'vs/base/common/uri';
import { CodeDataTransfers, FileAdditionalNativeProperties } from 'vs/platform/dnd/browser/dnd';


export function toVSDataTransfer(dataTransfer: DataTransfer) {
	const vsDataTransfer = new VSDataTransfer();
	for (const item of dataTransfer.items) {
		const type = item.type;
		if (item.kind === 'string') {
			const asStringValue = new Promise<string>(resolve => item.getAsString(resolve));
			vsDataTransfer.append(type, createStringDataTransferItem(asStringValue));
		} else if (item.kind === 'file') {
			const file = item.getAsFile();
			if (file) {
				vsDataTransfer.append(type, createFileDataTransferItemFromFile(file));
			}
		}
	}
	return vsDataTransfer;
}

function createFileDataTransferItemFromFile(file: File): IDataTransferItem {
	const uri = (file as FileAdditionalNativeProperties).path ? URI.parse((file as FileAdditionalNativeProperties).path!) : undefined;
	return createFileDataTransferItem(file.name, uri, async () => {
		return new Uint8Array(await file.arrayBuffer());
	});
}

const INTERNAL_DND_MIME_TYPES = Object.freeze([
	CodeDataTransfers.EDITORS,
	CodeDataTransfers.FILES,
	DataTransfers.RESOURCES,
	DataTransfers.INTERNAL_URI_LIST,
]);

export function toExternalVSDataTransfer(sourceDataTransfer: DataTransfer, overwriteUriList = false): VSDataTransfer {
	const vsDataTransfer = toVSDataTransfer(sourceDataTransfer);

	// Try to expose the internal uri-list type as the standard type
	const uriList = vsDataTransfer.get(DataTransfers.INTERNAL_URI_LIST);
	if (uriList) {
		vsDataTransfer.replace(Mimes.uriList, uriList);
	} else {
		if (overwriteUriList || !vsDataTransfer.has(Mimes.uriList)) {
			// Otherwise, fallback to adding dragged resources to the uri list
			const editorData: string[] = [];
			for (const item of sourceDataTransfer.items) {
				const file = item.getAsFile();
				if (file) {
					const path = (file as FileAdditionalNativeProperties).path;
					try {
						if (path) {
							editorData.push(URI.file(path).toString());
						} else {
							editorData.push(URI.parse(file.name, true).toString());
						}
					} catch {
						// Parsing failed. Leave out from list
					}
				}
			}

			if (editorData.length) {
				vsDataTransfer.replace(Mimes.uriList, createStringDataTransferItem(UriList.create(editorData)));
			}
		}
	}

	for (const internal of INTERNAL_DND_MIME_TYPES) {
		vsDataTransfer.delete(internal);
	}

	return vsDataTransfer;
}
