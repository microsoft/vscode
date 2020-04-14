/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ParsedArgs } from 'vs/platform/environment/common/argv';
import { URI } from 'vs/base/common/uri';

export interface INativeEnvironmentService extends IEnvironmentService {
	args: ParsedArgs;

	appRoot: string;
	execPath: string;

	appSettingsHome: URI;
	userDataPath: string;
	userHome: URI;
	machineSettingsResource: URI;
	backupWorkspacesPath: string;
	nodeCachedDataDir?: string;

	mainIPCHandle: string;
	sharedIPCHandle: string;

	installSourcePath: string;

	extensionsPath?: string;
	builtinExtensionsPath: string;

	globalStorageHome: string;
	workspaceStorageHome: string;

	driverHandle?: string;
	driverVerbose: boolean;

	disableUpdates: boolean;
}
