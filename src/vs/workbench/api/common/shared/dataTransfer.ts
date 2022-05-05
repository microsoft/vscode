/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { once } from 'vs/base/common/functional';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IDataTransfer, IDataTransferItem } from 'vs/editor/common/dnd';

export interface IDataTransferFileDTO {
	readonly name: string;
	readonly uri?: UriComponents;
}

interface DataTransferItemDTO {
	readonly asString: string;
	readonly fileData: IDataTransferFileDTO | undefined;
}

export interface DataTransferDTO {
	readonly types: string[];
	readonly items: DataTransferItemDTO[];
}

export namespace DataTransferConverter {
	export function toDataTransfer(value: DataTransferDTO, resolveFileData: (dataItemIndex: number) => Promise<Uint8Array>): IDataTransfer {
		const newDataTransfer: IDataTransfer = new Map<string, IDataTransferItem>();
		value.types.forEach((type, index) => {
			newDataTransfer.set(type, {
				asString: async () => value.items[index].asString,
				asFile: () => {
					const file = value.items[index].fileData;
					if (!file) {
						return undefined;
					}
					return {
						name: file.name,
						uri: URI.revive(file.uri),
						data: once(() => resolveFileData(index)),
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
				fileData: fileValue ? { name: fileValue.name, uri: fileValue.uri } : undefined,
			});
		}
		return newDTO;
	}
}
