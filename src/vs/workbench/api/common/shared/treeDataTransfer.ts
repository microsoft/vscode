/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITreeDataTransfer, ITreeDataTransferItem } from 'vs/workbench/common/views';

interface TreeDataTransferItemDTO {
	asString: string;
}

export interface TreeDataTransferDTO {
	types: string[];
	items: TreeDataTransferItemDTO[];
}

export namespace TreeDataTransferConverter {
	export function toITreeDataTransfer(value: TreeDataTransferDTO): ITreeDataTransfer {
		const newDataTransfer: ITreeDataTransfer = new Map<string, ITreeDataTransferItem>();
		value.types.forEach((type, index) => {
			newDataTransfer.set(type, {
				asString: async () => value.items[index].asString
			});
		});
		return newDataTransfer;
	}

	export async function toTreeDataTransferDTO(value: ITreeDataTransfer): Promise<TreeDataTransferDTO> {
		const newDTO: TreeDataTransferDTO = {
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
