/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { Range } from '../../../core/range.js';
import { MarkdownToken } from './markdownToken.js';
import { assert } from '../../../../../base/common/assert.js';

/**
 * A token that represent a `markdown comment` with a `range`. The `range`
 * value reflects the position of the token in the original data.
 */
export class MarkdownComment extends MarkdownToken {
	constructor(
		range: Range,
		public readonly text: string,
	) {
		assert(
			text.startsWith('<!--'),
			`The comment must start with '<!--', got '${text.substring(0, 10)}'.`,
		);

		super(range);
	}

	/**
	 * Whether the comment has an end comment marker `-->`.
	 */
	public get hasEndMarker(): boolean {
		return this.text.endsWith('-->');
	}

	/**
	 * Check if this token is equal to another one.
	 */
	public override equals<T extends BaseToken>(other: T): boolean {
		if (!super.sameRange(other.range)) {
			return false;
		}

		if (!(other instanceof MarkdownComment)) {
			return false;
		}

		return this.text === other.text;
	}

	/**
	 * Returns a string representation of the token.
	 */
	public override toString(): string {
		return `md-comment("${this.shortText()}")${this.range}`;
	}
}
