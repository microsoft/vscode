/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { clamp } from './numbers';

export interface ITreeNode<T> {
	readonly element: T;
	readonly children: ITreeNode<T>[];
}

function clone<T>(nodes: ITreeNode<T>[]): ITreeNode<T>[] {
	return nodes.map(({ element, children }) => ({ element, children: clone(children) }));
}

export class Tree<T> {

	private root: ITreeNode<T>[] = [];

	splice(start: number[], deleteCount: number, nodes: ITreeNode<T>[] = []): ITreeNode<T>[] {
		if (start.length === 0) {
			throw new Error('invalid tree location');
		}

		const children = this.findChildren(start);
		const index = start[start.length - 1];
		return children.splice(index, deleteCount, ...clone(nodes));
	}

	getElement(location: number[]): T | undefined {
		const node = this.findElement(location);
		return node && node.element;
	}

	getNodes(): ITreeNode<T>[] {
		return clone(this.root);
	}

	private findElement(location: number[]): ITreeNode<T> {
		const children = this.findChildren(location);
		const lastIndex = clamp(location[location.length - 1], 0, children.length);
		return children[lastIndex];
	}

	private findChildren(location: number[], children: ITreeNode<T>[] = this.root): ITreeNode<T>[] {
		if (location.length === 1) {
			return children;
		}

		let [i, ...rest] = location;
		i = clamp(i, 0, children.length);
		return this.findChildren(rest, children[i].children);
	}
}