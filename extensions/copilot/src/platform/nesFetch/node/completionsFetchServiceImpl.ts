/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterUtilsExt } from '../../../util/common/asyncIterableUtils';
import { ErrorUtils } from '../../../util/common/errors';
import { Result } from '../../../util/common/result';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Codicon } from '../../../util/vs/base/common/codicons';
import { IDisposable } from '../../../util/vs/base/common/lifecycle';
import { ThemeIcon } from '../../../util/vs/base/common/themables';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { getRequestId, RequestId } from '../../networking/common/fetch';
import { FetchOptions, IFetcherService, IHeaders, Response } from '../../networking/common/fetcherService';
import { IRequestLogger, LoggedRequestKind } from '../../requestLogger/node/requestLogger';
import { Completion } from '../common/completionsAPI';
import { Completions, ICompletionsFetchService } from '../common/completionsFetchService';
import { ResponseStream } from '../common/responseStream';
import { jsonlStreamToCompletions } from './streamTransformer';

export type FetchResponse = {
	status: number;
	statusText: string;
	headers: IHeaders;
	body: AsyncIterable<string>;
	requestId: RequestId;
	response: Response;
};

export interface IFetchRequestParams extends Completions.ModelParams { }

export class CompletionsFetchService implements ICompletionsFetchService {
	readonly _serviceBrand: undefined;

	constructor(
		@IAuthenticationService private authService: IAuthenticationService,
		@IFetcherService private fetcherService: IFetcherService,
		@IRequestLogger private readonly requestLogger: IRequestLogger,
	) {
	}

	public disconnectAll(): Promise<unknown> {
		return this.fetcherService.disconnectAll();
	}

	public async fetch(
		url: string,
		secretKey: string,
		params: IFetchRequestParams,
		requestId: string,
		ct: CancellationToken,
		headerOverrides?: Record<string, string>,
	): Promise<Result<ResponseStream, Completions.CompletionsFetchFailure>> {
		const startTimeMs = Date.now();

		if (ct.isCancellationRequested) {
			const result = Result.error(new Completions.RequestCancelled());
			this._logCompletionsRequest(url, params, requestId, startTimeMs, result);
			return result;
		}

		const options = {
			requestId,
			headers: this.getHeaders(requestId, secretKey, headerOverrides),
			body: JSON.stringify({
				...params,
				stream: true,
			})
		};

		const fetchResponse = await this._fetchFromUrl(url, options, ct);

		if (fetchResponse.isError()) {
			this._logCompletionsRequest(url, params, requestId, startTimeMs, fetchResponse);
			return fetchResponse;
		}

		if (fetchResponse.val.status === 200) {

			const jsonlStream = AsyncIterUtilsExt.splitLines(fetchResponse.val.body);
			const completionsStream = jsonlStreamToCompletions(jsonlStream);

			const response = new ResponseStream(fetchResponse.val.response, completionsStream, fetchResponse.val.requestId, fetchResponse.val.headers);

			const result = Result.ok(response);
			this._logCompletionsRequest(url, params, requestId, startTimeMs, result);
			return result;

		} else {
			const error: Completions.CompletionsFetchFailure = new Completions.UnsuccessfulResponse(
				fetchResponse.val.status,
				fetchResponse.val.statusText,
				fetchResponse.val.headers,
				() => collectAsyncIterableToString(fetchResponse.val.body).catch(() => ''),
			);

			const result = Result.error(error);
			this._logCompletionsRequest(url, params, requestId, startTimeMs, result);
			return result;
		}
	}

	protected async _fetchFromUrl(url: string, options: Completions.Internal.FetchOptions, ct: CancellationToken): Promise<Result<FetchResponse, Completions.CompletionsFetchFailure>> {

		const fetchAbortCtl = this.fetcherService.makeAbortController();

		const onCancellationDisposable = ct.onCancellationRequested(() => {
			fetchAbortCtl.abort();
		});

		try {

			const request: FetchOptions = {
				headers: options.headers,
				body: options.body,
				signal: fetchAbortCtl.signal,
				method: 'POST',
				callSite: 'nes-completions',
			};

			const response = await this.fetcherService.fetch(url, request);

			if (response.status === 200 && this.authService.copilotToken?.isFreeUser && this.authService.copilotToken?.isChatQuotaExceeded) {
				this.authService.resetCopilotToken();
			}

			if (response.status !== 200) {
				if (response.status === 402) {
					// When we receive a 402, we have exceed the free tier quota
					// This is stored on the token so let's refresh it
					if (!this.authService.copilotToken?.isCompletionsQuotaExceeded) {
						this.authService.resetCopilotToken(response.status);
						await this.authService.getCopilotToken();
					}
				}

				return Result.error(new Completions.UnsuccessfulResponse(response.status, response.statusText, response.headers, () => response.text().catch(() => '')));
			}

			const body = response.body.pipeThrough(new TextDecoderStream());

			const responseStream = streamWithCleanup(body, onCancellationDisposable);

			return Result.ok({
				status: response.status,
				statusText: response.statusText,
				headers: response.headers,
				body: responseStream,
				requestId: getRequestId(response.headers),
				response,
			});

		} catch (reason: unknown) {

			onCancellationDisposable.dispose();

			if (reason instanceof Error && reason.message === 'This operation was aborted') {
				return Result.error(new Completions.RequestCancelled());
			}

			const error = ErrorUtils.fromUnknown(reason);
			return Result.error(new Completions.Unexpected(error));
		}
	}

