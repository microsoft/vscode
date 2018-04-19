/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Event, anyEvent } from 'vs/base/common/event';
import { Orientation } from 'vs/base/browser/ui/sash/sash';
import { append, $ } from 'vs/base/browser/dom';
import { SplitView, IView } from 'vs/base/browser/ui/splitview/splitview';
export { Orientation } from 'vs/base/browser/ui/sash/sash';

export class GridNode implements IView {

	get minimumSize(): number {
		let result = 0;

		for (const child of this.children) {
			for (const grandchild of child.children) {
				result += grandchild.minimumSize;
			}
		}

		return result === 0 ? 50 : result;
	}

	readonly maximumSize = Number.MAX_VALUE;

	private _onDidChange: Event<number | undefined> = Event.None;
	get onDidChange(): Event<number | undefined> {
		return this._onDidChange;
	}

	protected orientation: Orientation | undefined;
	protected size: number | undefined;
	protected orthogonalSize: number | undefined;
	private splitview: SplitView | undefined;
	private children: GridNode[] = [];
	private color: string | undefined;

	constructor(private parent?: GridNode, orthogonalSize?: number, color?: string) {
		this.orthogonalSize = orthogonalSize;
		this.color = color || `hsl(${Math.round(Math.random() * 360)}, 72%, 72%)`;
	}

	render(container: HTMLElement): void {
		container = append(container, $('.node'));
		container.style.backgroundColor = this.color;

		append(container, $('.action', { onclick: () => this.split(container, Orientation.HORIZONTAL) }, '⬌'));
		append(container, $('.action', { onclick: () => this.split(container, Orientation.VERTICAL) }, '⬍'));
	}

	protected split(container: HTMLElement, orientation: Orientation): void {
		if (this.parent && this.parent.orientation === orientation) {
			const index = this.parent.children.indexOf(this);
			this.parent.addChild(this.size / 2, this.orthogonalSize, index + 1);
		} else {
			this.branch(container, orientation);
		}
	}

	protected branch(container: HTMLElement, orientation: Orientation): void {
		this.orientation = orientation;
		container.innerHTML = '';

		this.splitview = new SplitView(container, { orientation });
		this.layout(this.size);
		this.orthogonalLayout(this.orthogonalSize);

		this.addChild(this.orthogonalSize / 2, this.size, 0, this.color);
		this.addChild(this.orthogonalSize / 2, this.size);
	}

	layout(size: number): void {
		this.size = size;

		for (const child of this.children) {
			child.orthogonalLayout(size);
		}
	}

	orthogonalLayout(size: number): void {
		this.orthogonalSize = size;

		if (this.splitview) {
			this.splitview.layout(size);
		}
	}

	private addChild(size: number, orthogonalSize: number, index?: number, color?: string): void {
		const child = new GridNode(this, orthogonalSize, color);
		this.splitview.addView(child, size, index);

		if (typeof index === 'number') {
			this.children.splice(index, 0, child);
		} else {
			this.children.push(child);
		}

		this._onDidChange = anyEvent(...this.children.map(c => c.onDidChange));
	}
}

export class RootGridNode extends GridNode {

	private width: number;
	private height: number;

	protected branch(container: HTMLElement, orientation: Orientation): void {
		if (orientation === Orientation.VERTICAL) {
			this.size = this.width;
			this.orthogonalSize = this.height;
		} else {
			this.size = this.height;
			this.orthogonalSize = this.width;
		}

		super.branch(container, orientation);
	}

	layoutBox(width: number, height: number): void {
		if (this.orientation === Orientation.VERTICAL) {
			this.layout(width);
			this.orthogonalLayout(height);
		} else if (this.orientation === Orientation.HORIZONTAL) {
			this.layout(height);
			this.orthogonalLayout(width);
		} else {
			this.width = width;
			this.height = height;
		}
	}
}

export class Grid {

	private root: RootGridNode;

	constructor(container: HTMLElement) {
		this.root = new RootGridNode();
		this.root.render(container);
	}

	layout(width: number, height: number): void {
		this.root.layoutBox(width, height);
	}
}
