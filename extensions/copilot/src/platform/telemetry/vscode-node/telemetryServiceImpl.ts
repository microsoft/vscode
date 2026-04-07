/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CustomFetcher } from '@vscode/extension-telemetry';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ICopilotTokenStore } from '../../authentication/common/copilotTokenStore';
import { ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { ICAPIClientService } from '../../endpoint/common/capiClient';
import { IDomainService } from '../../endpoint/common/domainService';
import { IEnvService } from '../../env/common/envService';
import { IFetcherService, NO_FETCH_TELEMETRY } from '../../networking/common/fetcherService';
import { FetcherService } from '../../networking/vscode-node/fetcherServiceImpl';
import { BaseTelemetryService } from '../common/baseTelemetryService';
import { IExperimentationService } from '../common/nullExperimentationService';
import { ITelemetryUserConfig, TelemetryTrustedValue } from '../common/telemetry';
import { GitHubTelemetrySender } from './githubTelemetrySender';
import { MicrosoftTelemetrySender } from './microsoftTelemetrySender';

export class TelemetryService extends BaseTelemetryService {
	declare readonly _serviceBrand: undefined;
	constructor(
		extensionName: string,
		internalMSFTAIKey: string,
		internalLargeEventMSFTAIKey: string,
		externalMSFTAIKey: string,
		externalGHAIKey: string,
		estrictedGHAIKey: string,
		@IConfigurationService configService: IConfigurationService,
		@ICopilotTokenStore tokenStore: ICopilotTokenStore,
		@ICAPIClientService capiClientService: ICAPIClientService,
		@IEnvService envService: IEnvService,
		@ITelemetryUserConfig telemetryUserConfig: ITelemetryUserConfig,
		@IDomainService domainService: IDomainService,
		@IFetcherService fetcherService: IFetcherService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		const customFetcher: CustomFetcher = async (url: string, init?: { method: 'POST'; headers?: Record<string, string>; body?: string }) => {
			return fetcherService.fetch(url, {
				method: init?.method,
				headers: init?.headers,
				body: init?.body,
				callSite: NO_FETCH_TELEMETRY,
			});
		};
		const microsoftTelemetrySender = new MicrosoftTelemetrySender(
			internalMSFTAIKey,
			internalLargeEventMSFTAIKey,
			externalMSFTAIKey,
			tokenStore,
			customFetcher
		);

		// Lazy getter for the experiment flag.
		// Uses IInstantiationService to get IExperimentationService lazily to avoid circular dependency:
		// TelemetryService -> IExperimentationService -> ITelemetryService
		// The flag is only evaluated on the first telemetry event, by which time both services are initialized.
		const useNewTelemetryLibGetter = () => {
			const expService = instantiationService.invokeFunction(accessor => accessor.get(IExperimentationService));
			return configService.getExperimentBasedConfig(ConfigKey.TeamInternal.UseVSCodeTelemetryLibForGH, expService);
		};

		const ghTelemetrySender = new GitHubTelemetrySender(
			configService,
			envService,
			telemetryUserConfig,
			domainService,
			capiClientService,
			extensionName,
			externalGHAIKey,
			estrictedGHAIKey,
			tokenStore,
			useNewTelemetryLibGetter,
			customFetcher
		);
		super(tokenStore, capiClientService, microsoftTelemetrySender, ghTelemetrySender);

		if (fetcherService instanceof FetcherService) {
			fetcherService.setTelemetryService(this);
		}

		// Subscribe to fetch telemetry events on Insiders only to track request counts and latency per call site
		if (envService.isPreRelease()) {
			fetcherService.onDidCompleteFetch(event => {
				if (event.callSite === NO_FETCH_TELEMETRY) {
					return;
				}
				/* __GDPR__
					"fetchTelemetry" : {
						"owner": "lramos15",
						"comment": "Telemetry about fetch requests made by the extension, tracking request counts and latency per call site.",
						"callSite": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The call site identifier for the fetch request." },
						"latencyMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "The latency of the fetch request in milliseconds." },
						"statusCode": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "The HTTP status code returned by the fetch request." }
					}
				*/
				this.sendMSFTTelemetryEvent('fetchTelemetry', {
					callSite: new TelemetryTrustedValue(event.callSite),
				}, {
					latencyMs: event.latencyMs,
					statusCode: event.statusCode,
				});
			});
		}
	}
}
