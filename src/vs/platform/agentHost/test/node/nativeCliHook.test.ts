/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { normalizeNativeCliHook, readResumeDirectory } from '../../node/nativeCliHook.js';

suite('Native CLI lifecycle hook', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

	test('retains exact identity and a short prompt title without recording the transcript or tool output', () => {
		const event = normalizeNativeCliHook('prompt', { session_id: id, cwd: '/repo', prompt: '  Fix\n  the tests\x07 ', transcript_path: '/private/transcript.jsonl', tool_response: 'sensitive output' });
		assert.deepStrictEqual(event && { ...event, timestamp: 0 }, { event: 'prompt', sessionId: id, cwd: '/repo', title: 'Fix the tests', timestamp: 0 });
	});

	test('accepts Copilot camelCase identity and ignores unrelated subagent events', () => {
		assert.deepStrictEqual([
			normalizeNativeCliHook('start', { sessionId: id, cwd: '/repo' })?.sessionId,
			normalizeNativeCliHook('start', { session_id: id, cwd: '/repo', agent_id: 'worker' }),
			normalizeNativeCliHook('start', { session_id: '../other', cwd: '/repo' }),
			normalizeNativeCliHook('start', { session_id: id, cwd: 'relative' }),
		], [id, undefined, undefined, undefined]);
	});

	test('Claude hook metadata distinguishes titles, directory changes, permissions, tool completion and errors', () => {
		const input = { session_id: id, cwd: '/outgoing', agent_type: 'custom-agent' };
		const events = [
			normalizeNativeCliHook('prompt', { ...input, session_title: 'Native title', prompt: 'Fallback prompt' }),
			normalizeNativeCliHook('cwd', { ...input, new_cwd: '/resumed' }),
			normalizeNativeCliHook('input', { ...input, notification_type: 'permission_prompt' }),
			normalizeNativeCliHook('input', { ...input, notification_type: 'idle_prompt' }),
			normalizeNativeCliHook('input', { ...input, notification_type: 'auth_success' }),
			normalizeNativeCliHook('working', input),
			normalizeNativeCliHook('error', input),
		];
		assert.deepStrictEqual(events.map(event => event && { event: event.event, cwd: event.cwd, title: event.title, activity: event.activity }), [
			{ event: 'prompt', cwd: '/outgoing', title: 'Native title', activity: undefined },
			{ event: 'start', cwd: '/resumed', title: undefined, activity: undefined },
			{ event: 'input', cwd: '/outgoing', title: undefined, activity: undefined },
			{ event: 'stop', cwd: '/outgoing', title: undefined, activity: undefined },
			undefined,
			{ event: 'activity', cwd: '/outgoing', title: undefined, activity: 'working' },
			{ event: 'activity', cwd: '/outgoing', title: undefined, activity: 'error' },
		]);
	});

	test('resumed Claude directories come from the exact conversation, not the outgoing hook cwd', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'vscode-cli-hook-test-'));
		const transcript = join(directory, `${id}.jsonl`);
		try {
			await writeFile(transcript, [
				JSON.stringify({ sessionId: id, cwd: '/old', message: 'Not retained' }),
				JSON.stringify({ sessionId: id, cwd: '/target', message: 'Not retained' }),
				JSON.stringify({ sessionId: 'another-session', cwd: '/unrelated' }),
				'{"cwd":"/incomplete',
			].join('\n'));
			assert.deepStrictEqual([
				readResumeDirectory(transcript, id),
				readResumeDirectory(transcript, 'another-session'),
			], ['/target', undefined]);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
