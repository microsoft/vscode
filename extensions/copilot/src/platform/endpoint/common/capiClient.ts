/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CAPIClient, MakeRequestOptions, RequestMetadata, RequestType } from '@vscode/copilot-api';
import { createServiceIdentifier } from '../../../util/common/services';
import { IEnvService } from '../../env/common/envService';
import { IFetcherService, NO_FETCH_TELEMETRY } from '../../networking/common/fetcherService';
import type { FetchOptions, Response } from '../../networking/common/fetcherService';
import { getConfiguredProxyUrl, isLLMEndpoint, maybeInterceptUrlThroughProxy } from '../../networking/common/proxyUtils';
import { LICENSE_AGREEMENT } from './licenseAgreement';

/**
 * Interface for CAPI client service
 */
export interface ICAPIClientService extends CAPIClient {
	readonly _serviceBrand: undefined;
	abExpContext: string | undefined;
}

class ProxyInterceptingFetcherService implements IFetcherService {
	declare readonly _serviceBrand: undefined;

	constructor(private readonly _inner: IFetcherService) { }

	get onDidFetch() { return this._inner.onDidFetch; }
	get onDidCompleteFetch() { return this._inner.onDidCompleteFetch; }
	getUserAgentLibrary() { return this._inner.getUserAgentLibrary(); }
	disconnectAll() { return this._inner.disconnectAll(); }
	makeAbortController() { return this._inner.makeAbortController(); }
	isAbortError(e: any) { return this._inner.isAbortError(e); }
	isInternetDisconnectedError(e: any) { return this._inner.isInternetDisconnectedError(e); }
	isFetcherError(e: any) { return this._inner.isFetcherError(e); }
	isNetworkProcessCrashedError(e: any) { return this._inner.isNetworkProcessCrashedError(e); }
	getUserMessageForFetcherError(err: any) { return this._inner.getUserMessageForFetcherError(err); }
	fetchWithPagination<T>(baseUrl: string, options: any) { return this._inner.fetchWithPagination<T>(baseUrl, options); }
	createWebSocket(url: string, options?: any) { return this._inner.createWebSocket(url, options); }

	fetch(url: string, options: FetchOptions): Promise<Response> {
		const proxyUrl = getConfiguredProxyUrl();
		if (proxyUrl && isLLMEndpoint(url)) {
			const headers: Record<string, string> = { ...(options.headers as Record<string, string> ?? {}) };
			url = maybeInterceptUrlThroughProxy(url, proxyUrl, headers);
			options = { ...options, headers };
		}
		return this._inner.fetch(url, options);
	}
}

export abstract class BaseCAPIClientService extends CAPIClient implements ICAPIClientService {
	readonly _serviceBrand: undefined;
	public abExpContext: string | undefined;

	constructor(
		hmac: string | undefined,
		integrationId: string | undefined,
		fetcherService: IFetcherService,
		envService: IEnvService
	) {
		const proxyUrl = getConfiguredProxyUrl();
		const effectiveFetcher = proxyUrl ? new ProxyInterceptingFetcherService(fetcherService) : fetcherService;
		super({
			machineId: envService.machineId,
			deviceId: envService.devDeviceId,
			sessionId: envService.sessionId,
			vscodeVersion: envService.vscodeVersion,
			buildType: envService.getBuildType(),
			name: envService.getName(),
			version: envService.getVersion(),
		}, LICENSE_AGREEMENT, effectiveFetcher, hmac, integrationId);
	}

	override makeRequest<T>(request: MakeRequestOptions, requestMetadata: RequestMetadata): Promise<T> {
		// Inject AB Exp Context headers (legacy VScode-ABExpContext and new standardized X-Copilot-Client-Exp-Assignment-Context) if available
		if (this.abExpContext) {
			if (!request.headers) {
				request.headers = {};
			}
			request.headers['VScode-ABExpContext'] = this.abExpContext;
			request.headers['X-Copilot-Client-Exp-Assignment-Context'] = this.abExpContext;
		}
		// Expected high request volume events that we don't need to collect fetch telemetry for
		if (
			requestMetadata.type === RequestType.Telemetry ||
			requestMetadata.type === RequestType.ChatCompletions ||
			requestMetadata.type === RequestType.ChatMessages ||
			requestMetadata.type === RequestType.ChatResponses
		) {
			request.callSite = NO_FETCH_TELEMETRY;
		}
		return super.makeRequest<T>(request, requestMetadata);
	}
}
export const ICAPIClientService = createServiceIdentifier<ICAPIClientService>('ICAPIClientService');