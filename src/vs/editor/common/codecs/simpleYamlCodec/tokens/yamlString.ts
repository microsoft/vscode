/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { YamlToken } from './yamlToken.js';
import { BaseToken } from '../../baseToken.js';
import { assert } from '../../../../../base/common/assert.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { DoubleQuote, Quote } from '../../simpleCodec/tokens/index.js';

/**
 * TODO: @legomushroom
 */
export class YamlString extends YamlToken {
	constructor(
		range: Range,
		private readonly tokens: readonly BaseToken[],
	) {
		const firstToken = tokens[0];
		const lastToken = tokens[tokens.length - 1];

		// sanity checks - if the string starts with a quote,
		// it must also end with the same quote to be valid
		if (firstToken instanceof Quote) {
			assert(
				lastToken instanceof Quote,
				`Expected last token to be a Quote, got '${lastToken}'.`,
			);
		}
		if (firstToken instanceof DoubleQuote) {
			assert(
				lastToken instanceof DoubleQuote,
				`Expected last token to be a DoubleQuote, got '${lastToken}'.`,
			);
		}

		super(range);
	}

	/**
	 * Create new instance out of provided list of tokens.
	 */
	public static fromTokens(tokens: readonly BaseToken[]): YamlString {
		return new YamlString(
			BaseToken.fullRange(tokens),
			tokens,
		);
	}

	/**
	 * Text representation of the token.
	 */
	public override get text(): string {
		// TODO: @legomushroom - ignore quotes/double quotes in the tokens?
		return BaseToken.render(this.tokens);
	}

	/**
	 * String representation of the token.
	 */
	public override toString(): string {
		return `yaml-str(${this.shortText()}){this.range}`;
	}
}
