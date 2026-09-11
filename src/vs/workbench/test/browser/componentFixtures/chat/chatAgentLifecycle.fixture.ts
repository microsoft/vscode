/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { timeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IActionViewItemFactory, IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { buildAgentSessionLinkPresentation } from '../../../../../platform/agentHost/common/openSessionLink.js';
import { buildSubagentChatUri } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ILinkPresentationService } from '../../../../../platform/dataChannel/common/dataChannel.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { AgentHostSubagentProgress } from '../../../../contrib/chat/browser/agentSessions/agentHost/agentHostSubagentProgress.js';
import { toAgentHostBackendSessionUri } from '../../../../contrib/chat/browser/agentSessions/agentHost/agentHostSessionUri.js';
import { ISessionSummaryHoverService, SessionSummaryHoverService } from '../../../../contrib/chat/browser/agentSessions/sessionSummaryHoverService.js';
import { IChatWidgetService } from '../../../../contrib/chat/browser/chat.js';
import { getSubagentEditorResource, OpenSubagentChatActionViewItem } from '../../../../contrib/chat/browser/widget/chatContentParts/chatSubagentOpenChat.js';
import { IChatProgress, IChatSubagentToolInvocationData } from '../../../../contrib/chat/common/chatService/chatService.js';
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, ChatAgentLocation, ChatConfiguration, CollapsedToolsDisplayMode, ThinkingDisplayMode } from '../../../../contrib/chat/common/constants.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../../contrib/chat/common/languageModels.js';
import { ChatModel, ChatRequestModel } from '../../../../contrib/chat/common/model/chatModel.js';
import { ChatViewModel } from '../../../../contrib/chat/common/model/chatViewModel.js';
import { ChatToolInvocation } from '../../../../contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { ChatRequestTextPart } from '../../../../contrib/chat/common/requestParser/chatParserTypes.js';
import { ToolDataSource } from '../../../../contrib/chat/common/tools/languageModelToolsService.js';
import { IExtensionsWorkbenchService } from '../../../../contrib/extensions/common/extensions.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { IChatWidgetFixtureHandle, renderChatWidget } from './chatWidget.fixture.js';

type Phase = 'queued' | 'running' | 'parentComplete' | 'lateStart' | 'lateClassification' | 'childComplete' | 'followUp' | 'resumedFollowUp' | 'notified' | 'idleNotice' | 'failed' | 'nested' | 'parallel' | 'peerChat' | 'independentSession';

interface Scenario {
	readonly phase: Phase;
	readonly description: string;
	readonly synchronous?: boolean;
	readonly latestTurnOnly?: boolean;
	readonly model?: 'unknown' | 'late' | 'same' | 'autoParent' | 'byokSame';
	readonly interactive?: boolean;
	readonly openChild?: boolean;
	readonly narrow?: boolean;
}

interface Child {
	readonly title: string;
	readonly invocation: ChatToolInvocation;
	readonly data: IChatSubagentToolInvocationData;
	readonly publisher: AgentHostSubagentProgress;
	readonly background: boolean;
	readonly model: ChatModel;
	readonly viewModel: ChatViewModel;
	readonly parent?: Child;
	readonly parentInvocation?: ChatToolInvocation;
	request?: ChatRequestModel;
	activeTool?: ChatToolInvocation;
	transcriptTool?: ChatToolInvocation;
	forwardedTool?: ChatToolInvocation;
	turns: number;
	steps: number;
}

