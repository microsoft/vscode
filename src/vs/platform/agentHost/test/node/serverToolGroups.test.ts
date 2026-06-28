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
			del: display('deleteComments'),
			resolve: display('resolveComments'),
			view: display('viewUnreviewedComments'),
		}, {
			add: { displayName: 'Add Comment', invocation: 'Adding comment' },
			list: { displayName: 'List Comments', invocation: 'Checking comments' },
			del: { displayName: 'Delete Comments', invocation: 'Deleting comments' },
			resolve: { displayName: 'Resolve Comments', invocation: 'Resolving comments' },
			view: { displayName: 'View Comments', invocation: 'Viewing comments' },
		});
	});

	test('listComments past tense reflects the comment count parsed from the result', () => {
		const past = (resultText?: string) =>
			text(getServerToolDisplay('listComments', undefined, { text: resultText, success: true })?.pastTenseMessage);
		const withComments = (n: number) => JSON.stringify({ comments: Array.from({ length: n }, (_, i) => ({ id: `${i}` })) });
		assert.deepStrictEqual({
			zero: past(withComments(0)),
			one: past(withComments(1)),
			many: past(withComments(3)),
			noResult: past(),
			malformed: past('not json'),
			noComments: past(JSON.stringify({ other: 1 })),
		}, {
			zero: 'Checked 0 comments',
			one: 'Checked 1 comment',
			many: 'Checked 3 comments',
			noResult: 'Checked comments',
			malformed: 'Checked comments',
			noComments: 'Checked comments',
		});
	});

	test('non-listComments past tense ignores the result text', () => {
		assert.strictEqual(
			text(getServerToolDisplay('resolveComments', undefined, { text: 'anything', success: true })?.pastTenseMessage),
			'Resolved comments',
		);
	});

	test('transport-prefixed names (Claude mcp__host__) match the bare tool', () => {
		assert.deepStrictEqual({
			display: getServerToolDisplay('mcp__host__listComments', undefined)?.displayName,
			past: text(getServerToolDisplay('mcp__host__listComments', undefined, { text: JSON.stringify({ comments: [{ id: 'a' }, { id: 'b' }] }), success: true })?.pastTenseMessage),
		}, {
			display: 'List Comments',
			past: 'Checked 2 comments',
		});
	});

	test('unknown tools return undefined so callers fall back to their generic display', () => {
		assert.strictEqual(getServerToolDisplay('bash', { command: 'ls' }), undefined);
		assert.strictEqual(getServerToolDisplay('someClientTool', undefined), undefined);
	});
});
