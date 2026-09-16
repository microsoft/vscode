/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { AgentHostSubagentProgress } from '../../../../contrib/chat/browser/agentSessions/agentHost/agentHostSubagentProgress.js';
import { ISessionSummaryHoverService, SessionSummaryHoverService } from '../../../../contrib/chat/browser/agentSessions/sessionSummaryHoverService.js';
import { IChatWidgetService } from '../../../../contrib/chat/browser/chat.js';
import { ChatContentMarkdownRenderer } from '../../../../contrib/chat/browser/widget/chatContentMarkdownRenderer.js';
import { ChatListItemRenderer } from '../../../../contrib/chat/browser/widget/chatListRenderer.js';
import { ChatEditorOptions } from '../../../../contrib/chat/browser/widget/chatOptions.js';
import { OpenSubagentChatActionViewItem } from '../../../../contrib/chat/browser/widget/chatContentParts/chatSubagentOpenChat.js';
import { ChatSystemNotificationContentPart } from '../../../../contrib/chat/browser/widget/chatContentParts/chatSystemNotificationContentPart.js';
import { IChatSubagentToolInvocationData } from '../../../../contrib/chat/common/chatService/chatService.js';
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, ChatAgentLocation, ChatConfiguration, ChatModeKind, CollapsedToolsDisplayMode, ThinkingDisplayMode } from '../../../../contrib/chat/common/constants.js';
import { ChatModel } from '../../../../contrib/chat/common/model/chatModel.js';
import { ChatToolInvocation } from '../../../../contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { ChatViewModel, isResponseVM } from '../../../../contrib/chat/common/model/chatViewModel.js';
import { ChatRequestTextPart } from '../../../../contrib/chat/common/requestParser/chatParserTypes.js';
import { ToolDataSource } from '../../../../contrib/chat/common/tools/languageModelToolsService.js';
import { IExtensionsWorkbenchService } from '../../../../contrib/extensions/common/extensions.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { registerChatFixtureServices } from './chatFixtureUtils.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';

