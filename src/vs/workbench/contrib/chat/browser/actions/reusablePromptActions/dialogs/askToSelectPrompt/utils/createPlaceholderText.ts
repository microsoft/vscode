/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SUPER_KEY_NAME } from '../constants.js';
import { localize } from '../../../../../../../../../nls.js';
import { ISelectInstructionsOptions } from '../askToSelectPrompt.js';

/**
 * Creates a placeholder text to show in the attach instructions selection dialog.
 */
export const createPlaceholderText = (
	options: ISelectInstructionsOptions,
): string => {
	const { widget } = options;

	let text = localize(
		'commands.instructions.select-dialog.placeholder',
		'Select instructions files to attach',
	);

	// if no widget reference is provided, add the note about the `ctrl`/`cmd`
	// modifier that can be leveraged by users to alter the command behavior
	if (widget === undefined) {
		const superModifierNote = localize(
			'commands.instructions.select-dialog.super-modifier-note',
			'{0}-key to use in new chat',
			SUPER_KEY_NAME,
		);

		text += localize(
			'commands.instructions.select-dialog.modifier-notes',
			' (hold {0})',
			superModifierNote,
		);
	}

	return text;
};