const scenarios: Record<string, Scenario> = {
	SynchronousRunning: { phase: 'running', synchronous: true, description: 'The launch tool is still executing. The child has its own rich pill and the parent waits for its result.' },
	BackgroundQueued: { phase: 'queued', description: 'The launch returned, but no child turn exists yet. There is no premature pill; this is distinct from a running child hidden in older history.' },
	BackgroundRunning: { phase: 'running', description: 'The launch tool has completed, but its background child is running. The same subagent pill shows its model and latest tool.' },
	SynchronousAgentChat: { phase: 'running', synchronous: true, openChild: true, description: 'Opened by clicking the synchronous subagent pill. This read-only chat uses the same real list renderer; advance progress here or return to the parent.' },
	BackgroundAgentChat: { phase: 'parentComplete', openChild: true, description: 'Opened by clicking a background-agent pill after the parent finished. Its live transcript remains available and continues to update independently.' },
	NestedBackgroundChat: { phase: 'nested', openChild: true, description: 'The completed direct child has a running nested background agent. Click its pill to inspect the nested worker rather than hiding it behind the completed parent.' },
	ParentCompleteChildRunning: { phase: 'parentComplete', description: 'The parent finished after the child started. The running pill stays before the final answer and outside completed-step disclosure.' },
	ChildStartsAfterParentComplete: { phase: 'lateStart', description: 'The child starts after the parent finished. Its pill is appended after the original answer, not into the newer response below it.' },
	LateSubagentClassification: { phase: 'lateClassification', description: 'A completed generic task is identified as a running background agent after the parent finishes. It becomes a rich pill at its original position, before the final answer.' },
	ChildCompletesAfterParent: { phase: 'childComplete', description: 'The child completes after its parent. The existing pill settles in place and completed earlier work can fold again.' },
	RetainedFollowUpFullConversation: { phase: 'followUp', description: 'Log-derived case: a later write_agent sends a follow-up to an older, already-running background worker. Its original pill is active above; the newest parent response still says Working. No new child turn starts.' },
	RetainedFollowUpLatestTurn: { phase: 'followUp', latestTurnOnly: true, description: 'Known visibility gap from the supplied logs: this viewport shows the latest turn, while the active worker pill belongs to an earlier response. Use Show Original Agent to find it.' },
	ResumedIdleBackgroundAgent: { phase: 'resumedFollowUp', description: 'A different case: the older background worker completed before the follow-up. Resuming it reactivates its original pill, without adding a launch to the latest parent response.' },
	BackgroundCompletionNotification: { phase: 'notified', description: 'The retained worker finishes while the latest parent is waiting. The old pill settles, and the current response receives the background-completion notice.' },
	CompletionWakesIdleParent: { phase: 'idleNotice', description: 'A background-completion notification starts a new system-initiated turn. The old parent response remains complete; it is not reopened.' },
	BackgroundFailureNotification: { phase: 'failed', description: 'A failed background task stops running and its failure notice appears in a new system-initiated turn. The original child pill is retained.' },
	NestedBackgroundRunning: { phase: 'nested', description: 'A direct child finishes while its nested background worker continues. The containing root card must not be folded into completed steps.' },
	ParallelBackgroundAgents: { phase: 'parallel', description: 'Two background workers are active with different tasks. A third is queued and does not reserve an earlier empty slot.' },
	UnknownModel: { phase: 'running', model: 'unknown', description: 'The child is known to be running, but its model is not known yet. Do not invent a model name.' },
	LateModelDiscovery: { phase: 'running', model: 'late', description: 'The worker starts without model metadata. Show Model publishes its identity while it is still running; the existing pill must update without waiting for completion.' },
	MatchingParentModel: { phase: 'running', model: 'same', description: 'The child and parent have the same canonical model. The redundant inline model label is hidden.' },
	AutoParentConcreteChild: { phase: 'running', model: 'autoParent', description: 'The parent selected Auto. The known concrete child model remains useful information and is shown.' },
	MatchingByokModel: { phase: 'running', model: 'byokSame', description: 'The child display name includes its provider, but its canonical model matches the parent. The inline label stays hidden.' },
	CreatedPeerChat: { phase: 'peerChat', description: 'create_session(currentSession) creates a peer chat, not a child task. Its structured result is a chat link after the final answer.' },
	CreatedIndependentSession: { phase: 'independentSession', description: 'create_session(independent) creates a separate session. Its structured result is a session link, not a subagent progress pill.' },
	NarrowBackgroundRunning: { phase: 'running', narrow: true, description: 'The same live child pill in a narrow pane: task, model, and latest tool must remain usable without horizontal overflow.' },
	InteractiveLifecycle: { phase: 'queued', interactive: true, description: 'Step through queued -> running -> parent complete -> child complete -> retained follow-up -> notification. These controls feed real chat models; no real agent or session is started.' },
};

