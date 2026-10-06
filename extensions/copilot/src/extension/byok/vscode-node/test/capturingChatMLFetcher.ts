/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatMLFetcher, type IFetchMLOptions } from '../../../../platform/chat/common/chatMLFetcher';
import type { ChatResponse, ChatResponses } from '../../../../platform/chat/common/commonTypes';
import { MockChatMLFetcher } from '../../../../platform/chat/test/common/mockChatMLFetcher';
import { Event } from '../../../../util/vs/base/common/event';

/**
 * A chat fetcher that records the options of every request, so tests can
 * inspect the endpoint a BYOK provider built for a request.
 */
export class CapturingChatMLFetcher implements IChatMLFetcher {
	declare readonly _serviceBrand: undefined;
	readonly onDidMakeChatMLRequest = Event.None;
	readonly requests: IFetchMLOptions[] = [];

	private readonly delegate = new MockChatMLFetcher();

	fetchOne(options: IFetchMLOptions): Promise<ChatResponse> {
		this.requests.push(options);
		return this.delegate.fetchOne();
	}

	fetchMany(): Promise<ChatResponses> {
		return this.delegate.fetchMany();
	}
}
