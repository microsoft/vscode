/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileAccess } from '../../../base/common/network.js';
import { Client as TelemetryClient } from '../../../base/parts/ipc/node/ipc.cp.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { ILoggerService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { ICustomEndpointTelemetryService, ITelemetryData, ITelemetryEndpoint, ITelemetryService } from '../common/telemetry.js';
import { TelemetryAppenderClient } from '../common/telemetryIpc.js';
import { TelemetryLogAppender } from '../common/telemetryLogAppender.js';
import { TelemetryService } from '../common/telemetryService.js';

export class CustomEndpointTelemetryService implements ICustomEndpointTelemetryService {
	declare readonly _serviceBrand: undefined;

	private customTelemetryServices = new Map<string, ITelemetryService>();

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
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
						VSCODE_ESM_ENTRYPOINT: 'vs/workbench/contrib/debug/node/telemetryApp'
					}
				}
			);

			const channel = client.getChannel('telemetryAppender');
			const appenders = [
				new TelemetryAppenderClient(channel),
				new TelemetryLogAppender(`[${endpoint.id}] `, false, this.loggerService, this.environmentService, this.productService),
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
