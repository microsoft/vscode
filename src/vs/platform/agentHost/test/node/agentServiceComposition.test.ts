/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { IWillDeleteSessionDataEvent } from '../../common/sessionDataService.js';
import { createNullSessionDataService, createNoopGitService } from '../common/sessionTestHelpers.js';
import { AgentServiceCallbackAdapter } from '../../node/agentServiceFoundation.js';
import type { IAgentServiceCallbacks } from '../../node/agentService.js';
import { createTestAgentService } from './agentServiceTestUtils.js';

suite('AgentServiceComposition', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const expectedSessionDataCleanupParticipants = 2;

	test('arms session-data cleanup participants', async () => {
		const onWillDeleteSessionData = disposables.add(new Emitter<IWillDeleteSessionDataEvent>());
		const sessionDataService = {
			...createNullSessionDataService(),
			onWillDeleteSessionData: onWillDeleteSessionData.event,
		};
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		disposables.add(createTestAgentService(
			logService,
			fileService,
			sessionDataService,
			{ _serviceBrand: undefined, ...product },
			createNoopGitService(),
		));
		const cleanup: Promise<unknown>[] = [];

		onWillDeleteSessionData.fire({
			session: URI.parse('copilot:/session'),
			workingDirectories: undefined,
			waitUntil: promise => cleanup.push(promise),
		});

		assert.strictEqual(cleanup.length, expectedSessionDataCleanupParticipants);
		await Promise.all(cleanup);
	});

	test('callback adapter forwards every argument of the fork_session accessor calls', async () => {
		const calls: unknown[][] = [];
		const adapter = new AgentServiceCallbackAdapter();
		adapter.bind({
			sessionServerToolAccessor: {
				startPrompt: async (...args: unknown[]) => { calls.push(['startPrompt', ...args]); },
				supportsChatForks: (...args: unknown[]) => { calls.push(['supportsChatForks', ...args]); return true; },
			},
		} as unknown as IAgentServiceCallbacks);
		const session = URI.parse('copilot:/s1');
		const chat = URI.parse('copilot:/s1/chat');
		const delegation = { sourceSession: 'copilot:/s0' };
		const credentials = { token: 'token' };
		const agent = { uri: 'file:///agents/reviewer.agent.md' };

		await adapter.sessionServerToolAccessor.startPrompt(session, chat, 'prompt', delegation, credentials as never, agent as never);
		adapter.sessionServerToolAccessor.supportsChatForks(session, chat);

		assert.deepStrictEqual(calls, [
			['startPrompt', session, chat, 'prompt', delegation, credentials, agent],
			['supportsChatForks', session, chat],
		]);
	});
});
