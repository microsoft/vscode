/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ChatListItemRenderer, IChatListItemTemplate } from '../../browser/chatListRenderer.js';
import { IChatRendererDelegate } from '../../browser/chatListRenderer.js';
import { IChatListItemRendererOptions } from '../../browser/chat.js';
import { ChatEditorOptions } from '../../browser/chatOptions.js';
import { CodeBlockModelCollection } from '../../common/codeBlockModelCollection.js';
import { isRequestVM, isResponseVM } from '../../common/chatViewModel.js';
import { ChatModeKind } from '../../common/constants.js';

suite('ChatListRenderer Accessibility', () => {
	const disposables = new DisposableStore();
	let instantiationService: TestInstantiationService;
	let renderer: ChatListItemRenderer;
	let container: HTMLElement;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		container = document.createElement('div');
		document.body.appendChild(container);

		const delegate: IChatRendererDelegate = {
			container,
			getListLength: () => 1,
			currentChatMode: () => ChatModeKind.Default
		};

		const rendererOptions: IChatListItemRendererOptions = {
			renderStyle: 'default',
			editable: false
		};

		const editorOptions = new ChatEditorOptions('chatInput', {}, instantiationService);
		const codeBlockModelCollection = instantiationService.createInstance(CodeBlockModelCollection, 'test');

		renderer = disposables.add(instantiationService.createInstance(
			ChatListItemRenderer,
			editorOptions,
			rendererOptions,
			delegate,
			codeBlockModelCollection,
			undefined,
			undefined
		));
	});

	teardown(() => {
		disposables.clear();
		container.remove();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('accessibility header is always present', () => {
		const template = renderer.renderTemplate(container);
		
		assert.ok(template.accessibilityHeader, 'Accessibility header should be present');
		assert.strictEqual(template.accessibilityHeader.tagName.toLowerCase(), 'h3', 'Should be an h3 element');
		assert.strictEqual(template.accessibilityHeader.getAttribute('aria-level'), '3', 'Should have aria-level 3');
		
		// Verify it's visually hidden but accessible
		assert.strictEqual(template.accessibilityHeader.style.position, 'absolute', 'Should be positioned absolutely');
		assert.strictEqual(template.accessibilityHeader.style.left, '-10000px', 'Should be moved off-screen');
		
		renderer.disposeTemplate(template);
	});

	test('accessibility header text updates correctly for requests and responses', () => {
		const template = renderer.renderTemplate(container);
		
		// Mock a request element
		const mockRequest = {
			id: 'request1',
			username: 'user',
			sessionId: 'session1',
			messageText: 'test request'
		} as any;

		// Mock a response element  
		const mockResponse = {
			id: 'response1',
			username: 'assistant',
			sessionId: 'session1',
			agent: {
				metadata: {
					name: 'TestAgent'
				}
			}
		} as any;

		// Render request
		renderer.renderChatTreeItem(mockRequest, 0, template);
		assert.strictEqual(template.accessibilityHeader.textContent, 'Chat Request', 'Should show "Chat Request" for requests');

		// Render response
		renderer.renderChatTreeItem(mockResponse, 0, template);
		assert.strictEqual(template.accessibilityHeader.textContent, 'Chat Response from TestAgent', 'Should show agent name in response header');

		// Test response without agent name
		const mockResponseNoAgent = { ...mockResponse, agent: undefined };
		renderer.renderChatTreeItem(mockResponseNoAgent, 0, template);
		assert.strictEqual(template.accessibilityHeader.textContent, 'Chat Response', 'Should show generic "Chat Response" when no agent');

		renderer.disposeTemplate(template);
	});
});