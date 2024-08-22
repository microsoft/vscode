/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as performance from '../../../base/common/performance';
import { OperatingSystem } from '../../../base/common/platform';
import { URI } from '../../../base/common/uri';
import { IUserDataProfile } from '../../userDataProfile/common/userDataProfile';

export interface IRemoteAgentEnvironment {
	pid: number;
	connectionToken: string;
	appRoot: URI;
	settingsPath: URI;
	logsPath: URI;
	extensionHostLogsPath: URI;
	globalStorageHome: URI;
	workspaceStorageHome: URI;
	localHistoryHome: URI;
	userHome: URI;
	os: OperatingSystem;
	arch: string;
	marks: performance.PerformanceMark[];
	useHostProxy: boolean;
	profiles: {
		all: IUserDataProfile[];
		home: URI;
	};
	isUnsupportedGlibc: boolean;
}

export interface RemoteAgentConnectionContext {
	remoteAuthority: string;
	clientId: string;
}
