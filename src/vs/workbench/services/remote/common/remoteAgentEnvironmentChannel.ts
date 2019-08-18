/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as platform from 'vs/base/common/platform';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { IRemoteAgentEnvironment } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { IDiagnosticInfoOptions, IDiagnosticInfo } from 'vs/platform/diagnostics/common/diagnostics';
import { RemoteAuthorities } from 'vs/base/common/network';

export interface IGetEnvironmentDataArguments {
	language: string;
	remoteAuthority: string;
	extensionDevelopmentPath: UriComponents | UriComponents[] | undefined;
}

export interface IRemoteAgentEnvironmentDTO {
	pid: number;
	connectionToken: string;
	appRoot: UriComponents;
	appSettingsHome: UriComponents;
	settingsPath: UriComponents;
	logsPath: UriComponents;
	extensionsPath: UriComponents;
	extensionHostLogsPath: UriComponents;
	globalStorageHome: UriComponents;
	userHome: UriComponents;
	extensions: IExtensionDescription[];
	os: platform.OperatingSystem;
}

export class RemoteExtensionEnvironmentChannelClient {

	constructor(private channel: IChannel) { }

	async getEnvironmentData(remoteAuthority: string, extensionDevelopmentPath?: URI[]): Promise<IRemoteAgentEnvironment> {
		const args: IGetEnvironmentDataArguments = {
			language: platform.language,
			remoteAuthority,
			extensionDevelopmentPath
		};

		const data = await this.channel.call<IRemoteAgentEnvironmentDTO>('getEnvironmentData', args);

		RemoteAuthorities.setConnectionToken(remoteAuthority, data.connectionToken);

		return {
			pid: data.pid,
			connectionToken: data.connectionToken,
			appRoot: URI.revive(data.appRoot),
			appSettingsHome: URI.revive(data.appSettingsHome),
			settingsPath: URI.revive(data.settingsPath),
			logsPath: URI.revive(data.logsPath),
			extensionsPath: URI.revive(data.extensionsPath),
			extensionHostLogsPath: URI.revive(data.extensionHostLogsPath),
			globalStorageHome: URI.revive(data.globalStorageHome),
			userHome: URI.revive(data.userHome),
			extensions: data.extensions.map(ext => { (<any>ext).extensionLocation = URI.revive(ext.extensionLocation); return ext; }),
			os: data.os
		};
	}

	getDiagnosticInfo(options: IDiagnosticInfoOptions): Promise<IDiagnosticInfo> {
		return this.channel.call<IDiagnosticInfo>('getDiagnosticInfo', options);
	}

	disableTelemetry(): Promise<void> {
		return this.channel.call<void>('disableTelemetry');
	}
}
