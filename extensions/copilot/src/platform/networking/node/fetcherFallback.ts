/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Config, ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { collectSingleLineErrorMessage, ILogService, sanitizeNetworkErrorForTelemetry } from '../../log/common/logService';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { FetcherId, FetchOptions, Response } from '../common/fetcherService';
import { IFetcher } from '../common/networking';


const fetcherConfigKeys: Partial<Record<FetcherId, Config<boolean>>> = {
	'electron-fetch': ConfigKey.Shared.DebugUseElectronFetcher,
	'node-fetch': ConfigKey.Shared.DebugUseNodeFetchFetcher,
	'node-http': ConfigKey.Shared.DebugUseNodeFetcher,
};

const terminalResponseStatusCodes = new Set([429, 502, 503]);
const allFetchersFailedTelemetryIntervalMs = 15 * 60 * 1000;
const maxAggregatedErrorLength = 1024;
const maxAggregatedErrorsSerializedLength = 8192;
const aggregatedErrorsOverflowKey = '<other>';
const allFetchersFailedErrors = new Map<string, number>();
let lastAllFetchersFailedTelemetryTime = Date.now();
const terminalResponseErrors = new Map<string, number>();
let lastTerminalResponseTelemetryTime = Date.now();

function reportAllFetchersFailed(telemetryService: ITelemetryService | undefined): void {
	const now = Date.now();
	if (!telemetryService || now - lastAllFetchersFailedTelemetryTime <= allFetchersFailedTelemetryIntervalMs || allFetchersFailedErrors.size === 0) {
		return;
	}

	/* __GDPR__
		"fetcherAllFailed" : {
			"owner": "chrmarti",
			"comment": "Aggregates errors from requests for which every fallback fetcher failed during a 15-minute reporting interval",
			"errors": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "JSON object mapping sanitized fetcher failure messages to their counts, bounded to the telemetry property limit with omitted messages counted under <other>" }
		}
	*/
	telemetryService.sendTelemetryEvent('fetcherAllFailed', { github: true, microsoft: true }, {
		errors: serializeErrors(allFetchersFailedErrors),
	});

	allFetchersFailedErrors.clear();
	lastAllFetchersFailedTelemetryTime = now;
}

function reportTerminalResponses(telemetryService: ITelemetryService | undefined): void {
	const now = Date.now();
	if (!telemetryService || now - lastTerminalResponseTelemetryTime <= allFetchersFailedTelemetryIntervalMs || terminalResponseErrors.size === 0) {
		return;
	}

	/* __GDPR__
		"fetcherTerminalResponse" : {
			"owner": "chrmarti",
			"comment": "Aggregates errors from fetcher fallback sweeps stopped by a terminal response during a 15-minute reporting interval",
			"errors": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth", "comment": "JSON object mapping sanitized fetcher failure messages from stopped sweeps to their counts, bounded to the telemetry property limit with omitted messages counted under <other>" }
		}
	*/
	telemetryService.sendTelemetryEvent('fetcherTerminalResponse', { github: true, microsoft: true }, {
		errors: serializeErrors(terminalResponseErrors),
	});

	terminalResponseErrors.clear();
	lastTerminalResponseTelemetryTime = now;
}

function recordAllFetchersFailed(errors: readonly string[]): void {
	recordErrors(allFetchersFailedErrors, errors);
}

function recordTerminalResponseErrors(errors: readonly string[]): void {
	recordErrors(terminalResponseErrors, errors);
}

function recordErrors(target: Map<string, number>, errors: readonly string[]): void {
	for (const error of errors) {
		const truncatedError = error.slice(0, maxAggregatedErrorLength);
		const count = target.get(truncatedError);
		if (count !== undefined) {
			target.set(truncatedError, Math.min(count + 1, Number.MAX_SAFE_INTEGER));
			continue;
		}
		target.set(truncatedError, 1);
	}
}

function serializeErrors(errors: ReadonlyMap<string, number>): string {
	const entries: string[] = [];
	const maximumOverflowEntry = `${JSON.stringify(aggregatedErrorsOverflowKey)}:${Number.MAX_SAFE_INTEGER}`;
	let serializedLength = 2;
	let overflowCount = 0;
	for (const [error, count] of errors) {
		const entry = `${JSON.stringify(error)}:${count}`;
		const separatorLength = entries.length === 0 ? 0 : 1;
		if (overflowCount === 0 && serializedLength + separatorLength + entry.length + 1 + maximumOverflowEntry.length <= maxAggregatedErrorsSerializedLength) {
			entries.push(entry);
			serializedLength += separatorLength + entry.length;
		} else {
			overflowCount = Math.min(overflowCount + count, Number.MAX_SAFE_INTEGER);
		}
	}
	if (overflowCount > 0) {
		entries.push(`${JSON.stringify(aggregatedErrorsOverflowKey)}:${overflowCount}`);
	}
	return `{${entries.join(',')}}`;
}

