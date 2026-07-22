/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { AgentSession } from '../../../common/agentService.js';
import { SessionConfigKey } from '../../../common/sessionConfigKeys.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { IAgentSdkDownloader } from '../../../node/agentSdkDownloader.js';
import { CodexAgent } from '../../../node/codex/codexAgent.js';
import { ICodexProxyService } from '../../../node/codex/codexProxyService.js';
import { ICopilotApiService } from '../../../node/shared/copilotApiService.js';

suite('CodexAgent worktree-isolation prewarm eviction', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createAgent(pending: { value: boolean }): CodexAgent {
		const instantiationService = new TestInstantiationService();
		instantiationService.stub(ISessionDataService, { _serviceBrand: undefined });
		instantiationService.stub(ICopilotApiService, { _serviceBrand: undefined });
		instantiationService.stub(ICodexProxyService, { _serviceBrand: undefined });
		instantiationService.stub(IAgentConfigurationService, { _serviceBrand: undefined, isWorkingDirectoryPending: () => pending.value });
		// Keep prewarm from touching the connection: the eager background prewarm
		// bails when the SDK isn't already local.
		instantiationService.stub(IAgentSdkDownloader, { _serviceBrand: undefined, isSdkResolvableWithoutDownload: async () => false });
		instantiationService.stub(IProductService, { _serviceBrand: undefined, version: '1.0.0-test' } as IProductService);
		instantiationService.stub(ILogService, new NullLogService());
		return disposables.add(instantiationService.createInstance(CodexAgent));
	}

	test('evicts a folder-bound prewarm once the session flips to a pending worktree', async () => {
		const pending = { value: false };
		const agent = createAgent(pending);
		agent['_githubToken'] = 'test-token';

		const { session } = await agent.createSession({ workingDirectory: URI.file('/repo/folder') });
		const entry = agent['_sessions'].get(AgentSession.id(session))!;

		// Simulate the materialized folder-bound prewarm thread that createSession
		// would have produced for a non-pending `folder` session.
		const threadId = 'thread-folder';
		entry.threadId = threadId;
		entry.prewarmTimer = setTimeout(() => { }, 60_000);
		agent['_sessionIdByThreadId'].set(threadId, entry.sessionId);

		const snapshot = () => ({
			threadId: entry.threadId,
			routed: agent['_sessionIdByThreadId'].has(threadId),
			timerCleared: entry.prewarmTimer === undefined,
		});

		// A config change while the working directory is still `folder` (not
		// pending) must leave the prewarm intact.
		agent.onSessionConfigChanged(session, { [SessionConfigKey.Isolation]: 'folder' });
		const afterFolder = snapshot();

		// Toggling to `worktree` marks the working directory pending; the stale
		// folder-bound prewarm must be evicted so the next send re-materializes.
		pending.value = true;
		agent.onSessionConfigChanged(session, { [SessionConfigKey.Isolation]: 'worktree' });
		const afterWorktree = snapshot();

		assert.deepStrictEqual({ afterFolder, afterWorktree }, {
			afterFolder: { threadId, routed: true, timerCleared: false },
			afterWorktree: { threadId: undefined, routed: false, timerCleared: true },
		});
	});
});
