/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { type IAgentHostMcpServerTool } from '../../../../../../sessions/common/agentHostSessionsProvider.js';
import { IAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IAgentHostToolSetEnablementService } from '../../../browser/agentSessions/agentHost/agentHostToolSetEnablementService.js';
import { AICustomizationToolsModel } from '../../../browser/aiCustomization/aiCustomizationToolsModel.js';
import { AgentHostMcpServer } from '../../../browser/aiCustomization/mcpServerCount.js';
import { ICustomizationHarnessService } from '../../../common/customizationHarnessService.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { ILanguageModelToolsService, IToolData, IToolSet } from '../../../common/tools/languageModelToolsService.js';
import { IMcpServer, IMcpService, IMcpTool, McpToolVisibility } from '../../../../mcp/common/mcpTypes.js';

function localServer(id: string, enablement: ContributionEnablementState, cachedToolNames: readonly string[] = []): IMcpServer {
	return upcastPartial<IMcpServer>({
		definition: { id, label: id },
		collection: { id: 'collection', label: 'collection', order: 0 },
		enablement: constObservable(enablement),
		serverMetadata: constObservable(undefined),
		tools: constObservable(cachedToolNames.map(name => upcastPartial<IMcpTool>({
			id: `${id}.${name}`,
			visibility: McpToolVisibility.Model,
			definition: { name, inputSchema: { type: 'object' } },
		}))),
	});
}

suite('AICustomizationToolsModel', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('lists MCP tools over the channel, refetches on list_changed, and counts enabled tools', async () => {
		const toolSets = [
			upcastPartial<IToolSet>({
				id: 'builtin',
				getTools: () => [upcastPartial<IToolData>({ id: 'one' }), upcastPartial<IToolData>({ id: 'two' })],
			}),
			upcastPartial<IToolSet>({
				id: 'deprecated',
				deprecated: true,
				getTools: () => [upcastPartial<IToolData>({ id: 'ignored' })],
			}),
		];
		const listResults: (readonly IAgentHostMcpServerTool[])[] = [
			[{ name: 'search' }, { name: 'fetch' }],
			[{ name: 'search' }, { name: 'fetch' }, { name: 'summarize' }],
		];
		const listCalls: string[] = [];
		const sessionServer = upcastPartial<AgentHostMcpServer>({
			id: 'host/session',
			name: 'session',
			toolsChannel: 'mcp://host/session',
			listTools: async () => {
				listCalls.push('mcp://host/session');
				return listResults.shift() ?? [];
			},
		});
		const toolsChanged = disposables.add(new Emitter<string>());
		const model = disposables.add(new AICustomizationToolsModel(
			new class extends mock<ILanguageModelToolsService>() {
				override readonly toolSets = constObservable(toolSets);
			},
			new class extends mock<IAgentHostToolSetEnablementService>() {
				override observe() {
					return constObservable({ toolSets: new Map([['builtin', false]]), tools: new Map([['one', true]]) });
				}
			},
			new class extends mock<IMcpService>() {
				override readonly servers = constObservable([
					localServer('session', ContributionEnablementState.EnabledProfile),
					localServer('disabled', ContributionEnablementState.DisabledProfile, ['a', 'b']),
					localServer('empty', ContributionEnablementState.EnabledProfile),
				]);
			},
			new class extends mock<IAgentHostCustomizationService>() {
				override readonly onDidChangeCustomizations = Event.None;
				override readonly onDidChangeMcpServerTools = toolsChanged.event;
				override getMcpServers() {
					return [sessionServer];
				}
			},
			new class extends mock<ICustomizationHarnessService>() {
				override readonly activeSessionResource = constObservable(URI.parse('agent-host-test:/session'));
			},
			new NullLogService(),
		));
		const snapshot = () => ({
			mcpServers: model.mcpServerToolSets.get().map(({ server, toolCount }) => ({ id: server.definition.id, toolCount })),
			enabledToolCount: model.enabledToolCount.get(),
		});

		await timeout(0);
		const listed = snapshot();
		toolsChanged.fire('mcp://other/channel');
		toolsChanged.fire('mcp://host/session');
		await timeout(0);

		assert.deepStrictEqual({ listed, refreshed: snapshot(), listCalls }, {
			// One enabled built-in tool plus the enabled session server's tools; the disabled server's are excluded.
			listed: { mcpServers: [{ id: 'session', toolCount: 2 }, { id: 'disabled', toolCount: 2 }], enabledToolCount: 3 },
			refreshed: { mcpServers: [{ id: 'session', toolCount: 3 }, { id: 'disabled', toolCount: 2 }], enabledToolCount: 4 },
			listCalls: ['mcp://host/session', 'mcp://host/session'],
		});
	});
});
