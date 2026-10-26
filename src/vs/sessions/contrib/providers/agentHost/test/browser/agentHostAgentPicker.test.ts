/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationType, type AgentCustomization } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { agentHostAgentPickerStorageKey, resolveAgentHostAgent } from '../../../../../../platform/agentHost/common/customAgents.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IChatWidget } from '../../../../../../workbench/contrib/chat/browser/chat.js';
import { ChatInputPart } from '../../../../../../workbench/contrib/chat/browser/widget/input/chatInputPart.js';
import { ChatContextKeys } from '../../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatViewModel } from '../../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { Menus } from '../../../../../browser/menus.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../common/agentHostSessionsProvider.js';
import { IsPhoneLayoutContext, SessionProviderIdContext, SessionUsesCombinedConfigPickerContext } from '../../../../../common/contextkeys.js';
import { IChat, ISession } from '../../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { AGENTS_PICKER_IN_ATTACH_CONTEXT_MENU_SETTING, EXPERIMENTAL_NEW_SESSION_COMPOSER_LAYOUT_SETTING, UNIFIED_WORKSPACE_PICKER_SETTING } from '../../../../chat/common/constants.js';
import { AgentPickerSelectionState, createAgentContextPick } from '../../browser/agentHostAgentPicker.js';
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

	test('preserves explicit selection when a draft session graduates', () => {
		const state = new AgentPickerSelectionState();
		const draft = upcastPartial<ISession>({ resource: URI.parse('agent-host-copilotcli://draft') });
		const committed = upcastPartial<ISession>({ resource: URI.parse('agent-host-copilotcli://committed') });
		state.mark(draft);
		const transferred = state.transfer(draft, committed);

		assert.deepStrictEqual({
			transferred,
			draft: state.has(draft),
			committed: state.has(committed),
		}, {
			transferred: true,
			draft: false,
			committed: true,
		});
	});

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
