/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from 'vs/base/common/uuid';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ITreeDataTransfer } from 'vs/workbench/common/views';

export const ITreeViewsDragAndDropService = createDecorator<ITreeViewsDragAndDropService>('treeViewsDragAndDropService');
export interface ITreeViewsDragAndDropService {
	readonly _serviceBrand: undefined;

	removeDragOperationTransfer(uuid: string | undefined): Promise<ITreeDataTransfer | undefined> | undefined;
	addDragOperationTransfer(transferPromise: Promise<ITreeDataTransfer | undefined>): string;
}

export class TreeViewsDragAndDropService implements ITreeViewsDragAndDropService {
	_serviceBrand: undefined;
	private _dragOperations: Map<string, Promise<ITreeDataTransfer | undefined>> = new Map();

	removeDragOperationTransfer(uuid: string | undefined): Promise<ITreeDataTransfer | undefined> | undefined {
		if ((uuid && this._dragOperations.has(uuid))) {
			const operation = this._dragOperations.get(uuid);
			this._dragOperations.delete(uuid);
			return operation;
		}
		return undefined;
	}

	addDragOperationTransfer(transferPromise: Promise<ITreeDataTransfer | undefined>): string {
		const uuid = generateUuid();
		this._dragOperations.set(uuid, transferPromise);
		return uuid;
	}
}

registerSingleton(ITreeViewsDragAndDropService, TreeViewsDragAndDropService);
