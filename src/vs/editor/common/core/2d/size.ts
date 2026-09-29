/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDimension } from './dimension.js';

export class Size2D {
	static equals(a: Size2D, b: Size2D): boolean {
		return a.width === b.width && a.height === b.height;
	}

	constructor(
		public readonly width: number,
		public readonly height: number,
	) { }

	public add(other: Size2D): Size2D {
		return new Size2D(this.width + other.width, this.height + other.height);
	}

	public deltaX(delta: number): Size2D {
		return new Size2D(this.width + delta, this.height);
	}

	public deltaY(delta: number): Size2D {
		return new Size2D(this.width, this.height + delta);
	}

	public toString() {
		return `(${this.width},${this.height})`;
	}

	public subtract(other: Size2D): Size2D {
		return new Size2D(this.width - other.width, this.height - other.height);
	}

	public scale(factor: number): Size2D {
		return new Size2D(this.width * factor, this.height * factor);
	}

	public scaleWidth(factor: number): Size2D {
		return new Size2D(this.width * factor, this.height);
	}

	public mapComponents(map: (value: number) => number): Size2D {
		return new Size2D(map(this.width), map(this.height));
	}

	public isZero(): boolean {
		return this.width === 0 && this.height === 0;
	}

	public transpose(): Size2D {
		return new Size2D(this.height, this.width);
	}

	public toDimension(): IDimension {
		return { width: this.width, height: this.height };
	}
}
