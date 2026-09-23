/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IHttpRequest {
	readonly url: string;
	readonly method: 'GET' | 'POST';
	readonly headers: Record<string, string>;
	readonly body?: string;
	/**
	 * Whether this request may be re-sent through the other fetchers when one of them cannot make
	 * it. Safe for a read, and often the only way through a restricted network. Not safe for a
	 * request the server may already have acted on by the time it looks like it failed.
	 */
	readonly retryFallbacks: boolean;
}

export interface IHttpResponse {
	readonly ok: boolean;
	readonly status: number;
	readonly statusText: string;
	json(): Promise<unknown>;
}

/** Puts a request on the wire. Injected so tests drive a flow without reaching the network. */
export interface IHttpClient {
	send(request: IHttpRequest): Promise<IHttpResponse>;
}
