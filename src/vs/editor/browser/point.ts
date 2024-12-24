/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class Point {

	static equals(a: Point, b: Point): boolean {
		return a.x === b.x && a.y === b.y;
	}

	constructor(
		public readonly x: number,
		public readonly y: number
	) { }

	public add(other: Point): Point {
		return new Point(this.x + other.x, this.y + other.y);
	}

	public deltaX(delta: number): Point {
		return new Point(this.x + delta, this.y);
	}

	public deltaY(delta: number): Point {
		return new Point(this.x, this.y + delta);
	}
}
