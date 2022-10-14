/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ITreeViewsService<T, U, V> {
	readonly _serviceBrand: undefined;

	removeDragOperationTransfer(uuid: string | undefined): Promise<T | undefined> | undefined;
	addDragOperationTransfer(uuid: string, transferPromise: Promise<T | undefined>): void;

	getRenderedTreeElement(node: U): V | undefined;
	addRenderedTreeItemElement(node: U, element: V): void;
	removeRenderedTreeItemElement(node: U): void;
}

export class TreeviewsService<T, U, V> implements ITreeViewsService<T, U, V> {
	_serviceBrand: undefined;
	private _dragOperations: Map<string, Promise<T | undefined>> = new Map();
	private _renderedElements: Map<U, V> = new Map();

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


	getRenderedTreeElement(node: U): V | undefined {
		if (this._renderedElements.has(node)) {
			return this._renderedElements.get(node);
		}
		return undefined;
	}

	addRenderedTreeItemElement(node: U, element: V): void {
		this._renderedElements.set(node, element);
	}

	removeRenderedTreeItemElement(node: U): void {
		if (this._renderedElements.has(node)) {
			this._renderedElements.delete(node);
		}
	}
}
