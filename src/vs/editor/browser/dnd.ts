/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DataTransfers } from 'vs/base/browser/dnd';
import { distinct } from 'vs/base/common/arrays';
import { createFileDataTransferItem, createStringDataTransferItem, IDataTransferItem, VSDataTransfer } from 'vs/base/common/dataTransfer';
import { Mimes } from 'vs/base/common/mime';
import { URI } from 'vs/base/common/uri';
import { CodeDataTransfers, extractEditorsDropData, FileAdditionalNativeProperties } from 'vs/platform/dnd/browser/dnd';


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

export function createFileDataTransferItemFromFile(file: File): IDataTransferItem {
	const uri = (file as FileAdditionalNativeProperties).path ? URI.parse((file as FileAdditionalNativeProperties).path!) : undefined;
	return createFileDataTransferItem(file.name, uri, async () => {
		return new Uint8Array(await file.arrayBuffer());
	});
}

const INTERNAL_DND_MIME_TYPES = Object.freeze([
	CodeDataTransfers.EDITORS,
	CodeDataTransfers.FILES,
	DataTransfers.RESOURCES,
]);

export function addExternalEditorsDropData(dataTransfer: VSDataTransfer, dragEvent: DragEvent, overwriteUriList = false) {
	if (dragEvent.dataTransfer && (overwriteUriList || !dataTransfer.has(Mimes.uriList))) {
		const editorData = extractEditorsDropData(dragEvent)
			.filter(input => input.resource)
			.map(input => input.resource!.toString());

		// Also add in the files
		for (const item of dragEvent.dataTransfer?.items) {
			const file = item.getAsFile();
			if (file) {
				editorData.push((file as FileAdditionalNativeProperties).path ? URI.file((file as FileAdditionalNativeProperties).path!).toString() : file.name);
			}
		}

		if (editorData.length) {
			dataTransfer.replace(Mimes.uriList, createStringDataTransferItem(UriList.create(editorData)));
		}
	}

	for (const internal of INTERNAL_DND_MIME_TYPES) {
		dataTransfer.delete(internal);
	}
}

export const UriList = Object.freeze({
	// http://amundsen.com/hypermedia/urilist/
	create: (entries: ReadonlyArray<string | URI>): string => {
		return distinct(entries.map(x => x.toString())).join('\r\n');
	},
	parse: (str: string): string[] => {
		return str.split('\r\n').filter(value => !value.startsWith('#'));
	}
});
