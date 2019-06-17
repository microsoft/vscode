/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDiagnosticsService, IRemoteDiagnosticInfo, IRemoteDiagnosticError, SystemInfo, PerformanceInfo } from 'vs/platform/diagnostics/common/diagnosticsService';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IMainProcessInfo } from 'vs/platform/launch/common/launchService';
import { IWorkspace } from 'vs/platform/workspace/common/workspace';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';


export class DiagnosticsService implements IDiagnosticsService {

	_serviceBrand: ServiceIdentifier<any>;

	private channel: IChannel;

	constructor(@ISharedProcessService readonly sharedProcessService: ISharedProcessService) {
		this.channel = sharedProcessService.getChannel('diagnostics');
	}

	public getDiagnostics(mainProcessInfo: IMainProcessInfo, remoteInfo: (IRemoteDiagnosticInfo | IRemoteDiagnosticError)[]): Promise<string> {
		return this.channel.call('getDiagnostics', [mainProcessInfo, remoteInfo]);
	}

	public getSystemInfo(mainProcessInfo: IMainProcessInfo, remoteInfo: (IRemoteDiagnosticInfo | IRemoteDiagnosticError)[]): Promise<SystemInfo> {
		return this.channel.call('getSystemInfo', [mainProcessInfo, remoteInfo]);
	}

	public getPerformanceInfo(mainProcessInfo: IMainProcessInfo, remoteInfo: (IRemoteDiagnosticInfo | IRemoteDiagnosticError)[]): Promise<PerformanceInfo> {
		return this.channel.call('getPerformanceInfo', [mainProcessInfo, remoteInfo]);
	}

	public reportWorkspaceStats(workspace: IWorkspace): Promise<void> {
		return this.channel.call('reportWorkspaceStats', workspace);
	}
}