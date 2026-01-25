/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import Severity from '../../../../../../base/common/severity.js';
import { isValidBasename } from '../../../../../../base/common/extpath.js';
import { ServicesAccessor } from '../../../../../../editor/browser/editorExtensions.js';

/**
 * Asks the user for a skill folder name.
 */
export async function askForSkillName(
	accessor: ServicesAccessor,
	destinationFolder: URI,
	suggestedName?: string
): Promise<string | undefined> {
	const quickInputService = accessor.get(IQuickInputService);
	const fileService = accessor.get(IFileService);

	const validateInput = async (value: string) => {
		const folderName = value.trim();
		if (!folderName) {
			return {
				content: localize('askForSkillName.error.empty', "Please enter a name."),
				severity: Severity.Warning
			};
		}

		if (!isValidBasename(folderName)) {
			return {
				content: localize('askForSkillName.error.invalid', "The name contains invalid characters."),
				severity: Severity.Error
			};
		}

		const folderUri = URI.joinPath(destinationFolder, folderName);
		if (await fileService.exists(folderUri)) {
			return {
				content: localize('askForSkillName.error.exists', "A folder with this name already exists."),
				severity: Severity.Error
			};
		}

		return undefined;
	};

	const result = await quickInputService.input({
		placeHolder: localize('askForSkillName.placeholder', "Enter the name of the skill folder"),
		validateInput,
		value: suggestedName
	});

	if (!result) {
		return undefined;
	}

	return result.trim();
}
