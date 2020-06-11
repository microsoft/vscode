/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { URI } from 'vs/base/common/uri';
import { hash } from 'vs/base/common/hash';

export function getWorkspaceIdentifier(workspacePath: URI): IWorkspaceIdentifier {
	return {
		id: hash(workspacePath.toString()).toString(16),
		configPath: workspacePath
	};
}
