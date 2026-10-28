/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationType, type AgentCustomization } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { agentHostAgentPickerStorageKey, resolveAgentHostAgent } from '../../../../../../platform/agentHost/common/customAgents.js';
import { NullActionViewItemService } from '../../../../../../platform/actions/browser/actionViewItemService.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IChatWidget, IChatWidgetService } from '../../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatContextPickService } from '../../../../../../workbench/contrib/chat/browser/attachments/chatContextPickService.js';
import { ChatInputPart } from '../../../../../../workbench/contrib/chat/browser/widget/input/chatInputPart.js';
import { ChatContextKeys } from '../../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ChatMode } from '../../../../../../workbench/contrib/chat/common/chatModes.js';
import { IChatViewModel } from '../../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { IChatService } from '../../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ILifecycleService } from '../../../../../../workbench/services/lifecycle/common/lifecycle.js';
import { TestStorageService } from '../../../../../../workbench/test/common/workbenchTestServices.js';
import { Menus } from '../../../../../browser/menus.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../common/agentHostSessionsProvider.js';
import { IsPhoneLayoutContext, SessionProviderIdContext, SessionUsesCombinedConfigPickerContext } from '../../../../../common/contextkeys.js';
import { IChat, ISession, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import { SessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { AGENTS_PICKER_IN_ATTACH_CONTEXT_MENU_SETTING, EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING, UNIFIED_WORKSPACE_PICKER_SETTING } from '../../../../chat/common/constants.js';
import { AgentHostAgentPickerContribution, AgentHostModePickerActionViewItem, createAgentContextPick, isCustomAgentSelected } from '../../browser/agentHostAgentPicker.js';
import { ModePicker } from '../../../copilotChatSessions/browser/modePicker.js';
import '../../browser/agentHostSessionConfigPicker.js';
import '../../browser/mobile/mobileChatInputConfigPicker.js';
import '../../../../chat/browser/modelPicker.js';

suite('agentHostAgentPicker', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const alpha: AgentCustomization = { type: CustomizationType.Agent, id: 'agent://a', uri: 'agent://a', name: 'alpha' };
	const beta: AgentCustomization = { type: CustomizationType.Agent, id: 'agent://b', uri: 'agent://b', name: 'beta', description: 'b desc' };
	const agents: readonly AgentCustomization[] = [alpha, beta];

	function controls(context: ContextKeyService, menu: MenuId): string[] {
		const ids = ['sessions.agentHost.agentPicker', 'sessions.agentHost.newSessionModePicker', 'sessions.modelPicker'];
		return MenuRegistry.getMenuItems(menu).filter(isIMenuItem)
			.filter(item => ids.includes(item.command.id) && context.contextMatchesRules(item.when))
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
			.map(item => item.command.id);
	}

	test('keeps the new-session agent in the primary toolbar', () => {
		const context = disposables.add(new ContextKeyService(new TestConfigurationService()));
		SessionProviderIdContext.bindTo(context).set(LOCAL_AGENT_HOST_PROVIDER_ID);
		IsPhoneLayoutContext.bindTo(context).set(false);
		ChatContextKeys.inAutomationsDialog.bindTo(context).set(false);
		assert.deepStrictEqual({ newSessionPrimary: controls(context, Menus.NewSessionChatInputToolbar), newSessionSecondary: controls(context, Menus.NewSessionControl) }, {
			newSessionPrimary: ['sessions.agentHost.agentPicker', 'sessions.modelPicker'],
			newSessionSecondary: ['sessions.agentHost.newSessionModePicker'],
		});
	});

	test('offers the Agent picker in Add Context only in the treatment, logging the trigger in both arms', async () => {
		const chat = URI.parse('agent-host-copilot:/chat');
		const session = upcastPartial<IActiveSession>({ activeChat: constObservable(upcastPartial<IChat>({ resource: chat })) });
		const opened: string[] = [];
		const evaluate = async (treatment: boolean, options: { eligible?: boolean; widgetChat?: URI } = {}) => {
			const telemetryService = new TestExperimentTriggerTelemetryService();
			const pick = createAgentContextPick({
				getActiveSession: () => session,
				isEligible: () => options.eligible ?? true,
				openPicker: anchor => opened.push(anchor?.className ?? ''),
			}, new TestConfigurationService({ [AGENTS_PICKER_IN_ATTACH_CONTEXT_MENU_SETTING]: treatment }), telemetryService);
			const widget = upcastPartial<IChatWidget>({
				viewModel: upcastPartial<IChatViewModel>({ sessionResource: options.widgetChat ?? chat }),
				inputPart: upcastPartial<ChatInputPart>({ attachContextButtonElement: Object.assign(document.createElement('div'), { className: 'add-context' }) }),
			});
			const shown = await pick.isEnabled?.(widget);
			if (shown) {
				await pick.asAttachment(widget);
			}
			return { shown, triggers: telemetryService.triggers };
		};

		const trigger = `config.${AGENTS_PICKER_IN_ATTACH_CONTEXT_MENU_SETTING}`;
		assert.deepStrictEqual({
			control: await evaluate(false),
			treatment: await evaluate(true),
			ineligible: await evaluate(true, { eligible: false }),
			otherChat: await evaluate(true, { widgetChat: URI.parse('agent-host-copilot:/other') }),
			opened,
		}, {
			control: { shown: false, triggers: [trigger] },
			treatment: { shown: true, triggers: [trigger] },
			ineligible: { shown: false, triggers: [] },
			otherChat: { shown: false, triggers: [trigger] },
			opened: ['add-context'],
		});
	});

	for (const unifiedPicker of [false, true]) {
		for (const experimentalLayout of [false, true]) {
			test(`routes the agent toolbar with unified picker ${unifiedPicker} and experimental layout ${experimentalLayout}`, () => {
				const configuration = new TestConfigurationService({
					[UNIFIED_WORKSPACE_PICKER_SETTING]: unifiedPicker,
					[EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING]: experimentalLayout,
				});
				disposables.add(configuration.onDidChangeConfigurationEmitter);
				const context = disposables.add(new ContextKeyService(configuration));
				SessionProviderIdContext.bindTo(context).set(LOCAL_AGENT_HOST_PROVIDER_ID);
				IsPhoneLayoutContext.bindTo(context).set(false);
				ChatContextKeys.inAutomationsDialog.bindTo(context).set(false);
				const experimental = unifiedPicker && experimentalLayout;
				assert.deepStrictEqual({
					config: controls(context, Menus.NewSessionChatInputToolbar),
					control: controls(context, Menus.NewSessionControl),
				}, {
					config: experimental ? ['sessions.modelPicker'] : ['sessions.agentHost.agentPicker', 'sessions.modelPicker'],
					control: experimental ? ['sessions.agentHost.agentPicker', 'sessions.agentHost.newSessionModePicker'] : ['sessions.agentHost.newSessionModePicker'],
				});
			});
		}
	}

	test('uses the same desktop and phone agent controls in the automation prompt', () => {
		const context = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const enabled = ChatContextKeys.enabled.bindTo(context);
		const inDialog = ChatContextKeys.inAutomationsDialog.bindTo(context);
		const phone = IsPhoneLayoutContext.bindTo(context);
		SessionProviderIdContext.bindTo(context).set(LOCAL_AGENT_HOST_PROVIDER_ID);
		SessionUsesCombinedConfigPickerContext.bindTo(context).set(true);
		enabled.set(true);
		inDialog.set(true);
		phone.set(false);
		const visible = () => MenuRegistry.getMenuItems(Menus.AutomationsDialogInputToolbar)
			.filter(isIMenuItem)
			.filter(item => item.command.id.startsWith('sessions.agentHost.') && context.contextMatchesRules(item.when))
			.map(item => item.command.id);
		const desktop = visible();
		phone.set(true);
		const mobile = visible();
		enabled.set(false);
		const disabled = visible();
		enabled.set(true);
		inDialog.set(false);
		assert.deepStrictEqual({ desktop, mobile, disabled, outsideDialog: visible() }, {
			desktop: ['sessions.agentHost.agentPicker'],
			mobile: ['sessions.agentHost.mobileChatInputConfigPicker'],
			disabled: [],
			outsideDialog: [],
		});
	});

	for (const status of [SessionStatus.Untitled, SessionStatus.InProgress, SessionStatus.Completed]) {
		test(`only keeps the current custom agent in the toolbar for session status ${status}`, () => {
			const mode = observableValue<ReturnType<ISession['mode']['get']>>('mode', { id: beta.uri, kind: 'agent' });
			const session = upcastPartial<ISession>({ resource: URI.parse('custom-host:/session'), mode, status: constObservable(status) });
			const selections: boolean[] = [];
			disposables.add(autorun(reader => selections.push(isCustomAgentSelected(session, reader))));
			mode.set({ id: ChatMode.Agent.id, kind: 'agent' }, undefined);
			mode.set({ id: alpha.uri, kind: 'agent' }, undefined);
			mode.set(undefined, undefined);

			assert.deepStrictEqual(selections, [true, false, true, false]);
		});
	}

	test('updates toolbar placement when a custom-agent draft graduates with the default agent', () => {
		const draft = upcastPartial<ISession>({ mode: constObservable({ id: alpha.uri, kind: 'agent' }), status: constObservable(SessionStatus.Untitled) });
		const committed = upcastPartial<ISession>({ mode: constObservable(undefined), status: constObservable(SessionStatus.Completed) });
		const session = observableValue<ISession | undefined>('session', undefined);
		const selections: boolean[] = [];
		disposables.add(autorun(reader => selections.push(isCustomAgentSelected(session.read(reader), reader))));
		session.set(draft, undefined);
		session.set(committed, undefined);

		assert.deepStrictEqual(selections, [false, true, false]);
	});

	test('returns focus to the input when the focused agent picker moves into Add Context', () => {
		const root = dom.append(document.body, dom.$('div'));
		disposables.add(toDisposable(() => root.remove()));
		const container = dom.append(root, dom.$('div'));
		const input = dom.append(root, dom.$('input'));
		const hidden = observableValue('hidden', false);
		let focusRestored = 0;
		const item = disposables.add(new AgentHostModePickerActionViewItem(upcastPartial<ModePicker>({
			render: element => dom.append(element, dom.$('button')),
			dispose: () => { },
		}), hidden, Disposable.None, () => {
			focusRestored++;
			input.focus();
		}));
		item.render(container);
		input.focus();
		hidden.set(true, undefined);
		hidden.set(false, undefined);
		container.querySelector('button')!.focus();
		hidden.set(true, undefined);

		assert.deepStrictEqual({ hidden: container.hidden, inert: container.inert, focused: document.activeElement === input, focusRestored }, {
			hidden: true,
			inert: true,
			focused: true,
			focusRestored: 1,
		});
	});

	for (const scheme of ['agent-host-copilotcli', 'custom-host']) {
		test(`restores the last-used agent after an automatic fallback for ${scheme}`, () => {
			const storage = disposables.add(new TestStorageService());
			const key = agentHostAgentPickerStorageKey(scheme);
			storage.store(key, alpha.uri, StorageScope.PROFILE, StorageTarget.MACHINE);
			const createSession = (id: string, agent: AgentCustomization | undefined, status: SessionStatus) => {
				const mode = observableValue<ReturnType<ISession['mode']['get']>>('mode', agent ? { id: agent.uri, kind: 'agent' } : undefined);
				const session = upcastPartial<IActiveSession>({
					sessionId: id,
					resource: URI.from({ scheme, path: `/${id}` }),
					providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
					status: constObservable(status),
					mode,
				});
				return { session, mode };
			};
			const running = createSession('running', alpha, SessionStatus.Completed);
			const draft = createSession('draft', undefined, SessionStatus.Untitled);
			const sessions = new Map([['running', running], ['draft', draft]]);
			const activeSession = observableValue<IActiveSession | undefined>('activeSession', running.session);
			const agentsChanged = disposables.add(new Emitter<void>());
			let availableAgents: readonly AgentCustomization[] = [beta];
			const provider = upcastPartial<IAgentHostSessionsProvider>({
				id: LOCAL_AGENT_HOST_PROVIDER_ID,
				getCustomAgents: () => availableAgents,
				onDidChangeCustomAgents: agentsChanged.event,
				setAgent: (id, agent) => sessions.get(id)?.mode.set(agent ? { id: agent.uri, kind: 'agent' } : undefined, undefined),
			});
			const configuration = new TestConfigurationService({ [AGENTS_PICKER_IN_ATTACH_CONTEXT_MENU_SETTING]: true });
			disposables.add(configuration.onDidChangeConfigurationEmitter);
			const providers = disposables.add(new SessionsProvidersService(upcastPartial<ILifecycleService>({ willShutdown: false })));
			disposables.add(providers.registerProvider(provider));
			disposables.add(new AgentHostAgentPickerContribution(
				new NullActionViewItemService(),
				upcastPartial<ISessionsService>({ activeSession }),
				providers,
				upcastPartial<IChatService>({ getSession: () => undefined }),
				upcastPartial<IChatWidgetService>({
					getWidgetBySessionResource: () => undefined,
					onDidAddWidget: Event.None,
					onDidChangeFocusedSession: Event.None,
				}),
				storage,
				new NullLogService(),
				configuration,
				disposables.add(new ContextKeyService(configuration)),
				upcastPartial<IChatContextPickService>({ registerChatContextItem: () => Disposable.None }),
				new TestExperimentTriggerTelemetryService(),
			));
			const snapshot = () => ({
				mode: activeSession.get()?.mode.get()?.id,
				remembered: storage.get(key, StorageScope.PROFILE),
			});
			const afterFallback = snapshot();
			activeSession.set(draft.session, undefined);
			const beforeDiscovery = snapshot();
			availableAgents = agents;
			agentsChanged.fire();

			assert.deepStrictEqual({ afterFallback, beforeDiscovery, afterDiscovery: snapshot() }, {
				afterFallback: { mode: undefined, remembered: alpha.uri },
				beforeDiscovery: { mode: undefined, remembered: alpha.uri },
				afterDiscovery: { mode: alpha.uri, remembered: alpha.uri },
			});
		});
	}

	suite('agentHostAgentPickerStorageKey', () => {
		test('builds a per-scheme storage key', () => {
			assert.strictEqual(
				agentHostAgentPickerStorageKey('agent-host-copilotcli'),
				'workbench.agentsession.agentHostAgentPicker.agent-host-copilotcli.selectedAgentUri',
			);
		});
	});

	suite('resolveAgentHostAgent', () => {
		test('returns the session-selected agent when its URI is in the list', () => {
			assert.deepStrictEqual(resolveAgentHostAgent(agents, 'agent://b', undefined), beta);
		});

		test('falls back to the stored URI when the session has no selection', () => {
			assert.strictEqual(resolveAgentHostAgent(agents, undefined, 'agent://a'), alpha);
		});

		test('returns undefined when neither session nor stored selection matches the list', () => {
			assert.strictEqual(resolveAgentHostAgent(agents, undefined, 'agent://missing'), undefined);
			assert.strictEqual(resolveAgentHostAgent(agents, 'agent://missing', undefined), undefined);
		});

		test('session selection wins over stored selection', () => {
			assert.deepStrictEqual(resolveAgentHostAgent(agents, 'agent://a', 'agent://b'), alpha);
		});

		test('falls through to stored URI when the session agent URI is not in the list', () => {
			// The session's recorded selection is no longer in the effective
			// agent list (e.g. the customization providing it was removed),
			// so the stored fallback is consulted.
			assert.deepStrictEqual(resolveAgentHostAgent(agents, 'agent://gone', 'agent://a'), alpha);
		});

		test('returns undefined for an empty agent list', () => {
			assert.strictEqual(resolveAgentHostAgent([], 'agent://a', 'agent://a'), undefined);
			assert.strictEqual(resolveAgentHostAgent([], undefined, undefined), undefined);
		});
	});
});
