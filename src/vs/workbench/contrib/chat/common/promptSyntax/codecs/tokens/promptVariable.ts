/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptToken } from './promptToken.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { BaseToken } from '../../../../../../../editor/common/codecs/baseToken.js';

/**
 * All prompt variables start with `#` character.
 */
const TOKEN_START: string = '#';

/**
 * TODO: @lego
 */
const TOKEN_DATA_SEPARATOR: string = ':';

/**
 * Represents a `#variable` token in a prompt text.
 */
export class PromptVariable extends PromptToken {
	constructor(
		range: Range,
		/**
		 * The name of the variable, excluding the starting `#` character.
		 */
		public readonly name: string,
	) {
		// TODO: @lego - validate that name does not have `#` character (and no `:`?)

		super(range);
	}

	/**
	 * Get full text of the token.
	 */
	public get text(): string {
		return `${TOKEN_START}${this.name}`;
	}

	/**
	 * Check if this token is equal to another one.
	 */
	public override equals<T extends BaseToken>(other: T): boolean {
		if (!super.sameRange(other.range)) {
			return false;
		}

		if ((other instanceof PromptVariable) === false) {
			return false;
		}

		if (this.text.length !== other.text.length) {
			return false;
		}

		return this.text === other.text;
	}

	/**
	 * Return a string representation of the token.
	 */
	public override toString(): string {
		return `${this.name}${this.range}`;
	}
}

/**
 * Represents a {@link PromptVariable} with additional data token in a prompt text.
 * (e.g., `#variable:/path/to/file.md`)
 */
export class PromptVariableWithData extends PromptVariable {
	constructor(
		range: Range,
		/**
		 * The name of the variable, excluding the starting `#` character.
		 */
		name: string,
		/**
		 * The data of the variable, excluding the starting {@link TOKEN_DATA_SEPARATOR} character.
		 */
		public readonly data: string,
	) {
		super(range, name);
	}

	/**
	 * Get full text of the token.
	 */
	public override get text(): string {
		return `${TOKEN_START}${this.name}${TOKEN_DATA_SEPARATOR}${this.data}`;
	}

	/**
	 * Check if this token is equal to another one.
	 */
	public override equals<T extends BaseToken>(other: T): boolean {
		if (!super.sameRange(other.range)) {
			return false;
		}

		if ((other instanceof PromptVariableWithData) === false) {
			return false;
		}

		if (this.text.length !== other.text.length) {
			return false;
		}

		return this.text === other.text;
	}

	/**
	 * Return a string representation of the token.
	 */
	public override toString(): string {
		return `${this.text}${this.range}`;
	}
}
