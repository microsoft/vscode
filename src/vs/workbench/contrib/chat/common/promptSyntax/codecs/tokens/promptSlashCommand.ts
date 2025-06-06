/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptToken } from './promptToken.js';
import { assert } from '../../../../../../../base/common/assert.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { INVALID_NAME_CHARACTERS, STOP_CHARACTERS } from '../parsers/promptSlashCommandParser.js';

/**
 * All prompt at-mentions start with `/` character.
 */
const START_CHARACTER: string = '/';

/**
 * Represents a `/command` token in a prompt text.
 */
export class PromptSlashCommand extends PromptToken {
	constructor(
		range: Range,
		/**
		 * The name of a command, excluding the `/` character at the start.
		 */
		public readonly name: string,
	) {
		// sanity check of characters used in the provided command name
		for (const character of name) {
			assert(
				(INVALID_NAME_CHARACTERS.includes(character) === false) &&
				(STOP_CHARACTERS.includes(character) === false),
				`Slash command 'name' cannot contain character '${character}', got '${name}'.`,
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
	 * Return a string representation of the token.
	 */
	public override toString(): string {
		return `${this.text}${this.range}`;
	}
}