export async function fetchWithFallbacks(availableFetchers: readonly IFetcher[], url: string, options: FetchOptions, knownBadFetchers: Set<string>, configurationService: IConfigurationService, logService: ILogService, telemetryService: ITelemetryService | undefined, experimentationService: IExperimentationService | undefined): Promise<{ response: Response; updatedFetchers?: IFetcher[]; updatedKnownBadFetchers?: Set<string> }> {
	if (options.retryFallbacks && availableFetchers.length > 1) {
		reportAllFetchersFailed(telemetryService);
		reportTerminalResponses(telemetryService);
		let firstResult: { ok: boolean; response: Response } | { ok: false; err: any } | undefined;
		const updatedKnownBadFetchers = new Set<string>();
		const errors: string[] = [];
		const promoteFallbackFetcher = (fetcher: IFetcher, response: Response) => {
			logService.info(`FetcherService: using ${fetcher.getUserAgentLibrary()} from now on`);
			const updatedFetchers = availableFetchers.slice();
			updatedFetchers.splice(updatedFetchers.indexOf(fetcher), 1);
			updatedFetchers.unshift(fetcher);
			return { response, updatedFetchers, updatedKnownBadFetchers };
		};
		for (const fetcher of availableFetchers) {
			const result = await tryFetch(fetcher, url, options, logService);
			if (fetcher === availableFetchers[0]) {
				firstResult = result;
			}
			if (!result.ok) {
				const fetcherId = fetcher.getUserAgentLibrary();
				if ('response' in result) {
					errors.push(result.response.ok
						? `${fetcherId}: invalid-json`
						: `${fetcherId}: ${result.response.status} ${result.response.statusText}`);
				} else {
					const error = sanitizeNetworkErrorForTelemetry(collectSingleLineErrorMessage(result.err, true));
					errors.push(`${fetcherId}: ${error}`);
				}
				if ('response' in result && terminalResponseStatusCodes.has(result.response.status)) {
					recordTerminalResponseErrors(errors);
					if (fetcher === availableFetchers[0]) {
						return { response: result.response };
					}
					return promoteFallbackFetcher(fetcher, result.response);
				}
				updatedKnownBadFetchers.add(fetcherId);
				continue;
			}
			if (fetcher !== availableFetchers[0]) {
				const retry = await tryFetch(availableFetchers[0], url, options, logService);
				if (retry.ok) {
					return { response: retry.response };
				}
				/* __GDPR__
					"fetcherFallback" : {
						"owner": "chrmarti",
						"comment": "Sent when the fetcher service switches to a fallback fetcher due to the primary fetcher failing",
						"newFetcher": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The name of the fetcher that is now being used" },
						"knownBadFetchers": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Comma-separated list of fetchers that are known to be failing" },
						"knownBadFetchersCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "Number of fetchers that are known to be failing" },
						"lastError": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The last error encountered, containing fetcher ID, status code and error message" }
					}
				*/
				telemetryService?.sendTelemetryEvent('fetcherFallback', { github: true, microsoft: true }, {
					newFetcher: fetcher.getUserAgentLibrary(),
					knownBadFetchers: Array.from(updatedKnownBadFetchers).join(','),
					lastError: errors[errors.length - 1],
				}, {
					knownBadFetchersCount: updatedKnownBadFetchers.size,
				});
				return promoteFallbackFetcher(fetcher, result.response);
			}
			return { response: result.response };
		}
		recordAllFetchersFailed(errors);
		if ('response' in firstResult!) {
			return { response: firstResult.response };
		}
		throw firstResult!.err;
	}
	let fetcher = availableFetchers[0];
	if (options.useFetcher) {
		if (knownBadFetchers.has(options.useFetcher)) {
			logService.trace(`FetcherService: not using requested fetcher ${options.useFetcher} as it is known to be failing, using ${fetcher.getUserAgentLibrary()} instead.`);
		} else {
			const configKey = fetcherConfigKeys[options.useFetcher];
			if (configKey && configurationService.inspectConfig(configKey)?.globalValue === false) {
				logService.trace(`FetcherService: not using requested fetcher ${options.useFetcher} as it is disabled in user settings, using ${fetcher.getUserAgentLibrary()} instead.`);
			} else {
				const requestedFetcher = availableFetchers.find(f => f.getUserAgentLibrary() === options.useFetcher);
				if (requestedFetcher) {
					fetcher = requestedFetcher;
					logService.trace(`FetcherService: using ${options.useFetcher} as requested.`);
				} else {
					logService.info(`FetcherService: could not find requested fetcher ${options.useFetcher}, using ${fetcher.getUserAgentLibrary()} instead.`);
				}
			}
		}
	}
	try {
		return { response: await fetcher.fetch(url, options) };
	} catch (err) {
		// For net::ERR_FAILED from network process crash, disconnect and retry once.
		if (fetcher.isNetworkProcessCrashedError(err)) {
			const fetcherId = fetcher.getUserAgentLibrary();
			logService.info(`FetcherService: ${fetcherId} hit network process crash error (${(err as Error)?.message}), retrying after disconnect...`);
			try {
				await fetcher.disconnectAll();
				const response = await fetcher.fetch(url, options);
				logService.info(`FetcherService: ${fetcherId} retry after crash succeeded.`);
				/* __GDPR__
					"fetcherCrashRetry" : {
						"owner": "deepak1556",
						"comment": "Sent when a fetcher retries after a network process crash error",
						"fetcher": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The fetcher that crashed" },
						"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Whether the retry recovered or failed" },
						"error": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The error message" }
					}
				*/
				telemetryService?.sendTelemetryEvent('fetcherCrashRetry', { github: true, microsoft: true }, {
					fetcher: fetcherId,
					outcome: 'recovered',
					error: collectSingleLineErrorMessage(err, true),
				});
				return { response };
			} catch (retryErr) {
				logService.info(`FetcherService: ${fetcherId} retry also failed (${(retryErr as Error)?.message}), checking for demotion...`);
				telemetryService?.sendTelemetryEvent('fetcherCrashRetry', { github: true, microsoft: true }, {
					fetcher: fetcherId,
					outcome: 'failed',
					error: collectSingleLineErrorMessage(retryErr, true),
				});
				err = retryErr;
			}
		}

		// When Electron's network process crashes, it's permanently dead until the extension host restarts.
		// Above, we retry the current request once after disconnecting all connections if this is a crash error.
		// If that retry still fails and crash fallback is enabled, demote the crashed fetcher so future requests use a healthy one.
		// After demotion, the caller is responsible for deciding whether to retry or surface the error.
		const enableCrashFallback = experimentationService
			? configurationService.getExperimentBasedConfig(ConfigKey.TeamInternal.FallbackNodeFetchOnNetworkProcessCrash, experimentationService)
			: false;
		if (enableCrashFallback && fetcher.isNetworkProcessCrashedError(err)) {
			const fetcherId = fetcher.getUserAgentLibrary();
			logService.info(`FetcherService: ${fetcherId} network process crashed. Permanently demoting to avoid future use.`);
			const updatedKnownBadFetchers = new Set(knownBadFetchers);
			updatedKnownBadFetchers.add(fetcherId);
			const updatedFetchers = availableFetchers.filter(f => f !== fetcher);
			if (updatedFetchers.length > 0) {
				updatedFetchers.push(fetcher);
				logService.info(`FetcherService: now using ${updatedFetchers[0].getUserAgentLibrary()} as primary fetcher.`);
			}
			// Attach demotion info to the error so the caller can apply it
			(err as any)._fetcherDemotion = { updatedFetchers: updatedFetchers.length > 0 ? updatedFetchers : undefined, updatedKnownBadFetchers };
		}
		throw err;
	}
}

