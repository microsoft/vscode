/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../base/common/assert.js';
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

	/**
	 * TODO: @legomushroom
	 */
	public static render(tokens: readonly BaseToken[]): string {
		return tokens.map((token) => {
			return token.text;
		}).join('');
	}

	/**
	 * TODO: @legomushroom
	 * @throws
	 */
	public static fullRange(tokens: readonly BaseToken[]): Range {
		assert(
			tokens.length > 0,
			'Cannot get full range for an empty list of tokens.',
		);

		const firstToken = tokens[0];
		const lastToken = tokens[tokens.length - 1];

		// sanity checks for the full range we would construct
		assert(
			firstToken.range.startLineNumber <= lastToken.range.endLineNumber,
			'First token must start on previous or the same line as the last token.',
		);
		if (firstToken.range.startLineNumber === lastToken.range.endLineNumber) {
			assert(
				firstToken.range.startColumn <= lastToken.range.endColumn,
				'First token must start on previous or the same column as the last token.',
			);
		}

		return new Range(
			firstToken.range.startLineNumber,
			firstToken.range.startColumn,
			lastToken.range.endLineNumber,
			lastToken.range.endColumn,
		);
	}
}
