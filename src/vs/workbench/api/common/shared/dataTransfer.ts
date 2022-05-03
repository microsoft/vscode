/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IDataTransfer, IDataTransferItem } from 'vs/workbench/common/dnd';

export interface IDataTransferFileDTO {
	readonly name: string;
	readonly uri?: UriComponents;
	readonly data: VSBuffer;
}

interface DataTransferItemDTO {
	readonly asString: string;
	readonly asFile: IDataTransferFileDTO | undefined;
}

export interface DataTransferDTO {
	types: string[];
	items: DataTransferItemDTO[];
}

export namespace DataTransferConverter {
	export function toDataTransfer(value: DataTransferDTO): IDataTransfer {
		const newDataTransfer: IDataTransfer = new Map<string, IDataTransferItem>();
		value.types.forEach((type, index) => {
			newDataTransfer.set(type, {
				asString: async () => value.items[index].asString,
				asFile: () => {
					const file = value.items[index].asFile;
					if (!file) {
						return undefined;
					}
					return {
						name: file.name,
						uri: URI.revive(file.uri),
						data: async () => file.data.buffer,
					};
				},
				value: undefined
			});
		});
		return newDataTransfer;
	}

	export async function toDataTransferDTO(value: IDataTransfer): Promise<DataTransferDTO> {
		const newDTO: DataTransferDTO = {
			types: [],
			items: []
		};
		const entries = Array.from(value.entries());
		for (const entry of entries) {
			newDTO.types.push(entry[0]);
			const stringValue = await entry[1].asString();
			const fileValue = entry[1].asFile();
			newDTO.items.push({
				asString: stringValue,
				asFile: fileValue ? { ...fileValue, data: VSBuffer.wrap(await fileValue.data()) } : undefined,
			});
		}
		return newDTO;
	}
}
