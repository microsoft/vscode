/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OperatingSystem } from 'vs/base/common/platform';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IChannel } from 'vs/base/parts/ipc/node/ipc';
import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { IRemoteAgentEnvironment } from 'vs/workbench/services/remote/node/remoteAgentService';

export interface IRemoteAgentEnvironmentDTO {
	pid: number;
	appRoot: UriComponents;
	appSettingsHome: UriComponents;
	logsPath: UriComponents;
	extensionsPath: UriComponents;
	extensionHostLogsPath: UriComponents;
	globalStorageHome: UriComponents;
	extensions: IExtensionDescription[];
	os: OperatingSystem;
}

export class RemoteExtensionEnvironmentChannelClient {

	constructor(private channel: IChannel) { }

	getEnvironmentData(remoteAuthority: string, extensionDevelopmentPath?: URI): Promise<IRemoteAgentEnvironment> {
		return this.channel.call<IRemoteAgentEnvironmentDTO>('getEnvironmentData', [remoteAuthority, extensionDevelopmentPath])
			.then((data: IRemoteAgentEnvironmentDTO): IRemoteAgentEnvironment => {
				return {
					pid: data.pid,
					appRoot: URI.revive(data.appRoot),
					appSettingsHome: URI.revive(data.appSettingsHome),
					logsPath: URI.revive(data.logsPath),
					extensionsPath: URI.revive(data.extensionsPath),
					extensionHostLogsPath: URI.revive(data.extensionHostLogsPath),
					globalStorageHome: URI.revive(data.globalStorageHome),
					extensions: data.extensions.map(ext => { (<any>ext).extensionLocation = URI.revive(ext.extensionLocation); return ext; }),
					os: data.os
				};
			});
	}
}
