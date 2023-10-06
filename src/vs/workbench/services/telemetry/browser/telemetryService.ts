/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILogService, ILoggerService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { OneDataSystemWebAppender } from 'vs/platform/telemetry/browser/1dsAppender';
import { ClassifiedEvent, IGDPRProperty, OmitMetadata, StrictPropertyCheck } from 'vs/platform/telemetry/common/gdprTypings';
import { ITelemetryData, ITelemetryService, TelemetryLevel, TELEMETRY_SETTING_ID } from 'vs/platform/telemetry/common/telemetry';
import { TelemetryLogAppender } from 'vs/platform/telemetry/common/telemetryLogAppender';
import { ITelemetryServiceConfig, TelemetryService as BaseTelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { getTelemetryLevel, isInternalTelemetry, isLoggingOnly, ITelemetryAppender, NullTelemetryService, supportsTelemetry } from 'vs/platform/telemetry/common/telemetryUtils';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { resolveWorkbenchCommonProperties } from 'vs/workbench/services/telemetry/browser/workbenchCommonProperties';

export class TelemetryService extends Disposable implements ITelemetryService {

	declare readonly _serviceBrand: undefined;

	private impl: ITelemetryService = NullTelemetryService;
	public readonly sendErrorTelemetry = true;

	get sessionId(): string { return this.impl.sessionId; }
	get machineId(): string { return this.impl.machineId; }
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
