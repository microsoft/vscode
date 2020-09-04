/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { joinPath, relativePath } from 'vs/base/common/resources';

export function toBackupWorkspaceResource(backupWorkspacePath: string, environmentService: INativeWorkbenchEnvironmentService): URI {
	return joinPath(environmentService.userRoamingDataHome, relativePath(URI.file(environmentService.userDataPath), URI.file(backupWorkspacePath))!);
}
