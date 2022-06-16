/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createFileDataTransferItem, createStringDataTransferItem, IDataTransferItem, VSDataTransfer } from 'vs/base/common/dataTransfer';
import { URI } from 'vs/base/common/uri';
import { FileAdditionalNativeProperties } from 'vs/platform/dnd/browser/dnd';


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
