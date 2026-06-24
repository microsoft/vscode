/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { FetchResponse } from '../../src/platform/nesFetch/node/completionsFetchServiceImpl';
import { getRequestId } from '../../src/platform/networking/common/fetch';
import { IHeaders, ReportFetchEvent, Response } from '../../src/platform/networking/common/fetcherService';
import { AsyncIterableObject } from '../../src/util/vs/base/common/async';
import { SQLiteSlottedCache } from './cache';
import { CachedResponseMetadata } from './cachingChatMLFetcher';
import { CacheableCompletionRequest } from './cachingCompletionsFetchService';
import { CurrentTestRunInfo } from './simulationContext';

export interface ICacheableCompletionsResponse {
	readonly requestId: string;
	readonly cacheMetadata: CachedResponseMetadata;
	readonly status: number;
	readonly statusText: string;
	readonly body: string;
}

export namespace ICacheableCompletionsResponse {

	export function create(requestId: string, cacheMetadata: CachedResponseMetadata, status: number, statusText: string, body: string): ICacheableCompletionsResponse {
		return { requestId, cacheMetadata, status, statusText, body };
	}

	export function isICacheableResponse(obj: unknown): obj is ICacheableCompletionsResponse {
		return (
			typeof obj === 'object' &&
			obj !== null &&
			'requestId' in obj &&
			typeof (obj as any).requestId === 'string' &&
			'cacheMetadata' in obj &&
			CachedResponseMetadata.isCachedResponseMetadata((obj as any).cacheMetadata) &&
			'status' in obj &&
			typeof (obj as any).status === 'number' &&
			'statusText' in obj &&
			typeof (obj as any).statusText === 'string' &&
			'body' in obj &&
			typeof (obj as any).body === 'string'
		);
	}

	export function toFetchResponse(v: ICacheableCompletionsResponse): FetchResponse {
		// @ulugbekna: currently, if we don't chunk up, the streaming logic errors out if the stream eventually errored (eg "response too long"),
		// 	but we want to be able to capture edits proposed before the error
		const bodyStream = stringToChunkedStream(v.body, 512 /* arbitrary chunk size to hit fast/correct balance */);

		const headers = new Headers(); // @ulugbekna: we don't use headers, so this should be ok for now

		const response = emptyFetcherResponse(headers);

		return {
			status: v.status,
			statusText: v.statusText,
			body: bodyStream,
			headers,
			requestId: getRequestId(headers),
			response,
		};
	}

	function stringToChunkedStream(str: string, chunkSize: number) {
		return new AsyncIterableObject<string>(emitter => {
			for (let i = 0; i < str.length; i += chunkSize) {
				emitter.emitOne(str.slice(i, i + chunkSize));
			}
		});
	}
}

export interface ICompletionsCache {
	get(req: CacheableCompletionRequest, cacheSlot: number): Promise<ICacheableCompletionsResponse | undefined>;
	set(req: CacheableCompletionRequest, cacheSlot: number, cachedResponse: ICacheableCompletionsResponse): Promise<void>;
}

export class CompletionsSQLiteCache extends SQLiteSlottedCache<CacheableCompletionRequest, ICacheableCompletionsResponse> implements ICompletionsCache {
	constructor(salt: string, info: CurrentTestRunInfo) {
		super('completions', salt, info);
	}
}

export function emptyFetcherResponse(headers: IHeaders, reportEvent: ReportFetchEvent = () => { }): Response {
	return new Response(
		200,
		'',
		headers,
		null,
		'electron-fetch',
		reportEvent,
		'test',
		'test',
	);
}
