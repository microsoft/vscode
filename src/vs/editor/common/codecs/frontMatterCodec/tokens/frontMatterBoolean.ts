/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Word } from '../../simpleCodec/tokens/index.js';
import { FrontMatterValueToken } from './frontMatterToken.js';
import { assertDefined } from '../../../../../base/common/types.js';

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

	constructor(
		token: Word,
	) {
		const value = asBoolean(token);
		assertDefined(
			value,
			`Cannot convert '${token}' to a boolean value.`,
		);

		super([token]);

		this.value = value;
	}


	public override toString(): string {
		return `front-matter-boolean(${this.shortText()})${this.range}`;
	}
}

/**
 * Try to convert a {@link Word} token to a `boolean` value.
 */
const asBoolean = (
	token: Word,
): boolean | null => {
	if (token.text.toLowerCase() === 'true') {
		return true;
	}

	if (token.text.toLowerCase() === 'false') {
		return false;
	}

	return null;
};