	private _logCompletionsRequest(
		url: string,
		params: IFetchRequestParams,
		requestId: string,
		startTimeMs: number,
		result: Result<ResponseStream, Completions.CompletionsFetchFailure>,
	): void {
		if (result.isOk()) {
			// For successful requests, wait for the stream to complete so we can log the response
			const responseStream = result.val;
			void responseStream.response.then(aggregated => {
				const aggregationStatus = aggregated.isOk() ? 'success' : 'failed';
				this._emitCompletionsLogEntry(url, params, requestId, startTimeMs, aggregationStatus, aggregated);
			});
		} else {
			const err = result.err;
			if (err instanceof Completions.RequestCancelled) {
				this._emitCompletionsLogEntry(url, params, requestId, startTimeMs, 'cancelled', undefined);
			} else if (err instanceof Completions.UnsuccessfulResponse) {
				this._emitCompletionsLogEntry(url, params, requestId, startTimeMs, 'failed', undefined, `${err.status} ${err.statusText}`);
			} else if (err instanceof Completions.Unexpected) {
				this._emitCompletionsLogEntry(url, params, requestId, startTimeMs, 'failed', undefined, err.error.message);
			}
		}
	}

	private _emitCompletionsLogEntry(
		url: string,
		params: IFetchRequestParams,
		requestId: string,
		startTimeMs: number,
		status: 'success' | 'cancelled' | 'failed',
		aggregatedResponse: Result<Completion, Error> | undefined,
		errorReason?: string,
	): void {
		const durationMs = Date.now() - startTimeMs;
		const lines: string[] = [];

		lines.push(`> 🚨 Note: This log may contain personal information such as the contents of your files. Please review the contents carefully before sharing.`);
		lines.push(`# completions`);
		lines.push(``);

		// Table of contents
		lines.push(`- [Metadata](#metadata)`);
		lines.push(`- [Prompt](#prompt)`);
		if (params.suffix) {
			lines.push(`- [Suffix](#suffix)`);
		}
		lines.push(`- [Response](#response)`);
		lines.push(``);

		// Metadata
		lines.push(`## Metadata`);
		lines.push(`<pre><code>`);
		lines.push(`url              : ${url}`);
		lines.push(`requestId        : ${requestId}`);
		lines.push(`model            : ${params.model ?? '(default)'}`);
		lines.push(`maxTokens        : ${params.max_tokens}`);
		lines.push(`temperature      : ${params.temperature}`);
		lines.push(`top_p            : ${params.top_p}`);
		lines.push(`n                : ${params.n}`);
		lines.push(`duration         : ${durationMs}ms`);
		lines.push(`</code></pre>`);

		// Prompt
		lines.push(``);
		lines.push(`## Prompt`);
		lines.push(`~~~`);
		lines.push(params.prompt);
		lines.push(`~~~`);

		// Suffix
		if (params.suffix) {
			lines.push(``);
			lines.push(`## Suffix`);
			lines.push(`~~~`);
			lines.push(params.suffix);
			lines.push(`~~~`);
		}

		// Response
		lines.push(``);
		lines.push(`## Response`);
		if (status === 'cancelled') {
			lines.push(`## CANCELED`);
		} else if (status === 'failed') {
			lines.push(`## FAILED: ${errorReason}`);
		} else if (aggregatedResponse) {
			if (aggregatedResponse.isOk()) {
				const completion = aggregatedResponse.val;
				const text = completion.choices[0]?.text ?? '';
				const finishReason = completion.choices[0]?.finish_reason ?? 'unknown';
				lines.push(`~~~`);
				lines.push(text || '<EMPTY RESPONSE>');
				lines.push(`~~~`);
				lines.push(``);
				lines.push(`<pre><code>`);
				lines.push(`finishReason     : ${finishReason}`);
				if (completion.usage) {
					lines.push(`promptTokens     : ${completion.usage.prompt_tokens}`);
					lines.push(`completionTokens : ${completion.usage.completion_tokens}`);
					lines.push(`totalTokens      : ${completion.usage.total_tokens}`);
				}
				lines.push(`</code></pre>`);
			} else {
				lines.push(`## FAILED: stream error - ${aggregatedResponse.err.message}`);
			}
		}

		const icon: ThemeIcon | undefined = status === 'success' ? undefined : Codicon.error;

		this.requestLogger.addEntry({
			type: LoggedRequestKind.MarkdownContentRequest,
			debugName: 'Completions Request',
			startTimeMs,
			icon,
			markdownContent: lines.join('\n'),
		});
	}

	private getHeaders(
		requestId: string,
		secretKey: string,
		headerOverrides: Record<string, string> = {},
	): Record<string, string> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'x-policy-id': 'nil',
			Authorization: 'Bearer ' + secretKey,
			'X-Request-Id': requestId,
			'X-GitHub-Api-Version': '2025-04-01',
			...headerOverrides,
		};

		return headers;
	}
}

/**
 * Wraps an async iterable stream and disposes the cleanup disposable when the stream completes or errors.
 */
async function* streamWithCleanup(
	stream: AsyncIterable<string>,
	cleanupDisposable: IDisposable
): AsyncGenerator<string> {
	try {
		for await (const str of stream) {
			yield str;
		}
	} catch (err: unknown) {
		const error = ErrorUtils.fromUnknown(err);
		throw error;
	} finally {
		cleanupDisposable.dispose();
	}
}

/**
 * Collects all strings from an async iterable and joins them into a single string.
 */
async function collectAsyncIterableToString(iterable: AsyncIterable<string>): Promise<string> {
	const parts: string[] = [];
	for await (const part of iterable) {
		parts.push(part);
	}
	return parts.join('');
}
