/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ChatRichLink } from '../../../../browser/widget/chatContentParts/chatRichLink.js';

suite('ChatRichLink', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders semantic icons for session and chat pills', () => {
		const sessionAnchor = mainWindow.document.createElement('a');
		const chatAnchor = mainWindow.document.createElement('a');
		const sessionLink = store.add(ChatRichLink.mount(sessionAnchor, mainWindow.document.createElement('span')));
		const chatLink = store.add(ChatRichLink.mount(chatAnchor, mainWindow.document.createElement('span')));

		sessionLink.update({
			kind: 'session',
			title: 'Session',
			status: { kind: 'success', label: 'Completed' },
		});
		chatLink.update({
			kind: 'chat',
			title: 'New Chat',
			status: { kind: 'success', label: 'Completed' },
		});

		assert.deepStrictEqual({
			sessionIcon: sessionAnchor.firstElementChild?.className,
			chatIcon: chatAnchor.firstElementChild?.className,
		}, {
			sessionIcon: 'chat-rich-link-icon codicon codicon-agent',
			chatIcon: 'chat-rich-link-icon codicon codicon-comment-discussion',
		});
	});

	test('renders compact non-success status indicators', () => {
		const pendingAnchor = mainWindow.document.createElement('a');
		const warningAnchor = mainWindow.document.createElement('a');
		const errorAnchor = mainWindow.document.createElement('a');
		const completedAnchor = mainWindow.document.createElement('a');
		const pendingLink = store.add(ChatRichLink.mount(pendingAnchor, mainWindow.document.createElement('span')));
		const warningLink = store.add(ChatRichLink.mount(warningAnchor, mainWindow.document.createElement('span')));
		const errorLink = store.add(ChatRichLink.mount(errorAnchor, mainWindow.document.createElement('span')));
		const completedLink = store.add(ChatRichLink.mount(completedAnchor, mainWindow.document.createElement('span')));

		pendingLink.update({ kind: 'session', title: 'Working', status: { kind: 'pending', label: 'Working' } });
		warningLink.update({ kind: 'session', title: 'Needs input', status: { kind: 'warning', label: 'Needs input' } });
		errorLink.update({ kind: 'chat', title: 'Failed chat', status: { kind: 'error', label: 'Error' } });
		completedLink.update({ kind: 'chat', title: 'Completed chat', status: { kind: 'success', label: 'Completed' } });

		assert.deepStrictEqual({
			pending: {
				status: pendingAnchor.dataset.chatRichLinkStatus,
				spinner: pendingAnchor.querySelector('.chat-rich-link-primary-status .monaco-pixel-spinner') !== null,
			},
			warning: {
				status: warningAnchor.dataset.chatRichLinkStatus,
				spinner: warningAnchor.querySelector('.chat-rich-link-primary-status .monaco-pixel-spinner') !== null,
			},
			error: {
				status: errorAnchor.dataset.chatRichLinkStatus,
				icon: errorAnchor.querySelector('.chat-rich-link-primary-status .chat-rich-link-status-icon')?.className,
			},
			completed: {
				status: completedAnchor.dataset.chatRichLinkStatus,
				icon: completedAnchor.querySelector('.chat-rich-link-primary-status .chat-rich-link-status-icon')?.className,
			},
		}, {
			pending: { status: 'pending', spinner: true },
			warning: { status: 'warning', spinner: true },
			error: { status: 'error', icon: 'chat-rich-link-status-icon codicon codicon-error-compact' },
			completed: { status: 'success', icon: 'chat-rich-link-status-icon codicon codicon-pass-filled-compact' },
		});
	});
});
