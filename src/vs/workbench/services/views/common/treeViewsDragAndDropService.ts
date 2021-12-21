/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ITreeDataTransfer } from 'vs/workbench/common/views';

export const ITreeViewsDragAndDropService = createDecorator<ITreeViewsDragAndDropService<ITreeDataTransfer>>('treeViewsDragAndDropService');
export interface ITreeViewsDragAndDropService<T> {
	readonly _serviceBrand: undefined;

	removeDragOperationTransfer(uuid: string | undefined): Promise<T | undefined> | undefined;
	addDragOperationTransfer(uuid: string, transferPromise: Promise<T | undefined>): void;
}

export class TreeViewsDragAndDropService<T> implements ITreeViewsDragAndDropService<T> {
	_serviceBrand: undefined;
	private _dragOperations: Map<string, Promise<T | undefined>> = new Map();

	removeDragOperationTransfer(uuid: string | undefined): Promise<T | undefined> | undefined {
		if ((uuid && this._dragOperations.has(uuid))) {
			const operation = this._dragOperations.get(uuid);
			this._dragOperations.delete(uuid);
			return operation;
		}
		return undefined;
	}

	addDragOperationTransfer(uuid: string, transferPromise: Promise<T | undefined>): void {
		this._dragOperations.set(uuid, transferPromise);
	}
}

registerSingleton(ITreeViewsDragAndDropService, TreeViewsDragAndDropService);
