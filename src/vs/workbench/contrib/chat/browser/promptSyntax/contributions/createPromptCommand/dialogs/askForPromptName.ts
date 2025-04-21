/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../../nls.js';
import { TPromptsType } from '../../../../../common/promptSyntax/service/types.js';
import { getPromptFileExtension } from '../../../../../../../../platform/prompts/common/constants.js';
import { IQuickInputService } from '../../../../../../../../platform/quickinput/common/quickInput.js';

/**
 * Asks the user for a file name.
 */
export const askForPromptFileName = async (
	type: TPromptsType,
	quickInputService: IQuickInputService,
): Promise<string | undefined> => {
	const placeHolder = (type === 'instructions')
		? localize('askForInstructionsFileName.placeholder', "Enter the name of the instructions file")
		: localize('askForPromptFileName.placeholder', "Enter the name of the prompt file");

	const result = await quickInputService.input({ placeHolder });
	if (!result) {
		return undefined;
	}

	const trimmedName = result.trim();
	if (!trimmedName) {
		return undefined;
	}

	const fileExtension = getPromptFileExtension(type);
	const cleanName = (trimmedName.endsWith(fileExtension))
		? trimmedName
		: `${trimmedName}${fileExtension}`;

	return cleanName;
};
