/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { PassThrough } from 'stream';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CodexAppServerClient } from '../../../node/codex/codexAppServerClient.js';
import { codexSavedHistoryArguments, codexSavedHistoryEnvironment, readCodexSavedThread } from '../../../node/codex/codexSavedThreadReader.js';
import type { Thread } from '../../../node/codex/protocol/generated/v2/Thread.js';
import type { Turn } from '../../../node/codex/protocol/generated/v2/Turn.js';

suite('Codex saved native history requests', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const thread = upcastPartial<Thread>({
		id: 'native-thread', ephemeral: false, status: { type: 'notLoaded' },
		historyMode: 'paginated', path: '/saved/rollout.jsonl', turns: [],
	});
	const turn = (id: string): Turn => ({ id, rootTurnId: null, itemsView: 'full', status: 'completed', items: [], error: null, startedAt: null, completedAt: null, durationMs: null });

	function createClient(replies: object[]) {
		const input = new PassThrough();
		const output = new PassThrough();
		const exit = disposables.add(new Emitter<{ code: number | null; signal: NodeJS.Signals | null }>());
		const requests: { method: string; params: unknown }[] = [];
		const responses: unknown[] = [];
		input.on('data', data => {
			const message = JSON.parse(data.toString());
			if (!message.method) {
				responses.push(message);
				return;
			}
			requests.push({ method: message.method, params: message.params });
			const result = replies.shift();
			if (result) {
				output.write(JSON.stringify({ id: message.id, result }) + '\n');
			}
		});
		input.on('finish', () => exit.fire({ code: 0, signal: null }));
		disposables.add(toDisposable(() => { input.destroy(); output.destroy(); }));
		const client = disposables.add(new CodexAppServerClient({
			stdin: input, stdout: output, onExit: exit.event,
			onExitOnce: listener => { disposables.add(exit.event(listener)); },
			kill: () => { exit.fire({ code: null, signal: 'SIGKILL' }); return true; },
		}));
		return { client, requests, output, responses };
	}

	test('drains full ascending pages without resuming or preparing the source', async () => {
		const peer = createClient([
			{ thread },
			{ data: [turn('one')], nextCursor: 'next', backwardsCursor: null },
			{ data: [turn('two')], nextCursor: null, backwardsCursor: null },
		]);
		const result = await readCodexSavedThread(peer.client, thread.id, CancellationToken.None, async () => { });
		assert.deepStrictEqual({ ids: result.turns.map(turn => turn.id), requests: peer.requests }, {
			ids: ['one', 'two'],
			requests: [
				{ method: 'thread/read', params: { threadId: 'native-thread', includeTurns: false } },
				{ method: 'thread/turns/list', params: { threadId: 'native-thread', cursor: null, sortDirection: 'asc', itemsView: 'full', limit: 100 } },
				{ method: 'thread/turns/list', params: { threadId: 'native-thread', cursor: 'next', sortDirection: 'asc', itemsView: 'full', limit: 100 } },
			],
		});
	});

	test('validates the source projection before accepting an empty page', async () => {
		const peer = createClient([{ thread }]);
		await assert.rejects(readCodexSavedThread(peer.client, thread.id, CancellationToken.None, async () => { throw new Error('Missing history index'); }), /Missing history index/);
		assert.deepStrictEqual(peer.requests.map(request => request.method), ['thread/read']);
	});

	test('rejects repeated pagination cursors', async () => {
		const peer = createClient([{ thread },
		{ data: [turn('one')], nextCursor: 'loop', backwardsCursor: null },
		{ data: [turn('two')], nextCursor: 'loop', backwardsCursor: null },
		]);
		await assert.rejects(readCodexSavedThread(peer.client, thread.id, CancellationToken.None, async () => { }), /incomplete/);
	});

	test('rejects incomplete item pages', async () => {
		const peer = createClient([{ thread }, { data: [{ ...turn('one'), itemsView: 'summary' }], nextCursor: null, backwardsCursor: null }]);
		await assert.rejects(readCodexSavedThread(peer.client, thread.id, CancellationToken.None, async () => { }), /incomplete/);
	});

	test('rejects empty pages that claim more history', async () => {
		const peer = createClient([{ thread }, { data: [], nextCursor: 'lost', backwardsCursor: null }]);
		await assert.rejects(readCodexSavedThread(peer.client, thread.id, CancellationToken.None, async () => { }), /incomplete/);
	});

	test('cancels an outstanding native read without issuing another request', async () => {
		const cancellation = disposables.add(new CancellationTokenSource());
		const peer = createClient([]);
		const read = readCodexSavedThread(peer.client, thread.id, cancellation.token, async () => { });
		cancellation.cancel();
		await assert.rejects(read, CancellationError);
		assert.deepStrictEqual(peer.requests.map(request => request.method), ['thread/read']);
	});

	test('rejects unsolicited tool execution without installing a handler', async () => {
		const peer = createClient([{ thread }, { data: [], nextCursor: null, backwardsCursor: null }]);
		peer.output.write(JSON.stringify({ id: 77, method: 'item/tool/call', params: { threadId: thread.id, callId: 'tool', tool: 'shell', arguments: {} } }) + '\n');
		await readCodexSavedThread(peer.client, thread.id, CancellationToken.None, async () => { });
		assert.deepStrictEqual(peer.responses, [{ id: 77, error: { code: -32601, message: 'Method not found: item/tool/call' } }]);
	});

	test('reads legacy turns using only thread/read', async () => {
		const legacy = { ...thread, historyMode: 'legacy' as const };
		const peer = createClient([{ thread: legacy }, { thread: { ...legacy, turns: [turn('one')] } }]);
		const result = await readCodexSavedThread(peer.client, thread.id, CancellationToken.None, async () => { });
		assert.deepStrictEqual({ ids: result.turns.map(turn => turn.id), requests: peer.requests }, {
			ids: ['one'], requests: [
				{ method: 'thread/read', params: { threadId: 'native-thread', includeTurns: false } },
				{ method: 'thread/read', params: { threadId: 'native-thread', includeTurns: true } },
			],
		});
	});

	test('does not inherit source credentials, proxies or a native home', () => {
		const env = codexSavedHistoryEnvironment('/reader');
		assert.deepStrictEqual({
			home: env.CODEX_HOME, sqlite: env.CODEX_SQLITE_HOME, remote: env.CODEX_INTERNAL_APP_SERVER_REMOTE_CONTROL_DISABLED,
			credentialKeys: Object.keys(env).filter(key => /TOKEN|KEY|PROXY|SECRET|PATH/i.test(key)),
		}, { home: '/reader', sqlite: '/reader', remote: '1', credentialKeys: [] });
		const args = codexSavedHistoryArguments('/reader');
		assert.deepStrictEqual(args.filter(value => /features\./.test(value)), [
			'features.plugins=false', 'features.api_key_model_discovery=false', 'features.background_paginated_rollout_migration=false',
			'features.local_thread_store_compression=false', 'features.hooks=false', 'features.shell_snapshot=false',
		]);
		assert.ok(args.includes('cli_auth_credentials_store="ephemeral"'));
	});
});
