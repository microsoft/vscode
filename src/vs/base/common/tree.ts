/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { tail2, last } from 'vs/base/common/arrays';
import { IIterator, map, iter, collect } from 'vs/base/common/iterator';

export interface ITreeElement<T> {
	readonly element: T;
	readonly children: IIterator<ITreeElement<T>>;
}

export interface ITreeNode<T> {
	readonly element: T;
	readonly children: ITreeNode<T>[];
}

function asNode<T>(element: ITreeElement<T>): ITreeNode<T> {
	return {
		element: element.element,
		children: collect(map(element.children, asNode))
	};
}

function asElement<T>(element: ITreeNode<T>): ITreeElement<T> {
	return {
		element: element.element,
		children: map(iter(element.children), asElement)
	};
}

export class Tree<T> {

	private root: ITreeNode<T> = { element: undefined, children: [] };

	splice(start: number[], deleteCount: number, elements: IIterator<ITreeElement<T>>): IIterator<ITreeElement<T>> {
		if (start.length === 0) {
			throw new Error('Invalid tree location');
		}

		const [rest, index] = tail2(start);
		const parentPath = this.getNodePath(rest);
		const parent = last(parentPath);
		const nodes = collect(map(elements, asNode));
		const deletedNodes = parent.children.splice(index, deleteCount, ...nodes);

		return map(iter(deletedNodes), asElement);
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

	getElementRange(location: number[], length: number): [T[], IIterator<ITreeElement<T>>] {
		if (location.length === 0) {
			throw new Error('Invalid tree location');
		}

		const [parentLocation, index] = tail2(location);
		const parentPath = this.getNodePath(parentLocation);
		const parent = last(parentPath);

		return [
			parentPath.slice(1).map(node => node.element),
			map(iter(parent.children, index, length), asElement)
		];
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