/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITelemetryService, ITelemetryInfo, ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService, combinedAppender, LogAppender, ITelemetryAppender, validateTelemetryData } from 'vs/platform/telemetry/common/telemetryUtils';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ILogService } from 'vs/platform/log/common/log';
import { TelemetryService as BaseTelemetryService, ITelemetryServiceConfig } from 'vs/platform/telemetry/common/telemetryService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ClassifiedEvent, StrictPropertyCheck, GDPRClassification } from 'vs/platform/telemetry/common/gdprTypings';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { resolveWorkbenchCommonProperties } from 'vs/platform/telemetry/browser/workbenchCommonProperties';
import { IProductService } from 'vs/platform/product/common/product';
import { ApplicationInsights } from '@microsoft/applicationinsights-web';

export class WebTelemetryAppender implements ITelemetryAppender {
	private _aiClient?: ApplicationInsights;

	constructor(aiKey: string, private _logService: ILogService) {
		const initConfig = {
			config: {
				instrumentationKey: aiKey,
				endpointUrl: 'https://vortex.data.microsoft.com/collect/v1',
				emitLineDelimitedJson: true,
				autoTrackPageVisitTime: false,
				disableExceptionTracking: true,
				disableAjaxTracking: true
			}
		};

		this._aiClient = new ApplicationInsights(initConfig);
		this._aiClient.loadAppInsights();
	}

	log(eventName: string, data: any): void {
		if (!this._aiClient) {
			return;
		}

		data = validateTelemetryData(data);
		this._logService.trace(`telemetry/${eventName}`, data);

		this._aiClient.trackEvent({
			name: 'monacoworkbench/' + eventName,
			properties: data.properties,
			measurements: data.measurements
		});
	}

	flush(): Promise<void> {
		if (this._aiClient) {
			return new Promise(resolve => {
				this._aiClient!.flush();
				this._aiClient = undefined;
				resolve(undefined);
			});
		}

		return Promise.resolve();
	}
}

export class TelemetryService extends Disposable implements ITelemetryService {

	_serviceBrand: any;

	private impl: ITelemetryService;

	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@ILogService logService: ILogService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IProductService productService: IProductService
	) {
		super();

		const aiKey = productService.aiConfig && productService.aiConfig.asimovKey;
		if (!environmentService.isExtensionDevelopment && !environmentService.args['disable-telemetry'] && !!productService.enableTelemetry && !!aiKey) {
			const config: ITelemetryServiceConfig = {
				appender: combinedAppender(new WebTelemetryAppender(aiKey, logService), new LogAppender(logService)),
				commonProperties: resolveWorkbenchCommonProperties(storageService, productService.commit, productService.version, environmentService.configuration.machineId, environmentService.configuration.remoteAuthority),
				piiPaths: [environmentService.appRoot]
			};

			this.impl = this._register(new BaseTelemetryService(config, configurationService));
		} else {
			this.impl = NullTelemetryService;
		}
	}

	setEnabled(value: boolean): void {
		return this.impl.setEnabled(value);
	}

	get isOptedIn(): boolean {
		return this.impl.isOptedIn;
	}

	publicLog(eventName: string, data?: ITelemetryData, anonymizeFilePaths?: boolean): Promise<void> {
		return this.impl.publicLog(eventName, data, anonymizeFilePaths);
	}

	publicLog2<E extends ClassifiedEvent<T> = never, T extends GDPRClassification<T> = never>(eventName: string, data?: StrictPropertyCheck<T, E>, anonymizeFilePaths?: boolean) {
		return this.publicLog(eventName, data as ITelemetryData, anonymizeFilePaths);
	}

	getTelemetryInfo(): Promise<ITelemetryInfo> {
		return this.impl.getTelemetryInfo();
	}
}

registerSingleton(ITelemetryService, TelemetryService);
