/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { assert } from '../../../../../base/common/assert.js';
import { Colon, Word, Dash, Space, Tab } from '../../simpleCodec/tokens/index.js';
import { FrontMatterToken, FrontMatterValueToken, TValueTypeName } from '../tokens/frontMatterToken.js';

/**
 * Type for tokens that can be used inside a record name.
 */
export type TNameToken = Word | Dash;

/**
 * Type for tokens that can be used as "space" in-between record
 * name, delimiter and value.
 */
export type TSpaceToken = Space | Tab;

/**
 * Token representing a `record name` inside a Front Matter record.
 *
 * E.g., `name` in the example below:
 *
 * ```
 * ---
 * name: 'value'
 * ---
 * ```
 */
export class FrontMatterRecordName extends FrontMatterToken {
	constructor(
		public readonly tokens: readonly TNameToken[],
	) {
		super(BaseToken.fullRange(tokens));
	}

	public override get text(): string {
		return BaseToken.render(this.tokens);
	}

	public override toString(): string {
		return `front-matter-record-name(${this.shortText()})${this.range}`;
	}
}

/**
 * Token representing a delimiter of a record inside a Front Matter header.
 *
 * E.g., `: ` in the example below:
 *
 * ```
 * ---
 * name: 'value'
 * ---
 * ```
 */
export class FrontMatterRecordDelimiter extends FrontMatterToken {
	constructor(
		public readonly tokens: readonly [Colon, TSpaceToken],
	) {
		super(
			BaseToken.fullRange(tokens),
		);
	}

	public override get text(): string {
		return BaseToken.render(this.tokens);
	}

	public override toString(): string {
		return `front-matter-delimiter(${this.shortText()})${this.range}`;
	}
}

/**
 * Token representing a `record` inside a Front Matter header.
 *
 * E.g., `name: 'value'` in the example below:
 *
 * ```
 * ---
 * name: 'value'
 * ---
 * ```
 */
export class FrontMatterRecord extends FrontMatterToken {
	constructor(
		private readonly tokens: readonly [FrontMatterRecordName, FrontMatterRecordDelimiter, FrontMatterValueToken<TValueTypeName>],
	) {
		super(
			BaseToken.fullRange(tokens),
		);
	}

	/**
	 * Token that represent `name` of the record.
	 *
	 * E.g., `tools` in the example below:
	 *
	 * ```
	 * ---
	 * tools: ['value']
	 * ---
	 * ```
	 */
	public get nameToken(): FrontMatterRecordName {
		return this.tokens[0];
	}

	/**
	 * Token that represent `value` of the record.
	 *
	 * E.g., `['value']` in the example below:
	 *
	 * ```
	 * ---
	 * tools: ['value']
	 * ---
	 * ```
	 */
	public get valueToken(): FrontMatterValueToken<TValueTypeName> {
		return this.tokens[2];
	}

	/**
	 * Create new instance from a list of tokens.
	 *
	 * @throws if:
	 *  - the list of tokens is not exactly 3 tokens long
	 * 	- the first token in the list is not a `FrontMatterRecordName`
	 * 	- the second token in the list is not a `FrontMatterRecordDelimiter`
	 * 	- the third token in the list is not a `FrontMatterValueToken`
	 *
	 */
	public static fromTokens(
		tokens: readonly FrontMatterToken[],
	): FrontMatterRecord {
		assert(
			tokens.length === 3,
			`A front matter record must consist of exactly 3 tokens, got '${tokens.length}'.`,
		);

		const token1 = tokens[0];
		const token2 = tokens[1];
		const token3 = tokens[2];

		assert(
			token1 instanceof FrontMatterRecordName,
			`Token #1 must be a front matter record name, got '${token1}'.`,
		);
		assert(
			token2 instanceof FrontMatterRecordDelimiter,
			`Token #2 must be a front matter record delimiter, got '${token2}'.`,
		);
		assert(
			token3 instanceof FrontMatterValueToken,
			`Token #3 must be a front matter value, got '${token3}'.`,
		);

		return new FrontMatterRecord([
			token1, token2, token3,
		]);
	}

	public override get text(): string {
		return BaseToken.render(this.tokens);
	}

	public override toString(): string {
		return `front-matter-record(${this.shortText()})${this.range}`;
	}
}
