/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ITreeDataTransfer } from 'vs/workbench/common/views';

export const ITreeViewsService = createDecorator<ITreeViewsService<ITreeDataTransfer>>('treeViewsService');
export interface ITreeViewsService<T> {
	readonly _serviceBrand: undefined;

	removeDragOperationTransfer(uuid: string | undefined): Promise<T | undefined> | undefined;
	addDragOperationTransfer(uuid: string, transferPromise: Promise<T | undefined>): void;

	getRenderedTreeElement(node: T): HTMLElement | undefined;
	addRenderedTreeItemElement(node: T, element: HTMLElement): void;
	removeRenderedTreeItemElement(node: T): void;
}

export class TreeviewsService<T> implements ITreeViewsService<T> {
	_serviceBrand: undefined;
	private _dragOperations: Map<string, Promise<T | undefined>> = new Map();
	private _renderedElements: Map<T, HTMLElement> = new Map();

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


	getRenderedTreeElement(node: T): HTMLElement | undefined {
		if (this._renderedElements.has(node)) {
			return this._renderedElements.get(node);
		}
		return undefined;
	}

	addRenderedTreeItemElement(node: T, element: HTMLElement): void {
		this._renderedElements.set(node, element);
	}

	removeRenderedTreeItemElement(node: T): void {
		if (this._renderedElements.has(node)) {
			this._renderedElements.delete(node);
		}
	}
}

registerSingleton(ITreeViewsService, TreeviewsService);
