/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { extUri } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { getSessionConversationGroupId, SESSION_CONVERSATION_CHATS_GROUP, SESSION_CONVERSATION_SUBAGENTS_GROUP } from '../../browser/sessionConversationGroups.js';
import { ChatOriginKind, IChat, IChatOrigin } from '../../services/sessions/common/session.js';

function createChat(id: string, origin?: IChatOrigin): IChat {
	return new class extends mock<IChat>() {
		override readonly resource = URI.parse(`test-chat:/${id}`);
		override readonly origin = origin;
	}();
}

suite('Sessions - Session conversation groups', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps side chats top-level and separates subagents', () => {
		const activeChat = createChat('active');
		assert.deepStrictEqual([
			getSessionConversationGroupId(createChat('regular'), activeChat, extUri),
			getSessionConversationGroupId(createChat('side', { kind: ChatOriginKind.SideChat }), activeChat, extUri),
			getSessionConversationGroupId(createChat('subagent', { kind: ChatOriginKind.Tool, parentChat: activeChat.resource }), activeChat, extUri),
			getSessionConversationGroupId(createChat('other-subagent', { kind: ChatOriginKind.Tool, parentChat: URI.parse('test-chat:/other') }), activeChat, extUri),
		], [
			SESSION_CONVERSATION_CHATS_GROUP,
			SESSION_CONVERSATION_CHATS_GROUP,
			SESSION_CONVERSATION_SUBAGENTS_GROUP,
			undefined,
		]);
	});

});
