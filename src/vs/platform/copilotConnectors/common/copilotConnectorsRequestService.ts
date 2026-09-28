/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, raceCancellationError } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { listenStream } from '../../../base/common/stream.js';
import { IRequestContext, IRequestOptions } from '../../../base/parts/request/common/request.js';
import { localize } from '../../../nls.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IRequestService } from '../../request/common/request.js';

const requestTimeout = 30_000;
const maxResponseBytes = 5 * 1024 * 1024;

export const copilotConnectorsScope = 'write:plugin_gateway_connections';

export type CopilotConnectorsRequest =
	| { readonly type: 'query' }
	| { readonly type: 'connect' | 'disconnect'; readonly name: string };

export const ICopilotConnectorsRequestService = createDecorator<ICopilotConnectorsRequestService>('copilotConnectorsRequestService');

export interface ICopilotConnectorsRequestService {
	readonly _serviceBrand: undefined;
	request(request: CopilotConnectorsRequest, accessToken: string, token: CancellationToken): Promise<unknown>;
}

export class CopilotConnectorsError extends Error {
	constructor(message: string, readonly statusCode?: number) {
		super(message);
	}
}

// TODO: Replace this pre-session HTTP adapter when the Copilot SDK exposes client-scoped Connector management with rich catalog metadata.
export class CopilotConnectorsRequestService implements ICopilotConnectorsRequestService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IRequestService private readonly requestService: IRequestService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService,
	) { }

	async request(request: CopilotConnectorsRequest, accessToken: string, token: CancellationToken): Promise<unknown> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const store = new DisposableStore();
		const cancellation = store.add(new CancellationTokenSource(token));
		store.add(disposableTimeout(() => cancellation.cancel(), requestTimeout));
		try {
			return await this.doRequest(request, accessToken, cancellation.token);
		} catch (error) {
			if (!token.isCancellationRequested && cancellation.token.isCancellationRequested) {
				const timeoutError = new CopilotConnectorsError(localize('copilotConnectors.timeout', "The Copilot connectors request timed out. Try again."));
				this.logService.error('[CopilotConnectorsService] Request failed', timeoutError);
				throw timeoutError;
			}
			throw error;
		} finally {
			store.dispose();
		}
	}

	private async doRequest(request: CopilotConnectorsRequest, accessToken: string, token: CancellationToken): Promise<unknown> {
		const endpoint = this.productService.defaultChatAgent?.mcpConnectorsUrl;
		let endpointUrl: URL | undefined;
		try {
			endpointUrl = endpoint ? new URL(endpoint) : undefined;
		} catch {
			// Invalid product configuration is reported below.
		}
		if (!endpointUrl || endpointUrl.protocol !== `${Schemas.https}:` || endpointUrl.username || endpointUrl.password || endpointUrl.search || endpointUrl.hash) {
			throw new CopilotConnectorsError(localize('copilotConnectors.unavailable', "Copilot connectors are not available in this product."));
		}
		const method = request.type === 'query' ? 'GET' : request.type === 'connect' ? 'PUT' : 'DELETE';
		const path = request.type === 'query' ? '/plugins' : `/connectors/managed/${encodeURIComponent(request.name)}/connection`;
		const options: IRequestOptions = {
			url: `${endpointUrl.toString().replace(/\/+$/, '')}${path}`,
			type: method,
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${accessToken}`,
				...(request.type === 'connect' ? { 'Content-Type': 'application/json' } : {}),
			},
			data: request.type === 'connect' ? JSON.stringify({ client_source: 'VS_CODE' }) : undefined,
			timeout: requestTimeout,
			followRedirects: 0,
			disableCache: true,
			callSite: `copilotConnectors.${request.type}`,
		};
		let context: IRequestContext;
		try {
			context = await this.requestService.request(options, token);
		} catch (error) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			this.logService.error('[CopilotConnectorsService] Request failed', error);
			throw new CopilotConnectorsError(localize('copilotConnectors.requestFailed', "Copilot connectors could not be reached. Check your connection and try again."));
		}
		try {
			const status = context.res.statusCode ?? 0;
			if (status < 200 || status >= 300) {
				throw new CopilotConnectorsError(localize('copilotConnectors.httpError', "Copilot connectors could not complete the request (HTTP {0}).", status), status);
			}
			if (status === 204) {
				return undefined;
			}
			const text = await raceCancellationError(readResponse(context), token);
			try {
				return text ? JSON.parse(text) : undefined;
			} catch {
				throw new CopilotConnectorsError(localize('copilotConnectors.invalidJson', "Copilot connectors returned an invalid response."));
			}
		} catch (error) {
			if (!(error instanceof CancellationError)) {
				this.logService.error('[CopilotConnectorsService] Request failed', error);
			}
			throw error;
		} finally {
			context.stream.destroy();
		}
	}
}

function readResponse(context: IRequestContext): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: VSBuffer[] = [];
		let bytes = 0;
		listenStream(context.stream, {
			onData: chunk => {
				bytes += chunk.byteLength;
				if (bytes > maxResponseBytes) {
					reject(new CopilotConnectorsError(localize('copilotConnectors.responseTooLarge', "The Copilot connectors response is too large.")));
					context.stream.destroy();
				} else {
					chunks.push(chunk);
				}
			},
			onError: reject,
			onEnd: () => resolve(VSBuffer.concat(chunks).toString()),
		});
	});
}
