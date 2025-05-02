/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FrontMatterSequence } from './frontMatterSequence.js';
import { Colon, Word, Dash, SpacingToken } from '../../simpleCodec/tokens/index.js';
import { FrontMatterToken, FrontMatterValueToken, type TValueTypeName } from '../tokens/frontMatterToken.js';

/**
 * Type for tokens that can be used inside a record name.
 */
export type TNameToken = Word | Dash;

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
export class FrontMatterRecordName extends FrontMatterToken<readonly TNameToken[]> {
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
export class FrontMatterRecordDelimiter extends FrontMatterToken<readonly [Colon, SpacingToken]> {
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
export class FrontMatterRecord extends FrontMatterToken<readonly [FrontMatterRecordName, FrontMatterRecordDelimiter, FrontMatterValueToken<TValueTypeName>]> {
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
	 * TODO: @legomushroom
	 */
	// TODO: @legomushroom - unit test
	public trimValueEnd(): readonly SpacingToken[] {
		const { valueToken } = this;

		if ((valueToken instanceof FrontMatterSequence) === false) {
			return [];
		}

		const trimmedTokens = valueToken.trimEnd();
		const trimmedRange = BaseToken.fullRange(this.tokens);

		this.withRange(trimmedRange);

		return trimmedTokens;
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

	public override toString(): string {
		return `front-matter-record(${this.shortText()})${this.range}`;
	}
}
