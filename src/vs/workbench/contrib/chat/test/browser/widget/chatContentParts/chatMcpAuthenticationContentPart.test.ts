/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { McpAuthRequiredReason, McpServerState, McpServerStatus } from '../../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ConfigurationTarget } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IAgentHostCustomizationService } from '../../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { ChatMcpAuthenticationContentPart } from '../../../../browser/widget/chatContentParts/chatMcpAuthenticationContentPart.js';
import { IChatMcpAuthenticationRequired, IChatMcpAuthenticationRequiredServer } from '../../../../common/chatService/chatService.js';
import { ChatConfiguration } from '../../../../common/constants.js';

suite('ChatMcpAuthenticationContentPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createPart(hintsEnabled?: boolean) {
		const configurationService = new TestConfigurationService({ [ChatConfiguration.McpAuthenticationHintsEnabled]: hintsEnabled });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const instantiationService = workbenchInstantiationService({ configurationService: () => configurationService }, store);
		const onDidChangeCustomizations = store.add(new Emitter<void>());
		const authentication = new DeferredPromise<boolean>();
		const authenticationCalls: { sessionResource: string; serverId: string }[] = [];
		const server: IChatMcpAuthenticationRequiredServer = { id: 'mcp-1', name: 'Example MCP', resource: 'https://example.com/mcp' };
		let state: McpServerState = {
			kind: McpServerStatus.AuthRequired,
			reason: McpAuthRequiredReason.Required,
			resource: { resource: server.resource },
		};
		instantiationService.stub(IAgentHostCustomizationService, {
			onDidChangeCustomizations: onDidChangeCustomizations.event,
			getMcpServers: () => [{
				id: server.id,
				name: server.name,
				enabled: true,
				status: state.kind,
				state,
				start: async () => { },
				stop: async () => { },
				setEnabled: () => { },
			}],
			authenticateMcpServer: async (sessionResource, serverId) => {
				authenticationCalls.push({ sessionResource: sessionResource.toString(), serverId });
				return authentication.p;
			},
		});
		const servers = observableValue<readonly IChatMcpAuthenticationRequiredServer[]>('servers', [server]);
		const data: IChatMcpAuthenticationRequired = {
			kind: 'mcpAuthenticationRequired',
			sessionResource: URI.parse('agent-host-copilot:/test-session').toJSON(),
			servers,
			isUsed: false,
		};
		const part = store.add(instantiationService.createInstance(ChatMcpAuthenticationContentPart, data));

		const setHintsEnabled = async (enabled: boolean) => {
			await configurationService.setUserConfiguration(ChatConfiguration.McpAuthenticationHintsEnabled, enabled);
			configurationService.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([ChatConfiguration.McpAuthenticationHintsEnabled]),
				change: { keys: [ChatConfiguration.McpAuthenticationHintsEnabled], overrides: [] },
				affectsConfiguration: key => key === ChatConfiguration.McpAuthenticationHintsEnabled,
			});
		};
		const setServerState = (next: McpServerState) => {
			state = next;
			onDidChangeCustomizations.fire();
		};
		const snapshot = () => ({
			hidden: part.domNode.style.display === 'none',
			isUsed: data.isUsed,
		});

		return { part, servers, authentication, authenticationCalls, setHintsEnabled, setServerState, snapshot };
	}

	test('shows the hint by default and marks it used after authentication', () => {
		const { part, setServerState, snapshot } = createPart();
		const initial = {
			...snapshot(),
			text: part.domNode.textContent?.trim(),
			action: part.domNode.querySelector('a[role="button"]')?.getAttribute('data-href'),
		};
		setServerState({ kind: McpServerStatus.Ready });

		assert.deepStrictEqual({ initial, authenticated: snapshot() }, {
			initial: {
				hidden: false,
				isUsed: false,
				text: 'The MCP server Example MCP requires authentication. Authenticate?',
				action: '#authenticate',
			},
			authenticated: { hidden: true, isUsed: true },
		});
	});

	test('hides and restores existing hints without treating suppression as authentication', async () => {
		const { servers, setHintsEnabled, snapshot } = createPart();
		const initial = snapshot();
		await setHintsEnabled(false);
		servers.set([...servers.get()], undefined);
		const suppressed = snapshot();
		await setHintsEnabled(true);

		assert.deepStrictEqual({ initial, suppressed, restored: snapshot() }, {
			initial: { hidden: false, isUsed: false },
			suppressed: { hidden: true, isUsed: false },
			restored: { hidden: false, isUsed: false },
		});
	});

	test('keeps initially suppressed hints hidden when server state changes', async () => {
		const { setHintsEnabled, setServerState, snapshot } = createPart(false);
		const initial = snapshot();
		setServerState({
			kind: McpServerStatus.AuthRequired,
			reason: McpAuthRequiredReason.Expired,
			resource: { resource: 'https://example.com/mcp' },
		});
		const afterStateChange = snapshot();
		await setHintsEnabled(true);

		assert.deepStrictEqual({ initial, afterStateChange, enabled: snapshot() }, {
			initial: { hidden: true, isUsed: false },
			afterStateChange: { hidden: true, isUsed: false },
			enabled: { hidden: false, isUsed: false },
		});
	});

	test('keeps user-initiated authentication progress visible when hints are disabled', async () => {
		const { part, authentication, authenticationCalls, setHintsEnabled, setServerState, snapshot } = createPart();
		const action = part.domNode.querySelector<HTMLAnchorElement>('a[role="button"]');
		assert.ok(action);
		action.click();
		await setHintsEnabled(false);
		const authenticating = { ...snapshot(), text: part.domNode.textContent?.trim() };
		setServerState({ kind: McpServerStatus.Ready });
		await authentication.complete(true);
		await timeout(0);

		assert.deepStrictEqual({ authenticating, completed: snapshot(), authenticationCalls }, {
			authenticating: { hidden: false, isUsed: false, text: 'Authenticating Example MCP...' },
			completed: { hidden: true, isUsed: true },
			authenticationCalls: [{ sessionResource: 'agent-host-copilot:/test-session', serverId: 'mcp-1' }],
		});
	});
});
