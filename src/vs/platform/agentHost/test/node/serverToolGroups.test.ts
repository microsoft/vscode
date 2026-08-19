/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { StringOrMarkdown } from '../../common/state/sessionState.js';
import { getServerToolDisplay } from '../../node/shared/serverToolGroups.js';

function text(value: StringOrMarkdown | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	return typeof value === 'string' ? value : value.markdown;
}

suite('serverToolGroups display', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('feedback tools resolve to dedicated display strings', () => {
		const display = (toolName: string) => {
			const d = getServerToolDisplay(toolName, undefined);
			return { displayName: d?.displayName, invocation: text(d?.invocationMessage) };
		};
		assert.deepStrictEqual({
			add: display('addComment'),
			list: display('listComments'),
			reply: display('replyToComment'),
			del: display('deleteComments'),
			resolve: display('resolveComments'),
			view: display('viewUnreviewedComments'),
		}, {
			add: { displayName: 'Add Comment', invocation: 'Add comment' },
			list: { displayName: 'List Comments', invocation: 'List comments' },
			reply: { displayName: 'Reply to Comment', invocation: 'Reply to comment' },
			del: { displayName: 'Delete Comments', invocation: 'Delete comments' },
			resolve: { displayName: 'Resolve Comments', invocation: 'Resolve comments' },
			view: { displayName: 'View Comments', invocation: 'View comments' },
		});
	});

	test('session-management tools resolve to dedicated display strings', () => {
		const display = (toolName: string) => {
			const d = getServerToolDisplay(toolName, undefined);
			return { displayName: d?.displayName, invocation: text(d?.invocationMessage) };
		};
		assert.deepStrictEqual({
			list: display('list_sessions'),
			current: display('get_current_session'),
			create: display('create_session'),
			chat: display('create_chat'),
			send: display('send_message'),
			context: display('get_session_context'),
			del: display('delete_session'),
		}, {
			list: { displayName: 'List Sessions', invocation: 'List sessions' },
			current: { displayName: 'Get Current Session', invocation: 'Get current session' },
			create: { displayName: 'Create Session', invocation: 'Creating session' },
			chat: { displayName: 'Create Chat', invocation: 'Create chat' },
			send: { displayName: 'Send Message', invocation: 'Send message' },
			context: { displayName: 'Get Session Context', invocation: 'Read session context' },
			del: { displayName: 'Delete Session', invocation: 'Deleting session' },
		});
	});

	test('fast tools omit a duplicate completion message', () => {
		const past = (resultText?: string) =>
			text(getServerToolDisplay('listComments', undefined, { text: resultText, success: true })?.pastTenseMessage);
		assert.deepStrictEqual({
			withResult: past(JSON.stringify({ comments: [{ id: 'a' }] })),
			noResult: past(),
			malformed: past('not json'),
		}, {
			withResult: undefined,
			noResult: undefined,
			malformed: undefined,
		});
	});

	test('non-listComments past tense ignores the result text', () => {
		assert.strictEqual(
			text(getServerToolDisplay('resolveComments', undefined, { text: 'anything', success: true })?.pastTenseMessage),
			undefined,
		);
	});

	test('transport-prefixed names (Claude mcp__host__) match the bare tool', () => {
		assert.deepStrictEqual({
			display: getServerToolDisplay('mcp__host__listComments', undefined)?.displayName,
			past: text(getServerToolDisplay('mcp__host__listComments', undefined, { text: JSON.stringify({ comments: [{ id: 'a' }, { id: 'b' }] }), success: true })?.pastTenseMessage),
		}, {
			display: 'List Comments',
			past: undefined,
		});
	});

	test('unknown tools return undefined so callers fall back to their generic display', () => {
		assert.strictEqual(getServerToolDisplay('bash', { command: 'ls' }), undefined);
		assert.strictEqual(getServerToolDisplay('someClientTool', undefined), undefined);
	});
});
