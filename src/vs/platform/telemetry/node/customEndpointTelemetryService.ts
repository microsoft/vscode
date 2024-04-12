/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileAccess } from 'vs/base/common/network';
import { Client as TelemetryClient } from 'vs/base/parts/ipc/node/ipc.cp';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ILogService, ILoggerService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { ICustomEndpointTelemetryService, ITelemetryData, ITelemetryEndpoint, ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { TelemetryAppenderClient } from 'vs/platform/telemetry/common/telemetryIpc';
import { TelemetryLogAppender } from 'vs/platform/telemetry/common/telemetryLogAppender';
import { TelemetryService } from 'vs/platform/telemetry/common/telemetryService';

export class CustomEndpointTelemetryService implements ICustomEndpointTelemetryService {
	declare readonly _serviceBrand: undefined;

	private customTelemetryServices = new Map<string, ITelemetryService>();

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILogService private readonly logService: ILogService,
		@ILoggerService private readonly loggerService: ILoggerService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IProductService private readonly productService: IProductService
	) { }

	private getCustomTelemetryService(endpoint: ITelemetryEndpoint): ITelemetryService {
		if (!this.customTelemetryServices.has(endpoint.id)) {
			const telemetryInfo: { [key: string]: string } = Object.create(null);
			telemetryInfo['common.vscodemachineid'] = this.telemetryService.machineId;
			telemetryInfo['common.vscodesessionid'] = this.telemetryService.sessionId;
			const args = [endpoint.id, JSON.stringify(telemetryInfo), endpoint.aiKey];
			const client = new TelemetryClient(
				FileAccess.asFileUri('bootstrap-fork').fsPath,
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
			const appenders = [
				new TelemetryAppenderClient(channel),
				new TelemetryLogAppender(this.logService, this.loggerService, this.environmentService, this.productService, `[${endpoint.id}] `),
			];

			this.customTelemetryServices.set(endpoint.id, new TelemetryService({
				appenders,
				sendErrorTelemetry: endpoint.sendErrorTelemetry
			}, this.configurationService, this.productService));
		}

		return this.customTelemetryServices.get(endpoint.id)!;
	}

	publicLog(telemetryEndpoint: ITelemetryEndpoint, eventName: string, data?: ITelemetryData) {
		const customTelemetryService = this.getCustomTelemetryService(telemetryEndpoint);
		customTelemetryService.publicLog(eventName, data);
	}

	publicLogError(telemetryEndpoint: ITelemetryEndpoint, errorEventName: string, data?: ITelemetryData) {
		const customTelemetryService = this.getCustomTelemetryService(telemetryEndpoint);
		customTelemetryService.publicLogError(errorEventName, data);
	}
}
