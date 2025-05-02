/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../../../core/range.js';
import { BaseToken, Text } from '../../baseToken.js';
import { MarkdownExtensionsToken } from './markdownExtensionsToken.js';
import { TSimpleDecoderToken } from '../../simpleCodec/simpleDecoder.js';
import { FrontMatterMarker, TMarkerToken } from './frontMatterMarker.js';

/**
 * Token that represents a `Front Matter` header in a text.
 */
export class FrontMatterHeader extends MarkdownExtensionsToken {
	constructor(
		range: Range,
		public readonly startMarker: FrontMatterMarker,
		public readonly content: Text,
		public readonly endMarker: FrontMatterMarker,
	) {
		super(range);
	}

	/**
	 * Return complete text representation of the token.
	 */
	public get text(): string {
		const text: string[] = [
			this.startMarker.text,
			this.content.text,
			this.endMarker.text,
		];

		return text.join('');
	}

	/**
	 * Range of the content of the Front Matter header.
	 */
	public get contentRange(): Range {
		return this.content.range;
	}

	/**
	 * Content token of the Front Matter header.
	 */
	public get contentToken(): Text {
		return this.content;
	}

	/**
	 * Create new instance of the token from the given tokens.
	 */
	public static fromTokens(
		startMarkerTokens: readonly TMarkerToken[],
		contentTokens: readonly TSimpleDecoderToken[],
		endMarkerTokens: readonly TMarkerToken[],
	): FrontMatterHeader {
		const range = BaseToken.fullRange(
			[...startMarkerTokens, ...endMarkerTokens],
		);

		return new FrontMatterHeader(
			range,
			FrontMatterMarker.fromTokens(startMarkerTokens),
			Text.fromTokens(contentTokens),
			FrontMatterMarker.fromTokens(endMarkerTokens),
		);
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `frontmatter("${this.shortText()}")${this.range}`;
	}
}
