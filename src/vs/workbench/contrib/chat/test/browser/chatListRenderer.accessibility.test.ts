/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ChatListItemRenderer } from '../../browser/chatListRenderer.js';
import { IChatRendererDelegate } from '../../browser/chatListRenderer.js';
import { IChatListItemRendererOptions } from '../../browser/chat.js';
import { ChatEditorOptions } from '../../browser/chatOptions.js';
import { CodeBlockModelCollection } from '../../common/codeBlockModelCollection.js';
import { ChatModeKind } from '../../common/constants.js';

suite('ChatListRenderer Accessibility', () => {
	const disposables = new DisposableStore();
	let container: HTMLElement;

	setup(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	teardown(() => {
		disposables.clear();
		container.remove();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('accessibility header is always present', () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);

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

		const renderer = disposables.add(instantiationService.createInstance(
			ChatListItemRenderer,
			editorOptions,
			rendererOptions,
			delegate,
			codeBlockModelCollection,
			undefined,
			undefined
		));

		const template = renderer.renderTemplate(container);
		
		assert.ok(template.accessibilityHeader, 'Accessibility header should be present');
		assert.strictEqual(template.accessibilityHeader.tagName.toLowerCase(), 'h3', 'Should be an h3 element');
		assert.strictEqual(template.accessibilityHeader.getAttribute('aria-level'), '3', 'Should have aria-level 3');
		
		// Verify it's visually hidden but accessible
		assert.strictEqual(template.accessibilityHeader.style.position, 'absolute', 'Should be positioned absolutely');
		assert.strictEqual(template.accessibilityHeader.style.left, '-10000px', 'Should be moved off-screen');
		
		renderer.disposeTemplate(template);
	});
});