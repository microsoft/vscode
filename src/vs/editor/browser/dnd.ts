/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSDataTransfer } from 'vs/base/common/dataTransfer';
import { URI } from 'vs/base/common/uri';


export function toVSDataTransfer(dataTransfer: DataTransfer) {
	const vsDataTransfer = new VSDataTransfer();
	for (const item of dataTransfer.items) {
		const type = item.type;
		if (item.kind === 'string') {
			const asStringValue = new Promise<string>(resolve => item.getAsString(resolve));
			vsDataTransfer.setString(type, asStringValue);
		} else if (item.kind === 'file') {
			const file = item.getAsFile() as null | (File & { path?: string });
			if (file) {
				const uri = file.path ? URI.parse(file.path) : undefined;
				vsDataTransfer.setFile(type, file.name, uri, async () => {
					return new Uint8Array(await file.arrayBuffer());
				});
			}
		}
	}
	return vsDataTransfer;
}
