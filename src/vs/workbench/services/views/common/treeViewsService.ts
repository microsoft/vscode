/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ITreeViewsService<V> {
	readonly _serviceBrand: undefined;

	getRenderedTreeElement(node: string): V | undefined;
	addRenderedTreeItemElement(node: string, element: V): void;
	removeRenderedTreeItemElement(node: string): void;
}

export class TreeviewsService<V> implements ITreeViewsService<V> {
	_serviceBrand: undefined;
	private _renderedElements: Map<string, V> = new Map();

	getRenderedTreeElement(node: string): V | undefined {
		if (this._renderedElements.has(node)) {
			return this._renderedElements.get(node);
		}
		return undefined;
	}

	addRenderedTreeItemElement(node: string, element: V): void {
		this._renderedElements.set(node, element);
	}

	removeRenderedTreeItemElement(node: string): void {
		if (this._renderedElements.has(node)) {
			this._renderedElements.delete(node);
		}
	}
}
