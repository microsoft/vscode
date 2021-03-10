/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDebugHelperService } from 'vs/workbench/contrib/debug/common/debug';
import { Client as TelemetryClient } from 'vs/base/parts/ipc/node/ipc.cp';
import { TelemetryAppenderClient } from 'vs/platform/telemetry/common/telemetryIpc';
import { FileAccess } from 'vs/base/common/network';
import { TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { cleanRemoteAuthority } from 'vs/platform/telemetry/common/telemetryUtils';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export class NodeDebugHelperService implements IDebugHelperService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) { }

	async createPrivateTelemetryService(id: string, aiKey: string): Promise<TelemetryService> {

		const { machineId, sessionId } = await this.telemetryService.getTelemetryInfo();
		const telemetryInfo: { [key: string]: string } = Object.create(null);
		telemetryInfo['common.vscodemachineid'] = machineId;
		telemetryInfo['common.vscodesessionid'] = sessionId;
		const args = [id, JSON.stringify(telemetryInfo), aiKey];
		const client = new TelemetryClient(
			FileAccess.asFileUri('bootstrap-fork', require).fsPath,
			{
				serverName: 'Debug Telemetry',
				timeout: 1000 * 60 * 5,
				args,
				env: {
					ELECTRON_RUN_AS_NODE: 1,
					VSCODE_PIPE_LOGGING: 'true',
					VSCODE_AMD_ENTRYPOINT: 'vs/workbench/contrib/debug/node/telemetryApp'
				}
			}
		);

		const channel = client.getChannel('telemetryAppender');
		const appender = new TelemetryAppenderClient(channel);

		return new TelemetryService({
			appender,
			sendErrorTelemetry: cleanRemoteAuthority(this.environmentService.remoteAuthority) !== 'other'
		}, this.configurationService);
	}
}

registerSingleton(IDebugHelperService, NodeDebugHelperService, true);
