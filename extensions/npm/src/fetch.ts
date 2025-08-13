/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface XHROptions {
	type?: string;
	url: string;
	user?: string;
	password?: string;
	headers?: { [header: string]: string | string[] | undefined };
	timeout?: number;
	data?: string;
	strictSSL?: boolean;
	followRedirects?: number;
}

export interface XHRResponse {
	readonly responseText: string;
	readonly body: Uint8Array;
	readonly status: number;
	readonly headers: { [header: string]: string | string[] | undefined };
}

export interface XHRRequest {
	(options: XHROptions): Promise<XHRResponse>;
}

/**
 * A fetch-based implementation of XHRRequest interface
 */
export function createXHRRequest(): XHRRequest {
	return async function xhr(options: XHROptions): Promise<XHRResponse> {
		const method = options.type || 'GET';
		const url = options.url;
		
		const fetchOptions: RequestInit = {
			method,
			headers: normalizeHeaders(options.headers),
		};

		// Add data for POST/PUT requests
		if (options.data && (method === 'POST' || method === 'PUT')) {
			fetchOptions.body = options.data;
		}

		// Handle basic auth
		if (options.user && options.password) {
			const auth = btoa(`${options.user}:${options.password}`);
			fetchOptions.headers = {
				...fetchOptions.headers,
				'Authorization': `Basic ${auth}`
			};
		}

		// Add timeout using AbortController
		let timeoutId: NodeJS.Timeout | undefined;
		if (options.timeout) {
			const controller = new AbortController();
			fetchOptions.signal = controller.signal;
			timeoutId = setTimeout(() => controller.abort(), options.timeout);
		}

		try {
			const response = await fetch(url, fetchOptions);
			
			if (timeoutId) {
				clearTimeout(timeoutId);
			}

			const responseText = await response.text();
			const body = new TextEncoder().encode(responseText);
			
			const responseHeaders: { [header: string]: string } = {};
			response.headers.forEach((value, key) => {
				responseHeaders[key] = value;
			});

			return {
				responseText,
				body,
				status: response.status,
				headers: responseHeaders
			};
		} catch (error) {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
			throw error;
		}
	};
}

function normalizeHeaders(headers?: { [header: string]: string | string[] | undefined }): Record<string, string> {
	const normalized: Record<string, string> = {};
	if (headers) {
		for (const [key, value] of Object.entries(headers)) {
			if (value !== undefined) {
				let headerName = key;
				// Handle special case: convert 'agent' to 'User-Agent'
				if (key === 'agent') {
					headerName = 'User-Agent';
				}
				
				if (Array.isArray(value)) {
					normalized[headerName] = value.join(', ');
				} else {
					normalized[headerName] = value;
				}
			}
		}
	}
	return normalized;
}

/**
 * No-op configure function for compatibility
 */
export function configure(_proxyUrl: string | undefined, _strictSSL: boolean): void {
	// No-op: native fetch doesn't support proxy configuration through this interface
	// Proxy settings should be handled at the system level
}

/**
 * Create the xhr function instance
 */
export const xhr = createXHRRequest();