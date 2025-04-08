/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { Dash } from '../../simpleCodec/tokens/dash.js';
import { NewLine } from '../../linesCodec/tokens/newLine.js';
import { assert } from '../../../../../base/common/assert.js';
import { CarriageReturn } from '../../linesCodec/tokens/carriageReturn.js';
import { MarkdownExtensionsToken } from '../tokens/markdownExtensionsToken.js';

/**
 * Type for tokens inside a Front Matter header marker.
 */
export type TMarkerToken = Dash | CarriageReturn | NewLine;

/**
 * Marker for the start and end of a Front Matter header.
 */
export class FrontMatterHeaderMarkerToken extends MarkdownExtensionsToken {
	/**
	 * Number of dashes in the marker.
	 */
	public readonly dashCount: number;

	/**
	 * Returns complete text representation of the token.
	 */
	public get text(): string {
		return BaseToken.render(this.tokens);
	}

	constructor(
		public readonly tokens: readonly (Dash | CarriageReturn | NewLine)[],
	) {
		const lastToken = tokens[tokens.length - 1];

		assert(
			lastToken instanceof NewLine,
			`Front Matter header must end with a new line token, got '${lastToken}'.`,
		);

		const range = BaseToken.fullRange(tokens);
		super(range);

		this.dashCount = this.tokens
			.filter((token) => { return token instanceof Dash; })
			.length;
	}

	/**
	 * Returns a string representation of the token.
	 */
	public toString(): string {
		return `frontmatter-marker(${this.dashCount}:${this.range})`;
	}
}
