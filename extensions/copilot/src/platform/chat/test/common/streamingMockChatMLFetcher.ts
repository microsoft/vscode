/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { IChatMLFetcher, IFetchMLOptions } from '../../common/chatMLFetcher';
import { ChatFetchResponseType, ChatResponse, ChatResponses } from '../../common/commonTypes';

/**
 * A mock IChatMLFetcher that simulates streaming LLM responses by calling `finishedCb`
 * incrementally for each configured line. This enables testing the full streaming pipeline
 * in XtabProvider's `streamEdits` without hitting a real endpoint.
 */
export class StreamingMockChatMLFetcher implements IChatMLFetcher {
	declare readonly _serviceBrand: undefined;
	readonly onDidMakeChatMLRequest = Event.None;

	private _responseLines: string[] | undefined;
	private _errorResponse: ChatResponse | undefined;
	private _responseQueue: ChatResponse[] = [];
	private _callCount = 0;
	private _capturedOptions: IFetchMLOptions[] = [];

	/**
	 * Configure the next fetchOne call to stream lines of text via `finishedCb`.
	 */
	setStreamingLines(lines: string[]): void {
		this._responseLines = lines;
		this._errorResponse = undefined;
	}

	/**
	 * Configure the next fetchOne call to return an error response.
	 */
	setErrorResponse(response: ChatResponse): void {
		this._errorResponse = response;
		this._responseLines = undefined;
	}

	/**
	 * Enqueue ordered responses. Each `fetchOne` call dequeues from the front.
	 * If the queue is empty, falls back to `_responseLines` / `_errorResponse`.
	 */
	enqueueResponse(response: ChatResponse): void {
		this._responseQueue.push(response);
	}

	/**
	 * Get all captured request options from previous calls.
	 */
	get capturedOptions(): readonly IFetchMLOptions[] {
		return this._capturedOptions;
	}

	/**
	 * Get how many times fetchOne was called.
	 */
	get callCount(): number {
		return this._callCount;
	}

	/**
	 * Reset call tracking state.
	 */
	resetTracking(): void {
		this._callCount = 0;
		this._capturedOptions = [];
	}

	async fetchOne(options: IFetchMLOptions, _token: CancellationToken): Promise<ChatResponse> {
		this._callCount++;
		this._capturedOptions.push(options);

		// Check queued responses first
		if (this._responseQueue.length > 0) {
			const queuedResponse = this._responseQueue.shift()!;
			// For success responses, still call finishedCb if available
			if (queuedResponse.type === ChatFetchResponseType.Success && options.finishedCb) {
				await options.finishedCb(queuedResponse.value, 0, { text: queuedResponse.value });
			}
			return queuedResponse;
		}

		if (this._errorResponse) {
			return this._errorResponse;
		}

		const lines = this._responseLines ?? [];
		const fullText = lines.join('\n');

		// call finishedCb for each line incrementally to simulate streaming
		if (options.finishedCb) {
			let soFar = '';
			for (let i = 0; i < lines.length; i++) {
				if (i > 0) {
					soFar += '\n';
				}
				soFar += lines[i];
				await options.finishedCb(soFar, 0, { text: (i > 0 ? '\n' : '') + lines[i] });
			}
		}

		return {
			type: ChatFetchResponseType.Success,
			requestId: 'test-request-id',
			serverRequestId: 'test-server-request-id',
			usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } },
			value: fullText,
			resolvedModel: 'test-model',
		};
	}

	async fetchMany(options: IFetchMLOptions, token: CancellationToken): Promise<ChatResponses> {
		const response = await this.fetchOne(options, token);
		if (response.type === ChatFetchResponseType.Success) {
			return { ...response, value: [response.value] };
		}
		return response;
	}
}