async function renderSubagent(context: ComponentFixtureContext, state: 'pending' | 'initializing' | 'running' | 'thinking' | 'parent-complete', readOnly = false, thinkingStyle = ThinkingDisplayMode.FixedScrolling): Promise<void> {
	const { container, disposableStore } = context;
	const width = 620;
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: reg => {
			registerChatFixtureServices(reg);
			reg.define(ISessionSummaryHoverService, SessionSummaryHoverService);
			reg.defineInstance(IExtensionsWorkbenchService, new class extends mock<IExtensionsWorkbenchService>() {
				override async getExtensions() { return []; }
			}());
			reg.defineInstance(IActionViewItemService, new class extends mock<IActionViewItemService>() {
				override readonly onDidChange = Event.None;
				override lookUp(menu: MenuId, commandId: string | MenuId): IActionViewItemFactory | undefined {
					return menu === MenuId.ChatSubagentContent && commandId === CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID
						? (action, options, service) => service.createInstance(OpenSubagentChatActionViewItem, undefined, action, options, true)
						: undefined;
				}
			}());
			reg.defineInstance(IChatWidgetService, new class extends mock<IChatWidgetService>() {
				override getWidgetBySessionResource() { return undefined; }
				override async openSession(resource: URI) {
					container.dataset.openedChat = resource.toString();
					return undefined;
				}
			}());
		},
	});
	const configurationService = instantiationService.get(IConfigurationService) as TestConfigurationService;
	configurationService.setUserConfiguration(ChatConfiguration.SubagentsUseRichRendering, true);
	configurationService.setUserConfiguration(ChatConfiguration.ThinkingGenerateTitles, false);
	configurationService.setUserConfiguration('chat.agent.thinking.collapsedTools', state === 'thinking' ? CollapsedToolsDisplayMode.Always : CollapsedToolsDisplayMode.Off);
	if (state === 'thinking') {
		configurationService.setUserConfiguration(ChatConfiguration.ThinkingStyle, thinkingStyle);
	}
	configurationService.setUserConfiguration(ChatConfiguration.CheckpointsEnabled, false);
	const action = instantiationService.createInstance(
		MenuItemAction,
		{ id: CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, title: 'Open Subagent' },
		undefined,
		{ shouldForwardArgs: true },
		undefined,
		undefined,
	);
	instantiationService.stub(IMenuService, instantiationService.get(IMenuService), 'getMenuActions', (id: MenuId): ReturnType<IMenuService['getMenuActions']> =>
		id === MenuId.ChatSubagentContent ? [['navigation', [action]]] : []);

	container.classList.add('monaco-workbench', 'interactive-session');
	container.style.width = `${width}px`;
	container.style.padding = '12px';
	container.style.backgroundColor = 'var(--vscode-editor-background)';
	const transcript = dom.append(container, dom.$('.interactive-list.subagent-startup-transcript'));
	const model = disposableStore.add(instantiationService.createInstance(ChatModel, undefined, {
		initialLocation: ChatAgentLocation.Chat,
		canUseTools: true,
		resource: URI.parse('agent-host-copilotcli:/session'),
	}));
	const request = model.addRequest({
		text: 'Review',
		parts: [new ChatRequestTextPart(new OffsetRange(0, 6), new Range(1, 1, 1, 7), 'Review')],
	}, { variables: [] }, 0);
	const viewModel = disposableStore.add(instantiationService.createInstance(ChatViewModel, model, undefined));
	const response = viewModel.getItems().find(isResponseVM);
	if (!response) {
		throw new Error('Missing fixture response');
	}
	const renderer = disposableStore.add(instantiationService.createInstance(
		ChatListItemRenderer,
		upcastPartial<ChatEditorOptions>({}),
		{ noHeader: true, noFooter: true, restorable: false, readOnly },
		{
			getListLength: () => 1,
			onDidScroll: () => ({ dispose() { } }),
			container: transcript,
			currentChatMode: () => ChatModeKind.Agent,
			isStickyScrollEnabled: () => false,
			refreshStickyScroll: () => { },
			stickyScrollTopPadding: 0,
		},
		undefined,
		viewModel,
	));
	renderer.layout(width);
	const template = renderer.renderTemplate(transcript);
	disposableStore.add({ dispose: () => renderer.disposeTemplate(template) });
	const node = { element: response, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: undefined };
	const publisher = disposableStore.add(new AgentHostSubagentProgress(parts => {
		for (const part of parts) {
			if (request.response?.isComplete && (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized')) {
				request.response.updateContent(part);
			} else {
				model.acceptResponseProgress(request, part);
			}
		}
		// Match the list's element lifecycle when reusing the response template.
		renderer.disposeElement(node, 0, template);
		renderer.renderElement(node, 0, template);
	}));
	if (state === 'thinking') {
		publisher.publish([{ kind: 'systemNotification', content: new MarkdownString('Background agent `Factorial 1` is complete') }]);
		publisher.publish([{ kind: 'thinking', id: 'before', value: '**Processing agent notifications**\nReview the first result.' }]);
		const tool = new ChatToolInvocation(
			{ invocationMessage: 'Read first agent result', pastTenseMessage: 'Read first agent result' },
			{ id: 'read-agent', displayName: 'Read agent', modelDescription: 'Read agent', source: ToolDataSource.Internal },
			'read-first', undefined, {},
		);
		await tool.didExecuteTool(undefined);
		publisher.publish([tool]);
		publisher.publish([{ kind: 'thinking', id: 'coordinating', value: '**Coordinating parallel tool use**\nWait for the other results.' }]);
		for (const number of [5, 4, 3, 2]) {
			publisher.publish([{ kind: 'systemNotification', content: new MarkdownString(`Background agent \`Factorial ${number}\` is complete`) }]);
		}
		publisher.publish([{ kind: 'thinking', id: 'after', value: '**Reading completed agents**\nReview all remaining results below their completion notices.' }]);
		publisher.publish([new ChatToolInvocation(
			{ invocationMessage: 'Read remaining agent results' },
			{ id: 'read-agent', displayName: 'Read agent', modelDescription: 'Read agent', source: ToolDataSource.Internal },
			'read-remaining', undefined, {},
		)]);
		return;
	}
	publisher.publish([{ kind: 'markdownContent', content: new MarkdownString('Starting two read-only reviews. Other work can continue while they initialize.') }]);
	const launches: ChatToolInvocation[] = [];
	for (const [index, description] of ['Review child chat lifecycle', 'Review state and history'].entries()) {
		const data: IChatSubagentToolInvocationData = {
			kind: 'subagent',
			hasStarted: false,
			description,
			chatResource: `ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/review-${index}`,
			agentName: 'code-review',
			isChatAvailable: state === 'initializing',
			isActive: false,
		};
		const invocation = new ChatToolInvocation(
			{ invocationMessage: 'Delegating review', toolSpecificData: data },
			{ id: 'task', displayName: 'Delegate task', modelDescription: 'Delegate task', source: ToolDataSource.Internal },
			`review-${index}`, undefined, undefined,
		);
		launches.push(invocation);
		publisher.publish([invocation]);
		await invocation.didExecuteTool({ content: [{ kind: 'text', value: 'Agent started in background. You will be notified when it completes.' }] });
	}
	const normalTool = new ChatToolInvocation(
		{ invocationMessage: 'Check outstanding PR feedback', pastTenseMessage: 'Checked outstanding PR feedback' },
		{ id: 'search', displayName: 'Search', modelDescription: 'Search', source: ToolDataSource.Internal },
		'normal-tool', undefined, {},
	);
	await normalTool.didExecuteTool(undefined);
	publisher.publish([normalTool]);
	if (state === 'parent-complete') {
		request.response?.complete();
	}

	const start = (invocation: ChatToolInvocation) => {
		const data = invocation.toolSpecificData;
		if (data?.kind !== 'subagent') {
			throw new Error('Missing fixture subagent');
		}
		data.hasStarted = true;
		data.isChatAvailable = true;
		data.isActive = true;
		invocation.notifyToolSpecificDataChanged();
		publisher.publish([new ChatToolInvocation(
			{ invocationMessage: 'Search for subagent lifecycle handlers' },
			{ id: 'search', displayName: 'Search', modelDescription: 'Search', source: ToolDataSource.Internal },
			`search-${invocation.toolCallId}`, invocation.toolCallId, undefined,
		)]);
	};
	const controls = dom.append(container, dom.$('.subagent-startup-controls'));
	for (const [index, invocation] of launches.entries()) {
		const button = disposableStore.add(new Button(controls, defaultButtonStyles));
		button.label = `Start subagent ${index + 1}`;
		disposableStore.add(button.onDidClick(() => {
			start(invocation);
			button.enabled = false;
		}));
		if (state === 'running' || state === 'parent-complete') {
			button.enabled = false;
		}
	}
	if (state === 'running' || state === 'parent-complete') {
		start(launches[1]);
		start(launches[0]);
	}
}

