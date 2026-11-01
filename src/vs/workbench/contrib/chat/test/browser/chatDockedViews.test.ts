/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IChatDockedViewContribution, resolveChatDockedViewResource } from '../../browser/chatDockedViews/chatDockedViews.js';
import { defaultChatDockedViewSize, getChatDockedViewHeight, IChatDockedViewSize, resizeChatDockedView } from '../../browser/chatDockedViews/chatDockedViewSizing.js';

suite('ChatDockedViews', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function contribution(resource: string): IChatDockedViewContribution {
		return { extensionId: new ExtensionIdentifier('pub.ext'), id: 'todos', label: 'Todos', icon: undefined, resource };
	}

	test('resolves the resource template with the chat session id', () => {
		const session = URI.parse('vscode-chat-session://local/c2Vzc2lvbi8x');
		assert.strictEqual(
			resolveChatDockedViewResource(contribution('chat-todos:/${chatSessionId}.todo.json'), session)?.toString(),
			'chat-todos:/c2Vzc2lvbi8x.todo.json',
		);
	});

	test('keeps characters of the chat session id that are special in URIs within the path', () => {
		const session = URI.parse('agent-host://host/session%20one%23two%3F');
		assert.strictEqual(
			resolveChatDockedViewResource(contribution('chat-todos:/${chatSessionId}.todo.json'), session)?.path,
			'/session one#two?.todo.json',
		);
	});

	suite('sizing', () => {
		const automatic = (maxAutomaticHeight: number): IChatDockedViewSize => ({ fixedHeight: undefined, maxAutomaticHeight });

		test('follows the content height up to the maximum, within the available space', () => {
			assert.deepStrictEqual([
				getChatDockedViewHeight(defaultChatDockedViewSize, 200, 1000),
				getChatDockedViewHeight(defaultChatDockedViewSize, 600, 1000),
				getChatDockedViewHeight(defaultChatDockedViewSize, 600, 250),
				getChatDockedViewHeight(defaultChatDockedViewSize, 10, 1000),
				getChatDockedViewHeight({ fixedHeight: 500, maxAutomaticHeight: 320 }, 100, 1000),
			], [200, 320, 250, 40, 500]);
		});

		test('dragging to another height fixes it', () => {
			assert.deepStrictEqual(resizeChatDockedView(defaultChatDockedViewSize, 200, 260, 200), { fixedHeight: 260, maxAutomaticHeight: 320 });
		});

		test('dragging back to the automatic height follows the content again', () => {
			assert.deepStrictEqual(resizeChatDockedView({ fixedHeight: 100, maxAutomaticHeight: 320 }, 320, 315, 600), automatic(320));
		});

		test('dragging to the content height follows it and remembers it as the maximum', () => {
			assert.deepStrictEqual(resizeChatDockedView(defaultChatDockedViewSize, 320, 605, 600), automatic(600));
		});

		test('the remembered maximum is never below the default', () => {
			assert.deepStrictEqual(resizeChatDockedView(automatic(600), 200, 205, 200), automatic(320));
		});

		test('heights are clamped', () => {
			assert.deepStrictEqual([
				resizeChatDockedView(defaultChatDockedViewSize, 200, 5, undefined),
				resizeChatDockedView(defaultChatDockedViewSize, 200, 5000, undefined),
			], [{ fixedHeight: 40, maxAutomaticHeight: 320 }, { fixedHeight: 1000, maxAutomaticHeight: 320 }]);
		});
	});
});
