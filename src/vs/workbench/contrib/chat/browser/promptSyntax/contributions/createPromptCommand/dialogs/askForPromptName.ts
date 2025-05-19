/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../../../nls.js';
import { TPromptsType } from '../../../../../common/promptSyntax/service/types.js';
import { getPromptFileExtension } from '../../../../../../../../platform/prompts/common/constants.js';
import { IQuickInputService } from '../../../../../../../../platform/quickinput/common/quickInput.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { IFileService } from '../../../../../../../../platform/files/common/files.js';
import Severity from '../../../../../../../../base/common/severity.js';
import { isValidBasename } from '../../../../../../../../base/common/extpath.js';
import { ServicesAccessor } from '../../../../../../../../editor/browser/editorExtensions.js';

/**
 * Asks the user for a file name.
 */
export async function askForPromptFileName(
	accessor: ServicesAccessor,
	type: TPromptsType,
	selectedFolder: URI
): Promise<string | undefined> {
	const quickInputService = accessor.get(IQuickInputService);
	const fileService = accessor.get(IFileService);

	const placeHolder = (type === 'instructions')
		? localize('askForInstructionsFileName.placeholder', "Enter the name of the instructions file")
		: localize('askForPromptFileName.placeholder', "Enter the name of the prompt file");


	const sanitizeInput = (input: string) => {
		const trimmedName = input.trim();
		if (!trimmedName) {
			return undefined;
		}

		const fileExtension = getPromptFileExtension(type);
		return (trimmedName.endsWith(fileExtension))
			? trimmedName
			: `${trimmedName}${fileExtension}`;
	};

	const validateInput = async (value: string) => {
		const fileName = sanitizeInput(value);
		if (!fileName) {
			return {
				content: localize('askForPromptFileName.error.empty', "Please enter a name."),
				severity: Severity.Warning
			};
		}

		if (!isValidBasename(fileName)) {
			return {
				content: localize('askForPromptFileName.error.invalid', "The name contains invalid characters."),
				severity: Severity.Error
			};
		}

		const fileUri = URI.joinPath(selectedFolder, fileName);
		if (await fileService.exists(fileUri)) {
			return {
				content: localize('askForPromptFileName.error.exists', "A file for the given name already exists."),
				severity: Severity.Error
			};
		}

		return undefined;
	};

	const result = await quickInputService.input({ placeHolder, validateInput });
	if (!result) {
		return undefined;
	}

	return sanitizeInput(result);
}
