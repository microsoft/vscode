/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from 'vs/base/common/arrays';
import { createFileDataTransferItem, createStringDataTransferItem, IDataTransferItem, VSDataTransfer } from 'vs/base/common/dataTransfer';
import { Mimes } from 'vs/base/common/mime';
import { URI } from 'vs/base/common/uri';
import { CodeDataTransfers, extractEditorsDropData, FileAdditionalNativeProperties } from 'vs/platform/dnd/browser/dnd';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';


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

export const INTERNAL_DND_MIME_TYPES = Object.freeze([
	CodeDataTransfers.EDITORS,
	CodeDataTransfers.FILES,
]);

export async function addExternalEditorsDropData(accessor: ServicesAccessor, dataTransfer: VSDataTransfer, dragEvent: DragEvent) {
	if (!dataTransfer.has(Mimes.uriList)) {
		const editorData = (await extractEditorsDropData(accessor, dragEvent))
			.filter(input => input.resource)
			.map(input => input.resource!.toString());

		if (editorData.length) {
			const str = distinct(editorData).join('\n');
			dataTransfer.replace(Mimes.uriList, createStringDataTransferItem(str));
		}
	}

	for (const interal of INTERNAL_DND_MIME_TYPES) {
		dataTransfer.delete(interal);
	}
}
