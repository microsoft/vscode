/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { CancellationError } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import type { IAgentHostChatContributions } from '../../common/agentHostChatContributionsService.js';
import { buildChatUri, buildDefaultChatUri, ChatOriginKind, MessageKind, SessionStatus, TurnState, type Turn } from '../../common/state/sessionState.js';
import { AgentHostChatContributions } from '../../node/agentHostChatContributionsService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostWorkspaceFiles } from '../../node/agentHostWorkspaceFiles.js';
import { WorkspaceContextContribution } from '../../node/chatContributions/workspaceContext/workspaceContextContribution.js';

suite('WorkspaceContextContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const workspaceHeading = JSON.stringify(URI.file('/workspace').fsPath).slice(1, -1);
	const otherHeading = JSON.stringify(URI.file('/other').fsPath).slice(1, -1);
	teardown(() => sinon.restore());

	function setupContext(options: { files?: readonly string[]; roots?: readonly string[]; provider?: string; truncated?: boolean } = {}) {
		const log = store.add(new NullLogService());
		const state = store.add(new AgentHostStateManager(log));
		const session = 'agent-host-session://workspace-context';
		const chat = buildDefaultChatUri(session);
		state.createSession({
			resource: session,
			provider: options.provider ?? 'copilotcli',
			title: 'Workspace context',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			workingDirectories: [...(options.roots ?? [URI.file('/workspace').toString()])],
		});
		const instantiation = store.add(new InstantiationService(new ServiceCollection(
			[ILogService, log],
			[IAgentHostStateManager, state],
		), true));
		const service: IAgentHostChatContributions = store.add(new AgentHostChatContributions(log, instantiation));
		store.add(service.registerContribution(WorkspaceContextContribution));
		const enumerate = sinon.stub(AgentHostWorkspaceFiles.prototype, 'getFiles').resolves({
			files: (options.files ?? ['/workspace/meta.json']).map(path => URI.file(path)),
			isTruncated: options.truncated ?? false,
		});
		let turn = 0;
		const send = (channel = chat) => service.outgoingTurn({
			session, chat: channel, turnId: String(++turn),
			message: { text: 'Bump the version to 2', origin: { kind: MessageKind.User } },
		});
		return { log, state, service, session, chat, enumerate, send };
	}

	test('adds a sorted file-name tree and preserves the user message', async () => {
		const context = setupContext({
			files: [
				'/workspace/tests/main.test.ts', '/workspace/src/main.ts', '/workspace/meta.json',
				'/workspace/.env', '/workspace/.git/config', '/workspace/node_modules/pkg/index.js', '/other/private.txt',
			]
		});
		assert.deepStrictEqual(await context.send(), {
			message: { text: 'Bump the version to 2', origin: { kind: MessageKind.User } },
			instructions: ['<workspace_info>\nInitial workspace structure (file names only):\n```text\n' + workspaceHeading + '\nmeta.json\nsrc/\n\tmain.ts\ntests/\n\tmain.test.ts\n```\nThis snapshot may be truncated or stale. Use tools to inspect file contents and collect more context as needed.\n</workspace_info>'],
		});
	});

	test('adds context once per chat and suppresses it for populated restored chats', async () => {
		const context = setupContext();
		const peer = buildChatUri(context.session, 'peer');
		const restored = buildChatUri(context.session, 'restored');
		const empty = buildChatUri(context.session, 'empty');
		for (const chat of [peer, restored, empty]) {
			context.state.addChat(context.session, chat, { title: chat, origin: { kind: ChatOriginKind.User } });
		}
		const turn: Turn = { id: 'old', state: TurnState.Complete, message: { text: 'old', origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined };
		await context.service.hydrateTurns({ session: context.session, chat: restored }, [turn]);
		await context.service.hydrateTurns({ session: context.session, chat: empty }, []);
		const results = [];
		for (const chat of [context.chat, context.chat, peer, peer, restored, empty]) {
			results.push(!!(await context.send(chat)).instructions?.length);
		}
		assert.deepStrictEqual({ results, enumerations: context.enumerate.callCount }, { results: [true, false, true, false, false, true], enumerations: 3 });
	});

	test('preserves multiple roots without enumerating overlapping roots twice', async () => {
		const context = setupContext({
			roots: ['/workspace', '/workspace/src', '/workspace', '/other'].map(path => URI.file(path).toString()),
			files: ['/workspace/package.json', '/workspace/src/main.ts', '/other/meta.json'],
		});
		const result = await context.send();
		assert.deepStrictEqual({
			roots: context.enumerate.getCalls().map(call => call.args[0].path),
			structure: result.instructions?.[0].split('```text\n')[1].split('\n```')[0],
		}, { roots: ['/workspace', '/other'], structure: workspaceHeading + '\npackage.json\nsrc/\n\tmain.ts\n\n' + otherHeading + '\nmeta.json' });
	});

	test('uses a peer chat\'s restricted working directories', async () => {
		const context = setupContext({
			roots: ['/workspace', '/other'].map(path => URI.file(path).toString()),
			files: ['/workspace/private.ts', '/other/meta.json'],
		});
		const peer = buildChatUri(context.session, 'restricted');
		context.state.addChat(context.session, peer, {
			title: 'Restricted', origin: { kind: ChatOriginKind.User },
			workingDirectories: [URI.file('/other').toString()],
		});
		const result = await context.send(peer);
		assert.deepStrictEqual({
			roots: context.enumerate.getCalls().map(call => call.args[0].path),
			structure: result.instructions?.[0].split('```text\n')[1].split('\n```')[0],
		}, { roots: ['/other'], structure: otherHeading + '\nmeta.json' });
	});

	test('bounds the snapshot and keeps root-level orientation ahead of deep files', async () => {
		const context = setupContext({
			files: [
				'/workspace/meta.json', '/workspace/z-last/test.ts',
				...Array.from({ length: 1000 }, (_, i) => `/workspace/a-large/file-${String(i).padStart(4, '0')}.ts`),
			]
		});
		const instruction = (await context.send()).instructions?.[0];
		assert.ok(instruction);
		const structure = instruction.split('```text\n')[1].split('\n```')[0];
		assert.deepStrictEqual({ bounded: structure.length <= 2000, manifest: structure.includes('meta.json'), lastDirectory: structure.includes('z-last/'), truncated: structure.endsWith('...') }, {
			bounded: true, manifest: true, lastDirectory: true, truncated: true,
		});
	});

	test('marks an incomplete enumeration as truncated', async () => {
		const context = setupContext({ truncated: true });
		assert.ok((await context.send()).instructions?.[0].includes('meta.json\n...\n```'));
	});

	test('quotes control characters and uses a safe Markdown fence', async () => {
		const context = setupContext({ files: ['/workspace/```', '/workspace/line\nname.ts'] });
		const instruction = (await context.send()).instructions?.[0];
		assert.ok(instruction);
		assert.deepStrictEqual({ safeFence: instruction.includes('````text\n'), escapedName: instruction.includes('line\\nname.ts') }, { safeFence: true, escapedName: true });
	});

	for (const options of [{ roots: [] }, { roots: ['vscode-remote://host/workspace'] }, { files: [] }, { provider: 'claude' }]) {
		test(`does not add unavailable context: ${JSON.stringify(options)}`, async () => {
			const context = setupContext(options);
			assert.deepStrictEqual(await context.send(), { message: { text: 'Bump the version to 2', origin: { kind: MessageKind.User } } });
		});
	}

	test('logs enumeration errors without blocking the user message', async () => {
		const context = setupContext();
		context.enumerate.rejects(new Error('directory unavailable'));
		const error = sinon.spy(context.log, 'error');
		const result = await context.send();
		assert.deepStrictEqual({ text: result.message.text, instructions: result.instructions, logged: error.calledOnce }, {
			text: 'Bump the version to 2', instructions: undefined, logged: true,
		});
	});

	test('bounds the wait for a slow filesystem', async () => {
		const context = setupContext();
		const clock = sinon.useFakeTimers();
		context.enumerate.callsFake((_root, token) => new Promise((_resolve, reject) => {
			const listener = token.onCancellationRequested(() => {
				listener.dispose();
				reject(new CancellationError());
			});
			store.add(listener);
		}));
		const pending = context.send();
		await clock.tickAsync(2000);
		assert.deepStrictEqual(await pending, { message: { text: 'Bump the version to 2', origin: { kind: MessageKind.User } } });
	});
});
