/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vscode-uri';
import { Uri, workspace } from 'vscode';

import { services } from '../../services';
import { assertDefined } from '../../utils/asserts';

/**
 * Create a test folder in the first workspace folder.
 *
 * @throws if no workspace folders present.
 */
export const createTestFolder = (folderName: string): URI => {
	const { workspaceFolders } = workspace;
	assertDefined(
		workspaceFolders,
		'No workspace folders found.',
	);

	const firstFolder = workspaceFolders[0];
	assertDefined(
		firstFolder,
		'Workspace must have at least 1 folder.',
	);

	const testsRootFolder = Uri.joinPath(firstFolder.uri, folderName);

	setup(async () => {
		await services.filesystemService.createDirectory(testsRootFolder);
	});

	teardown(async () => {
		if (await services.filesystemService.exists(testsRootFolder)) {
			await services.filesystemService.delete(testsRootFolder, { recursive: true, useTrash: false });
		}
	});

	return testsRootFolder;
};
