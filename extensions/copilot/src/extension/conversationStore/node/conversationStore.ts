/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatSessionService } from '../../../platform/chat/common/chatSessionService';
import { createServiceIdentifier } from '../../../util/common/services';
import { TimeoutTimer } from '../../../util/vs/base/common/async';
import { Disposable, DisposableMap } from '../../../util/vs/base/common/lifecycle';
import { LRUCache } from '../../../util/vs/base/common/map';
import { Conversation } from '../../prompt/common/conversation';

export const IConversationStore = createServiceIdentifier<IConversationStore>('IConversationStore');

export interface IConversationStore {
	readonly _serviceBrand: undefined;

	addConversation(responseId: string, conversation: Conversation): void;
	getConversation(responseId: string): Conversation | undefined;
	lastConversation: Conversation | undefined;
}

const CLEANUP_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export class ConversationStore extends Disposable implements IConversationStore {
	readonly _serviceBrand: undefined;

	private readonly conversationMap: LRUCache<string, Conversation>;
	private readonly pendingCleanups: DisposableMap<string, TimeoutTimer> = this._register(new DisposableMap());

	constructor(
		@IChatSessionService chatSessionService: IChatSessionService,
	) {
		super();
		this.conversationMap = new LRUCache<string, Conversation>(1000);
		this._register(chatSessionService.onDidDisposeChatSession(sessionId => {
			this._scheduleSessionCleanup(sessionId);
		}));
	}

	addConversation(responseId: string, conversation: Conversation): void {
		this.conversationMap.set(responseId, conversation);
		this.pendingCleanups.deleteAndDispose(conversation.sessionId);
	}

	getConversation(responseId: string): Conversation | undefined {
		const conversation = this.conversationMap.get(responseId);
		if (conversation) {
			this.pendingCleanups.deleteAndDispose(conversation.sessionId);
		}
		return conversation;
	}

	get lastConversation(): Conversation | undefined {
		const conversation = this.conversationMap.last;
		if (conversation) {
			this.pendingCleanups.deleteAndDispose(conversation.sessionId);
		}
		return conversation;
	}

	private _scheduleSessionCleanup(sessionId: string): void {
		let timer = this.pendingCleanups.get(sessionId);
		if (!timer) {
			timer = new TimeoutTimer();
			this.pendingCleanups.set(sessionId, timer);
		}
		timer.cancelAndSet(() => {
			this._cleanupSession(sessionId);
		}, CLEANUP_TIMEOUT_MS);
	}

	private _cleanupSession(sessionId: string): void {
		this.pendingCleanups.deleteAndDispose(sessionId);
		const keysToDelete: string[] = [];
		this.conversationMap.forEach((conversation, responseId) => {
			if (conversation.sessionId === sessionId) {
				keysToDelete.push(responseId);
			}
		});
		for (const key of keysToDelete) {
			this.conversationMap.delete(key);
		}
	}
}
