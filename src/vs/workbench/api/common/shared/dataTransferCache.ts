/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from 'vs/base/common/arrays';
import { VSBuffer } from 'vs/base/common/buffer';
import { IDataTransferFile, IReadonlyVSDataTransfer } from 'vs/base/common/dataTransfer';

export class DataTransferFileCache {

	private requestIdPool = 0;
	private readonly dataTransferFiles = new Map</* requestId */ number, ReadonlyArray<IDataTransferFile>>();

	public add(dataTransfer: IReadonlyVSDataTransfer): { id: number; dispose: () => void } {
		const requestId = this.requestIdPool++;
		this.dataTransferFiles.set(requestId, coalesce(Array.from(dataTransfer, ([, item]) => item.asFile())));
		return {
			id: requestId,
			dispose: () => {
				this.dataTransferFiles.delete(requestId);
			}
		};
	}

	async resolveFileData(requestId: number, dataItemId: string): Promise<VSBuffer> {
		const files = this.dataTransferFiles.get(requestId);
		if (!files) {
			throw new Error('No data transfer found');
		}

		const file = files.find(file => file.id === dataItemId);
		if (!file) {
			throw new Error('No matching file found in data transfer');
		}

		return VSBuffer.wrap(await file.data());
	}

	dispose() {
		this.dataTransferFiles.clear();
	}
}
