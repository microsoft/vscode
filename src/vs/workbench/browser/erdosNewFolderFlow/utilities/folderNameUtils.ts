/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { FlowFormattedTextType } from '../components/flowFormattedText.js';

const MAX_LENGTH_FOLDER_PATH = 255;

export const getMaxFolderPathLength = (parentFolderLength: number) => MAX_LENGTH_FOLDER_PATH + 1 - parentFolderLength;

export const checkFolderName = async (
	folderName: string,
	parentFolder: URI,
	fileService: IFileService
) => {
	if (!folderName.trim()) {
		return {
			type: FlowFormattedTextType.Error,
			text: localize(
				'folderNameLocationSubStep.folderName.feedback.emptyFolderName',
				"Please enter a folder name."
			),
		};
	}

	const folderPath = URI.joinPath(parentFolder, folderName);
	if (await fileService.exists(folderPath)) {
		return {
			type: FlowFormattedTextType.Error,
			text: localize(
				'folderNameLocationSubStep.folderName.feedback.existingFolder',
				"A folder named '{0}' already exists.",
				folderName
			),
		};
	}

	return undefined;
};
