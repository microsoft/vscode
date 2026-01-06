/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../../../../../../../../../editor/common/core/range.js';
import { BaseToken } from '../../baseToken.js';
import { Dash } from '../../simpleCodec/tokens/dash.js';
import { NewLine } from '../../linesCodec/tokens/newLine.js';
import { MarkdownExtensionsToken } from './markdownExtensionsToken.js';
import { CarriageReturn } from '../../linesCodec/tokens/carriageReturn.js';

/**
 * Type for tokens inside a Front Matter header marker.
 */
export type TMarkerToken = Dash | CarriageReturn | NewLine;

/**
 * Marker for the start and end of a Front Matter header.
 */
export class FrontMatterMarker extends MarkdownExtensionsToken {
	/**
	 * Returns complete text representation of the token.
	 */
	public get text(): string {
		return BaseToken.render(this.tokens);
	}

	/**
	 * List of {@link Dash} tokens in the marker.
	 */
	public get dashTokens(): readonly Dash[] {
		return this.tokens
			.filter((token) => { return token instanceof Dash; });
	}

	constructor(
		range: Range,
		public readonly tokens: readonly TMarkerToken[],
	) {
		super(range);
	}

	/**
	 * Create new instance of the token from a provided
	 * list of tokens.
	 */
	public static fromTokens(
		tokens: readonly TMarkerToken[],
	): FrontMatterMarker {
		const range = BaseToken.fullRange(tokens);

		return new FrontMatterMarker(range, tokens);
	}

	public toString(): string {
		return `frontmatter-marker(${this.dashTokens.length}:${this.range})`;
	}
}
