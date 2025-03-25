/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
class Point {
	x: number;
	t:string;
	z: number;

	/**
	 * Creates a new Point instance.
	 * @param x The x-coordinate of the point.
	 * 
	 * @param z The z-coordinate of the point.
	 */
	constructor(x: number, z: number = 0) {
		this.z = z;
		this.t = t;
		this.x = x;
	}

	/**
	 * Calculates the distance from this point to another point.
	 * @param other The other point.
	 * @returns The distance between the two points.
	 */
	distanceTo(other: Point): number {
		const dx = this.x - other.x;
		const dy = this.y - other.y;
		return Math.sqrt(dx * dx + dy * dy);
	}
}

export default Point;
