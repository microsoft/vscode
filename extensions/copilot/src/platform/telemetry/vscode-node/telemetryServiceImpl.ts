/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CustomFetcher } from '@vscode/extension-telemetry';
import * as vscode from 'vscode';
import * as zlib from 'zlib';
import { promisify } from 'util';
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
import { ITelemetryUserConfig, setTelemetryPropertyCompressor, TelemetryTrustedValue } from '../common/telemetry';
import { GitHubTelemetrySender } from './githubTelemetrySender';
import { MicrosoftTelemetrySender } from './microsoftTelemetrySender';

// Register the Node-only property compressor with the common-layer multiplexProperties helper once,
// so oversized telemetry properties are chunked in gzip + base64 form without every call site
// having to thread the compressor through. gzip runs on the libuv threadpool so it never blocks the
// host process event loop.
const gzip = promisify(zlib.gzip);
setTelemetryPropertyCompressor(async value => (await gzip(Buffer.from(value, 'utf8'))).toString('base64'));

/**
 * The shared telemetry property carrying the CAPI flight assignment context.
 * Kept in sync with `CAPI_ASSIGNMENT_CONTEXT_PROPERTY` in the VS Code core
 * (`src/vs/workbench/api/browser/mainThreadTelemetry.ts`).
 */
const CAPI_ASSIGNMENT_CONTEXT_PROPERTY = 'capi.assignmentcontext';

/**
 * Private core command that forwards the CAPI assignment context onto core
 * telemetry events. Kept in sync with `SET_CAPI_ASSIGNMENT_CONTEXT_COMMAND` in
 * `src/vs/workbench/api/browser/mainThreadTelemetry.ts`.
 */
const SET_CAPI_ASSIGNMENT_CONTEXT_COMMAND = '_telemetry.setCapiAssignmentContext';

export class TelemetryService extends BaseTelemetryService {
	declare readonly _serviceBrand: undefined;
	constructor(
		extensionName: string,
		internalMSFTAIKey: string,
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
			externalMSFTAIKey,
			tokenStore,
			customFetcher
		);

		// The experiment flag is read lazily on the first telemetry event (to avoid the circular
		// dependency TelemetryService -> IExperimentationService -> ITelemetryService) and then
		// cached.
		let cachedUseNewTelemetryLib: boolean | undefined;
		const computeUseNewTelemetryLib = () => {
			const expService = instantiationService.invokeFunction(accessor => accessor.get(IExperimentationService));
			return configService.getExperimentBasedConfig(ConfigKey.TeamInternal.UseVSCodeTelemetryLibForGH, expService);
		};
		const useNewTelemetryLibGetter = () => {
			if (cachedUseNewTelemetryLib === undefined) {
				cachedUseNewTelemetryLib = computeUseNewTelemetryLib();
			}
			return cachedUseNewTelemetryLib;
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

		// Refresh the cached experiment flag when ExP treatments change so a runtime treatment flip
		// takes effect without requiring a window reload. We only recompute once
		// the flag has been read at least once, preserving the lazy initialization above (so the
		// experimentation service is not pulled on before the first telemetry event).
		this._disposables.push(configService.onDidChangeConfiguration(e => {
			if (cachedUseNewTelemetryLib !== undefined && e.affectsConfiguration(ConfigKey.TeamInternal.UseVSCodeTelemetryLibForGH.fullyQualifiedId)) {
				cachedUseNewTelemetryLib = computeUseNewTelemetryLib();
			}
		}));

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
						"cacheStatus": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Cache outcome for callers that opted in: 'hit', 'stale-hit', 'revalidated', 'miss', 'bypass'. Empty string when caching was not requested." },
						"latencyMs": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "The latency of the fetch request in milliseconds." },
						"statusCode": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true, "comment": "The HTTP status code returned by the fetch request." }
					}
				*/
				this.sendMSFTTelemetryEvent('fetchTelemetry', {
					callSite: new TelemetryTrustedValue(event.callSite),
					cacheStatus: event.cacheStatus ?? '',
				}, {
					latencyMs: event.latencyMs,
					statusCode: event.statusCode,
				});
			});
		}
	}

	// __GDPR__COMMON__ "capi.assignmentcontext" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	override setSharedProperty(name: string, value: string): void {
		super.setSharedProperty(name, value);

		// Forward the CAPI assignment context to the core telemetry pipeline so it
		// appears on all telemetry events from the current window (same scope as
		// `abexp.assignmentcontext`). The core side (`mainThreadTelemetry.ts`)
		// validates the value before trusting it onto telemetry events.
		if (name === CAPI_ASSIGNMENT_CONTEXT_PROPERTY) {
			vscode.commands.executeCommand(SET_CAPI_ASSIGNMENT_CONTEXT_COMMAND, value);
		}
	}
}
