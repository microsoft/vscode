/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { tail2, last } from 'vs/base/common/arrays';

export interface ITreeNode<T> {
	readonly element: T;
	readonly children: ITreeNode<T>[];
}

export class Tree<T> {

	private root: ITreeNode<T> = { element: undefined, children: [] };

	splice(start: number[], deleteCount: number, nodes: ITreeNode<T>[] = []): ITreeNode<T>[] {
		if (start.length === 0) {
			throw new Error('Invalid tree location');
		}

		const [rest, index] = tail2(start);
		const parentPath = this.getNodePath(rest);
		const parent = last(parentPath);

		return parent.children.splice(index, deleteCount, ...nodes);
	}

	getElement(location: number[]): T {
		if (location.length === 0) {
			throw new Error('Invalid tree location');
		}

		const nodePath = this.getNodePath(location);
		const node = last(nodePath);

		return node.element;
	}

	getElementPath(location: number[]): T[] {
		if (location.length === 0) {
			throw new Error('Invalid tree location');
		}

		const [, ...nodePath] = this.getNodePath(location);
		return nodePath.map(node => node.element);
	}

	getNodes(): ITreeNode<T>[] {
		return this.root.children;
	}

	private getNodePath(location: number[], node: ITreeNode<T> = this.root): ITreeNode<T>[] {
		if (location.length === 0) {
			return [node];
		}

		let [index, ...rest] = location;

		if (index < 0 || index >= node.children.length) {
			throw new Error('Invalid location');
		}

		const child = node.children[index];
		return [node, ...this.getNodePath(rest, child)];
	}
}