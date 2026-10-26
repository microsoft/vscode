/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { McpServerStatus } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IAgentHostCustomizationService } from '../../../chat/browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../chat/common/aiCustomizationWorkspaceService.js';
import { ContributionEnablementState } from '../../../chat/common/enablement.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { findLocalMcpServer, McpBrowseCommand, McpBrowsePageCommand, ShowInstalledMcpServersCommand } from '../../browser/mcpCommands.js';
import { IMcpServer, IMcpService, InstalledMcpServersViewId } from '../../common/mcpTypes.js';

type AgentHostMcpServer = ReturnType<IAgentHostCustomizationService['getMcpServers']>[number];

class TestMcpServer extends mock<IMcpServer>() {
	override readonly definition;
	override readonly enablement = constObservable(ContributionEnablementState.EnabledProfile);

	constructor(id: string, label: string) {
		super();
		this.definition = { id, label };
	}
}

class TestMcpService extends mock<IMcpService>() {
	override readonly servers;

	constructor(servers: readonly IMcpServer[]) {
		super();
		this.servers = constObservable(servers);
	}
}

function agentHostServer(id: string, name: string): AgentHostMcpServer {
	return {
		id,
		name,
		enabled: true,
		status: McpServerStatus.Ready,
		state: { kind: McpServerStatus.Ready },
		setEnabled() { },
		start: async () => { },
		stop: async () => { },
	};
}

suite('MCP commands', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('findLocalMcpServer matches exact, unambiguous definition IDs and labels', () => {
		const byId = new TestMcpServer('extension.server', 'Extension Server');
		const byLabel = new TestMcpServer('other.server', 'Other Server');
		const duplicateLabel = new TestMcpServer('duplicate.server', 'Duplicate');
		const otherDuplicateLabel = new TestMcpServer('other.duplicate.server', 'Duplicate');
		const service = new TestMcpService([byId, byLabel, duplicateLabel, otherDuplicateLabel]);

		assert.deepStrictEqual({
			byId: findLocalMcpServer(service, agentHostServer('session-id/extension.server', 'Different Name'))?.definition.id,
			byLabel: findLocalMcpServer(service, agentHostServer('unmatched', 'Other Server'))?.definition.id,
			caseMismatch: findLocalMcpServer(service, agentHostServer('unmatched', 'other server'))?.definition.id,
			ambiguousLabel: findLocalMcpServer(service, agentHostServer('unmatched', 'Duplicate'))?.definition.id,
			unmatched: findLocalMcpServer(service, agentHostServer('unmatched', 'Missing'))?.definition.id,
		}, {
			byId: 'extension.server',
			byLabel: 'other.server',
			caseMismatch: undefined,
			ambiguousLabel: undefined,
			unmatched: undefined,
		});
	});

	test('browse command opens the MCP customizations marketplace', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const calls: { id: string; args: unknown[] }[] = [];
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override executeCommand<R = unknown>(id: string, ...args: unknown[]): Promise<R | undefined> {
				calls.push({ id, args });
				return Promise.resolve(undefined);
			}
		}());

		await instantiationService.invokeFunction(accessor => new McpBrowseCommand().run(accessor));

		assert.deepStrictEqual(calls, [{
			id: AICustomizationManagementCommands.OpenMarketplace,
			args: [AICustomizationManagementSection.McpServers],
		}]);
	});

	test('extensions browse action searches for MCP servers', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const searches: string[] = [];
		instantiationService.stub(IExtensionsWorkbenchService, new class extends mock<IExtensionsWorkbenchService>() {
			override openSearch(searchValue: string): Promise<void> {
				searches.push(searchValue);
				return Promise.resolve();
			}
		}());

		await instantiationService.invokeFunction(accessor => new McpBrowsePageCommand().run(accessor));

		assert.deepStrictEqual(searches, ['@mcp ']);
	});

	test('show installed resets the Extensions search before opening the view', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const calls: string[] = [];
		instantiationService.stub(IExtensionsWorkbenchService, new class extends mock<IExtensionsWorkbenchService>() {
			override openSearch(searchValue: string): Promise<void> {
				calls.push(`search:${searchValue}`);
				return Promise.resolve();
			}
		}());
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({
			openView: async id => {
				calls.push(`view:${id}`);
				return null;
			}
		}));

		await instantiationService.invokeFunction(accessor => new ShowInstalledMcpServersCommand().run(accessor));

		assert.deepStrictEqual(calls, ['search:', `view:${InstalledMcpServersViewId}`]);
	});
});
