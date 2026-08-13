/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { AgentSession, CODEX_AGENT_PROVIDER_ID, type AgentProvider, type IAgentChatContext } from '../../../common/agent.js';
import { CustomizationEnablementKind, CustomizationType, McpServerStatus, type McpServerCustomization } from '../../../common/state/protocol/channels-session/state.js';
import { buildDefaultChatUri } from '../../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../../node/agentHostStateManager.js';
import { getCustomizationEnablementKey, type CustomizationEnablementResolution, type ICustomizationEnablementTarget } from '../../../node/agentHostCustomizationEnablementService.js';
import { CodexAgent } from '../../../node/codex/codexAgent.js';
import { CodexClientCustomizationStore, type ICodexClientPlugin } from '../../../node/codex/codexClientCustomizations.js';
import { targetForMcpServer } from '../../../node/shared/customizationEnablementGate.js';
import { McpCustomizationController, type IMcpCustomizationControllerOptions } from '../../../node/shared/mcpCustomizationController.js';

/**
 * Exactly the state `_resolveConversationSession` reads: the provider id it
 * mints canonical session URIs with, and the chat→runtime bindings it recorded.
 * Notably NOT the session map — resolution answers with the canonical URI of
 * the bound runtime id rather than echoing whatever URI an entry happens to
 * carry, so a stale or mis-stamped entry cannot redirect a chat.
 */
interface ICodexConversationResolverHarness {
	readonly id: AgentProvider;
	readonly _sessionIdByChatUri: Map<string, string>;
}

interface ICodexMcpControllerSession {
	readonly sessionId: string;
	readonly sessionUri: URI;
	readonly clientCustomizations: CodexClientCustomizationStore;
	mcpController: McpCustomizationController | undefined;
}

interface ICodexMcpControllerHarness {
	readonly id: AgentProvider;
	readonly _instantiationService: {
		createInstance(ctor: typeof McpCustomizationController, options: IMcpCustomizationControllerOptions): McpCustomizationController;
	};
	readonly _customizationEnablementService: {
		resolve(session: string, target: ICustomizationEnablementTarget): CustomizationEnablementResolution;
	};
	readonly _fire: (...args: readonly unknown[]) => void;
}

function resolveConversationSession(harness: ICodexConversationResolverHarness, address: URI, context?: URI | IAgentChatContext): URI | undefined {
	const resolver = (CodexAgent.prototype as unknown as {
		_resolveConversationSession(this: ICodexConversationResolverHarness, address: URI, context?: URI | IAgentChatContext): URI | undefined;
	})._resolveConversationSession;
	return resolver.call(harness, address, context);
}

function getOrCreateMcpController(harness: ICodexMcpControllerHarness, session: ICodexMcpControllerSession): McpCustomizationController {
	const getOrCreate = (CodexAgent.prototype as unknown as {
		_getOrCreateMcpController(this: ICodexMcpControllerHarness, session: ICodexMcpControllerSession): McpCustomizationController;
	})._getOrCreateMcpController;
	return getOrCreate.call(harness, session);
}

function emptyHarness(): ICodexConversationResolverHarness {
	return { id: CODEX_AGENT_PROVIDER_ID, _sessionIdByChatUri: new Map() };
}

