/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../base/common/uri.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { getSessionConversationStatusAriaLabel, getSessionConversationStatusLabel } from '../../browser/sessionConversationGroups.js';
import { ChatOriginKind, IChat, IChatOrigin, isSideChatOf, SessionStatus } from '../../services/sessions/common/session.js';

function createChat(id: string, origin?: IChatOrigin): IChat {
	return new class extends mock<IChat>() {
		override readonly resource = URI.parse(`test-chat:/${id}`);
		override readonly origin = origin;
	}();
}

suite('Sessions - Session conversation groups', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('identifies only side chats belonging to the given parent chat', () => {
		const parent = createChat('main');
		const otherParent = createChat('other');
		assert.deepStrictEqual([
			isSideChatOf(createChat('regular'), parent.resource),
			isSideChatOf(createChat('side', { kind: ChatOriginKind.SideChat, parentChat: parent.resource }), parent.resource),
			isSideChatOf(createChat('otherSide', { kind: ChatOriginKind.SideChat, parentChat: otherParent.resource }), parent.resource),
			isSideChatOf(createChat('subagent', { kind: ChatOriginKind.Tool, parentChat: parent.resource }), parent.resource),
		], [
			false,
			true,
			false,
			false,
		]);
	});

	test('localizes every conversation state for accessibility', () => {
		assert.deepStrictEqual([
			SessionStatus.Untitled,
			SessionStatus.InProgress,
			SessionStatus.NeedsInput,
			SessionStatus.Completed,
			SessionStatus.Error,
		].map(status => ({
			label: getSessionConversationStatusLabel(status),
			ariaLabel: getSessionConversationStatusAriaLabel(status),
		})), [
			{ label: 'New', ariaLabel: 'State: New' },
			{ label: 'In Progress', ariaLabel: 'State: In Progress' },
			{ label: 'Input Needed', ariaLabel: 'State: Input Needed' },
			{ label: 'Completed', ariaLabel: 'State: Completed' },
			{ label: 'Failed', ariaLabel: 'State: Failed' },
		]);
	});

});
