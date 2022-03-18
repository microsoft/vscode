/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDataTransfer, IDataTransferItem } from 'vs/workbench/common/dnd';

interface DataTransferItemDTO {
	asString: string;
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
			newDTO.items.push({
				asString: await entry[1].asString()
			});
		}
		return newDTO;
	}
}