function renderCompletionNotices(context: ComponentFixtureContext): void {
	const { container, disposableStore } = context;
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: registerChatFixtureServices,
	});
	container.classList.add('interactive-session');
	container.style.width = '620px';
	container.style.padding = '12px';
	const transcript = dom.append(container, dom.$('.interactive-item-container'));
	const renderer = instantiationService.createInstance(ChatContentMarkdownRenderer);
	for (const content of [
		'Background agent `Renderer reviewer` is complete',
		'Background agent `History reviewer` completed',
		'Background agent `Lifecycle reviewer` failed',
	]) {
		const part = disposableStore.add(instantiationService.createInstance(ChatSystemNotificationContentPart, { kind: 'systemNotification', content: new MarkdownString(content) }, renderer));
		transcript.appendChild(part.domNode);
	}
}

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	Pending: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => renderSubagent(context, 'pending') }),
	Initializing: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => renderSubagent(context, 'initializing') }),
	Running: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => renderSubagent(context, 'running') }),
	StartedAfterParentComplete: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => renderSubagent(context, 'parent-complete') }),
	CompletionNotices: defineComponentFixture({ labels: { kind: 'screenshot' }, render: renderCompletionNotices }),
	ThinkingAcrossCompletion: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => renderSubagent(context, 'thinking') }),
	ReadOnlyThinkingAcrossCompletion: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => renderSubagent(context, 'thinking', true) }),
	CollapsedThinkingAcrossCompletion: defineComponentFixture({ labels: { kind: 'screenshot' }, render: context => renderSubagent(context, 'thinking', false, ThinkingDisplayMode.Collapsed) }),
});
