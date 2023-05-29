/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class Array2D<T> {
	private readonly array: T[] = [];

	constructor(public readonly width: number, public readonly height: number) {
		this.array = new Array<T>(width * height);
	}

	get(x: number, y: number): T {
		return this.array[x + y * this.width];
	}

	set(x: number, y: number, value: T): void {
		this.array[x + y * this.width] = value;
	}
}
