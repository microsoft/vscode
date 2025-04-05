/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../../../nls.js';
import { ISelectPromptOptions } from '../askToSelectPrompt.js';
import { SUPER_KEY_NAME } from '../constants.js';

/**
 * Creates a placeholder text to show in the prompt selection dialog.
 */
export const createPlaceholderText = (
	options: ISelectPromptOptions,
): string => {
	const { widget } = options;

	let text = localize(
		'commands.prompts.use.select-dialog.placeholder',
		'Select a prompt to use',
	);

	// if no widget reference is provided, add the note about `options`
	// and `cmd` modifiers users can leverage to alter the command behavior
	if (widget === undefined) {
		const superModifierNote = localize(
			'commands.prompts.use.select-dialog.super-modifier-note',
			'{0}-key to use in new chat',
			SUPER_KEY_NAME,
		);

		text += localize(
			'commands.prompts.use.select-dialog.modifier-notes',
			' (hold {0})',
			superModifierNote,
		);
	}

	return text;
};
