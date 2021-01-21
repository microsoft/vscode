/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { URI } from 'vs/base/common/uri';
import { hash } from 'vs/base/common/hash';

export function getWorkspaceIdentifier(workspacePath: URI): IWorkspaceIdentifier {
	return {
		id: getWorkspaceId(workspacePath),
		configPath: workspacePath
	};
}

export function getSingleFolderWorkspaceIdentifier(folderPath: URI): ISingleFolderWorkspaceIdentifier {
	return {
		id: getWorkspaceId(folderPath),
		uri: folderPath
	};
}

function getWorkspaceId(uri: URI): string {
	return hash(uri.toString()).toString(16);
}
