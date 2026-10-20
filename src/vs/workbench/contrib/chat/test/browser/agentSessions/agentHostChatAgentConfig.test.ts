/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import type { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import type { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import type { InitializeResult } from '../../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import type { RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { AgentHostChatAgentConfigService } from '../../../browser/agentSessions/agentHost/agentHostChatAgentConfig.js';

suite('AgentHostChatAgentConfigService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	class TestConnection extends mock<IAgentConnection>() {
		readonly requests: { provider?: string; workingDirectory?: string }[] = [];
		root: RootState = { agents: [], config: { schema: { type: 'object', properties: {} }, values: {} } };
		fail = false;
		override readonly initializeResult = observableValue<InitializeResult | undefined>(this, undefined);
		override readonly rootState: IAgentSubscription<RootState> = (() => {
			const connection = this;
			return { get value() { return connection.root; }, get verifiedValue() { return connection.root; }, onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None };
		})();
		override async resolveSessionConfig(params: { provider?: string; workingDirectory?: URI }): Promise<ResolveSessionConfigResult> {
			this.requests.push({ provider: params.provider, workingDirectory: params.workingDirectory?.toString() });
			await Promise.resolve();
			if (this.fail) {
				throw new Error('unavailable');
			}
			return { schema: { type: 'object', properties: {} }, values: { agent: params.provider } };
		}
	}

	class RecordingLogService extends NullLogService {
		readonly warnings: string[] = [];
		override warn(message: string): void { this.warnings.push(message); }
	}

	test('resolves lazily once per provider and working directory, again after a root config change, and reads a failure as no config', async () => {
		const log = new RecordingLogService();
		const service = store.add(new AgentHostChatAgentConfigService(log satisfies ILogService));
		const connection = new TestConnection();
		const changes: IAgentConnection[] = [];
		store.add(service.onDidChange(changed => changes.push(changed)));
		const repo = URI.file('/repo');

		const lazy = connection.requests.length;
		const pending = service.getAgentConfig(connection, 'claude', repo);
		service.getAgentConfig(connection, 'claude', repo);
		service.getAgentConfig(connection, 'codex', repo);
		await timeout(0);
		const resolved = service.getAgentConfig(connection, 'claude', repo);
		const requestsAfterResolve = connection.requests.length;

		connection.root = { ...connection.root, config: { schema: { type: 'object', properties: {} }, values: { changed: true } } };
		connection.fail = true;
		const invalidated = service.getAgentConfig(connection, 'claude', repo);
		await timeout(0);
		const failed = service.getAgentConfig(connection, 'claude', repo);

		assert.deepStrictEqual({
			lazy,
			pending,
			resolved,
			requestsAfterResolve,
			invalidated,
			failed,
			requests: connection.requests,
			changes: changes.length,
			warnings: log.warnings.length,
		}, {
			lazy: 0,
			pending: { config: undefined, resolving: true },
			resolved: { config: { schema: { type: 'object', properties: {} }, values: { agent: 'claude' } }, resolving: false },
			requestsAfterResolve: 2,
			invalidated: { config: undefined, resolving: true },
			failed: { config: undefined, resolving: false },
			requests: [
				{ provider: 'claude', workingDirectory: repo.toString() },
				{ provider: 'codex', workingDirectory: repo.toString() },
				{ provider: 'claude', workingDirectory: repo.toString() },
			],
			changes: 3,
			warnings: 1,
		});
	});

	test('drops a resolution that settles after the connection\'s configs were cleared', async () => {
		const service = store.add(new AgentHostChatAgentConfigService(new NullLogService()));
		const connection = new TestConnection();
		service.getAgentConfig(connection, 'claude', undefined);
		service.clear(connection);
		await timeout(0);

		assert.deepStrictEqual({ config: service.getAgentConfig(connection, 'claude', undefined), requests: connection.requests.length }, { config: { config: undefined, resolving: true }, requests: 2 });
	});
});
