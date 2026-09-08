/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IChatWidgetService } from '../../../../contrib/chat/browser/chat.js';
import { ChatContentMarkdownRenderer } from '../../../../contrib/chat/browser/widget/chatContentMarkdownRenderer.js';
import { DiffEditorPool, EditorPool } from '../../../../contrib/chat/browser/widget/chatContentParts/chatContentCodePools.js';
import { IChatContentPartRenderContext, InlineTextModelCollection } from '../../../../contrib/chat/browser/widget/chatContentParts/chatContentParts.js';
import { CollapsibleListPool } from '../../../../contrib/chat/browser/widget/chatContentParts/chatReferencesContentPart.js';
import { ChatSubagentContentPart } from '../../../../contrib/chat/browser/widget/chatContentParts/chatSubagentContentPart.js';
import { OpenSubagentChatActionViewItem } from '../../../../contrib/chat/browser/widget/chatContentParts/chatSubagentOpenChat.js';
import { IChatSubagentToolInvocationData } from '../../../../contrib/chat/common/chatService/chatService.js';
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, ChatConfiguration } from '../../../../contrib/chat/common/constants.js';
import { ChatToolInvocation } from '../../../../contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { IChatResponseViewModel } from '../../../../contrib/chat/common/model/chatViewModel.js';
import { ToolDataSource } from '../../../../contrib/chat/common/tools/languageModelToolsService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { registerChatFixtureServices } from './chatFixtureUtils.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';

async function renderSubagent(context: ComponentFixtureContext, state: 'pending' | 'initializing' | 'running'): Promise<void> {
	const { container, disposableStore } = context;
	const width = 360;
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: reg => {
			registerChatFixtureServices(reg);
			reg.defineInstance(IActionViewItemService, new class extends mock<IActionViewItemService>() {
				override readonly onDidChange = Event.None;
				override lookUp(menu: MenuId, commandId: string | MenuId): IActionViewItemFactory | undefined {
					return menu === MenuId.ChatSubagentContent && commandId === CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID
						? (action, options, service) => service.createInstance(OpenSubagentChatActionViewItem, undefined, action, options, true)
						: undefined;
				}
			}());
			reg.defineInstance(IChatWidgetService, new class extends mock<IChatWidgetService>() {
				override async openSession(resource: URI) {
					container.dataset.openedChat = resource.toString();
					return undefined;
				}
			}());
		},
	});
	const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
	configurationService.setUserConfiguration(ChatConfiguration.SubagentsUseRichRendering, true);
	const action = instantiationService.createInstance(
		MenuItemAction,
		{ id: CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, title: 'Open Subagent' },
		undefined,
		{ shouldForwardArgs: true },
		undefined,
		undefined,
	);
	instantiationService.stub(IMenuService, new class extends mock<IMenuService>() {
		override getMenuActions(id: MenuId): ReturnType<IMenuService['getMenuActions']> {
			return id === MenuId.ChatSubagentContent ? [['navigation', [action]]] : [];
		}
	}());

	container.classList.add('monaco-workbench', 'interactive-session');
	container.style.width = `${width}px`;
	container.style.padding = '12px';
	container.style.backgroundColor = 'var(--vscode-editor-background)';
	const response = dom.append(container, dom.$('.interactive-response'));
	const value = dom.append(response, dom.$('.value'));
	const element = new class extends mock<IChatResponseViewModel>() {
		override readonly isComplete = false;
		override readonly sessionResource = URI.parse('agent-host-copilotcli:/session');
	}();
	const renderContext: IChatContentPartRenderContext = {
		element,
		inlineTextModels: upcastPartial<InlineTextModelCollection>({}),
		elementIndex: 0,
		container: value,
		content: [],
		contentIndex: 0,
		editorPool: upcastPartial<EditorPool>({}),
		codeBlockStartIndex: 0,
		treeStartIndex: 0,
		diffEditorPool: upcastPartial<DiffEditorPool>({}),
		currentWidth: observableValue('currentWidth', width),
		onDidChangeVisibility: Event.None,
	};
	const data: IChatSubagentToolInvocationData = {
		kind: 'subagent',
		description: 'Review child chat lifecycle',
		chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/review',
		agentName: 'code-review',
		isChatAvailable: state === 'running',
		isActive: state !== 'initializing',
	};
	const invocation = new ChatToolInvocation(
		{ invocationMessage: 'Delegating review', toolSpecificData: data },
		{ id: 'task', displayName: 'Delegate task', modelDescription: 'Delegate task', source: ToolDataSource.Internal },
		'review',
		undefined,
		undefined,
	);
	await invocation.didExecuteTool({ content: [{ kind: 'text', value: 'Agent started in background. You will be notified when it completes.' }] });
	const part = disposableStore.add(instantiationService.createInstance(
		ChatSubagentContentPart,
		'review',
		invocation,
		renderContext,
		instantiationService.createInstance(ChatContentMarkdownRenderer),
		upcastPartial<CollapsibleListPool>({}),
		upcastPartial<EditorPool>({}),
		() => width,
		new Set<string>(),
	));
	value.appendChild(part.domNode);
	if (state === 'running') {
		part.appendToolInvocation(new ChatToolInvocation(
			{ invocationMessage: 'Search for subagent lifecycle handlers' },
			{ id: 'search', displayName: 'Search', modelDescription: 'Search', source: ToolDataSource.Internal },
			'search',
			'review',
			undefined,
		), 0);
	}
}

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	Pending: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => renderSubagent(context, 'pending') }),
	Initializing: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => renderSubagent(context, 'initializing') }),
	Running: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => renderSubagent(context, 'running') }),
});
