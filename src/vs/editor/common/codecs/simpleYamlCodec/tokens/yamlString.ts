/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { YamlToken } from './yamlToken.js';
import { BaseToken } from '../../baseToken.js';
import { Range } from '../../../../../editor/common/core/range.js';

/**
 * TODO: @legomushroom
 */
export class YamlString extends YamlToken {
	constructor(
		range: Range,
		private readonly tokens: readonly BaseToken[],
	) {
		// TODO: @legomushroom - validate quotes/double quotes in the tokens?
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
		return `yaml-str(${this.shortText}){this.range}`;
	}
}
