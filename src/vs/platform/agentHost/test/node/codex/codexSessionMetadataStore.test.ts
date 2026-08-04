/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { CodexSessionMetadataStore } from '../../../node/codex/codexSessionMetadataStore.js';
import { createSessionDataService, TestSessionDatabase } from '../../common/sessionTestHelpers.js';

suite('CodexSessionMetadataStore', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('round trips working directories', async () => {
		const store = new CodexSessionMetadataStore(createSessionDataService(), new NullLogService());
		const session = URI.parse('codex:/session');
		const workingDirectories = [URI.file('/repo-a'), URI.file('/repo-b')];

		await store.write(session, { threadId: 'thread', cwd: workingDirectories[0], workingDirectories, agent: { uri: 'file:///agents/reviewer.agent.md' } });

		const overlay = await store.read(session);
		assert.deepStrictEqual({
			threadId: overlay.threadId,
			cwd: overlay.cwd?.toString(),
			workingDirectories: overlay.workingDirectories?.map(directory => directory.toString()),
			agent: overlay.agent,
		}, {
			threadId: 'thread',
			cwd: workingDirectories[0].toString(),
			workingDirectories: workingDirectories.map(directory => directory.toString()),
			agent: { uri: 'file:///agents/reviewer.agent.md' },
		});
	});

	test('keeps provider-qualified model selections independent per session', async () => {
		const copilotStore = new CodexSessionMetadataStore(createSessionDataService(new TestSessionDatabase()), new NullLogService());
		const chatGPTStore = new CodexSessionMetadataStore(createSessionDataService(new TestSessionDatabase()), new NullLogService());
		const copilotSession = URI.parse('codex:/copilot-session');
		const chatGPTSession = URI.parse('codex:/chatgpt-session');

		await copilotStore.write(copilotSession, { modelId: '@provider=vscode-proxy:gpt-5' });
		await chatGPTStore.write(chatGPTSession, { modelId: '@provider=openai:gpt-5' });

		assert.deepStrictEqual({
			copilot: (await copilotStore.read(copilotSession)).modelId,
			chatGPT: (await chatGPTStore.read(chatGPTSession)).modelId,
		}, {
			copilot: '@provider=vscode-proxy:gpt-5',
			chatGPT: '@provider=openai:gpt-5',
		});
	});

	test('clears a persisted agent selection', async () => {
		const store = new CodexSessionMetadataStore(createSessionDataService(), new NullLogService());
		const session = URI.parse('codex:/session');
		await store.write(session, { agent: { uri: 'file:///agents/reviewer.agent.md' } });
		await store.write(session, { agent: null });
		assert.strictEqual((await store.read(session)).agent, undefined);
	});

	test('ignores malformed working directory metadata', async () => {
		const database = new TestSessionDatabase();
		await database.setMetadata('codex.cwd', '{"cwd":');
		const store = new CodexSessionMetadataStore(createSessionDataService(database), new NullLogService());

		const overlay = await store.read(URI.parse('codex:/session'));

		assert.deepStrictEqual({ cwd: overlay.cwd, workingDirectories: overlay.workingDirectories }, {
			cwd: undefined,
			workingDirectories: undefined,
		});
	});
});
