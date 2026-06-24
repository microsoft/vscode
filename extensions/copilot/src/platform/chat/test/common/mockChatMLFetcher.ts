/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../util/vs/base/common/event';
import { IChatMLFetcher } from '../../common/chatMLFetcher';
import { ChatFetchResponseType, ChatResponse, ChatResponses } from '../../common/commonTypes';

export class MockChatMLFetcher implements IChatMLFetcher {
	_serviceBrand: undefined;
	onDidMakeChatMLRequest = Event.None;

	private _nextResponse: ChatResponse = {
		type: ChatFetchResponseType.Success,
		requestId: 'test-request-id',
		serverRequestId: 'test-server-request-id',
		usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } },
		value: '10',
		resolvedModel: 'test-model'
	};

	setNextResponse(response: ChatResponse): void {
		this._nextResponse = response;
	}

	async fetchOne(): Promise<ChatResponse> {
		return this.fetchMany().then(responses => {
			if (responses.type === ChatFetchResponseType.Success) {
				return {
					...responses,
					value: responses.value[0]
				};
			}
			return responses;
		});
	}

	async fetchMany(): Promise<ChatResponses> {
		if (this._nextResponse.type === ChatFetchResponseType.Success) {
			return {
				...this._nextResponse,
				value: [this._nextResponse.value]
			};
		}
		return this._nextResponse;
	}
}
