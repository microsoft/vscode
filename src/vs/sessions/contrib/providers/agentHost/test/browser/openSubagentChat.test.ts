/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventType } from '../../../../../../base/browser/dom.js';
import { Action } from '../../../../../../base/common/actions.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { buildSubagentChatUri } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, ChatConfiguration } from '../../../../../../workbench/contrib/chat/common/constants.js';
import { ILanguageModelsService } from '../../../../../../workbench/contrib/chat/common/languageModels.js';
import { workbenchInstantiationService } from '../../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import { IChat } from '../../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { OpenSubagentChatActionViewItem, OpenSubagentChatActionViewItemContribution, shouldShowSubagentModel } from '../../browser/openSubagentChat.js';

class TestOpenSubagentChatActionViewItem extends OpenSubagentChatActionViewItem {
	get tooltip(): string | undefined {
		return this.getTooltip();
	}
}

suite('OpenSubagentChatActionViewItemContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const toSide of [undefined, true]) {
		for (const parentSessionResource of [undefined, 'agent-host-copilotcli:/session#peer']) {
			test(`opens subagents beside their parent through the sessions service (toSide=${toSide}, parent=${parentSessionResource})`, async () => {
				const instantiationService = workbenchInstantiationService(undefined, store);
				const resource = URI.parse('agent-host-copilotcli:/session');
				const chat = upcastPartial<IChat>({ resource: resource.with({ fragment: 'subagent/launch' }) });
				const session = upcastPartial<IActiveSession>({
					sessionId: 'session',
					resource,
					chats: constObservable([chat]),
				});
				const otherSession = upcastPartial<IActiveSession>({
					sessionId: 'other',
					resource: resource.with({ path: '/other' }),
					chats: constObservable([upcastPartial<IChat>({ resource: chat.resource.with({ path: '/other' }) })]),
				});
				const opened: { toSide: boolean; sessionId: string; resource: URI; referenceChatResource?: URI }[] = [];
				instantiationService.stub(ISessionsService, {
					activeSession: constObservable(otherSession),
					visibleSessions: constObservable([otherSession, session]),
					openChat: async (session, resource) => {
						opened.push({ toSide: false, sessionId: session.sessionId, resource });
					},
					openChatToSide: async (session, resource, options) => {
						opened.push({ toSide: true, sessionId: session.sessionId, resource, referenceChatResource: options?.referenceChatResource });
					},
				});
				store.add(instantiationService.createInstance(OpenSubagentChatActionViewItemContribution));
				const command = CommandsRegistry.getCommand(CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID);
				assert.ok(command);

				await instantiationService.invokeFunction(command.handler, {
					chatResource: buildSubagentChatUri('copilot:/session', 'launch'),
					parentSessionResource,
					toSide,
				});

				assert.deepStrictEqual(opened, [{
					toSide: true,
					sessionId: session.sessionId,
					resource: chat.resource,
					referenceChatResource: parentSessionResource ? URI.parse(parentSessionResource) : undefined,
				}]);
			});
		}
	}
});

