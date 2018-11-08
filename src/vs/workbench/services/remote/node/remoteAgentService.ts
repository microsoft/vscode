/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/node/ipc';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';

export const RemoteExtensionLogFileName = 'remoteagent';

export const IRemoteAgentService = createDecorator<IRemoteAgentService>('remoteAgentService');

export interface IRemoteAgentEnvironment {
	pid: number;
	appRoot: URI;
	appSettingsHome: URI;
	logsPath: URI;
	extensionsPath: URI;
	extensionHostLogsPath: URI;
	extensions: IExtensionDescription[];
	os: OperatingSystem;
}

export interface IRemoteAgentService {
	_serviceBrand: any;

	getConnection(): IRemoteAgentConnection | null;
}

export interface IRemoteAgentConnection {
	readonly remoteAuthority: string;

	getEnvironment(): TPromise<IRemoteAgentEnvironment | null>;

	getChannel<T extends IChannel>(channelName: string): T;
	registerChannel<T extends IChannel>(channelName: string, channel: T);
}
