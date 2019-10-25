/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { joinPath, relativePath } from 'vs/base/common/resources';

export function toBackupWorkspaceResource(backupWorkspacePath: string, environmentService: IEnvironmentService): URI {
	return joinPath(environmentService.userRoamingDataHome, relativePath(URI.file(environmentService.userDataPath), URI.file(backupWorkspacePath))!);
}
