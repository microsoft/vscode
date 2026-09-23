/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IProductService } from '../../../product/common/productService.js';
import { resolveAgentChatContext, type IAgentPluginMarketplaces } from '../../common/agent.js';
import { buildDefaultChatUri } from '../../common/state/sessionState.js';
import { MockAgent } from './mockAgent.js';
import { createNoopGitService, createSessionDataService } from '../common/sessionTestHelpers.js';
import { createTestAgentService, registerTestAgentProvider } from './agentServiceTestUtils.js';

suite('SessionPluginMarketplaces', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('routes through the selected session default chat and reports unsupported providers', async () => {
		class MarketplaceAgent extends MockAgent {
			readonly calls: { operation: string; chat: string; resource: string; configurationResource: string; value?: string }[] = [];
			readonly pluginMarketplaces: IAgentPluginMarketplaces = {
				getSnapshot: async (chat, context) => {
					const resolved = resolveAgentChatContext(context, chat);
					this.calls.push({ operation: 'snapshot', chat: chat.toString(), resource: resolved.resource.toString(), configurationResource: resolved.configurationResource.toString() });
					return { marketplaces: [], plugins: [], failures: [] };
				},
				refresh: async (chat, context, marketplace) => {
					const resolved = resolveAgentChatContext(context, chat);
					this.calls.push({ operation: 'refresh', chat: chat.toString(), resource: resolved.resource.toString(), configurationResource: resolved.configurationResource.toString(), value: marketplace });
					return { marketplaces: [], plugins: [], failures: [] };
				},
				install: async (chat, context, source) => {
					const resolved = resolveAgentChatContext(context, chat);
					this.calls.push({ operation: 'install', chat: chat.toString(), resource: resolved.resource.toString(), configurationResource: resolved.configurationResource.toString(), value: source });
					return { postInstallMessage: 'Installed.' };
				},
			};
		}
		const fileService = disposables.add(new FileService(new NullLogService()));
		const service = disposables.add(createTestAgentService(
			new NullLogService(),
			fileService,
			createSessionDataService(),
			{ _serviceBrand: undefined } as IProductService,
			createNoopGitService(),
		));
		const marketplaceAgent = new MarketplaceAgent('copilot');
		const unsupportedAgent = new MockAgent('codex');
		disposables.add(toDisposable(() => marketplaceAgent.dispose()));
		disposables.add(toDisposable(() => unsupportedAgent.dispose()));
		registerTestAgentProvider(service, marketplaceAgent);
		registerTestAgentProvider(service, unsupportedAgent);
		const session = await service.createSession({ provider: 'copilot' });
		const unsupportedSession = await service.createSession({ provider: 'codex' });
		const defaultChat = buildDefaultChatUri(session);

		const snapshot = await service.getSessionPluginMarketplaceSnapshot(session);
		const refreshed = await service.refreshSessionPluginMarketplaces(session, 'company');
		const installed = await service.installSessionPlugin(session, 'reviewer@company');
		await assert.rejects(service.getSessionPluginMarketplaceSnapshot(unsupportedSession), /does not support live-session plugin marketplaces/);

		assert.deepStrictEqual({
			snapshot,
			refreshed,
			installed,
			calls: marketplaceAgent.calls,
		}, {
			snapshot: { marketplaces: [], plugins: [], failures: [] },
			refreshed: { marketplaces: [], plugins: [], failures: [] },
			installed: { postInstallMessage: 'Installed.' },
			calls: [
				{ operation: 'snapshot', chat: defaultChat, resource: session.toString(), configurationResource: session.toString() },
				{ operation: 'refresh', chat: defaultChat, resource: session.toString(), configurationResource: session.toString(), value: 'company' },
				{ operation: 'install', chat: defaultChat, resource: session.toString(), configurationResource: session.toString(), value: 'reviewer@company' },
			],
		});
	});
});
