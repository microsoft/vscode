/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { appendSystemDrift, CacheDiffKind, diffPromptSignature, formatSignatureToken, parseInputMessages } from '../../browser/chatDebug/chatDebugCacheDiff.js';

function msg(role: string, content: string, name?: string) {
	const part: { type: string; content: string; name?: string } = { type: 'text', content };
	if (name) {
		part.name = name;
	}
	return { role, ...(name ? { name } : {}), parts: [part] };
}

suite('chatDebugCacheDiff', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('parseInputMessages', () => {
		test('parses well-formed input messages and computes byte length', () => {
			const json = JSON.stringify([msg('system', 'hi'), msg('user', 'hello'), msg('tool', 'result', 'tool_a')]);
			const parsed = parseInputMessages(json);
			assert.deepStrictEqual(parsed, [
				{ role: 'system', name: undefined, text: 'hi', charLength: 2 },
				{ role: 'user', name: undefined, text: 'hello', charLength: 5 },
				{ role: 'tool', name: 'tool_a', text: 'result', charLength: 6 },
			]);
		});

		test('returns empty array for malformed inputs', () => {
			assert.deepStrictEqual(parseInputMessages(undefined), []);
			assert.deepStrictEqual(parseInputMessages(''), []);
			assert.deepStrictEqual(parseInputMessages('not json'), []);
			assert.deepStrictEqual(parseInputMessages('"a string"'), []);
		});

		test('extracts tool_call_response content and reclassifies role to tool', () => {
			const json = JSON.stringify([
				{ role: 'user', parts: [{ type: 'tool_call_response', id: 'call_1', response: 'Found 12 references.' }] },
			]);
			assert.deepStrictEqual(parseInputMessages(json), [
				{ role: 'tool', name: undefined, text: 'Found 12 references.', charLength: 'Found 12 references.'.length },
			]);
		});

		test('extracts tool_call arguments on assistant messages', () => {
			const json = JSON.stringify([
				{ role: 'assistant', parts: [{ type: 'tool_call', id: 'call_1', name: 'fs_read', arguments: { path: '/etc/hosts' } }] },
			]);
			const expected = `call:fs_read${JSON.stringify({ path: '/etc/hosts' })}`;
			assert.deepStrictEqual(parseInputMessages(json), [
				{ role: 'assistant', name: undefined, text: expected, charLength: expected.length },
			]);
		});
	});

	suite('diffPromptSignature', () => {
		test('all identical messages produce no break and only identical tokens', () => {
			const a = parseInputMessages(JSON.stringify([msg('system', 'sys'), msg('user', 'q1')]));
			const b = parseInputMessages(JSON.stringify([msg('system', 'sys'), msg('user', 'q1')]));
			const result = diffPromptSignature(a, b);
			assert.deepStrictEqual(
				{
					break: result.break,
					counts: result.counts,
					kinds: result.signature.map(s => s.kind),
					drift: result.drift.map(d => d.name + ':' + d.status),
				},
				{
					break: undefined,
					counts: { identical: 2, contentDrift: 0, lengthChange: 0, onlyInA: 0, onlyInB: 0 },
					kinds: [CacheDiffKind.Identical, CacheDiffKind.Identical],
					drift: [],
				},
			);
		});

		test('content drift at index 1 reports a contentDrift break', () => {
			const a = parseInputMessages(JSON.stringify([msg('system', 'sys'), msg('user', 'aaaa')]));
			const b = parseInputMessages(JSON.stringify([msg('system', 'sys'), msg('user', 'bbbb')]));
			const result = diffPromptSignature(a, b);
			assert.deepStrictEqual(
				{
					break: result.break,
					counts: result.counts,
					kinds: result.signature.map(s => s.kind),
					drift: result.drift.map(d => `${d.name}:${d.status}:${d.aSize}->${d.bSize}`),
				},
				{
					break: { index: 1, kind: CacheDiffKind.ContentDrift },
					counts: { identical: 1, contentDrift: 1, lengthChange: 0, onlyInA: 0, onlyInB: 0 },
					kinds: [CacheDiffKind.Identical, CacheDiffKind.ContentDrift],
					drift: ['messages[1]:contentDrift:4->4'],
				},
			);
		});

		test('length change at index 1 reports a lengthChange break', () => {
			const a = parseInputMessages(JSON.stringify([msg('system', 'sys'), msg('user', 'short')]));
			const b = parseInputMessages(JSON.stringify([msg('system', 'sys'), msg('user', 'much longer text')]));
			const result = diffPromptSignature(a, b);
			assert.deepStrictEqual(
				{
					break: result.break,
					counts: result.counts,
					kinds: result.signature.map(s => s.kind),
					drift: result.drift.map(d => `${d.name}:${d.status}:${d.aSize}->${d.bSize}`),
				},
				{
					break: { index: 1, kind: CacheDiffKind.LengthChange },
					counts: { identical: 1, contentDrift: 0, lengthChange: 1, onlyInA: 0, onlyInB: 0 },
					kinds: [CacheDiffKind.Identical, CacheDiffKind.LengthChange],
					drift: ['messages[1]:lengthChange:5->16'],
				},
			);
		});

		test('B has trailing messages A does not — break at first onlyInB', () => {
			const a = parseInputMessages(JSON.stringify([msg('system', 'sys'), msg('user', 'q1')]));
			const b = parseInputMessages(JSON.stringify([msg('system', 'sys'), msg('user', 'q1'), msg('assistant', 'a1'), msg('user', 'q2')]));
			const result = diffPromptSignature(a, b);
			assert.deepStrictEqual(
				{
					break: result.break,
					counts: result.counts,
					kinds: result.signature.map(s => s.kind),
				},
				{
					break: { index: 2, kind: CacheDiffKind.OnlyInB },
					counts: { identical: 2, contentDrift: 0, lengthChange: 0, onlyInA: 0, onlyInB: 2 },
					kinds: [CacheDiffKind.Identical, CacheDiffKind.Identical, CacheDiffKind.OnlyInB, CacheDiffKind.OnlyInB],
				},
			);
		});

		test('A has trailing messages B does not — break at first onlyInA', () => {
			const a = parseInputMessages(JSON.stringify([msg('system', 'sys'), msg('user', 'q1'), msg('assistant', 'a1')]));
			const b = parseInputMessages(JSON.stringify([msg('system', 'sys'), msg('user', 'q1')]));
			const result = diffPromptSignature(a, b);
			assert.deepStrictEqual(
				{ break: result.break, counts: result.counts },
				{
					break: { index: 2, kind: CacheDiffKind.OnlyInA },
					counts: { identical: 2, contentDrift: 0, lengthChange: 0, onlyInA: 1, onlyInB: 0 },
				},
			);
		});

		test('appendSystemDrift inserts a system row when system instructions differ', () => {
			const drift = appendSystemDrift([], 'old system', 'new system!!');
			assert.deepStrictEqual(drift, [{ name: 'system', status: CacheDiffKind.LengthChange, aSize: 10, bSize: 12 }]);
		});

		test('appendSystemDrift returns input unchanged when system matches', () => {
			const existing = [{ name: 'messages[0]', role: 'user', status: CacheDiffKind.ContentDrift, aSize: 4, bSize: 4 }];
			assert.deepStrictEqual(appendSystemDrift(existing, 'sys', 'sys'), existing);
		});
	});

	suite('formatSignatureToken', () => {
		test('formats identical, drift, and one-sided tokens', () => {
			assert.strictEqual(
				formatSignatureToken({ index: 0, kind: CacheDiffKind.Identical, aRole: 'user', aCharLength: 12, bRole: 'user', bCharLength: 12 }),
				'user:12',
			);
			assert.strictEqual(
				formatSignatureToken({ index: 1, kind: CacheDiffKind.LengthChange, aRole: 'user', aCharLength: 5, bRole: 'user', bCharLength: 8 }),
				'user:5\u21928',
			);
			assert.strictEqual(
				formatSignatureToken({ index: 2, kind: CacheDiffKind.OnlyInB, bRole: 'tool', bName: 'fs_read', bCharLength: 320 }),
				'tool-fs_read:0\u2192320',
			);
		});
	});
});
