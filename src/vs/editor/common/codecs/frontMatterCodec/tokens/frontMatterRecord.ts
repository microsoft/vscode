/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Colon, Word, Dash, Space, Tab, VerticalTab } from '../../simpleCodec/tokens/index.js';
import { FrontMatterToken, FrontMatterValueToken, TValueTypeName } from '../tokens/frontMatterToken.js';

/**
 * Type for tokens that can be used inside a record name.
 */
export type TNameToken = Word | Dash;

/**
 * Type for tokens that can be used as "space" in-between record
 * name, delimiter and value.
 */
export type TSpaceToken = Space | Tab | VerticalTab;

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
export class FrontMatterRecordDelimiter extends FrontMatterToken<readonly [Colon, TSpaceToken]> {
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
