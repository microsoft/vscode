/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ChatAutoModeResolutionContentPart } from '../../../../contrib/chat/browser/widget/chatContentParts/chatAutoModeResolutionContentPart.js';
import { IChatContentPartRenderContext, InlineTextModelCollection } from '../../../../contrib/chat/browser/widget/chatContentParts/chatContentParts.js';
import { IChatAutoModeResolutionPart } from '../../../../contrib/chat/common/chatService/chatService.js';
import { IChatResponseViewModel } from '../../../../contrib/chat/common/model/chatViewModel.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';
// The routing row is styled by the Thinking chrome; import it so this fixture
// does not rely on another module happening to pull it into the bundle.
import '../../../../contrib/chat/browser/widget/chatContentParts/media/chatThinkingContent.css';

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

function renderRoutingPart(context: ComponentFixtureContext, content: IChatAutoModeResolutionPart): void {
	const { container, disposableStore } = context;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
	});

	const part = disposableStore.add(instantiationService.createInstance(
		ChatAutoModeResolutionContentPart,
		content,
		createRenderContext(!!content.resolved),
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
}

const routing: IChatAutoModeResolutionPart = { kind: 'autoModeResolution' };
const routed: IChatAutoModeResolutionPart = { kind: 'autoModeResolution', resolved: { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini' } };

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	Routing: defineComponentFixture({
		labels: { kind: 'animated' },
		render: (ctx) => renderRoutingPart(ctx, routing),
	}),

	Routed: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderRoutingPart(ctx, routed),
	}),
});
