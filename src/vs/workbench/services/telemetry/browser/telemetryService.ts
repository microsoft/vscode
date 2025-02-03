/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService, ILoggerService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { OneDataSystemWebAppender } from '../../../../platform/telemetry/browser/1dsAppender.js';
import { ClassifiedEvent, IGDPRProperty, OmitMetadata, StrictPropertyCheck } from '../../../../platform/telemetry/common/gdprTypings.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel, TELEMETRY_SETTING_ID } from '../../../../platform/telemetry/common/telemetry.js';
import { TelemetryLogAppender } from '../../../../platform/telemetry/common/telemetryLogAppender.js';
import { ITelemetryServiceConfig, TelemetryService as BaseTelemetryService } from '../../../../platform/telemetry/common/telemetryService.js';
import { getTelemetryLevel, isInternalTelemetry, isLoggingOnly, ITelemetryAppender, NullTelemetryService, supportsTelemetry } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { resolveWorkbenchCommonProperties } from './workbenchCommonProperties.js';

export class TelemetryService extends Disposable implements ITelemetryService {

	declare readonly _serviceBrand: undefined;

	private impl: ITelemetryService = NullTelemetryService;
	public readonly sendErrorTelemetry = true;

	get sessionId(): string { return this.impl.sessionId; }
	get machineId(): string { return this.impl.machineId; }
	get sqmId(): string { return this.impl.sqmId; }
	get devDeviceId(): string { return this.impl.devDeviceId; }
	get firstSessionDate(): string { return this.impl.firstSessionDate; }
	get msftInternal(): boolean | undefined { return this.impl.msftInternal; }

	constructor(
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
		@ILogService logService: ILogService,
		@ILoggerService loggerService: ILoggerService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IProductService productService: IProductService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService
	) {
		super();

		this.impl = this.initializeService(environmentService, logService, loggerService, configurationService, storageService, productService, remoteAgentService);

		// When the level changes it could change from off to on and we want to make sure telemetry is properly intialized
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TELEMETRY_SETTING_ID)) {
				this.impl = this.initializeService(environmentService, logService, loggerService, configurationService, storageService, productService, remoteAgentService);
			}
		}));
	}

	/**
	 * Initializes the telemetry service to be a full fledged service.
	 * This is only done once and only when telemetry is enabled as this will also ping the endpoint to
	 * ensure its not adblocked and we can send telemetry
	 */
	private initializeService(
		environmentService: IBrowserWorkbenchEnvironmentService,
		logService: ILogService,
		loggerService: ILoggerService,
		configurationService: IConfigurationService,
		storageService: IStorageService,
		productService: IProductService,
		remoteAgentService: IRemoteAgentService
	) {
		const telemetrySupported = supportsTelemetry(productService, environmentService) && productService.aiConfig?.ariaKey;
		if (telemetrySupported && getTelemetryLevel(configurationService) !== TelemetryLevel.NONE && this.impl === NullTelemetryService) {
			// If remote server is present send telemetry through that, else use the client side appender
			const appenders: ITelemetryAppender[] = [];
			const isInternal = isInternalTelemetry(productService, configurationService);
			if (!isLoggingOnly(productService, environmentService)) {
				if (remoteAgentService.getConnection() !== null) {
					const remoteTelemetryProvider = {
						log: remoteAgentService.logTelemetry.bind(remoteAgentService),
						flush: remoteAgentService.flushTelemetry.bind(remoteAgentService)
					};
					appenders.push(remoteTelemetryProvider);
				} else {
					appenders.push(new OneDataSystemWebAppender(isInternal, 'monacoworkbench', null, productService.aiConfig?.ariaKey));
				}
			}
			appenders.push(new TelemetryLogAppender(logService, loggerService, environmentService, productService));
			const config: ITelemetryServiceConfig = {
				appenders,
				commonProperties: resolveWorkbenchCommonProperties(storageService, productService.commit, productService.version, isInternal, environmentService.remoteAuthority, productService.embedderIdentifier, productService.removeTelemetryMachineId, environmentService.options && environmentService.options.resolveCommonTelemetryProperties),
				sendErrorTelemetry: this.sendErrorTelemetry,
			};

			return this._register(new BaseTelemetryService(config, configurationService, productService));
		}
		return this.impl;
	}

	setExperimentProperty(name: string, value: string): void {
		return this.impl.setExperimentProperty(name, value);
	}

	get telemetryLevel(): TelemetryLevel {
		return this.impl.telemetryLevel;
	}

	publicLog(eventName: string, data?: ITelemetryData) {
		this.impl.publicLog(eventName, data);
	}

	publicLog2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>) {
		this.publicLog(eventName, data as ITelemetryData);
	}

	publicLogError(errorEventName: string, data?: ITelemetryData) {
		this.impl.publicLog(errorEventName, data);
	}

	publicLogError2<E extends ClassifiedEvent<OmitMetadata<T>> = never, T extends IGDPRProperty = never>(eventName: string, data?: StrictPropertyCheck<T, E>) {
		this.publicLogError(eventName, data as ITelemetryData);
	}
}

registerSingleton(ITelemetryService, TelemetryService, InstantiationType.Delayed);
