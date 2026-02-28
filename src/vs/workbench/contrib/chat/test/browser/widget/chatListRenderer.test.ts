/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IChatResponseViewModel, IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { IChatContentPart } from '../../../browser/widget/chatContentParts/chatContentParts.js';
import { ChatListItemRenderer, IChatListItemTemplate } from '../../../browser/widget/chatListRenderer.js';
import { IChatMarkdownContent } from '../../../common/chatService/chatService.js';

type ChatListItemRendererPrivateMethods = {
	isFinalAnswerMarkdownPart(content: ReadonlyArray<IChatRendererContent>, index: number, element: unknown): boolean;
	diff(renderedParts: ReadonlyArray<IChatContentPart>, contentToRender: ReadonlyArray<IChatRendererContent>, element: unknown): ReadonlyArray<IChatRendererContent | null>;
	renderChatContentDiff(partsToRender: ReadonlyArray<IChatRendererContent | null>, contentForThisTurn: ReadonlyArray<IChatRendererContent>, element: IChatResponseViewModel, elementIndex: number, templateData: IChatListItemTemplate): void;
};

suite('ChatListItemRenderer', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const createResponseElement = (isComplete: boolean): IChatResponseViewModel => {
		const responseLike: Pick<IChatResponseViewModel, 'isComplete' | 'setVote'> = {
			isComplete,
			setVote: () => undefined
		};

		return responseLike as IChatResponseViewModel;
	};

	const createMarkdown = (value: string): IChatMarkdownContent => ({
		kind: 'markdownContent',
		content: new MarkdownString(value)
	});

	test('isFinalAnswerMarkdownPart: treats markdown after pinned content as final answer', () => {
		const renderer = Object.create(ChatListItemRenderer.prototype) as ChatListItemRendererPrivateMethods;
		const response = createResponseElement(true);

		const content: IChatRendererContent[] = [
			{ kind: 'references', references: [] },
			{ kind: 'textEditGroup', edits: [], done: true, uri: URI.parse('file:///test.ts') },
			createMarkdown('final answer')
		];

		assert.strictEqual(renderer.isFinalAnswerMarkdownPart(content, 2, response), true);
	});

	test('diff: rerenders final markdown when previous node is inside thinking container', () => {
		const renderer = Object.create(ChatListItemRenderer.prototype) as ChatListItemRendererPrivateMethods;
		const response = createResponseElement(true);
		const finalMarkdown = createMarkdown('final answer');

		const thinkingBox = mainWindow.document.createElement('div');
		thinkingBox.className = 'chat-thinking-box';
		const oldMarkdownDomNode = mainWindow.document.createElement('div');
		thinkingBox.appendChild(oldMarkdownDomNode);

		const renderedPart: IChatContentPart = {
			domNode: oldMarkdownDomNode,
			dispose: () => { },
			hasSameContent: () => true
		};

		const diff = renderer.diff([renderedPart], [finalMarkdown], response);
		assert.strictEqual(diff[0], finalMarkdown);
	});

	test('renderChatContentDiff: moves final markdown from thinking container to root value container', () => {
		const renderer = Object.create(ChatListItemRenderer.prototype) as ChatListItemRendererPrivateMethods & Record<string, unknown>;
		const value = mainWindow.document.createElement('div');
		const rowContainer = mainWindow.document.createElement('div');
		const thinkingBox = mainWindow.document.createElement('div');
		thinkingBox.className = 'chat-thinking-box';
		const oldMarkdownDomNode = mainWindow.document.createElement('div');
		thinkingBox.appendChild(oldMarkdownDomNode);
		value.appendChild(thinkingBox);

		let disposed = false;
		const alreadyRenderedPart: IChatContentPart = {
			domNode: oldMarkdownDomNode,
			dispose: () => { disposed = true; },
			hasSameContent: () => false
		};

		const newMarkdownDomNode = mainWindow.document.createElement('div');
		newMarkdownDomNode.className = 'final-answer-node';
		const newPart: IChatContentPart = {
			domNode: newMarkdownDomNode,
			dispose: () => { },
			hasSameContent: () => false
		};

		renderer['_editorPool'] = {};
		renderer['_diffEditorPool'] = {};
		renderer['codeBlockModelCollection'] = {};
		renderer['_currentLayoutWidth'] = { get: () => 500 };
		renderer['_onDidChangeVisibility'] = { event: Event.None };
		renderer['logService'] = { error: () => { } };
		renderer['shouldPinPart'] = () => false;
		renderer['getLastThinkingPart'] = () => undefined;
		renderer['renderChatContentPart'] = () => newPart;
		renderer['isFinalAnswerMarkdownPart'] = () => true;
		renderer['isRenderedPartInsideThinking'] = (renderedPart: IChatContentPart | undefined) => {
			if (!renderedPart?.domNode) {
				return false;
			}
			return !!renderedPart.domNode.closest('.chat-thinking-box');
		};

		const templateData = {
			renderedParts: [alreadyRenderedPart],
			rowContainer,
			value,
			renderedPartsMounted: true
		} as unknown as IChatListItemTemplate;

		const response = createResponseElement(true);
		const finalMarkdown = createMarkdown('final answer');

		renderer.renderChatContentDiff([finalMarkdown], [finalMarkdown], response, 0, templateData);

		assert.strictEqual(disposed, true);
		assert.strictEqual(thinkingBox.contains(newMarkdownDomNode), false);
		assert.strictEqual(value.contains(newMarkdownDomNode), true);
		assert.strictEqual(oldMarkdownDomNode.isConnected, false);
	});
});
