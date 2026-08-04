/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { McpServerStatus } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { IAgentHostCustomizationService } from '../../../chat/browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { ContributionEnablementState } from '../../../chat/common/enablement.js';
import { findLocalMcpServer } from '../../browser/mcpCommands.js';
import { IMcpServer, IMcpService } from '../../common/mcpTypes.js';

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
	ensureNoDisposablesAreLeakedInTestSuite();

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
});
