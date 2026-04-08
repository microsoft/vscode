/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { Config, ConfigKey, ExperimentBasedConfig, ExperimentBasedConfigType, IConfigurationService } from '../../configuration/common/configurationService';
import { IEnvService } from '../../env/common/envService';
import { ILogService } from '../../log/common/logService';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { ITelemetryService } from '../../telemetry/common/telemetry';
import { FetchEvent, FetchOptions, FetchTelemetryEvent, IAbortController, IFetcherService, NO_FETCH_TELEMETRY, PaginationOptions, ReportFetchEvent, Response, safeGetHostname, WebSocketConnection, WebSocketConnectOptions } from '../common/fetcherService';
import { IFetcher } from '../common/networking';
import { fetchWithFallbacks } from '../node/fetcherFallback';
import { NodeFetcher } from '../node/nodeFetcher';
import { createWebSocket, NodeFetchFetcher } from '../node/nodeFetchFetcher';
import { ElectronFetcher } from './electronFetcher';

export class FetcherService extends Disposable implements IFetcherService {

	declare readonly _serviceBrand: undefined;
	private _availableFetchers: readonly IFetcher[] | undefined;
	private _knownBadFetchers = new Set<string>();
	private _experimentationService: IExperimentationService | undefined;
	private _telemetryService: ITelemetryService | undefined;
	private readonly _onDidFetch = this._register(new Emitter<FetchEvent>());
	readonly onDidFetch = this._onDidFetch.event;
	private readonly _onDidCompleteFetch = this._register(new Emitter<FetchTelemetryEvent>());
	readonly onDidCompleteFetch = this._onDidCompleteFetch.event;

	constructor(
		fetcher: IFetcher | undefined,
		@ILogService private readonly _logService: ILogService,
		@IEnvService private readonly _envService: IEnvService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		this._availableFetchers = fetcher ? [fetcher] : undefined;
	}

	async fetchWithPagination<T>(baseUrl: string, options: PaginationOptions<T>): Promise<T[]> {
		const items: T[] = [];
		const pageSize = options.pageSize ?? 20;
		let page = options.startPage ?? 1;
		let hasNextPage = false;

		do {
			const url = options.buildUrl(baseUrl, pageSize, page);
			const response = await this.fetch(url, options);

			if (!response.ok) {
				// Return what we've collected so far if request fails
				return items;
			}

			const data = await response.json();
			const pageItems = options.getItemsFromResponse(data);
			items.push(...pageItems);

			hasNextPage = pageItems.length === pageSize;
			page++;
		} while (hasNextPage);

		return items;
	}

	setExperimentationService(experimentationService: IExperimentationService) {
		this._experimentationService = experimentationService;
	}

	setTelemetryService(telemetryService: ITelemetryService) {
		this._telemetryService = telemetryService;
	}

	private _getAvailableFetchers(): readonly IFetcher[] {
		if (!this._availableFetchers) {
			if (!this._experimentationService) {
				this._logService.info('FetcherService: Experimentation service not available yet, using default fetcher configuration.');
			} else {
				this._logService.debug('FetcherService: Using experimentation service to determine fetcher configuration.');
			}
			this._availableFetchers = this._getFetchers(this._configurationService, this._experimentationService, this._envService);
		}
		return this._availableFetchers;
	}

	private _getFetchers(configurationService: IConfigurationService, experimentationService: IExperimentationService | undefined, envService: IEnvService): IFetcher[] {
		const reportEvent: ReportFetchEvent = e => this._onDidFetch.fire(e);
		const useElectronFetcher = getShadowedConfig<boolean>(configurationService, experimentationService, ConfigKey.Shared.DebugUseElectronFetcher, ConfigKey.TeamInternal.DebugExpUseElectronFetcher);
		const electronFetcher = ElectronFetcher.create(envService, reportEvent);
		const useNodeFetcher = !(useElectronFetcher && electronFetcher) && getShadowedConfig<boolean>(configurationService, experimentationService, ConfigKey.Shared.DebugUseNodeFetcher, ConfigKey.TeamInternal.DebugExpUseNodeFetcher); // Node https wins over Node fetch. (historical order)
		const useNodeFetchFetcher = !(useElectronFetcher && electronFetcher) && !useNodeFetcher && getShadowedConfig<boolean>(configurationService, experimentationService, ConfigKey.Shared.DebugUseNodeFetchFetcher, ConfigKey.TeamInternal.DebugExpUseNodeFetchFetcher);

		const fetchers = [];
		if (electronFetcher) {
			fetchers.push(electronFetcher);
		}
		if (useElectronFetcher) {
			if (electronFetcher) {
				this._logService.info(`Using the Electron fetcher.`);
			} else {
				this._logService.info(`Can't use the Electron fetcher in this environment.`);
			}
		}

		// Node fetch preferred over Node https in fallbacks. (HTTP2 support)
		const nodeFetchFetcher = new NodeFetchFetcher(envService, reportEvent);
		if (useNodeFetchFetcher) {
			this._logService.info(`Using the Node fetch fetcher.`);
			fetchers.unshift(nodeFetchFetcher);
		} else {
			fetchers.push(nodeFetchFetcher);
		}

		const nodeFetcher = new NodeFetcher(envService, reportEvent);
		if (useNodeFetcher || (!(useElectronFetcher && electronFetcher) && !useNodeFetchFetcher)) { // Node https used when none is configured. (historical)
			this._logService.info(`Using the Node fetcher.`);
			fetchers.unshift(nodeFetcher);
		} else {
			fetchers.push(nodeFetcher);
		}

		return fetchers;
	}

