/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptToken } from './promptToken.js';
import { assert } from '../../../../../../../base/common/assert.js';
import { INVALID_NAME_CHARACTERS, STOP_CHARACTERS } from '../parsers/promptVariableParser.js';
import { IRange, Range } from '../../../../../../../editor/common/core/range.js';
import { BaseToken } from '../../../../../../../editor/common/codecs/baseToken.js';

/**
 * All prompt variables start with `#` character.
 */
const START_CHARACTER: string = '#';

/**
 * Character that separates name of a prompt variable from its data.
 */
const DATA_SEPARATOR: string = ':';

/**
 * Represents a `#variable` token in a prompt text.
 */
export class PromptVariable extends PromptToken {
	constructor(
		range: Range,
		/**
		 * The name of a prompt variable, excluding the `#` character at the start.
		 */
		public readonly name: string,
	) {
		for (const character of name) {
			assert(
				(INVALID_NAME_CHARACTERS.includes(character) === false),
				`File name cannot contain character '${character}', got '${name}'.`,
			);

			assert(
				(STOP_CHARACTERS.includes(character) === false),
				`File name cannot contain character '${character}', got '${name}'.`,
			);
		}

		super(range);
	}

	/**
	 * Get full text of the token.
	 */
	public get text(): string {
		return `${START_CHARACTER}${this.name}`;
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
		return `${this.text}${this.range}`;
	}
}

/**
 * Represents a {@link PromptVariable} with additional data token in a prompt text.
 * (e.g., `#variable:/path/to/file.md`)
 */
// TODO: @legomushroom - allow for empty `path`s?
export class PromptVariableWithData extends PromptVariable {
	constructor(
		fullRange: Range,
		/**
		 * The name of the variable, excluding the starting `#` character.
		 */
		name: string,

		/**
		 * The data of the variable, excluding the starting {@link DATA_SEPARATOR} character.
		 */
		public readonly data: string,
	) {
		super(fullRange, name);
	}

	/**
	 * Get full text of the token.
	 */
	public override get text(): string {
		return `${START_CHARACTER}${this.name}${DATA_SEPARATOR}${this.data}`;
	}

	/**
	 * Check if this token is equal to another one.
	 */
	public override equals<T extends BaseToken>(other: T): boolean {
		if ((other instanceof PromptVariableWithData) === false) {
			return false;
		}

		return super.equals(other);
	}

	/**
	 * Range of the `data` part of the variable.
	 */
	public get dataRange(): IRange {
		const { range } = this;
		const dataStartColumn = range.startColumn +
			START_CHARACTER.length + this.name.length +
			DATA_SEPARATOR.length;

		return new Range(
			range.startLineNumber,
			dataStartColumn,
			range.endLineNumber,
			range.endColumn,
		);
	}
}