async function renderLifecycle(context: ComponentFixtureContext, name: string, scenario: Scenario): Promise<void> {
	const { container, disposableStore } = context;
	const width = scenario.narrow ? 380 : 760;
	const isFollowUp = scenario.phase === 'followUp' || scenario.phase === 'resumedFollowUp' || scenario.phase === 'notified';
	const height = scenario.latestTurnOnly ? 280 : isFollowUp ? 760 : 500;
	container.style.width = `${width}px`;
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.gap = 'var(--vscode-spacing-size120)';
	const heading = dom.append(container, dom.$('h3', undefined, name.replace(/([a-z])([A-Z])/g, '$1 $2')));
	heading.style.margin = '0';
	const description = dom.append(container, dom.$('p', { role: 'note' }, scenario.description));
	description.style.margin = '0';
	description.style.color = 'var(--vscode-descriptionForeground)';
	const controls = dom.append(container, dom.$('.agent-lifecycle-fixture-controls', { role: 'group', 'aria-label': 'Scenario controls' }));
	controls.style.display = 'flex';
	controls.style.flexWrap = 'wrap';
	controls.style.gap = 'var(--vscode-spacing-size80)';
	const preview = dom.append(container, dom.$('.agent-lifecycle-fixture-preview'));
	const feedback = dom.append(container, dom.$('p', { role: 'status', 'aria-live': 'polite' }, 'Preview only. No real agents or sessions are created.'));
	feedback.style.margin = '0';

	const parentRawModel = scenario.model === 'autoParent' ? 'auto' : scenario.model === 'byokSame' ? 'openrouter/amazon/nova-micro-v1' : 'gpt-6-astra';
	const parentModelName = scenario.model === 'autoParent' ? 'Auto' : scenario.model === 'byokSame' ? 'Amazon: Nova Micro 1.0' : 'GPT-6 Astra';
	const parentModelId = `agent-host-copilotcli:${parentRawModel}`;
	const parentMetadata: ILanguageModelChatMetadata = {
		extension: new ExtensionIdentifier('fixture.agent-host'),
		id: parentRawModel,
		name: parentModelName,
		vendor: 'agent-host-copilotcli',
		version: '1',
		family: parentRawModel,
		maxInputTokens: 128000,
		maxOutputTokens: 16000,
		isDefaultForLocation: { panel: true },
		capabilities: { toolCalling: true, agentMode: true },
	};
	let handle: IChatWidgetFixtureHandle | undefined;
	await renderChatWidget({ ...context, container: preview }, {
		messages: [],
		agentHostSession: true,
		inputVisible: false,
		width,
		height,
		listHeight: height,
		stickyScroll: false,
		additionalServices: reg => {
			reg.define(ISessionSummaryHoverService, SessionSummaryHoverService);
			reg.defineInstance(IExtensionsWorkbenchService, new class extends mock<IExtensionsWorkbenchService>() {
				override async getExtensions() { return []; }
			}());
			reg.defineInstance(IActionViewItemService, new class extends mock<IActionViewItemService>() {
				override readonly onDidChange = Event.None;
				override lookUp(menu: MenuId, command: string | MenuId): IActionViewItemFactory | undefined {
					return menu === MenuId.ChatSubagentContent && command === CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID
						? (action, options, service) => service.createInstance(OpenSubagentChatActionViewItem, undefined, action, options, true)
						: undefined;
				}
			}());
			reg.defineInstance(ILanguageModelsService, new class extends mock<ILanguageModelsService>() {
				override readonly onDidChangeLanguageModels = Event.None;
				override readonly onDidChangeModelVisibility = Event.None;
				override getLanguageModelIds() { return [parentModelId]; }
				override lookupLanguageModel(id: string) { return id === parentModelId ? parentMetadata : undefined; }
				override getVendors() { return []; }
				override getLanguageModelGroups() { return []; }
				override getHiddenModelIds() { return []; }
				override isModelHidden() { return false; }
				override hasResolvedVendor() { return true; }
				override getModelConfiguration() { return undefined; }
				override getModelConfigurationActions() { return []; }
			}());
			reg.defineInstance(IOpenerService, new class extends mock<IOpenerService>() {
				override async open(resource: URI | string) {
					feedback.textContent = `Would open ${resource.toString()}`;
					return true;
				}
			}());
		},
		linkPresentationService: new class extends mock<ILinkPresentationService>() {
			override getLinkPresentationRule(resource: URI) {
				return resource.scheme === 'agent-host-session' ? { id: 'fixture-created-work', uriPattern: /^agent-host-session:/, kind: 'session' as const } : undefined;
			}
			override createLinkPresentationWatcher() {
				const peer = scenario.phase === 'peerChat';
				return {
					presentation: constObservable(buildAgentSessionLinkPresentation(peer ? 'Fixture review chat' : 'Fixture validation session', undefined, 'inProgress', peer ? 'chat' : 'session')),
					dispose() { },
				};
			}
		}(),
		onRendered: value => handle = value,
	});
	if (!handle) {
		throw new Error('Agent lifecycle fixture did not initialize');
	}
	const { model, viewModel, listWidget, instantiationService } = handle;
	const children = new ResourceMap<Child>();
	let inspectedChild: Child | undefined;
	const config = instantiationService.get(IConfigurationService) as TestConfigurationService;
	config.setUserConfiguration(ChatConfiguration.ThinkingStyle, ThinkingDisplayMode.Collapsed);
	config.setUserConfiguration('chat.agent.thinking.collapsedTools', CollapsedToolsDisplayMode.Always);
	config.setUserConfiguration(ChatConfiguration.ThinkingGenerateTitles, false);
	config.setUserConfiguration(ChatConfiguration.ThinkingPhrases, { mode: 'replace', phrases: ['Working'] });
	config.setUserConfiguration(ChatConfiguration.SubagentsUseRichRendering, true);
	config.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, true);
	config.setUserConfiguration(ChatConfiguration.ToolConfirmationCarousel, false);
	config.setUserConfiguration(ChatConfiguration.CheckpointsEnabled, false);
	config.setUserConfiguration(ChatConfiguration.Verbose, false);
	config.setUserConfiguration(ChatConfiguration.RichLinks, true);
	const openAction = instantiationService.createInstance(MenuItemAction, { id: CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, title: 'Open Subagent' }, undefined, { shouldForwardArgs: true }, undefined, undefined);
	instantiationService.stub(IMenuService, instantiationService.get(IMenuService), 'getMenuActions', (menu: MenuId): ReturnType<IMenuService['getMenuActions']> =>
		menu === MenuId.ChatSubagentContent ? [['navigation', [openAction]]] : []);
	model.inputModel.setState({ selectedModel: { identifier: parentModelId, metadata: parentMetadata } });
	disposableStore.add(viewModel.onDidChange(() => listWidget.refresh()));

	const request = (text: string, systemInitiated = false, targetModel = model, modelId = parentModelId) => targetModel.addRequest({
		text, parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)],
	}, { variables: [] }, 0, undefined, undefined, undefined, undefined, undefined, undefined, undefined, modelId,
		undefined, undefined, systemInitiated, undefined, undefined, undefined, undefined, undefined, undefined, systemInitiated);
	const publish = (target: ChatRequestModel, parts: IChatProgress[], targetModel = model) => {
		for (const part of parts) {
			if (target.response?.isComplete && (part.kind === 'toolInvocation' || part.kind === 'markdownContent')) {
				target.response.updateContent(part);
			} else {
				targetModel.acceptResponseProgress(target, part);
			}
		}
	};
	const markdown = (target: ChatRequestModel, text: string) => publish(target, [{ kind: 'markdownContent', content: new MarkdownString(`${text}\n\n`) }]);
	const completeParent = (target: ChatRequestModel) => {
		markdown(target, '**Task completed:** Parent work is finished; delegated work has its own lifecycle.');
		target.response?.setElapsedMs(65000);
		target.response?.complete();
	};
	const root = request('Split the fixture work and review the card header.');
	let current = root;
	const publisher = disposableStore.add(new AgentHostSubagentProgress(parts => publish(root, parts)));
	const launch = async (id: string, title: string, parent?: string): Promise<Child> => {
		const lateClassification = scenario.phase === 'lateClassification';
		const backendSession = toAgentHostBackendSessionUri(model.sessionResource);
		if (!backendSession) {
			throw new Error('Agent lifecycle fixture requires an agent-host session');
		}
		const chatResource = buildSubagentChatUri(backendSession, id);
		const editorResource = getSubagentEditorResource({ chatResource, parentSessionResource: model.sessionResource.toString() });
		if (!editorResource) {
			throw new Error(`Cannot build the child editor resource for ${id}`);
		}
		const data: IChatSubagentToolInvocationData = {
			kind: 'subagent', description: title, agentName: 'general-purpose',
			hasStarted: false, isActive: false, isChatAvailable: false,
			chatResource,
		};
		const createInvocation = (parentId?: string) => new ChatToolInvocation(
			{ invocationMessage: title, toolSpecificData: lateClassification ? undefined : data },
			{ id: 'task', displayName: 'Task', modelDescription: 'Delegate work', source: ToolDataSource.Internal },
			id, parentId, { mode: scenario.synchronous ? 'sync' : 'background' },
		);
		const invocation = createInvocation(parent);
		const childModel = disposableStore.add(instantiationService.createInstance(ChatModel, undefined, {
			initialLocation: ChatAgentLocation.Chat, canUseTools: false, resource: editorResource, isReadOnly: constObservable(true),
		}));
		const childViewModel = disposableStore.add(instantiationService.createInstance(ChatViewModel, childModel, undefined));
		const parentChild = [...children.values()].find(child => child.invocation.toolCallId === parent);
		const parentInvocation = parentChild ? createInvocation() : undefined;
		const child: Child = {
			title, invocation, data, publisher, background: !scenario.synchronous,
			model: childModel, viewModel: childViewModel, parent: parentChild, parentInvocation, turns: 0, steps: 0,
		};
		children.set(editorResource, child);
		disposableStore.add(childViewModel.onDidChange(() => {
			if (inspectedChild === child) {
				listWidget.refresh();
			}
		}));
		if (parentChild?.request && parentInvocation) {
			publish(parentChild.request, [parentInvocation], parentChild.model);
		}
		if (lateClassification) {
			publish(root, [invocation]);
		} else {
			publisher.publish([invocation]);
		}
		if (child.background) {
			await invocation.didExecuteTool({ content: [{ kind: 'text', value: 'Agent started in background.' }] });
			await parentInvocation?.didExecuteTool({ content: [{ kind: 'text', value: 'Agent started in background.' }] });
		}
		return child;
	};
	const setChildModel = (child: Child) => {
		child.data.modelId = scenario.model === 'same' || scenario.model === 'byokSame' ? parentModelId : 'agent-host-copilotcli:gpt-5.6-sol';
		child.data.modelName = scenario.model === 'byokSame' ? 'OpenRouter/Amazon: Nova Micro 1.0' : scenario.model === 'same' ? parentModelName : 'GPT-5.6 Sol';
	};
	const notifyChild = (child: Child) => {
		child.invocation.notifyToolSpecificDataChanged();
		child.parentInvocation?.notifyToolSpecificDataChanged();
	};
	const childToolLabels = ['Read fixture rendering code', 'Validate the sticky header', 'Run the renderer regression tests'];
	const startChildTool = (child: Child) => {
		if (!child.request) {
			throw new Error('Cannot publish child progress before a child turn starts');
		}
		const label = childToolLabels[child.steps++ % childToolLabels.length];
		const createTool = (parent?: string) => new ChatToolInvocation(
			{ invocationMessage: label, icon: Codicon.search },
			{ id: 'fixture_review_step', displayName: 'Review Step', modelDescription: 'Review fixture behavior', source: ToolDataSource.Internal },
			`${child.invocation.toolCallId}-tool-${child.turns}-${child.steps}`, parent, {},
		);
		child.activeTool = createTool(child.invocation.subAgentInvocationId ?? child.invocation.toolCallId);
		child.transcriptTool = createTool();
		child.publisher.publish([child.activeTool]);
		publish(child.request, [child.transcriptTool], child.model);
		if (child.parent?.request) {
			child.forwardedTool = createTool(child.invocation.toolCallId);
			publish(child.parent.request, [child.forwardedTool], child.parent.model);
		}
	};
	const finishChildTool = async (child: Child) => {
		await child.activeTool?.didExecuteTool({ content: [], toolResultMessage: 'Validated fixture behavior' });
		await child.transcriptTool?.didExecuteTool({ content: [], toolResultMessage: 'Validated fixture behavior' });
		await child.forwardedTool?.didExecuteTool({ content: [], toolResultMessage: 'Validated fixture behavior' });
	};
	const start = (child: Child) => {
		child.turns++;
		child.data.hasStarted = true;
		child.data.isActive = true;
		child.data.isChatAvailable = true;
		child.data.startedAt = Date.now() - 5000;
		child.data.duration = undefined;
		if (scenario.model !== 'unknown' && scenario.model !== 'late') {
			setChildModel(child);
		}
		notifyChild(child);
		child.request = request(child.turns === 1 ? child.title : 'Continue the delegated review', false, child.model, child.data.modelId);
		publish(child.request, [{
			kind: 'markdownContent',
			content: new MarkdownString('I am checking the shared agent rendering and progress updates.\n\n'),
		}], child.model);
		startChildTool(child);
	};
	const finish = async (child: Child) => {
		await finishChildTool(child);
		if (!child.background) {
			await child.invocation.didExecuteTool({ content: [{ kind: 'text', value: 'Review finished.' }] });
			await child.parentInvocation?.didExecuteTool({ content: [{ kind: 'text', value: 'Review finished.' }] });
		}
		child.data.isActive = false;
		child.data.duration = 65000;
		child.data.credits = 1.2;
		notifyChild(child);
		child.request?.response?.complete();
	};
	const followUp = async (child: Child) => {
		current = request('continue');
		const write = new ChatToolInvocation(
			{ invocationMessage: 'Write to agent', pastTenseMessage: 'Wrote to the retained background agent' },
			{ id: 'write_agent', displayName: 'Write to Agent', modelDescription: 'Send a follow-up', source: ToolDataSource.Internal },
			`write-${child.turns}`, undefined, { agent_id: 'fixture-background-agent' },
		);
		publish(current, [write]);
		await write.didExecuteTool(undefined);
		markdown(current, 'Continuing with the background reviewer on the sticky-header transition. I will review its results when it finishes.');
		if (!child.data.isActive) {
			start(child);
		}
	};
	const notice = async (child: Child) => {
		await finish(child);
		publish(current, [{ kind: 'systemNotification', content: new MarkdownString('Background agent `Fixture reviewer` is complete') }]);
		markdown(current, 'The background review finished. Reviewing the results.');
	};
	markdown(root, 'Delegating a read-only fixture review. The main agent can keep working independently.');

	let first: Child | undefined;
	if (scenario.phase === 'peerChat' || scenario.phase === 'independentSession') {
		const peer = scenario.phase === 'peerChat';
		const invocation = new ChatToolInvocation({
			invocationMessage: peer ? 'Creating a peer chat' : 'Creating a separate session',
			toolSpecificData: {
				kind: 'sessionCreated', isChat: peer,
				label: peer ? 'Fixture review chat' : 'Fixture validation session',
				openLink: peer ? 'agent-host-session://copilotcli/session?chat=fixture-review' : 'agent-host-session://copilotcli/fixture-session',
			},
		}, { id: 'create_session', displayName: 'Create Session', modelDescription: 'Create delegated work', source: ToolDataSource.Internal }, 'create-work', undefined, { relationship: peer ? 'currentSession' : 'independent' });
		publish(root, [invocation]);
		await invocation.didExecuteTool({ content: [{ kind: 'text', value: 'Created work.' }] });
		completeParent(root);
	} else {
		first = await launch('fixture-review', 'Extract fixture-only changes');
		if (scenario.phase === 'lateStart') {
			completeParent(root);
			current = request('A separate, newer question');
			markdown(current, 'This newer response is not the owner of the background task.');
			current.response?.complete();
			start(first);
		} else if (scenario.phase === 'lateClassification') {
			completeParent(root);
			await timeout(100);
			if (preview.querySelector('.chat-subagent-pill-widget')) {
				throw new Error(`${name}: the unclassified task must not already render as a subagent`);
			}
			first.invocation.toolSpecificData = first.data;
			start(first);
		} else if (scenario.phase !== 'queued') {
			start(first);
			if (scenario.phase === 'parallel') {
				const second = await launch('history-review', 'Review restored history');
				start(second);
				await launch('queued-review', 'Queued accessibility review');
			}
			if (scenario.phase === 'nested') {
				const nested = await launch('nested-review', 'Review nested background work', first.invocation.toolCallId);
				start(nested);
				await finish(first);
				completeParent(root);
			}
			if (scenario.phase === 'parentComplete' || scenario.phase === 'childComplete' || isFollowUp) {
				completeParent(root);
			}
			if (scenario.phase === 'childComplete' || scenario.phase === 'resumedFollowUp') {
				await finish(first);
			}
			if (isFollowUp) {
				await followUp(first);
			}
			if (scenario.phase === 'notified') {
				await notice(first);
			}
			if (scenario.phase === 'idleNotice' || scenario.phase === 'failed') {
				completeParent(root);
				await finish(first);
				const message = scenario.phase === 'failed' ? 'Background agent `Fixture reviewer` failed' : 'Background agent `Fixture reviewer` is complete';
				current = request(message, true);
				publish(current, [{ kind: 'systemNotification', content: new MarkdownString(message) }]);
				markdown(current, scenario.phase === 'failed' ? 'The delegated review failed. I will inspect the error before retrying.' : 'The delegated review finished. I will inspect its results.');
			}
		}
	}

	const settle = () => timeout(1200);
	const revealOriginal = () => {
		showParent();
		listWidget.scrollTop = 0;
		feedback.textContent = 'Showing the original response that owns the child pill.';
	};
	const revealLatest = () => {
		showParent();
		listWidget.scrollTop = listWidget.scrollHeight;
		feedback.textContent = 'Showing the latest turn. An older active child does not create a new pill here.';
	};
	const addControl = (label: string, action: () => void | Promise<void>) => {
		const button = disposableStore.add(new Button(controls, { ...defaultButtonStyles, secondary: true }));
		button.label = label;
		button.element.style.width = 'auto';
		disposableStore.add(button.onDidClick(() => {
			void (async () => action())().catch(error => {
				feedback.textContent = `Scenario failed: ${String(error)}`;
				throw error;
			});
		}));
		return button;
	};
	let parentScrollTop = 0;
	const showParent = () => {
		if (!inspectedChild) {
			return;
		}
		inspectedChild = undefined;
		listWidget.setViewModel(viewModel);
		listWidget.refresh();
		listWidget.scrollTop = parentScrollTop;
		listWidget.focus();
		dom.hide(back.element);
		delete container.dataset.openedChat;
	};
	const back = addControl('Back to Parent', () => {
		showParent();
		feedback.textContent = 'Showing the parent conversation. Click a child pill to inspect its live transcript.';
	});
	dom.hide(back.element);
	const openSession: IChatWidgetService['openSession'] = async resource => {
		const child = children.get(resource);
		if (!child || !child.data.isChatAvailable) {
			throw new Error(`No available fixture child chat for ${resource.toString()}`);
		}
		if (!inspectedChild) {
			parentScrollTop = listWidget.scrollTop;
		}
		inspectedChild = child;
		listWidget.setViewModel(child.viewModel);
		listWidget.refresh();
		listWidget.scrollTop = 0;
		dom.show(back.element);
		back.focus();
		container.dataset.openedChat = resource.toString();
		feedback.textContent = `Viewing the ${child.background ? 'background agent' : 'synchronous subagent'} chat: ${child.data.description}. This is a read-only preview, not a new agent.`;
		return undefined;
	};
	instantiationService.stub(IChatWidgetService, instantiationService.get(IChatWidgetService), 'openSession', openSession);
	if (first) {
		const firstChild = first;
		const advance = addControl('Advance Child Progress', async () => {
			const child = inspectedChild ?? firstChild;
			if (!child.data.isActive) {
				feedback.textContent = 'This child is not running. Start or resume it before advancing its progress.';
				return;
			}
			advance.enabled = false;
			try {
				await finishChildTool(child);
				startChildTool(child);
				feedback.textContent = `Updated the ${child.background ? 'background agent' : 'synchronous subagent'}: ${childToolLabels[(child.steps - 1) % childToolLabels.length]}.`;
			} finally {
				advance.enabled = true;
			}
		});
	}
	if (isFollowUp) {
		addControl('Show Original Agent', revealOriginal);
		addControl('Show Latest Turn', revealLatest);
	}
	if (scenario.model === 'late' && first) {
		const child = first;
		const showModel = addControl('Show Model', () => {
			setChildModel(child);
			notifyChild(child);
			showModel.enabled = false;
			feedback.textContent = 'Published GPT-5.6 Sol while the existing child is still running.';
		});
	}
	if (scenario.interactive && first) {
		const child = first;
		const steps = [
			{ label: 'Start Child', run: async () => start(child) },
			{ label: 'Finish Parent', run: async () => completeParent(root) },
			{ label: 'Finish Child', run: async () => finish(child) },
			{ label: 'Send Follow-up', run: async () => followUp(child) },
			{ label: 'Complete Follow-up', run: async () => notice(child) },
		];
		let step = 0;
		const next = addControl(steps[0].label, async () => {
			next.enabled = false;
			const action = steps[step++];
			await action.run();
			await settle();
			feedback.textContent = `Applied: ${action.label}. Parent complete: ${root.response?.isComplete}. Child active: ${child.data.isActive}.`;
			next.label = steps[step]?.label ?? 'Lifecycle Complete';
			next.enabled = step < steps.length;
		});
	}
	listWidget.refresh();
	await settle();
	if (scenario.latestTurnOnly) {
		revealLatest();
	}
	const rootLaunches = root.response?.response.value.filter(part => (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') && part.toolSpecificData?.kind === 'subagent' && !part.subAgentInvocationId) ?? [];
	const expectedLaunches = scenario.phase === 'queued' || scenario.phase === 'peerChat' || scenario.phase === 'independentSession' ? 0 : scenario.phase === 'parallel' ? 2 : 1;
	if (rootLaunches.length !== expectedLaunches) {
		throw new Error(`${name}: expected ${expectedLaunches} published child launches, got ${rootLaunches.length}`);
	}
	if (isFollowUp) {
		const currentLaunches = current.response?.response.value.filter(part => (part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized') && part.toolSpecificData?.kind === 'subagent') ?? [];
		const expectedChildTurns = scenario.phase === 'resumedFollowUp' ? 2 : 1;
		if (currentLaunches.length !== 0 || !root.response?.isComplete || current.response?.isComplete || first?.turns !== expectedChildTurns) {
			throw new Error(`${name}: retained child must stay owned by the completed original response`);
		}
	}
	if (scenario.phase === 'peerChat' || scenario.phase === 'independentSession') {
		if (!preview.querySelector('.chat-open-session-result') || preview.querySelector('.chat-subagent-pill-widget')) {
			throw new Error(`${name}: created work must render as a chat/session result, not a subagent pill`);
		}
	} else if (expectedLaunches > 0 && !scenario.latestTurnOnly && !preview.querySelector('.chat-subagent-pill-widget')) {
		throw new Error(`${name}: expected the real subagent pill`);
	}
	const pill = preview.querySelector<HTMLElement>('.chat-subagent-pill-widget');
	if (pill) {
		const expectedModel = scenario.model === 'unknown' || scenario.model === 'late' || scenario.model === 'same' || scenario.model === 'byokSame' ? '' : 'GPT-5.6 Sol';
		const displayedModel = pill.querySelector('.chat-subagent-pill-model')?.textContent ?? '';
		if (displayedModel !== expectedModel) {
			throw new Error(`${name}: expected inline model "${expectedModel}", got "${displayedModel}"`);
		}
		if (scenario.phase === 'lateStart' || scenario.phase === 'lateClassification' || scenario.phase === 'parentComplete') {
			const answer = [...(pill.closest('[role="listitem"]')?.querySelectorAll('p') ?? [])].find(paragraph => paragraph.textContent?.includes('Parent work is finished'));
			const pillFollowsAnswer = answer && (answer.compareDocumentPosition(pill) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
			if (!answer || pillFollowsAnswer !== (scenario.phase === 'lateStart')) {
				throw new Error(`${name}: the pill must keep its position relative to the original final answer`);
			}
		}
	}
	if (scenario.phase === 'followUp' || scenario.phase === 'resumedFollowUp') {
		const latestResponse = preview.querySelector('.chat-most-recent-response');
		if (latestResponse?.querySelector('.chat-subagent-pill-widget') || latestResponse?.querySelector('.shimmer-progress')?.textContent !== 'Working') {
			throw new Error(`${name}: the latest turn must expose the current generic Working visibility gap`);
		}
	}
	if (scenario.openChild && first) {
		const openPill = pill?.querySelector<HTMLElement>('.chat-subagent-pill-content');
		if (!openPill) {
			throw new Error(`${name}: expected a clickable child pill`);
		}
		openPill.click();
		if (container.dataset.openedChat !== first.model.sessionResource.toString()) {
			throw new Error(`${name}: clicking the pill did not open the matching child chat`);
		}
	}
	container.dataset.agentLifecycleScenario = name;
	container.dataset.expectedLaunches = String(expectedLaunches);
	container.dataset.validation = 'passed';
}

export default defineThemedFixtureGroup({ path: 'chat/agent-lifecycle/' }, Object.fromEntries(
	Object.entries(scenarios).map(([name, scenario]) => [name, defineComponentFixture({
		labels: { kind: 'screenshot' },
		virtualTime: { durationMs: 2000 },
		additionalThemes: name === 'RetainedFollowUpLatestTurn' || name === 'ParentCompleteChildRunning' ? ['darkHighContrast', 'lightHighContrast'] : [],
		expectedVisualDescriptions: [scenario.description],
		render: context => renderLifecycle(context, name, scenario),
	})]),
));
