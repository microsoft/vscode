/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A size in the editor. This interface is suitable for serialization.
 */
export interface ISize {
	/**
	 * width in pixels
	 */
	readonly width: number;
	/**
	 * height in pixels
	 */
	readonly height: number;
}

/**
 * A size in the editor.
 */
export class Size implements ISize {
	/**
	 * A Size instance with width and height equal to 0.
	 */
	public static readonly Zero = new Size(0, 0);

	/**
	 * Test if two sizes are equal.
	 */
	public static equals(a: ISize | null, b: ISize | null): boolean {
		if (!a && !b) {
			return true;
		}
		return (
			!!a &&
			!!b &&
			a.width === b.width &&
			a.height === b.height
		);
	}

	/**
	 * Test if a size is defined (neither null nor undefined).
	 */
	public static isSize(obj: any): obj is ISize {
		return obj && typeof obj.width === 'number' && typeof obj.height === 'number';
	}

	/**
	 * Create a new size by combining the properties of all sizes in args.
	 */
	public static lift(size: ISize): Size {
		if (size instanceof Size) {
			return size;
		}
		return new Size(size.width, size.height);
	}

	/**
	 * width in pixels
	 */
	public readonly width: number;

	/**
	 * height in pixels
	 */
	public readonly height: number;

	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
	}

	/**
	 * Create a new size from this size.
	 *
	 * @param newWidth new width
	 * @param newHeight new height
	 */
	public with(newWidth: number = this.width, newHeight: number = this.height): Size {
		if (newWidth === this.width && newHeight === this.height) {
			return this;
		}
		return new Size(newWidth, newHeight);
	}

	/**
	 * Create a new size with width and height scaled by the provided factor.
	 */
	public scale(factor: number): Size {
		return new Size(this.width * factor, this.height * factor);
	}

	/**
	 * Create a new size that is the sum of this size and the provided size.
	 */
	public add(other: ISize): Size {
		return new Size(this.width + other.width, this.height + other.height);
	}

	/**
	 * Create a new size that is the difference of this size and the provided size.
	 */
	public subtract(other: ISize): Size {
		return new Size(Math.max(0, this.width - other.width), Math.max(0, this.height - other.height));
	}

	/**
	 * Test if this size equals other size.
	 */
	public equals(other: ISize): boolean {
		return Size.equals(this, other);
	}

	/**
	 * Returns a string representation of this size.
	 */
	public toString(): string {
		return `(${this.width}x${this.height})`;
	}
}
