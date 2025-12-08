/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ITreeViewsDnDService<T> {
	readonly _serviceBrand: undefined;

	removeDragOperationTransfer(uuid: string | undefined): Promise<T | undefined> | undefined;
	addDragOperationTransfer(uuid: string, transferPromise: Promise<T | undefined>): void;
}

export class TreeViewsDnDService<T> implements ITreeViewsDnDService<T> {
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


export class DraggedTreeItemsIdentifier {

	constructor(readonly identifier: string) { }
}
