/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRange, Range } from '../../../editor/common/core/range.js';

/**
 * Base class for all tokens with a `range` that
 * reflects token position in the original data.
 */
export abstract class BaseToken {
	constructor(
		private _range: Range,
	) { }

	public get range(): Range {
		return this._range;
	}

	/**
	 * Return text representation of the token.
	 */
	public abstract get text(): string;

	/**
	 * Check if this token has the same range as another one.
	 */
	public sameRange(other: Range): boolean {
		return this.range.equalsRange(other);
	}

	/**
	 * Returns a string representation of the token.
	 */
	public abstract toString(): string;

	/**
	 * Check if this token is equal to another one.
	 */
	public equals<T extends BaseToken>(other: T): boolean {
		if (!(other instanceof this.constructor)) {
			return false;
		}

		return this.sameRange(other.range);
	}

	/**
	 * Change `range` of the token with provided range components.
	 */
	public withRange(components: Partial<IRange>): this {
		this._range = new Range(
			components.startLineNumber ?? this.range.startLineNumber,
			components.startColumn ?? this.range.startColumn,
			components.endLineNumber ?? this.range.endLineNumber,
			components.endColumn ?? this.range.endColumn,
		);

		return this;
	}
}