async function tryFetch(fetcher: IFetcher, url: string, options: FetchOptions, logService: ILogService): Promise<{ ok: boolean; response: Response } | { ok: false; err: any }> {
	try {
		const response = await fetcher.fetch(url, options);
		if (!response.ok) {
			logService.info(`FetcherService: ${fetcher.getUserAgentLibrary()} failed with status: ${response.status} ${response.statusText}`);
			return { ok: false, response };
		}
		if (!options.expectJSON) {
			logService.debug(`FetcherService: ${fetcher.getUserAgentLibrary()} succeeded (not JSON)`);
			return { ok: response.ok, response };
		}
		const text = await response.text();
		try {
			JSON.parse(text); // Verify JSON
			logService.debug(`FetcherService: ${fetcher.getUserAgentLibrary()} succeeded (JSON)`);
			return { ok: true, response: Response.fromText(response.status, response.statusText, response.headers, text, response.fetcher) };
		} catch (err) {
			logService.info(`FetcherService: ${fetcher.getUserAgentLibrary()} failed to parse JSON: ${err.message}`);
			return { ok: false, err, response: Response.fromText(response.status, response.statusText, response.headers, text, response.fetcher) };
		}
	} catch (err) {
		logService.info(`FetcherService: ${fetcher.getUserAgentLibrary()} failed with error: ${err.message}`);
		return { ok: false, err };
	}
}
