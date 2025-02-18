/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from '../../base/common/errors.js';
import { OffsetRange } from '../common/core/offsetRange.js';
import { Point } from './point.js';

export class Rect {
	public static fromPoint(point: Point): Rect {
		return new Rect(point.x, point.y, point.x, point.y);
	}

	public static fromPoints(topLeft: Point, bottomRight: Point): Rect {
		return new Rect(topLeft.x, topLeft.y, bottomRight.x, bottomRight.y);
	}

	public static fromPointSize(point: Point, size: Point): Rect {
		return new Rect(point.x, point.y, point.x + size.x, point.y + size.y);
	}

	public static fromLeftTopRightBottom(left: number, top: number, right: number, bottom: number): Rect {
		return new Rect(left, top, right, bottom);
	}

	public static fromLeftTopWidthHeight(left: number, top: number, width: number, height: number): Rect {
		return new Rect(left, top, left + width, top + height);
	}

	public static fromRanges(leftRight: OffsetRange, topBottom: OffsetRange): Rect {
		return new Rect(leftRight.start, topBottom.start, leftRight.endExclusive, topBottom.endExclusive);
	}

	public static hull(rects: Rect[]): Rect {
		let left = Number.MAX_SAFE_INTEGER;
		let top = Number.MAX_SAFE_INTEGER;
		let right = Number.MIN_SAFE_INTEGER;
		let bottom = Number.MIN_SAFE_INTEGER;

		for (const rect of rects) {
			left = Math.min(left, rect.left);
			top = Math.min(top, rect.top);
			right = Math.max(right, rect.right);
			bottom = Math.max(bottom, rect.bottom);
		}

		return new Rect(left, top, right, bottom);
	}

	public get width() { return this.right - this.left; }
	public get height() { return this.bottom - this.top; }

	constructor(
		public readonly left: number,
		public readonly top: number,
		public readonly right: number,
		public readonly bottom: number,
	) {
		if (left > right || top > bottom) {
			throw new BugIndicatingError('Invalid arguments');
		}
	}

	withMargin(margin: number): Rect {
		return new Rect(this.left - margin, this.top - margin, this.right + margin, this.bottom + margin);
	}

	intersectVertical(range: OffsetRange): Rect {
		return new Rect(
			this.left,
			Math.max(this.top, range.start),
			this.right,
			Math.min(this.bottom, range.endExclusive),
		);
	}

	toString(): string {
		return `Rect{(${this.left},${this.top}), (${this.right},${this.bottom})}`;
	}

	intersect(parent: Rect): Rect | undefined {
		const left = Math.max(this.left, parent.left);
		const right = Math.min(this.right, parent.right);
		const top = Math.max(this.top, parent.top);
		const bottom = Math.min(this.bottom, parent.bottom);

		if (left > right || top > bottom) {
			return undefined;
		}

		return new Rect(left, top, right, bottom);
	}

	union(other: Rect): Rect {
		return new Rect(
			Math.min(this.left, other.left),
			Math.min(this.top, other.top),
			Math.max(this.right, other.right),
			Math.max(this.bottom, other.bottom),
		);
	}

	containsRect(other: Rect): boolean {
		return this.left <= other.left
			&& this.top <= other.top
			&& this.right >= other.right
			&& this.bottom >= other.bottom;
	}

	moveToBeContainedIn(parent: Rect): Rect {
		const width = this.width;
		const height = this.height;

		let left = this.left;
		let top = this.top;

		if (left < parent.left) {
			left = parent.left;
		} else if (left + width > parent.right) {
			left = parent.right - width;
		}

		if (top < parent.top) {
			top = parent.top;
		} else if (top + height > parent.bottom) {
			top = parent.bottom - height;
		}

		return new Rect(left, top, left + width, top + height);
	}

	withWidth(width: number): Rect {
		return new Rect(this.left, this.top, this.left + width, this.bottom);
	}

	withHeight(height: number): Rect {
		return new Rect(this.left, this.top, this.right, this.top + height);
	}

	withTop(top: number): Rect {
		return new Rect(this.left, top, this.right, this.bottom);
	}

	translateX(delta: number): Rect {
		return new Rect(this.left + delta, this.top, this.right + delta, this.bottom);
	}

	translateY(delta: number): Rect {
		return new Rect(this.left, this.top + delta, this.right, this.bottom + delta);
	}

	deltaRight(delta: number): Rect {
		return new Rect(this.left, this.top, this.right + delta, this.bottom);
	}

	deltaTop(delta: number): Rect {
		return new Rect(this.left, this.top + delta, this.right, this.bottom);
	}

	deltaLeft(delta: number): Rect {
		return new Rect(this.left + delta, this.top, this.right, this.bottom);
	}

	deltaBottom(delta: number): Rect {
		return new Rect(this.left, this.top, this.right, this.bottom + delta);
	}

	getLeftBottom(): Point {
		return new Point(this.left, this.bottom);
	}

	getRightBottom(): Point {
		return new Point(this.right, this.bottom);
	}

	getLeftTop(): Point {
		return new Point(this.left, this.top);
	}

	getRightTop(): Point {
		return new Point(this.right, this.top);
	}
}
