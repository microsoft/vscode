/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../../../core/range.js';
import { BaseToken } from '../../baseToken.js';
import { MarkdownExtensionsToken } from './markdownExtensionsToken.js';
import { TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';

/**
 * TODO: @legomushroom
 */
export class FrontMatterHeaderToken extends MarkdownExtensionsToken {
	constructor(
		range: Range,
		public readonly startMarker: string,
		public readonly contents: string,
		public readonly endMarker: string,
	) {
		// TODO: @legomushroom - validate text?

		super(range);
	}

	/**
	 * TODO: @legomushroom
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

		return this.text === other.text;
	}

	/**
	 * TODO: @legomushroom
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
		// TODO: @legomushroom - add an utility to truncate strings
		return `frontmatter("${this.text.slice(0, 16)}")${this.range}`;
	}
}