suite('OpenSubagentChatActionViewItem', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('shows the subagent model unless it matches the parent model', () => {
		assert.deepStrictEqual([
			shouldShowSubagentModel(undefined, 'agent-host-copilotcli:gpt-5.6-sol', 'GPT-5.6 Sol', 'gpt-5.6-sol'),
			shouldShowSubagentModel('GPT-5.6 Sol', undefined, undefined, undefined),
			shouldShowSubagentModel('gpt-5.6-sol', 'agent-host-copilotcli:gpt-5.6-sol', 'GPT-5.6 Sol', 'gpt-5.6-sol'),
			shouldShowSubagentModel('GPT-5.6 Sol', 'agent-host-copilotcli:gpt-5.6-sol', 'GPT-5.6 Sol', 'gpt-5.6-sol'),
			shouldShowSubagentModel('Claude Opus 4.8', 'agent-host-copilotcli:gpt-5.6-sol', 'GPT-5.6 Sol', 'gpt-5.6-sol'),
		], [
			false,
			true,
			false,
			false,
			true,
		]);
	});

	test('shows a concrete model under an Auto parent but never shows Auto itself', () => {
		assert.deepStrictEqual([
			// Auto names no real model, so it is never worth showing.
			shouldShowSubagentModel('Auto', 'agent-host-copilotcli:auto', 'Auto', 'auto'),
			shouldShowSubagentModel('Auto', 'agent-host-copilotcli:gpt-5.6-sol', 'GPT-5.6 Sol', 'gpt-5.6-sol'),
			// Under Auto the routed model is new information, even when it is what Auto picked.
			shouldShowSubagentModel('GPT-5.6 Sol', 'agent-host-copilotcli:auto', 'Auto', 'auto'),
			shouldShowSubagentModel('Claude Opus 4.8', 'agent-host-copilotcli:auto', 'Auto', 'auto'),
			// The parent resolved to this very model, yet its chip still only says "Auto".
			shouldShowSubagentModel('gpt-5.6-sol', 'agent-host-copilotcli:auto', 'Auto', 'gpt-5.6-sol'),
			// The picker moved to Auto after the request started, but the request itself
			// ran on a concrete model, so a matching subagent model is still redundant.
			shouldShowSubagentModel('gpt-5.6-sol', 'agent-host-copilotcli:gpt-5.6-sol', 'Auto', 'auto'),
		], [
			false,
			false,
			true,
			true,
			true,
			false,
		]);
	});

	test('keeps the rich pill visible but disables opening until its peer chat resolves', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ISessionsService, {
			activeSession: observableValue<IActiveSession | undefined>('activeSession', undefined),
			visibleSessions: observableValue<readonly (IActiveSession | undefined)[]>('visibleSessions', []),
		});
		instantiationService.stub(ILanguageModelsService, {
			onDidChangeLanguageModels: Event.None,
			lookupLanguageModel: () => undefined,
		});
		const action = store.add(new Action('openSubagent', 'Open Subagent'));
		const viewItem = store.add(instantiationService.createInstance(
			OpenSubagentChatActionViewItem,
			{ chatResource: 'ahp-chat://subagent/session/tool-call' },
			action,
			{},
			false,
		));
		const container = document.createElement('div');

		viewItem.render(container);

		assert.deepStrictEqual({
			enabled: viewItem.action.enabled,
			sourceActionEnabled: action.enabled,
			hidden: container.classList.contains('hidden'),
			ariaHidden: container.getAttribute('aria-hidden'),
			modelHidden: container.querySelector('.chat-subagent-pill-model')?.classList.contains('hidden'),
		}, {
			enabled: false,
			sourceActionEnabled: false,
			hidden: false,
			ariaHidden: 'false',
			modelHidden: true,
		});
	});

	test('provides drag data and opens to the side from the keyboard', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ISessionsService, {
			activeSession: observableValue<IActiveSession | undefined>('activeSession', undefined),
			visibleSessions: observableValue<readonly (IActiveSession | undefined)[]>('visibleSessions', []),
		});
		instantiationService.stub(ILanguageModelsService, {
			onDidChangeLanguageModels: Event.None,
			lookupLanguageModel: () => undefined,
		});
		let openContext: unknown;
		const action = store.add(new Action('openSubagent', 'Open Subagent', undefined, true, context => {
			openContext = context;
		}));
		const viewItem = store.add(instantiationService.createInstance(
			OpenSubagentChatActionViewItem,
			{ chatResource: 'ahp-chat://subagent/session/tool-call' },
			action,
			{ draggable: true },
			false,
		));
		let dragResource: string | undefined;
		viewItem.setDragDataProvider(context => {
			dragResource = context.chatResource;
			return true;
		});
		viewItem.trackEnabled((_context, update) => {
			update(true);
			return Disposable.None;
		});
		const container = document.createElement('div');
		viewItem.render(container);

		const dragStart = new DragEvent(EventType.DRAG_START, { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
		container.dispatchEvent(dragStart);
		const keyDown = new KeyboardEvent(EventType.KEY_DOWN, { key: 'Enter', altKey: true, bubbles: true, cancelable: true });
		Object.defineProperty(keyDown, 'keyCode', { value: 13 });
		container.dispatchEvent(keyDown);

		assert.deepStrictEqual({
			draggable: container.draggable,
			dragPrevented: dragStart.defaultPrevented,
			dragResource,
			openContext,
		}, {
			draggable: true,
			dragPrevented: false,
			dragResource: 'ahp-chat://subagent/session/tool-call',
			openContext: { chatResource: 'ahp-chat://subagent/session/tool-call', toSide: true },
		});
	});

	test('refreshes accessible metadata when the active tool clears', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ISessionsService, {
			activeSession: observableValue<IActiveSession | undefined>('activeSession', undefined),
			visibleSessions: observableValue<readonly (IActiveSession | undefined)[]>('visibleSessions', []),
		});
		instantiationService.stub(ILanguageModelsService, {
			onDidChangeLanguageModels: Event.None,
			lookupLanguageModel: () => undefined,
		});
		const action = store.add(new Action('openSubagent', 'Open Subagent'));
		const viewItem = store.add(instantiationService.createInstance(
			TestOpenSubagentChatActionViewItem,
			{ chatResource: 'ahp-chat://subagent/session/tool-call', isActive: true, activeToolLabel: 'Reading files' },
			action,
			{},
			false,
		));
		viewItem.trackEnabled((_context, update) => {
			update(true);
			return Disposable.None;
		});
		const container = document.createElement('div');
		viewItem.render(container);

		const withActiveTool = {
			tooltip: viewItem.tooltip,
			ariaLabel: container.getAttribute('aria-label'),
		};
		viewItem.setActionContext({ chatResource: 'ahp-chat://subagent/session/tool-call' });

		assert.deepStrictEqual({
			withActiveTool,
			withoutActiveTool: {
				tooltip: viewItem.tooltip,
				ariaLabel: container.getAttribute('aria-label'),
			},
		}, {
			withActiveTool: {
				tooltip: 'Open Subagent\nActive tool: Reading files',
				ariaLabel: 'Open Subagent. Subagent is working. Active tool Reading files',
			},
			withoutActiveTool: {
				tooltip: 'Open Subagent',
				ariaLabel: 'Open Subagent',
			},
		});
	});

	test('keeps matching model metadata in the hover while hiding it inline', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ISessionsService, {
			activeSession: observableValue<IActiveSession | undefined>('activeSession', undefined),
			visibleSessions: observableValue<readonly (IActiveSession | undefined)[]>('visibleSessions', []),
		});
		instantiationService.stub(ILanguageModelsService, {
			onDidChangeLanguageModels: Event.None,
			lookupLanguageModel: () => undefined,
		});
		const action = store.add(new Action('openSubagent', 'Open Subagent'));
		const viewItem = store.add(instantiationService.createInstance(
			TestOpenSubagentChatActionViewItem,
			{
				chatResource: 'ahp-chat://subagent/session/tool-call',
				modelName: 'GPT-5.6 Sol',
				parentModelName: 'GPT-5.6 Sol',
			},
			action,
			{},
			false,
		));
		viewItem.trackEnabled((_context, update) => {
			update(true);
			return Disposable.None;
		});
		const container = document.createElement('div');

		viewItem.render(container);

		assert.deepStrictEqual({
			modelHidden: container.querySelector('.chat-subagent-pill-model')?.classList.contains('hidden'),
			tooltip: viewItem.tooltip,
			ariaLabel: container.getAttribute('aria-label'),
		}, {
			modelHidden: true,
			tooltip: 'Open Subagent\nModel: GPT-5.6 Sol',
			ariaLabel: 'Open Subagent. Model GPT-5.6 Sol',
		});
	});

	test('renders the credit cost alongside the model when enabled', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		(instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(ChatConfiguration.SubagentsShowCreditUsage, true);
		instantiationService.stub(ISessionsService, {
			activeSession: observableValue<IActiveSession | undefined>('activeSession', undefined),
			visibleSessions: observableValue<readonly (IActiveSession | undefined)[]>('visibleSessions', []),
		});
		instantiationService.stub(ILanguageModelsService, {
			onDidChangeLanguageModels: Event.None,
			lookupLanguageModel: () => undefined,
		});
		const action = store.add(new Action('openSubagent', 'Open Subagent'));
		const viewItem = store.add(instantiationService.createInstance(
			TestOpenSubagentChatActionViewItem,
			{
				chatResource: 'ahp-chat://subagent/session/tool-call',
				modelName: 'Claude Opus 4.8',
				parentModelName: 'GPT-5.6 Sol',
				credits: 2.5,
			},
			action,
			{},
			false,
		));
		viewItem.trackEnabled((_context, update) => {
			update(true);
			return Disposable.None;
		});
		const container = document.createElement('div');

		viewItem.render(container);

		const creditsElement = container.querySelector('.chat-subagent-pill-credits');
		const withCredits = {
			text: creditsElement?.textContent,
			hidden: creditsElement?.classList.contains('hidden'),
			tooltip: viewItem.tooltip,
			ariaLabel: container.getAttribute('aria-label'),
		};

		// A subagent that bills nothing should not carry an empty cost readout.
		viewItem.setActionContext({ chatResource: 'ahp-chat://subagent/session/tool-call', credits: 0 });

		assert.deepStrictEqual({
			withCredits,
			withoutCredits: {
				text: creditsElement?.textContent,
				hidden: creditsElement?.classList.contains('hidden'),
				tooltip: viewItem.tooltip,
			},
		}, {
			withCredits: {
				text: '2.5 credits',
				hidden: false,
				tooltip: 'Open Subagent\nModel: Claude Opus 4.8\n2.5 credits',
				ariaLabel: 'Open Subagent. Model Claude Opus 4.8. 2.5 credits',
			},
			withoutCredits: {
				text: '',
				hidden: true,
				tooltip: 'Open Subagent',
			},
		});
	});
});
