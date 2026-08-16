/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ChatContentMarkdownRenderer } from '../../../../contrib/chat/browser/widget/chatContentMarkdownRenderer.js';
import { DiffEditorPool, EditorPool } from '../../../../contrib/chat/browser/widget/chatContentParts/chatContentCodePools.js';
import { IChatContentPartDiffData, IChatContentPartRenderContext, InlineTextModelCollection } from '../../../../contrib/chat/browser/widget/chatContentParts/chatContentParts.js';
import { ChatThinkingContentPart } from '../../../../contrib/chat/browser/widget/chatContentParts/chatThinkingContentPart.js';
import { IChatThinkingPart } from '../../../../contrib/chat/common/chatService/chatService.js';
import { ChatConfiguration, ThinkingDisplayMode } from '../../../../contrib/chat/common/constants.js';
import { IChatResponseViewModel } from '../../../../contrib/chat/common/model/chatViewModel.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { registerChatFixtureServices } from './chatFixtureUtils.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';

function renderUsedContextLabel(context: ComponentFixtureContext, hovered: boolean): void {
	const { container, disposableStore } = context;
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: reg => {
			registerChatFixtureServices(reg);
			reg.defineInstance(IEditorService, new class extends mock<IEditorService>() {
				override onDidActiveEditorChange = Event.None;
				override async openEditor() { return undefined; }
			}());
		},
	});
	const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
	configurationService.setUserConfiguration(ChatConfiguration.ThinkingStyle, ThinkingDisplayMode.Collapsed);

	const element = new class extends mock<IChatResponseViewModel>() {
		override readonly isComplete = true;
		override readonly sessionResource = URI.parse('vscode-chat-session://fixture/session');
	}();
	const renderContext: IChatContentPartRenderContext = {
		element,
		inlineTextModels: upcastPartial<InlineTextModelCollection>({}),
		elementIndex: 0,
		container,
		content: [],
		contentIndex: 0,
		editorPool: upcastPartial<EditorPool>({}),
		codeBlockStartIndex: 0,
		treeStartIndex: 0,
		diffEditorPool: upcastPartial<DiffEditorPool>({}),
		currentWidth: observableValue('currentWidth', 420),
		onDidChangeVisibility: Event.None,
	};
	const content: IChatThinkingPart = {
		kind: 'thinking',
		id: 'fixture-thinking',
		value: '**Read and edited several files**',
		generatedTitle: 'Read and edited several files',
	};
	const markdownRenderer = instantiationService.createInstance(ChatContentMarkdownRenderer);
	const part = disposableStore.add(instantiationService.createInstance(
		ChatThinkingContentPart,
		content,
		renderContext,
		markdownRenderer,
		true,
	));
	const diffEmitter = disposableStore.add(new Emitter<IChatContentPartDiffData>());
	part.appendItem(
		() => ({ domNode: dom.$('.fixture-edit-pill') }),
		'fixture-edits',
		undefined,
		undefined,
		diffEmitter.event,
	);
	diffEmitter.fire({
		added: 42,
		removed: 7,
		resources: [{
			resource: URI.file('/workspace/src/chat.ts'),
			originalURI: URI.file('/snapshots/chat-before.ts'),
			modifiedURI: URI.file('/snapshots/chat-after.ts'),
		}],
	});
	part.finalizeTitleIfDefault();

	container.classList.add('monaco-workbench', 'interactive-session');
	container.style.width = '420px';
	container.style.padding = '12px';
	container.style.backgroundColor = 'var(--vscode-editor-background)';
	const response = dom.append(container, dom.$('.interactive-response'));
	const value = dom.append(response, dom.$('.value'));
	value.appendChild(part.domNode);

	if (hovered) {
		part.domNode.querySelector('.chat-thinking-title-diff')?.classList.add('hovered');
	}
}

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	Normal: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderUsedContextLabel(context, false),
	}),
	DiffHovered: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderUsedContextLabel(context, true),
	}),
});
