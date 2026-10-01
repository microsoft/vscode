/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, derived } from '../../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { type IMcpServerToolMeta } from '../../../../../../platform/agentHost/common/meta/mcpCustomizationMeta.js';
import { AgentHostMcpServer } from '../../../browser/aiCustomization/mcpServerCount.js';
import { countEnabledMcpServerTools, getMcpServerToolSets, McpSessionToolsMemory } from '../../../browser/aiCustomization/mcpServerToolSets.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { IMcpServer, IMcpTool, McpToolVisibility } from '../../../../mcp/common/mcpTypes.js';

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

function sessionServer(name: string, tools: readonly IMcpServerToolMeta[] | undefined): AgentHostMcpServer {
	return upcastPartial<AgentHostMcpServer>({ id: `host/${name}`, name, tools });
}

suite('mcpServerToolSets', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('lists only servers that contribute tools, preferring the session tools, and counts enabled servers', () => {
		const result = derived(reader => {
			const toolSets = getMcpServerToolSets([
				localServer('cached', ContributionEnablementState.EnabledProfile, ['read']),
				localServer('session', ContributionEnablementState.EnabledProfile, ['stale']),
				localServer('disabled', ContributionEnablementState.DisabledProfile, ['a', 'b']),
				localServer('empty', ContributionEnablementState.EnabledProfile),
				localServer('sessionEmpty', ContributionEnablementState.EnabledProfile, ['stale']),
			], [
				sessionServer('session', [{ name: 'search', description: 'Search.' }, { name: 'fetch' }]),
				sessionServer('sessionEmpty', []),
			], reader);
			return {
				servers: toolSets.map(({ server, toolSet }) => ({ id: server.definition.id, tools: Array.from(toolSet.getTools(), tool => tool.displayName) })),
				enabledToolCount: countEnabledMcpServerTools(toolSets, reader),
			};
		}).get();

		assert.deepStrictEqual(result, {
			servers: [
				{ id: 'cached', tools: ['read'] },
				{ id: 'session', tools: ['search', 'fetch'] },
				{ id: 'disabled', tools: ['a', 'b'] },
			],
			enabledToolCount: 3,
		});
	});

	test('keeps a server listed while its session container is transiently reloading', () => {
		const memory = new McpSessionToolsMemory();
		const servers = [localServer('many-tools', ContributionEnablementState.EnabledProfile)];
		const read = (sessionKey: string, sessionServers: readonly AgentHostMcpServer[]) => derived(reader =>
			getMcpServerToolSets(servers, sessionServers, reader, { instance: memory, sessionKey }).map(({ toolCount }) => toolCount)
		).get();
		const reported = [sessionServer('many-tools', [{ name: 'a' }, { name: 'b' }])];

		assert.deepStrictEqual({
			loaded: read('session-1', reported),
			// The host republishes the synced plugin container as Loading with no children.
			reloading: read('session-1', []),
			otherSession: read('session-2', []),
		}, {
			loaded: [2],
			reloading: [2],
			otherSession: [],
		});
	});
});
