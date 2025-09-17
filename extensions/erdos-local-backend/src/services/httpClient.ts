/*---------------------------------------------------------------------------------------------
 * Copyright (c) Lotas Inc. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as https from 'https';
import * as http from 'http';

export interface HttpResponse {
	ok: boolean;
	status: number;
	statusText: string;
	body(): Promise<NodeJS.ReadableStream>;
}

export interface HttpOptions {
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
	headers?: Record<string, string>;
	body?: string;
	signal?: AbortSignal;
}

class HttpResponseImpl implements HttpResponse {
	public readonly ok: boolean;
	
	constructor(
		public readonly status: number,
		public readonly statusText: string,
		private readonly stream: NodeJS.ReadableStream
	) {
		this.ok = this.status >= 200 && this.status < 300;
	}

	async body(): Promise<NodeJS.ReadableStream> {
		return this.stream;
	}
}

// Try electron.net.fetch first, fallback to Node.js https
let electronFetch: any;
try {
	electronFetch = require('electron').net.fetch;
} catch {
	electronFetch = null;
}

export async function httpRequest(url: string, options: HttpOptions = {}): Promise<HttpResponse> {
	// Try electron.net.fetch first if available (bypasses CORS)
	if (electronFetch) {
		try {
			const response = await electronFetch(url, {
				method: options.method || 'GET',
				headers: options.headers,
				body: options.body,
				signal: options.signal
			});
			
			return {
				ok: response.ok,
				status: response.status,
				statusText: response.statusText,
				body: async () => {
					// Convert Web ReadableStream to Node.js stream for consistent interface
					const webStream = response.body;
					if (!webStream) {
						throw new Error('Response body is null');
					}
					
					// Use Node.js built-in method to convert Web ReadableStream to Node.js Readable
					const { Readable } = require('stream');
					return Readable.fromWeb(webStream);
				}
			};
		} catch (error) {
			// Fall back to Node.js if electron fetch fails
		}
	}

	// Node.js https fallback
	return new Promise((resolve, reject) => {
		const urlObj = new URL(url);
		const module = urlObj.protocol === 'https:' ? https : http;
		
		const req = module.request(url, {
			method: options.method || 'GET',
			headers: options.headers
		}, (res) => {
			resolve(new HttpResponseImpl(
				res.statusCode || 0,
				res.statusMessage || '',
				res
			));
		});

		req.setTimeout(60 * 1000);
		req.on('error', reject);
		
		if (options.signal) {
			options.signal.addEventListener('abort', () => {
				req.destroy();
				reject(new Error('Request aborted'));
			});
		}

		if (options.body) {
			req.write(options.body);
		}
		req.end();
	});
}