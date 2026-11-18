/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../util/vs/base/common/event';
import { IResponseDelta } from '../../../networking/common/fetch';
import { IChatMLFetcher, IFetchMLOptions } from '../../common/chatMLFetcher';
import { ChatFetchResponseType, ChatResponse, ChatResponses } from '../../common/commonTypes';

export type StaticChatMLFetcherInput = string | (string | IResponseDelta[])[];

export class StaticChatMLFetcher implements IChatMLFetcher {
	_serviceBrand: undefined;
	onDidMakeChatMLRequest = Event.None;
	private reqs = 0;
	public resolvedModel = '';

	constructor(public readonly value: StaticChatMLFetcherInput) { }

	async fetchOne({ finishedCb }: IFetchMLOptions): Promise<ChatResponse> {
		// chunk up
		const value = typeof this.value === 'string'
			? this.value
			: (this.value.at(this.reqs++) || this.value.at(-1)!);

		const chunks: IResponseDelta[] = (Array.isArray(value) ? value : [value]).flatMap(value => {
			if (typeof value === 'string') {
				const chunks: IResponseDelta[] = [];
				for (let i = 0; i < value.length; i += 4) {
					const chunk = value.slice(i, i + 4);
					chunks.push({ text: chunk });
				}
				return chunks;
			} else {
				return value;
			}
		});

		// stream through finishedCb
		let responseSoFar = '';
		for (let i = 0; i < chunks.length; i++) {
			finishedCb?.(responseSoFar, i, chunks[i]);
			responseSoFar += chunks[i].text;
		}

		return { type: ChatFetchResponseType.Success, requestId: '', serverRequestId: '', usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } }, value: responseSoFar, resolvedModel: this.resolvedModel };
	}

	async fetchMany(): Promise<ChatResponses> {
		throw new Error('Method not implemented.');
	}
}
