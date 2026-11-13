/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestProductService } from '../../../../test/common/workbenchTestServices.js';
import { CustomAgentUsageContribution } from '../../browser/customAgentUsage.contribution.js';
import { IChatRequestAcceptedEvent, IChatService } from '../../common/chatService/chatService.js';
import { ChatModeKind } from '../../common/constants.js';
import { CustomAgentUsage } from '../../common/customAgentUsage.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { IChatRequestModeInfo } from '../../common/model/chatModel.js';
import { IAgentSource, ICustomAgent, PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';

suite('CustomAgentUsageContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const chatExtensionId = 'github.copilot-chat';
	const sessionResource = URI.parse('vscode-chat-session://local/session');
	const agents = new Map<string, IAgentSource>([
		['file:///workspace/.github/agents/reviewer.agent.md', { storage: PromptsStorage.local }],
		[`file:///extensions/${chatExtensionId}/agents/plan.agent.md`, { storage: PromptsStorage.extension, extensionId: new ExtensionIdentifier(chatExtensionId) }],
		['file:///host/builtin/ask.agent.md', { storage: PromptsStorage.builtIn }],
	]);

	const defaultMode: IChatRequestModeInfo = { kind: ChatModeKind.Agent, isBuiltin: true, modeInstructions: undefined, telemetryModeId: 'agent', applyCodeBlockSuggestionId: undefined };
	function customMode(uri: string): IChatRequestModeInfo {
		return { kind: ChatModeKind.Agent, isBuiltin: false, modeInstructions: { uri: URI.parse(uri), name: '', content: '', toolReferences: [] }, telemetryModeId: 'custom', applyCodeBlockSuggestionId: undefined };
	}

	test('records the count and last use of agents not built into the product', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		const accepted = disposables.add(new Emitter<IChatRequestAcceptedEvent>());
		disposables.add(new CustomAgentUsageContribution(
			upcastPartial<IChatService>({ onDidAcceptRequest: accepted.event }),
			upcastPartial<ICustomizationHarnessService>({
				getCustomAgents: async () => [...agents].map(([uri, source]) => upcastPartial<ICustomAgent>({ id: uri, uri: URI.parse(uri), source })),
			}),
			upcastPartial<IProductService>({ ...TestProductService, defaultChatAgent: upcastPartial<NonNullable<IProductService['defaultChatAgent']>>({ chatExtensionId }) }),
			storage,
			new NullLogService(),
		));
		const usage = new CustomAgentUsage(storage);
		const record = async (modeInfo: IChatRequestModeInfo | undefined) => {
			const before = Date.now();
			accepted.fire({ chatSessionResource: sessionResource, isNewSession: false, modeInfo });
			await timeout(0);
			return { count: usage.useCount, recordedNow: (usage.lastUsed ?? 0) >= before };
		};

		assert.deepStrictEqual({
			noMode: await record(undefined),
			defaultAgent: await record(defaultMode),
			builtInExtensionAgent: await record(customMode(`file:///extensions/${chatExtensionId}/agents/plan.agent.md`)),
			builtInHostAgent: await record(customMode('file:///host/builtin/ask.agent.md')),
			workspaceAgent: await record(customMode('file:///workspace/.github/agents/reviewer.agent.md')),
			unlistedAgent: await record(customMode('file:///removed.agent.md')),
		}, {
			noMode: { count: 0, recordedNow: false },
			defaultAgent: { count: 0, recordedNow: false },
			builtInExtensionAgent: { count: 0, recordedNow: false },
			builtInHostAgent: { count: 0, recordedNow: false },
			workspaceAgent: { count: 1, recordedNow: true },
			unlistedAgent: { count: 2, recordedNow: true },
		});
	});
});
