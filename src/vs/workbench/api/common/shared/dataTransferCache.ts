/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { IDataTransfer, IDataTransferItem } from 'vs/base/common/dataTransfer';

export class DataTransferCache {

	private requestIdPool = 0;
	private readonly dataTransfers = new Map</* requestId */ number, ReadonlyArray<IDataTransferItem>>();

	public add(dataTransfer: IDataTransfer): { id: number; dispose: () => void } {
		const requestId = this.requestIdPool++;
		this.dataTransfers.set(requestId, [...dataTransfer.values()]);
		return {
			id: requestId,
			dispose: () => {
				this.dataTransfers.delete(requestId);
			}
		};
	}

	async resolveDropFileData(requestId: number, dataItemIndex: number): Promise<VSBuffer> {
		const entry = this.dataTransfers.get(requestId);
		if (!entry) {
			throw new Error('No data transfer found');
		}

		const file = entry[dataItemIndex]?.asFile();
		if (!file) {
			throw new Error('No file item found in data transfer');
		}

		return VSBuffer.wrap(await file.data());
	}

	dispose() {
		this.dataTransfers.clear();
	}
}
