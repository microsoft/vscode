/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { FileAccess } from '../../../base/common/network.js';
import { IChannel } from '../../../base/parts/ipc/common/ipc.js';
import { Client as TelemetryClient } from '../../../base/parts/ipc/node/ipc.cp.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { ILoggerService } from '../../log/common/log.js';
import { IMeteredConnectionService } from '../../meteredConnection/common/meteredConnection.js';
import { IProductService } from '../../product/common/productService.js';
import { ICustomEndpointTelemetryService, ITelemetryData, ITelemetryEndpoint, ITelemetryService } from '../common/telemetry.js';
import { TelemetryAppenderClient } from '../common/telemetryIpc.js';
import { TelemetryLogAppender } from '../common/telemetryLogAppender.js';
import { TelemetryService } from '../common/telemetryService.js';

interface ICustomTelemetryServiceEntry {
	readonly service: ITelemetryService;
	readonly appender: TelemetryAppenderClient;
}

class TrackedTelemetryAppenderClient extends TelemetryAppenderClient {
	constructor(
		channel: IChannel,
		private readonly onWillLog: (appender: TelemetryAppenderClient) => void,
	) {
		super(channel);
	}

	override log(eventName: string, data?: unknown): unknown {
		this.onWillLog(this);
		return super.log(eventName, data);
	}
}

export class CustomEndpointTelemetryService extends Disposable implements ICustomEndpointTelemetryService {
	declare readonly _serviceBrand: undefined;

	private readonly customTelemetryServices = new Map<string, ICustomTelemetryServiceEntry>();
	private readonly activeTelemetryAppenders = new Set<TelemetryAppenderClient>();

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ILoggerService private readonly loggerService: ILoggerService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IProductService private readonly productService: IProductService,
		@IMeteredConnectionService private readonly meteredConnectionService: IMeteredConnectionService,
	) {
		super();
		this._register(this.meteredConnectionService.onDidChangeIsConnectionMetered(isMetered => {
			for (const appender of this.activeTelemetryAppenders) {
				void appender.setIsConnectionMetered(isMetered);
			}
		}));
	}

	private getCustomTelemetryService(endpoint: ITelemetryEndpoint): ITelemetryService {
		let entry = this.customTelemetryServices.get(endpoint.id);
		if (!entry) {
			const telemetryInfo: { [key: string]: string } = Object.create(null);
			telemetryInfo['common.vscodemachineid'] = this.telemetryService.machineId;
			telemetryInfo['common.vscodesessionid'] = this.telemetryService.sessionId;
			const args = [endpoint.id, JSON.stringify(telemetryInfo), endpoint.aiKey, String(this.meteredConnectionService.isConnectionMetered)];
			const client = this._register(new TelemetryClient(
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
			));

			const channel = client.getChannel('telemetryAppender');
			const telemetryAppender = new TrackedTelemetryAppenderClient(channel, appender => this.activeTelemetryAppenders.add(appender));
			this._register(client.onDidProcessExit(() => this.activeTelemetryAppenders.delete(telemetryAppender)));
			const appenders = [
				telemetryAppender,
				new TelemetryLogAppender(`[${endpoint.id}] `, false, this.loggerService, this.environmentService, this.productService),
			];

			const service = this._register(new TelemetryService({
				appenders,
				sendErrorTelemetry: endpoint.sendErrorTelemetry,
				meteredConnectionService: this.meteredConnectionService,
			}, this.configurationService, this.productService));
			entry = { service, appender: telemetryAppender };
			this.customTelemetryServices.set(endpoint.id, entry);
		}

		return entry.service;
	}

	publicLog(telemetryEndpoint: ITelemetryEndpoint, eventName: string, data?: ITelemetryData) {
		if (this.meteredConnectionService.isConnectionMetered) {
			return;
		}
		const customTelemetryService = this.getCustomTelemetryService(telemetryEndpoint);
		customTelemetryService.publicLog(eventName, data);
	}

	publicLogError(telemetryEndpoint: ITelemetryEndpoint, errorEventName: string, data?: ITelemetryData) {
		if (this.meteredConnectionService.isConnectionMetered) {
			return;
		}
		const customTelemetryService = this.getCustomTelemetryService(telemetryEndpoint);
		customTelemetryService.publicLogError(errorEventName, data);
	}
}
