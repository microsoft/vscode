/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { INativeCliLifecycleEvent } from '../../common/nativeCliLifecycle.js';
import { getNativeCodexBackendArguments, NativeCodexConnectionRouter, NativeCodexLifecycleTracker } from '../../node/nativeCodexLifecycle.js';

suite('Native Codex lifecycle', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const first = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
	const second = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

	test('correlates exact idle start, resume and fork responses instead of global thread broadcasts', () => {
		const events: INativeCliLifecycleEvent[] = [];
		const tracker = new NativeCodexLifecycleTracker(event => events.push(event));
		tracker.response({ method: 'thread/started', result: { thread: { id: first, cwd: '/unrelated' } } });
		tracker.request({ id: 1, method: 'thread/start', params: { ephemeral: true } });
		tracker.response({ id: 1, result: { thread: { id: second, cwd: '/internal-title' } } });
		for (const [id, method, sessionId, cwd] of [
			[2, 'thread/start', first, '/first'],
			[3, 'thread/resume', second, '/second'],
			[4, 'thread/fork', first, '/first'],
		] as const) {
			tracker.request({ id, method });
			tracker.response({ id, result: { thread: { id: sessionId, cwd, name: method, status: { type: 'idle' } } } });
		}
		assert.deepStrictEqual(events.map(({ event, sessionId, cwd, title, activity }) => ({ event, sessionId, cwd, title, activity })), [
			{ event: 'start', sessionId: first, cwd: '/first', title: 'thread/start', activity: 'idle' },
			{ event: 'start', sessionId: second, cwd: '/second', title: 'thread/resume', activity: 'idle' },
			{ event: 'start', sessionId: first, cwd: '/first', title: 'thread/fork', activity: 'idle' },
		]);
	});

	test('reports main-thread activity, real input waits, errors and title changes', () => {
		const events: INativeCliLifecycleEvent[] = [];
		const tracker = new NativeCodexLifecycleTracker(event => events.push(event));
		tracker.request({ id: 1, method: 'thread/start' });
		tracker.response({ id: 1, result: { thread: { id: first, cwd: '/repo' } } });
		tracker.request({ id: 2, method: 'turn/start', params: { threadId: first, input: [{ type: 'text', text: 'Fix tests' }] } });
		tracker.response({ method: 'thread/status/changed', params: { threadId: second, status: { type: 'active' } } });
		tracker.response({ method: 'thread/status/changed', params: { threadId: first, status: { type: 'active', activeFlags: ['waitingOnApproval'] } } });
		tracker.response({ method: 'thread/status/changed', params: { threadId: first, status: { type: 'active', activeFlags: [] } } });
		tracker.response({ method: 'error', params: { threadId: first, willRetry: true } });
		tracker.response({ method: 'turn/completed', params: { threadId: first, turn: { status: 'completed' } } });
		tracker.response({ method: 'thread/name/updated', params: { threadId: first, threadName: 'Updated title' } });
		tracker.response({ method: 'error', params: { threadId: first, willRetry: false } });
		assert.deepStrictEqual(events.map(({ event, activity, title }) => ({ event, activity, title })), [
			{ event: 'start', activity: 'idle', title: undefined },
			{ event: 'prompt', activity: 'working', title: 'Fix tests' },
			{ event: 'activity', activity: 'input', title: undefined },
			{ event: 'activity', activity: 'working', title: undefined },
			{ event: 'activity', activity: 'idle', title: undefined },
			{ event: 'title', activity: undefined, title: 'Updated title' },
			{ event: 'activity', activity: 'error', title: undefined },
		]);
	});

	test('a failed resume does not change conversation identity', () => {
		const events: INativeCliLifecycleEvent[] = [];
		const tracker = new NativeCodexLifecycleTracker(event => events.push(event));
		tracker.request({ id: 1, method: 'thread/start' });
		tracker.response({ id: 1, result: { thread: { id: first, cwd: '/repo' } } });
		tracker.request({ id: 2, method: 'thread/resume', params: { threadId: second } });
		tracker.response({ id: 2 });
		tracker.response({ method: 'turn/started', params: { threadId: first } });
		assert.deepStrictEqual(events.map(event => event.sessionId), [first, first]);
	});

	test('a rejected turn clears working state without changing the selected conversation', () => {
		const events: INativeCliLifecycleEvent[] = [];
		const tracker = new NativeCodexLifecycleTracker(event => events.push(event));
		tracker.request({ id: 1, method: 'thread/start' });
		tracker.response({ id: 1, result: { thread: { id: first, cwd: '/repo' } } });
		tracker.request({ id: 2, method: 'turn/start', params: { threadId: first } });
		tracker.response({ id: 2, error: { code: -1, message: 'Rejected' } });
		assert.deepStrictEqual(events.map(({ sessionId, activity }) => ({ sessionId, activity })), [
			{ sessionId: first, activity: 'idle' },
			{ sessionId: first, activity: 'working' },
			{ sessionId: first, activity: 'error' },
		]);
	});

	test('native TUI arguments become app-server configuration without executing a turn', () => {
		assert.deepStrictEqual(getNativeCodexBackendArguments(['resume', first, '--model', 'model', '-c', 'model_provider="copilot"']), [
			'app-server', '-c', 'model="model"', '-c', 'model_provider="copilot"',
		]);
		assert.throws(() => getNativeCodexBackendArguments(['exec', 'Do work']), /Unsupported/);
	});

	test('the resume picker shares initialization but not request identifiers with the main TUI', () => {
		type Message = Parameters<NativeCodexConnectionRouter['response']>[0];
		const events: INativeCliLifecycleEvent[] = [];
		const server: Message[] = [];
		const clients: { clientId: number; message: Message }[] = [];
		const router = new NativeCodexConnectionRouter(new NativeCodexLifecycleTracker(event => events.push(event)), message => server.push(message), (clientId, message) => clients.push({ clientId, message }));
		router.addClient(1);
		router.addClient(2);
		router.request(1, { id: 0, method: 'initialize' });
		router.request(2, { id: 0, method: 'initialize' });
		router.response({ id: 1, result: {} });
		router.request(1, { method: 'initialized' });
		router.request(2, { method: 'initialized' });
		router.request(1, { id: 1, method: 'thread/start' });
		router.request(2, { id: 1, method: 'thread/list' });
		router.response({ id: 3, result: {} });
		router.response({ id: 2, result: { thread: { id: first, cwd: '/repo' } } });
		router.removeClient(2);

		assert.deepStrictEqual({
			requests: server.map(({ id, method }) => ({ id, method })),
			replies: clients.map(({ clientId, message }) => ({ clientId, id: message.id })),
			foreground: events.map(event => event.sessionId),
		}, {
			requests: [
				{ id: 1, method: 'initialize' }, { id: undefined, method: 'initialized' },
				{ id: 2, method: 'thread/start' }, { id: 3, method: 'thread/list' },
			],
			replies: [{ clientId: 1, id: 0 }, { clientId: 2, id: 0 }, { clientId: 2, id: 1 }, { clientId: 1, id: 1 }],
			foreground: [first],
		});
	});

	test('native approval requests go only to the owning TUI, not its session picker', () => {
		type Message = Parameters<NativeCodexConnectionRouter['response']>[0];
		const server: Message[] = [];
		const clients: { clientId: number; message: Message }[] = [];
		const router = new NativeCodexConnectionRouter(new NativeCodexLifecycleTracker(() => { }), message => server.push(message), (clientId, message) => clients.push({ clientId, message }));
		router.addClient(1);
		router.addClient(2);
		router.request(1, { id: 0, method: 'thread/start' });
		router.response({ id: 1, result: { thread: { id: first, cwd: '/repo' } } });
		router.response({ id: 99, method: 'item/commandExecution/requestApproval', params: { threadId: first } });
		assert.throws(() => router.request(2, { id: 99, result: {} }), /Unexpected/);
		router.removeClient(1);

		assert.deepStrictEqual({
			approvalRecipients: clients.filter(entry => entry.message.method).map(entry => entry.clientId),
			reply: server[server.length - 1],
		}, {
			approvalRecipients: [1],
			reply: { id: 99, error: { code: -32000, message: 'Native CLI connection closed' } },
		});
	});
});
