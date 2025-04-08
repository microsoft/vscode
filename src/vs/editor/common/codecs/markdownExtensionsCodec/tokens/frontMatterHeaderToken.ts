/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../../../core/range.js';
import { BaseToken } from '../../baseToken.js';
import { NewLine } from '../../linesCodec/tokens/newLine.js';
import { assert } from '../../../../../base/common/assert.js';
import { MarkdownExtensionsToken } from './markdownExtensionsToken.js';
import { TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';

/**
 * Token that represents a `Front Matter` header in a text.
 */
export class FrontMatterHeaderToken extends MarkdownExtensionsToken {
	constructor(
		range: Range,
		public readonly startMarker: string,
		public readonly contents: string,
		public readonly endMarker: string,
	) {
		// sanity check of the `start marker` string
		assert(
			startMarker.length > 0,
			'Front Matter header start marker must not be empty.',
		);
		assert(
			startMarker.endsWith(NewLine.symbol),
			'Front Matter header start marker must end with a new line.',
		);

		// sanity check of the `end marker` string
		assert(
			endMarker.length > 0,
			'Front Matter header end marker must not be empty.',
		);
		assert(
			endMarker.endsWith(NewLine.symbol),
			'Front Matter header end marker must end with a new line.',
		);

		super(range);
	}

	/**
	 * Return complete text representation of the token.
	 */
	public get text(): string {
		return [
			this.startMarker,
			this.contents,
			this.endMarker,
		].join('');
	}

	/**
	 * Check if this token is equal to another one.
	 */
	public override equals<T extends BaseToken>(other: T): boolean {
		if (!super.sameRange(other.range)) {
			return false;
		}

		if (!(other instanceof FrontMatterHeaderToken)) {
			return false;
		}

		if (this.text.length !== other.text.length) {
			return false;
		}

		return (this.text === other.text);
	}

	/**
	 * Create new instance of the token from the given tokens.
	 */
	public static fromTokens(
		startMarkerTokens: readonly TSimpleDecoderToken[],
		contentTokens: readonly TSimpleDecoderToken[],
		endMarkerTokens: readonly TSimpleDecoderToken[],
	): FrontMatterHeaderToken {
		return new FrontMatterHeaderToken(
			BaseToken.fullRange([...startMarkerTokens, ...endMarkerTokens]),
			BaseToken.render(startMarkerTokens),
			BaseToken.render(contentTokens),
			BaseToken.render(endMarkerTokens),
		);
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `frontmatter("${this.shortText()}")${this.range}`;
	}
}
