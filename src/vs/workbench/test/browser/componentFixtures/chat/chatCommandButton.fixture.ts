/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderMarkdown } from '../../../../../base/browser/markdownRenderer.js';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ChatCommandButtonContentPart } from '../../../../contrib/chat/browser/widget/chatContentParts/chatCommandContentPart.js';
import { IChatContentPartRenderContext, InlineTextModelCollection } from '../../../../contrib/chat/browser/widget/chatContentParts/chatContentParts.js';
import { IChatCommandButton } from '../../../../contrib/chat/common/chatService/chatService.js';
import { IChatResponseViewModel } from '../../../../contrib/chat/common/model/chatViewModel.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';

function createRenderContext(isStale: boolean): IChatContentPartRenderContext {
	const element = new class extends mock<IChatResponseViewModel>() {
		override readonly isComplete = true;
		override readonly isStale = isStale;
		override setVote(): void { }
	}();
	return {
		element,
		inlineTextModels: upcastPartial<InlineTextModelCollection>({}),
		elementIndex: 0,
		container: document.createElement('div'),
		content: [],
		contentIndex: 0,
		editorPool: undefined!,
		codeBlockStartIndex: 0,
		treeStartIndex: 0,
		diffEditorPool: undefined!,
		currentWidth: observableValue('currentWidth', 400),
		onDidChangeVisibility: Event.None,
	};
}

/** A response with a markdown message followed by a command button row. */
function renderResponse(context: ComponentFixtureContext, message: string, button: IChatCommandButton, options: { isStale?: boolean } = {}): void {
	const { container, disposableStore } = context;
	const instantiationService = createEditorServices(disposableStore, { colorTheme: context.theme });

	container.style.width = '400px';
	container.style.padding = '8px';
	container.classList.add('interactive-session');

	const response = dom.append(container, dom.$('.interactive-item-container.interactive-response'));
	const value = dom.append(response, dom.$('.value'));
	const markdown = disposableStore.add(renderMarkdown(new MarkdownString(message)));
	markdown.element.classList.add('rendered-markdown');
	value.appendChild(markdown.element);

	const part = disposableStore.add(instantiationService.createInstance(ChatCommandButtonContentPart, button, createRenderContext(!!options.isStale)));
	value.appendChild(part.domNode);
}

const greeting = 'Hi! What went wrong in this window? Describe it below, or start with a screenshot.';

const screenshot = { id: 'fixture.screenshot', title: '$(device-camera) Attach a screenshot', tooltip: 'Attach a screenshot of this window' };
const repro = { id: 'fixture.repro', title: '$(list-ordered) Add steps to reproduce' };
const skip = { id: 'fixture.skip', title: 'Skip' };

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	SingleButton: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderResponse(ctx, greeting, { kind: 'command', command: screenshot }),
	}),

	PrimaryAndSecondaryButtons: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderResponse(ctx, greeting, { kind: 'command', command: screenshot, additionalCommands: [repro, skip] }),
	}),

	RestoredChat: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: ctx => renderResponse(ctx, greeting, { kind: 'command', command: screenshot, additionalCommands: [repro] }, { isStale: true }),
	}),
});
