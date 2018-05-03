/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./gridview';
import { Orientation } from 'vs/base/browser/ui/sash/sash';
import { IDisposable } from 'vs/base/common/lifecycle';
import { tail2 as tail } from 'vs/base/common/arrays';
import { orthogonal, IView, GridView, GridBranchNode } from './gridview';

export { Orientation } from './gridview';

export function getRelativeLocation(rootOrientation: Orientation, location: number[], direction: Direction): number[] {
	const orientation = location.length % 2 === 0
		? orthogonal(rootOrientation)
		: rootOrientation;

	const sameDimension = (orientation === Orientation.HORIZONTAL && (direction === Direction.Left || direction === Direction.Right))
		|| (orientation === Orientation.VERTICAL && (direction === Direction.Up || direction === Direction.Down));

	if (sameDimension) {
		let [rest, index] = tail(location);

		if (direction === Direction.Right || direction === Direction.Down) {
			index += 1;
		}

		return [...rest, index];
	} else {
		const index = (direction === Direction.Right || direction === Direction.Down) ? 1 : 0;
		return [...location, index];
	}
}

function indexInParent(element: HTMLElement): number {
	const parentElement = element.parentElement;
	let el = parentElement.firstElementChild;
	let index = 0;

	while (el !== element && el !== parentElement.lastElementChild) {
		el = el.nextElementSibling;
		index++;
	}

	return index;
}

/**
 * This will break as soon as DOM structures of the Splitview or Gridview change.
 */
function getGridLocation(element: HTMLElement): number[] {
	if (/\bmonaco-grid-view\b/.test(element.parentElement.className)) {
		return [];
	}

	const index = indexInParent(element.parentElement);
	const ancestor = element.parentElement.parentElement.parentElement.parentElement;
	return [...getGridLocation(ancestor), index];
}

export enum Direction {
	Up,
	Down,
	Left,
	Right
}

function directionOrientation(direction: Direction): Orientation {
	return direction === Direction.Up || direction === Direction.Down ? Orientation.VERTICAL : Orientation.HORIZONTAL;
}

export class Grid<T extends IView> implements IDisposable {

	private gridview: GridView;
	private views = new Map<T, HTMLElement>();

	get orientation(): Orientation { return this.gridview.orientation; }
	set orientation(orientation: Orientation) { this.gridview.orientation = orientation; }

	constructor(container: HTMLElement, view: T) {
		this.gridview = new GridView(container);
		this._addView(view, 0, [0]);
	}

	layout(width: number, height: number): void {
		this.gridview.layout(width, height);
	}

	addView(referenceView: T, direction: Direction, newView: T, size: number): void {
		if (this.views.has(newView)) {
			throw new Error('Can\'t add same view twice');
		}

		const orientation = directionOrientation(direction);

		if (this.views.size === 1 && this.orientation !== orientation) {
			this.orientation = orientation;
		}

		const referenceLocation = this.getViewLocation(referenceView);
		const location = getRelativeLocation(this.gridview.orientation, referenceLocation, direction);

		this._addView(newView, size, location);
	}

	private _addView(view: T, size: number, location: number[]): void {
		this.views.set(view, view.element);
		this.gridview.addView(view, size, location);
	}

	removeView(view: T): void {
		if (this.views.size === 1) {
			throw new Error('Can\'t remove last view');
		}

		if (!this.views.has(view)) {
			throw new Error('View not found');
		}

		const location = this.getViewLocation(view);
		this.gridview.removeView(location);
		this.views.delete(view);
	}

	swapViews(from: T, to: T): void {
		const fromLocation = this.getViewLocation(from);
		const toLocation = this.getViewLocation(to);
		return this.gridview.swapViews(fromLocation, toLocation);
	}

	resizeView(view: T, size: number): void {
		const location = this.getViewLocation(view);
		return this.gridview.resizeView(location, size);
	}

	getViewSize(view: T): number {
		const location = this.getViewLocation(view);
		return this.gridview.getViewSize(location);
	}

	getViews(): GridBranchNode {
		return this.gridview.getViews();
	}

	private getViewLocation(view: T): number[] {
		const element = this.views.get(view);

		if (!element) {
			throw new Error('View not found');
		}

		return getGridLocation(element);
	}

	dispose(): void {
		this.gridview.dispose();
	}
}
