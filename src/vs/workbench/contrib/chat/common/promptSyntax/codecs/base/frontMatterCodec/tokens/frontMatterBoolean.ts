/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { Word } from '../../simpleCodec/tokens/tokens.js';
import { FrontMatterValueToken } from './frontMatterToken.js';
import { assertDefined } from '../../../../../../../../../base/common/types.js';

/**
 * Token that represents a `boolean` value in a Front Matter header.
 */
export class FrontMatterBoolean extends FrontMatterValueToken<'boolean', readonly [Word]> {
	/**
	 * Name of the `boolean` value type.
	 */
	public override readonly valueTypeName = 'boolean';

	/**
	 * Value of the `boolean` token.
	 */
	public readonly value: boolean;

	/**
	 * @throws if provided {@link Word} cannot be converted to a `boolean` value.
	 */
	constructor(token: Word) {
		const value = asBoolean(token);
		assertDefined(
			value,
			`Cannot convert '${token}' to a boolean value.`,
		);

		super([token]);

		this.value = value;
	}

	/**
	 * Try creating a {@link FrontMatterBoolean} out of provided token.
	 * Unlike the constructor, this method does not throw, returning
	 * a 'null' value on failure instead.
	 */
	public static tryFromToken(
		token: BaseToken,
	): FrontMatterBoolean | null {
		if (token instanceof Word === false) {
			return null;
		}

		try {
			return new FrontMatterBoolean(token);
		} catch (_error) {
			// noop
			return null;
		}
	}

	public override equals(other: BaseToken): other is typeof this {
		if (super.equals(other) === false) {
			return false;
		}

		return this.value === other.value;
	}

	public override toString(): string {
		return `front-matter-boolean(${this.shortText()})${this.range}`;
	}
}

/**
 * Try to convert a {@link Word} token to a `boolean` value.
 */
export function asBoolean(
	token: Word,
): boolean | null {
	if (token.text.toLowerCase() === 'true') {
		return true;
	}

	if (token.text.toLowerCase() === 'false') {
		return false;
	}

	return null;
}
