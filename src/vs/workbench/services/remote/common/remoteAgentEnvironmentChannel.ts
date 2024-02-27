/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as platform from 'vs/base/common/platform';
import * as performance from 'vs/base/common/performance';
import { URI, UriComponents, UriDto } from 'vs/base/common/uri';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IRemoteAgentEnvironment } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { IDiagnosticInfoOptions, IDiagnosticInfo } from 'vs/platform/diagnostics/common/diagnostics';
import { ITelemetryData, TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';
import { IExtensionHostExitInfo } from 'vs/workbench/services/remote/common/remoteAgentService';
import { revive } from 'vs/base/common/marshalling';
import { IUserDataProfile } from 'vs/platform/userDataProfile/common/userDataProfile';

export interface IGetEnvironmentDataArguments {
	remoteAuthority: string;
	profile?: string;
}

export interface IGetExtensionHostExitInfoArguments {
	remoteAuthority: string;
	reconnectionToken: string;
}

export interface IRemoteAgentEnvironmentDTO {
	pid: number;
	connectionToken: string;
	appRoot: UriComponents;
	settingsPath: UriComponents;
	logsPath: UriComponents;
	extensionHostLogsPath: UriComponents;
	globalStorageHome: UriComponents;
	workspaceStorageHome: UriComponents;
	localHistoryHome: UriComponents;
	userHome: UriComponents;
	os: platform.OperatingSystem;
	arch: string;
	marks: performance.PerformanceMark[];
	useHostProxy: boolean;
	profiles: {
		all: UriDto<IUserDataProfile[]>;
		home: UriComponents;
	};
	isUnsupportedGlibc: boolean;
}

export class RemoteExtensionEnvironmentChannelClient {

	static async getEnvironmentData(channel: IChannel, remoteAuthority: string, profile: string | undefined): Promise<IRemoteAgentEnvironment> {
		const args: IGetEnvironmentDataArguments = {
			remoteAuthority,
			profile
		};

		const data = await channel.call<IRemoteAgentEnvironmentDTO>('getEnvironmentData', args);

		return {
			pid: data.pid,
			connectionToken: data.connectionToken,
			appRoot: URI.revive(data.appRoot),
			settingsPath: URI.revive(data.settingsPath),
			logsPath: URI.revive(data.logsPath),
			extensionHostLogsPath: URI.revive(data.extensionHostLogsPath),
			globalStorageHome: URI.revive(data.globalStorageHome),
			workspaceStorageHome: URI.revive(data.workspaceStorageHome),
			localHistoryHome: URI.revive(data.localHistoryHome),
			userHome: URI.revive(data.userHome),
			os: data.os,
			arch: data.arch,
			marks: data.marks,
			useHostProxy: data.useHostProxy,
			profiles: revive(data.profiles),
			isUnsupportedGlibc: data.isUnsupportedGlibc
		};
	}

	static async getExtensionHostExitInfo(channel: IChannel, remoteAuthority: string, reconnectionToken: string): Promise<IExtensionHostExitInfo | null> {
		const args: IGetExtensionHostExitInfoArguments = {
			remoteAuthority,
			reconnectionToken
		};
		return channel.call<IExtensionHostExitInfo | null>('getExtensionHostExitInfo', args);
	}

	static getDiagnosticInfo(channel: IChannel, options: IDiagnosticInfoOptions): Promise<IDiagnosticInfo> {
		return channel.call<IDiagnosticInfo>('getDiagnosticInfo', options);
	}

	static updateTelemetryLevel(channel: IChannel, telemetryLevel: TelemetryLevel): Promise<void> {
		return channel.call<void>('updateTelemetryLevel', { telemetryLevel });
	}

	static logTelemetry(channel: IChannel, eventName: string, data: ITelemetryData): Promise<void> {
		return channel.call<void>('logTelemetry', { eventName, data });
	}

	static flushTelemetry(channel: IChannel): Promise<void> {
		return channel.call<void>('flushTelemetry');
	}

	static async ping(channel: IChannel): Promise<void> {
		await channel.call<void>('ping');
	}
}
