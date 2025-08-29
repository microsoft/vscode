/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptToken } from './promptToken.js';
import { Range } from '../../../../../../../editor/common/core/range.js';

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
