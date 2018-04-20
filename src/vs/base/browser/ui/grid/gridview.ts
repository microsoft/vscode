/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Event, anyEvent, Emitter } from 'vs/base/common/event';
import { Orientation } from 'vs/base/browser/ui/sash/sash';
import { SplitView, IView } from 'vs/base/browser/ui/splitview/splitview';
import { empty as EmptyDisposable, IDisposable } from 'vs/base/common/lifecycle';
export { Orientation } from 'vs/base/browser/ui/sash/sash';

function orthogonal(orientation: Orientation): Orientation {
	return orientation === Orientation.VERTICAL ? Orientation.HORIZONTAL : Orientation.VERTICAL;
}

export interface IGrid {
	layout(width: number, height: number): void;
	addView(view: IView, size: number, location: number[]): void;
	removeView(location: number[]): void;
	moveView(from: number[], to: number[]): void;
	resizeView(location: number[], size: number): void;
	getViewSize(location: number[]): number;
	// getViews(): ITreeNode<T>[];
}

function tail<T>(arr: T[]): [T[], T] {
	return [arr.slice(0, arr.length - 1), arr[length - 1]];
}

abstract class Node implements IView {

	abstract minimumSize: number;
	abstract maximumSize: number;
	abstract onDidChange: Event<number>;
	abstract render(container: HTMLElement, orientation: Orientation): void;

	protected size: number | undefined;
	protected orthogonalSize: number | undefined;
	readonly orientation;

	layout(size: number): void {
		this.size = size;
	}

	orthogonalLayout(size: number): void {
		this.orthogonalSize = size;
	}
}

class BranchNode extends Node {

	readonly children: Node[] = [];
	private splitview: SplitView;

	constructor(readonly orientation: Orientation) {
		super();
	}

	get minimumSize(): number {
		let result = 0;

		for (const child of this.children) {
			if (!(child instanceof BranchNode)) {
				continue;
			}

			for (const grandchild of child.children) {
				result += grandchild.minimumSize;
			}
		}

		return result;
	}

	get maximumSize(): number {
		let result = 0;

		for (const child of this.children) {
			if (!(child instanceof BranchNode)) {
				continue;
			}

			for (const grandchild of child.children) {
				result += grandchild.maximumSize;
			}
		}

		return result;
	}

	private _onDidChange = new Emitter<number | undefined>();
	get onDidChange(): Event<number | undefined> { return this._onDidChange.event; }
	private _onDidChangeDisposable: IDisposable = EmptyDisposable;

	layout(size: number): void {
		super.layout(size);

		for (const child of this.children) {
			child.orthogonalLayout(size);
		}
	}

	orthogonalLayout(size: number): void {
		super.orthogonalLayout(size);
		this.splitview.layout(size);
	}

	render(container: HTMLElement): void {
		this.splitview = new SplitView(container, { orientation: this.orientation });
		this.layout(this.size);
		this.orthogonalLayout(this.orthogonalSize);
	}

	addChild(node: Node, size: number, index: number): void {
		this.splitview.addView(node, size, index);
		this.children.splice(index, 0, node);

		const onDidChildrenChange = anyEvent(...this.children.map(c => c.onDidChange));
		this._onDidChangeDisposable.dispose();
		this._onDidChangeDisposable = onDidChildrenChange(this._onDidChange.fire, this._onDidChange);
	}

	removeChild(index: number): void {
		// TODO
	}
}

class LeafNode extends Node {

	constructor(private view: IView, readonly orientation: Orientation) {
		super();
	}

	get minimumSize(): number { return this.view.minimumSize; }
	get maximumSize(): number { return this.view.maximumSize; }
	get onDidChange(): Event<number> { return this.view.onDidChange; }

	render(container: HTMLElement, orientation: Orientation): void {
		return this.view.render(container, orientation);
	}

	layout(size: number): void {
		super.layout(size);
		return this.view.layout(size, this.orientation);
	}
}

/**
 * Explanation:
 *
 * it appears at first that grid nodes should be treated as tree nodes, but that's not the case
 * the tree is composed of two types of nodes: branch nodes and leaf nodes!
 */

export class Grid2 {

	private root: BranchNode;

	constructor(container: HTMLElement) {
		this.root = new BranchNode(Orientation.VERTICAL);
		this.root.render(container);
	}

	addView(view: IView, size: number, location: number[]): void {
		const [rest, index] = tail(location);
		const [pathToParent, parent] = this.getNode(rest);
		const node = new LeafNode(view, orthogonal(parent.orientation));

		if (parent instanceof BranchNode) {
			parent.addChild(node, size, index);
		} else {
			const [, grandParent] = tail(pathToParent);

			// we must split!
			// 1. remove parent from grandparent
			// 2. convert parent to Branch Node
			// 3. add parent to grandparent
			// 4. add node to parent
		}
	}

	removeView(location: number[]): void {
		throw new Error('not implemneted');
	}

	layout(width: number, height: number): void {
		this.root.layout(width);
		this.root.orthogonalLayout(height);
	}

	private getNode(location: number[], path: BranchNode[] = [this.root]): [BranchNode[], Node] {
		if (location.length === 0) {
			throw new Error('Invalid location');
		}

		const parentNode = path[path.length - 1];
		const [index, ...rest] = location;
		const node = parentNode.children[index];

		if (rest.length === 0) {
			return [path, node];
		}

		if (!(node instanceof BranchNode)) {
			throw new Error('Invalid location');
		}

		path.push(node);
		return this.getNode(rest, path);
	}
}