	getUserAgentLibrary(): string {
		return this._getAvailableFetchers()[0].getUserAgentLibrary();
	}

	createWebSocket(url: string, options?: WebSocketConnectOptions): WebSocketConnection {
		if (options?.headers) {
			delete options.headers['Request-Hmac'];
			options.headers['Copilot-Integration-Id'] = 'vscode-chat';
		}
		return createWebSocket(url, options);
	}

	async fetch(url: string, options: FetchOptions): Promise<Response> {
		const start = Date.now();
		try {
			const { response: res, updatedFetchers, updatedKnownBadFetchers } = await fetchWithFallbacks(this._getAvailableFetchers(), url, options, this._knownBadFetchers, this._configurationService, this._logService, this._telemetryService, this._experimentationService);
			if (updatedFetchers) {
				this._availableFetchers = updatedFetchers;
			}
			if (updatedKnownBadFetchers) {
				this._knownBadFetchers = updatedKnownBadFetchers;
			}
			if (options.callSite !== NO_FETCH_TELEMETRY) {
				this._onDidCompleteFetch.fire({
					callSite: options.callSite,
					hostname: safeGetHostname(url),
					latencyMs: Date.now() - start,
					statusCode: res.status,
					success: res.ok,
				});
			}
			return res;
		} catch (err) {
			// Apply fetcher demotion if fetchWithFallbacks detected a network process crash
			const demotion = (err as any)?._fetcherDemotion;
			if (demotion) {
				if (demotion.updatedFetchers) {
					this._availableFetchers = demotion.updatedFetchers;
				}
				if (demotion.updatedKnownBadFetchers) {
					this._knownBadFetchers = demotion.updatedKnownBadFetchers;
				}
			}
			if (options.callSite !== NO_FETCH_TELEMETRY) {
				this._onDidCompleteFetch.fire({
					callSite: options.callSite,
					hostname: safeGetHostname(url),
					latencyMs: Date.now() - start,
					statusCode: undefined,
					success: false,
				});
			}
			throw err;
		}
	}

	disconnectAll(): Promise<unknown> {
		return this._getAvailableFetchers()[0].disconnectAll();
	}
	makeAbortController(): IAbortController {
		return this._getAvailableFetchers()[0].makeAbortController();
	}
	isAbortError(e: any): boolean {
		return this._getAvailableFetchers()[0].isAbortError(e);
	}
	isInternetDisconnectedError(e: any): boolean {
		return this._getAvailableFetchers()[0].isInternetDisconnectedError(e);
	}
	isFetcherError(e: any): boolean {
		return !!e?.fetcherId || this._getAvailableFetchers().some(f => f.isFetcherError(e));
	}
	isNetworkProcessCrashedError(e: any): boolean {
		return this._getAvailableFetchers().some(f => f.isNetworkProcessCrashedError(e));
	}
	getUserMessageForFetcherError(err: any): string {
		// Use the fetcher that recognizes the error, falling back to the primary
		const recognizing = this._getAvailableFetchers().find(f => f.isFetcherError(err));
		return (recognizing ?? this._getAvailableFetchers()[0]).getUserMessageForFetcherError(err);
	}
}

export function getShadowedConfig<T extends ExperimentBasedConfigType>(configurationService: IConfigurationService, experimentationService: IExperimentationService | undefined, configKey: Config<T>, expKey: ExperimentBasedConfig<T | undefined>): T {
	if (!experimentationService) {
		return configurationService.getConfig<T>(configKey);
	}

	const inspect = configurationService.inspectConfig<T>(configKey);
	if (inspect?.globalValue !== undefined) {
		return inspect.globalValue;
	}
	const expValue = configurationService.getExperimentBasedConfig(expKey, experimentationService);
	if (expValue !== undefined) {
		return expValue;
	}
	return configurationService.getConfig<T>(configKey);
}
