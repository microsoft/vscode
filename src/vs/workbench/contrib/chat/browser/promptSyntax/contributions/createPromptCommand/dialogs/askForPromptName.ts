/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../../nls.js';
import { PROMPT_FILE_EXTENSION } from '../../../../../common/promptSyntax/constants.js';
import { IQuickInputService } from '../../../../../../../../platform/quickinput/common/quickInput.js';

/**
 * Asks the user for a prompt name.
 */
export const askForPromptName = async (
	_type: 'local' | 'global',
	quickInputService: IQuickInputService,
): Promise<string | undefined> => {
	const result = await quickInputService.input(
		{
			placeHolder: localize(
				'commands.prompts.create.ask-name.placeholder',
				"Provide a prompt name",
				PROMPT_FILE_EXTENSION,
			),
		});

	if (!result) {
		return undefined;
	}

	const trimmedName = result.trim();
	if (!trimmedName) {
		return undefined;
	}

	const cleanName = (trimmedName.endsWith(PROMPT_FILE_EXTENSION))
		? trimmedName
		: `${trimmedName}${PROMPT_FILE_EXTENSION}`;

	return cleanName;
};
