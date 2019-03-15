/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { OperatingSystem } from 'vs/base/common/platform';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';

export interface IRemoteAgentEnvironment {
	pid: number;
	appRoot: URI;
	appSettingsHome: URI;
	logsPath: URI;
	extensionsPath: URI;
	extensionHostLogsPath: URI;
	globalStorageHome: URI;
	userHome: URI;
	extensions: IExtensionDescription[];
	os: OperatingSystem;
	syncExtensions: boolean;
}

export interface RemoteAgentConnectionContext {
	remoteAuthority: string;
	clientId: string;
}