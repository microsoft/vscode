/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotNamedAnnotationList } from '../../../../../../platform/completions-core/common/openai/copilotAnnotations';
import { Completions, ICompletionsFetchService } from '../../../../../../platform/nesFetch/common/completionsFetchService';
import { ResponseStream } from '../../../../../../platform/nesFetch/common/responseStream';
import { jsonlStreamToCompletions } from '../../../../../../platform/nesFetch/node/streamTransformer';
import { HeadersImpl } from '../../../../../../platform/networking/common/fetcherService';
import { Result } from '../../../../../../util/common/result';
import { CancellationToken } from '../../../../../../util/vs/base/common/cancellation';
import { FetchOptions, IAbortController, ICompletionsFetcherService, IHeaders, Response } from '../networking';

type HeadersParameter = { [key: string]: string };

export function createFakeResponse(statusCode: number, response?: string, headers?: HeadersParameter) {
	const fakeHeaders = new FakeHeaders();
	fakeHeaders.set('x-github-request-id', '1');
	for (const [key, value] of Object.entries(headers || {})) {
		fakeHeaders.set(key, value);
	}
	return Response.fromText(
		statusCode,
		'status text',
		fakeHeaders,
		response ?? '',
		'test-stub'
	);
}

export function createFakeJsonResponse(statusCode: number, response: string | object, headers?: HeadersParameter) {
	let text: string;
	if (typeof response === 'string') {
		text = response;
	} else {
		text = JSON.stringify(response);
	}
	return createFakeResponse(statusCode, text, Object.assign({ 'content-type': 'application/json' }, headers));
}

export function createFakeStreamResponse(body: string): Response {
	return Response.fromText(
		200,
		'Success',
		new FakeHeaders(),
		body,
		'test-stub'
	);
}

export function createFakeCompletionResponse(
	completionText: string | string[],
	options?: { annotations?: CopilotNamedAnnotationList }
): Response {
	const now = Math.floor(Date.now() / 1000);
	if (typeof completionText === 'string') {
		completionText = [completionText];
	}
	const choices = completionText.map((text, i) => ({
		text,
		index: i,
		finishReason: 'stop',
		logprobs: null,
		copilot_annotations: options?.annotations,
		p: 'aaaaaa',
	}));
	const responseObject = {
		id: 'cmpl-AaZz1234',
		created: now,
		model: 'unit-test',
		choices,
	};
	const responseLines = [JSON.stringify(responseObject), `[DONE]`];
	return createFakeStreamResponse(responseLines.map(l => `data: ${l}\n`).join(''));
}

export function fakeCodeReference(
	startOffset: number = 0,
	stopOffset: number = 1,
	license: string = 'MIT',
	url: string = 'https://github.com/github/example'
): CopilotNamedAnnotationList {
	return {
		ip_code_citations: [
			{
				id: 5,
				start_offset: startOffset,
				stop_offset: stopOffset,
				details: {
					citations: [
						{
							url,
							license,
						},
					],
				},
			},
		],
	};
}

export abstract class FakeFetcher implements ICompletionsFetcherService {
	declare _serviceBrand: undefined;

	abstract fetch(url: string, options: FetchOptions): Promise<Response>;
	getImplementation(): ICompletionsFetcherService | Promise<ICompletionsFetcherService> {
		return this;
	}
	disconnectAll(): Promise<unknown> {
		throw new Error('Method not implemented.');
	}
}

type FakeResponseGenerator = (url: string, options: FetchOptions) => Response | Promise<Response>;
const SuccessResponseGenerator: FakeResponseGenerator = () => createFakeResponse(200);

export class StaticFetcher extends FakeFetcher {
	constructor(private createResponse: FakeResponseGenerator = SuccessResponseGenerator) {
		super();
	}

	headerBuffer: { [name: string]: string } | undefined;

	fetch(url: string, options: FetchOptions): Promise<Response> {
		this.headerBuffer = options.headers;
		return Promise.resolve(this.createResponse(url, options));
	}
}

export class NoFetchFetcher extends FakeFetcher {
	fetch(url: string, options: FetchOptions): Promise<Response> {
		throw new Error('NoFetchFetcher does not support fetching');
	}
}

class FakeHeaders implements IHeaders {
	private readonly headers: Map<string, string> = new Map();

	append(name: string, value: string): void {
		this.headers.set(name.toLowerCase(), value);
	}
	delete(name: string): void {
		this.headers.delete(name.toLowerCase());
	}
	get(name: string): string | null {
		return this.headers.get(name.toLowerCase()) ?? null;
	}
	has(name: string): boolean {
		return this.headers.has(name.toLowerCase());
	}
	set(name: string, value: string): void {
		this.headers.set(name.toLowerCase(), value);
	}
	entries(): Iterator<[string, string]> {
		return this.headers.entries();
	}
	keys(): Iterator<string> {
		return this.headers.keys();
	}
	values(): Iterator<string> {
		return this.headers.values();
	}
	[Symbol.iterator](): Iterator<[string, string]> {
		return this.headers.entries();
	}
}

export class FakeAbortController implements IAbortController {
	readonly signal = { aborted: false, addEventListener: () => { }, removeEventListener: () => { } };
	abort(): void {
		this.signal.aborted = true;
	}
}

/**
 * Adapts a `StaticFetcher` (which returns raw SSE `Response` objects) into an
 * `ICompletionsFetchService` for tests that use `LiveOpenAIFetcher` (v2).
 */
export class StaticCompletionsFetchService implements ICompletionsFetchService {
	declare _serviceBrand: undefined;
	constructor(private readonly fetcher: FakeFetcher) { }
	async fetch(
		url: string,
		_secretKey: string,
		params: Completions.ModelParams,
		requestId: string,
		ct: CancellationToken,
		headerOverrides?: Record<string, string>
	): Promise<Result<ResponseStream, Completions.CompletionsFetchFailure>> {
		if (ct.isCancellationRequested) {
			return Result.error(new Completions.RequestCancelled());
		}
		const options: FetchOptions = {
			callSite: 'test',
			method: 'POST',
			headers: headerOverrides ?? {},
			json: { ...params, stream: true },
		};
		let rawResponse: Response;
		try {
			rawResponse = await this.fetcher.fetch(url, options);
		} catch (err) {
			return Result.error(new Completions.Unexpected(err instanceof Error ? err : new Error(String(err))));
		}
		if (rawResponse.status !== 200) {
			return Result.error(new Completions.UnsuccessfulResponse(
				rawResponse.status,
				'error',
				rawResponse.headers,
				() => rawResponse.text(),
			));
		}
		const bodyText = await rawResponse.text();
		const lines = bodyText.split('\n').filter(l => l.length > 0);
		async function* lineStream() { for (const l of lines) { yield l; } }
		const completionsStream = jsonlStreamToCompletions(lineStream());
		const headers = rawResponse.headers instanceof HeadersImpl ? rawResponse.headers : new HeadersImpl({});
		const mockResponse = Response.fromText(200, 'OK', headers, '', 'test-stub');
		const stream = new ResponseStream(mockResponse, completionsStream, {
			headerRequestId: requestId,
			serverExperiments: '',
			deploymentId: '',
			gitHubRequestId: '',
			completionId: '',
			created: 0
		}, headers);
		return Result.ok(stream);
	}
	async disconnectAll() { }
}
