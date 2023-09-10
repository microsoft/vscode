/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ITreeViewsService<U, V> {
	readonly _serviceBrand: undefined;

	getRenderedTreeElement(node: U): V | undefined;
	addRenderedTreeItemElement(node: U, element: V): void;
	removeRenderedTreeItemElement(node: U): void;
}

export class TreeviewsService<U, V> implements ITreeViewsService<U, V> {
	_serviceBrand: undefined;
	private _renderedElements: Map<U, V> = new Map();

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