suite('CodexAgent', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('prefers transient host context over conversation URI shape', () => {
		const session = AgentSession.uri('codex', 'session-1');

		const result = resolveConversationSession(emptyHarness(), URI.parse('untitled:conversation'), {
			resource: URI.parse('untitled:conversation'),
			configurationResource: session,
		});

		assert.strictEqual(result?.toString(), session.toString());
	});

	test('resolves a bound conversation URI from the recorded session binding', () => {
		const session = AgentSession.uri('codex', 'session-2');
		const chat = URI.parse('untitled:bound');
		const harness: ICodexConversationResolverHarness = {
			id: CODEX_AGENT_PROVIDER_ID,
			_sessionIdByChatUri: new Map([[chat.toString(), 'session-2']]),
		};

		const result = resolveConversationSession(harness, chat);

		assert.strictEqual(result?.toString(), session.toString());
	});

	test('resolution has exactly two sources: a recorded binding or host context', () => {
		const session = AgentSession.uri('codex', 'session-3');
		const defaultChat = URI.parse(buildDefaultChatUri(session));

		assert.deepStrictEqual({
			// The legacy "a codex session URI addresses its own chat" adapter is
			// gone: an unbound session URI is not self-resolving any more.
			unboundSessionUri: resolveConversationSession(emptyHarness(), session)?.toString(),
			// Nor is a chat URI recognized by shape — an unbound default chat
			// only resolves once the host supplies its owning session.
			unboundDefaultChat: resolveConversationSession(emptyHarness(), defaultChat)?.toString(),
			withHostContext: resolveConversationSession(emptyHarness(), defaultChat, { configurationResource: session, resource: defaultChat })?.toString(),
			foreignUri: resolveConversationSession(emptyHarness(), URI.parse('untitled:unknown'))?.toString(),
		}, {
			unboundSessionUri: undefined,
			unboundDefaultChat: undefined,
			withHostContext: session.toString(),
			foreignUri: undefined,
		});
	});

	test('keeps fresh plugin MCP ownership after client customization resyncs, including disabled plugins', () => {
		const store = new DisposableStore();
		const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
		const customizations = new CodexClientCustomizationStore();
		const session: ICodexMcpControllerSession = {
			sessionId: 'session-1',
			sessionUri: AgentSession.uri('codex', 'session-1'),
			clientCustomizations: customizations,
			mcpController: undefined,
		};
		const pluginUri = 'file:///plugins/azure';
		const harness: ICodexMcpControllerHarness = {
			id: CODEX_AGENT_PROVIDER_ID,
			_instantiationService: {
				createInstance: (_ctor, options) => store.add(new McpCustomizationController(options, stateManager)),
			},
			_customizationEnablementService: {
				resolve: (_session, target) => ({
					kind: 'resolved',
					enablement: target.owningPluginSource?.toString() === pluginUri
						? [{ kind: CustomizationEnablementKind.Global, enabled: false }]
						: [],
					enabled: false,
					workingDirectory: { kind: 'workspaceless' },
				}),
			},
			_fire: () => { },
		};
		const controller = getOrCreateMcpController(harness, session);
		const plugin = {
			synced: { customization: { id: 'azure-plugin', uri: pluginUri } },
			parsed: { mcpServers: [{ name: 'azure' }] },
		} as unknown as ICodexClientPlugin;

		customizations.setClient('client', [plugin]);
		customizations.setEnabled('azure-plugin', false);

		const topLevel: McpServerCustomization = {
			type: CustomizationType.McpServer,
			id: 'mcp-top-level:codex:session-1:azure',
			uri: 'mcp-top-level:codex:session-1:azure',
			name: 'azure',
			state: { kind: McpServerStatus.Starting },
		};
		const nested: McpServerCustomization = {
			...topLevel,
			id: 'mcp-child:azure',
			uri: `${pluginUri}/.mcp.json`,
		};
		const owner = controller.pluginMcpServerSources?.get('azure');
		controller.applyOne({ name: 'azure', state: { kind: McpServerStatus.Starting } });
		const topLevelEnablement = controller.topLevelCustomizations()[0]?.enablement;

		assert.deepStrictEqual({
			owner,
			topLevelKey: getCustomizationEnablementKey(targetForMcpServer(topLevel, owner, false), CustomizationEnablementKind.Global),
			nestedKey: getCustomizationEnablementKey(targetForMcpServer(nested, pluginUri, false), CustomizationEnablementKind.Global),
			topLevelEnablement,
		}, {
			owner: pluginUri,
			topLevelKey: `${pluginUri}#mcp=azure`,
			nestedKey: `${pluginUri}#mcp=azure`,
			topLevelEnablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
		});
		store.dispose();
	});
});
