/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationType, type AgentCustomization } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { agentHostAgentPickerStorageKey, resolveAgentHostAgent } from '../../../../../../platform/agentHost/common/customAgents.js';
import { isIMenuItem, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { ChatContextKeys } from '../../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus } from '../../../../../browser/menus.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../common/agentHostSessionsProvider.js';
import { IsPhoneLayoutContext, SessionProviderIdContext, SessionUsesCombinedConfigPickerContext } from '../../../../../common/contextkeys.js';
import '../../browser/agentHostAgentPicker.js';
import '../../browser/mobile/mobileChatInputConfigPicker.js';

suite('agentHostAgentPicker', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const alpha: AgentCustomization = { type: CustomizationType.Agent, id: 'agent://a', uri: 'agent://a', name: 'alpha' };
	const beta: AgentCustomization = { type: CustomizationType.Agent, id: 'agent://b', uri: 'agent://b', name: 'beta', description: 'b desc' };
	const agents: readonly AgentCustomization[] = [alpha, beta];

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
