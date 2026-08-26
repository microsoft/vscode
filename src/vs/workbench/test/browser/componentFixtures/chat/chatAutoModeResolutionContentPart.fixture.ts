/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { ChatContentMarkdownRenderer } from '../../../../contrib/chat/browser/widget/chatContentMarkdownRenderer.js';
import { ChatAutoModeResolutionContentPart } from '../../../../contrib/chat/browser/widget/chatContentParts/chatAutoModeResolutionContentPart.js';
import { IChatContentPartRenderContext, InlineTextModelCollection } from '../../../../contrib/chat/browser/widget/chatContentParts/chatContentParts.js';
import { IChatMarkdownAnchorService } from '../../../../contrib/chat/browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { IChatAutoModeResolutionPart } from '../../../../contrib/chat/common/chatService/chatService.js';
import { IChatResponseViewModel } from '../../../../contrib/chat/common/model/chatViewModel.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';

function createRenderContext(isComplete: boolean): IChatContentPartRenderContext {
	const element = new class extends mock<IChatResponseViewModel>() {
		override readonly isComplete = isComplete;
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

function renderRoutingPart(
	context: ComponentFixtureContext,
	content: IChatAutoModeResolutionPart,
	opts: { expanded: boolean },
): void {
	const { container, disposableStore } = context;

	const mockAnchorService = new class extends mock<IChatMarkdownAnchorService>() {
		override register() { return { dispose() { } }; }
	}();

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: (reg) => {
			reg.define(IMarkdownRendererService, MarkdownRendererService);
			reg.defineInstance(IChatMarkdownAnchorService, mockAnchorService);
		},
	});

	const markdownRenderer = instantiationService.createInstance(ChatContentMarkdownRenderer);
	const part = disposableStore.add(instantiationService.createInstance(
		ChatAutoModeResolutionContentPart,
		content,
		createRenderContext(!!content.resolved),
		markdownRenderer,
	));

	container.style.width = '400px';
	container.style.padding = '8px';
	container.classList.add('interactive-session');

	// The routing row reuses the thinking chrome, whose CSS is scoped to the
	// response value container.
	const response = dom.$('.interactive-item-container.interactive-response');
	const value = dom.$('.value');
	value.appendChild(part.domNode);
	response.appendChild(value);
	container.appendChild(response);

	if (opts.expanded) {
		part.domNode.querySelector<HTMLElement>('.chat-used-context-label .monaco-button')?.click();
	}
}

const routing: IChatAutoModeResolutionPart = { kind: 'autoModeResolution' };
const routed: IChatAutoModeResolutionPart = { kind: 'autoModeResolution', resolved: { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini' } };

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	Routing: defineComponentFixture({
		labels: { kind: 'animated' },
		render: (ctx) => renderRoutingPart(ctx, routing, { expanded: false }),
	}),

	Routed: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderRoutingPart(ctx, routed, { expanded: false }),
	}),

	RoutedExpanded: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderRoutingPart(ctx, routed, { expanded: true }),
	}),
});
