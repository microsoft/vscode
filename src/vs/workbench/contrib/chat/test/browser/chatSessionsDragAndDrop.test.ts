/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { suite, test } from 'mocha';
import { assert } from 'chai';
import { ChatSessionUri } from '../../common/chatUri.js';

// Mock interfaces for testing
interface IChatSessionItem {
	id: string;
	label: string;
}

interface ILocalChatSessionItem extends IChatSessionItem {
	sessionType: 'editor' | 'widget';
}

// Test implementation of getDragURI logic (extracted from ChatSessionsDragAndDrop)
function getDragURI(element: IChatSessionItem): string | null {
	const localItem = element as ILocalChatSessionItem;
	if (localItem && ('sessionType' in localItem)) {
		return ChatSessionUri.forSession('local', element.id).toString();
	}
	return null;
}

suite('ChatSessionsDragAndDrop', () => {
	test('getDragURI returns URI for local chat session items', () => {
		const localSessionItem: ILocalChatSessionItem = {
			id: 'local-1-0',
			label: 'Test Chat Session',
			sessionType: 'editor'
		};

		const dragURI = getDragURI(localSessionItem);
		assert.isNotNull(dragURI);
		assert.isString(dragURI);
		assert.include(dragURI!, 'vscode-chat-session:');
	});

	test('getDragURI returns null for non-local chat session items', () => {
		const nonLocalSessionItem: IChatSessionItem = {
			id: 'remote-session-1',
			label: 'Remote Chat Session'
		};

		const dragURI = getDragURI(nonLocalSessionItem);
		assert.isNull(dragURI);
	});

	test('generated ChatSessionUri can be parsed back', () => {
		const sessionId = 'test-session-123';
		const uri = ChatSessionUri.forSession('local', sessionId);
		const parsed = ChatSessionUri.parse(uri);
		
		assert.isNotNull(parsed);
		assert.equal(parsed!.chatSessionType, 'local');
		assert.equal(parsed!.sessionId, sessionId);
	});

	test('getDragURI with widget session type', () => {
		const widgetSessionItem: ILocalChatSessionItem = {
			id: 'chat-widget-view',
			label: 'Chat View',
			sessionType: 'widget'
		};

		const dragURI = getDragURI(widgetSessionItem);
		assert.isNotNull(dragURI);
		assert.isString(dragURI);
		assert.include(dragURI!, 'vscode-chat-session:');
	});
});