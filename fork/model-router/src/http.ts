/*---------------------------------------------------------------------------------------------
 *  Fork model router. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { errorFromResponse, isAbortError, ModelRouterError } from './errors.ts';
import { API_FORMATS, type FetchLike, type ModelConfig } from './types.ts';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function isLocalHost(hostname: string): boolean {
	return LOCAL_HOSTS.has(hostname) || hostname.endsWith('.localhost');
}

/** HTTPS is required; plain HTTP only for models running on this machine. */
export function parseBaseUrl(raw: string): URL {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		throw new ModelRouterError('invalid_config', `"${raw}" is not a valid URL.`);
	}
	if (url.protocol === 'https:' || (url.protocol === 'http:' && isLocalHost(url.hostname))) {
		return url;
	}
	throw new ModelRouterError('invalid_config', 'Endpoint URLs must use HTTPS. Plain HTTP is allowed only for localhost.');
}

/** Appends a path to the base URL's path, keeping its query string (Azure puts api-version there). */
export function joinPath(base: URL, path: string): URL {
	const url = new URL(base.toString());
	url.pathname = base.pathname.replace(/\/+$/, '') + path;
	return url;
}

export function basePath(base: URL): string {
	return base.pathname.replace(/\/+$/, '');
}

export function validateConfig(config: ModelConfig): void {
	if (!API_FORMATS.includes(config.apiFormat)) {
		throw new ModelRouterError('invalid_config', `Unknown API format "${config.apiFormat}". Use one of: ${API_FORMATS.join(', ')}.`);
	}
	if (!config.model || !config.model.trim()) {
		throw new ModelRouterError('invalid_config', 'A model name is required.');
	}
	if (!config.id) {
		throw new ModelRouterError('invalid_config', 'A model id is required.');
	}
	parseBaseUrl(config.baseUrl);
}

/** Sends a request and turns transport failures and error statuses into ModelRouterErrors. */
export async function send(fetchFn: FetchLike, url: URL, init: RequestInit): Promise<Response> {
	let response: Response;
	try {
		response = await fetchFn(url.toString(), init);
	} catch (error) {
		if (isAbortError(error) || init.signal?.aborted) {
			throw new ModelRouterError('aborted', 'The request was cancelled.');
		}
		const message = error instanceof Error ? error.message : String(error);
		throw new ModelRouterError('network', `Could not reach ${url.host}: ${message}`);
	}
	if (!response.ok) {
		throw await errorFromResponse(response);
	}
	return response;
}

/** Like send, but insists on a streamed body. */
export async function sendStreaming(fetchFn: FetchLike, url: URL, init: RequestInit): Promise<ReadableStream<Uint8Array>> {
	const response = await send(fetchFn, url, init);
	const contentType = response.headers.get('content-type') ?? '';
	if (contentType.includes('application/json')) {
		throw new ModelRouterError('protocol', 'The endpoint answered without streaming. Check that the URL points at a chat API that supports streaming.');
	}
	if (!response.body) {
		throw new ModelRouterError('protocol', 'The endpoint returned an empty response.');
	}
	return response.body;
}

export async function getJson(fetchFn: FetchLike, url: URL, headers: Record<string, string>): Promise<Record<string, unknown>> {
	const response = await send(fetchFn, url, { method: 'GET', headers });
	try {
		return await response.json() as Record<string, unknown>;
	} catch {
		throw new ModelRouterError('protocol', 'The model list is not valid JSON.');
	}
}

export function jsonPost(headers: Record<string, string>, body: unknown, signal: AbortSignal | undefined): RequestInit {
	return {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'text/event-stream', ...headers },
		body: JSON.stringify(body),
		signal,
	};
}
