/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { extractAiChunks } from '../../../node/shared/editChunkExtractor.js';

suite('agentHost editChunkExtractor', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Write returns [content]', () => {
		const chunks = extractAiChunks('Write', { file_path: '/x.ts', content: 'hello world\n' });
		assert.deepStrictEqual(chunks, ['hello world\n']);
	});

	test('Edit returns [new_string]', () => {
		const chunks = extractAiChunks('Edit', { file_path: '/x.ts', old_string: 'a', new_string: 'b' });
		assert.deepStrictEqual(chunks, ['b']);
	});

	test('MultiEdit returns one chunk per edit', () => {
		const chunks = extractAiChunks('MultiEdit', {
			file_path: '/x.ts',
			edits: [
				{ old_string: 'a', new_string: '1' },
				{ old_string: 'b', new_string: '2' },
				{ old_string: 'c', new_string: '3' },
			],
		});
		assert.deepStrictEqual(chunks, ['1', '2', '3']);
	});

	test('MultiEdit silently drops malformed entries', () => {
		const chunks = extractAiChunks('MultiEdit', {
			file_path: '/x.ts',
			edits: [
				{ old_string: 'a', new_string: '1' },
				{ old_string: 'b' },                 // missing new_string
				null,                                // not an object
				{ old_string: 'c', new_string: 42 }, // wrong type
				{ old_string: 'd', new_string: '4' },
			],
		});
		assert.deepStrictEqual(chunks, ['1', '4']);
	});

	test('unknown tool returns []', () => {
		assert.deepStrictEqual(extractAiChunks('Bash', { command: 'ls' }), []);
		assert.deepStrictEqual(extractAiChunks('NotebookEdit', { notebook_path: '/x.ipynb' }), []);
		assert.deepStrictEqual(extractAiChunks('mcp__foo__bar', { x: 'y' }), []);
	});

	test('malformed input returns []', () => {
		assert.deepStrictEqual(extractAiChunks('Edit', null), []);
		assert.deepStrictEqual(extractAiChunks('Edit', undefined), []);
		assert.deepStrictEqual(extractAiChunks('Edit', 'string'), []);
		assert.deepStrictEqual(extractAiChunks('Edit', 42), []);
		assert.deepStrictEqual(extractAiChunks('Edit', { file_path: '/x.ts' }), []); // missing new_string
		assert.deepStrictEqual(extractAiChunks('Edit', { new_string: 42 }), []);     // wrong type
		assert.deepStrictEqual(extractAiChunks('MultiEdit', { edits: 'not an array' }), []);
		assert.deepStrictEqual(extractAiChunks('Write', { file_path: '/x.ts' }), []); // missing content
	});

	test('empty chunks are preserved (caller decides how to score)', () => {
		// An Edit whose new_string is "" (pure deletion) still produces
		// one chunk. The reporter's chunked scoring treats an empty
		// chunk as fraction-present = 1, which is correct: there is
		// nothing to find.
		assert.deepStrictEqual(extractAiChunks('Edit', { old_string: 'a', new_string: '' }), ['']);
	});

	suite('Copilot CLI tools', () => {

		test('create returns [file_text]', () => {
			const chunks = extractAiChunks('create', { path: '/x.ts', file_text: 'hello world\n' });
			assert.deepStrictEqual(chunks, ['hello world\n']);
		});

		test('edit / str_replace / insert return [new_str]', () => {
			assert.deepStrictEqual(
				extractAiChunks('edit', { path: '/x.ts', old_str: 'a', new_str: 'b' }),
				['b'],
			);
			assert.deepStrictEqual(
				extractAiChunks('str_replace', { path: '/x.ts', old_str: 'a', new_str: 'c' }),
				['c'],
			);
			assert.deepStrictEqual(
				extractAiChunks('insert', { path: '/x.ts', insert_line: 3, new_str: 'd' }),
				['d'],
			);
		});

		test('Copilot snake_case tools reject malformed input', () => {
			assert.deepStrictEqual(extractAiChunks('create', null), []);
			assert.deepStrictEqual(extractAiChunks('create', { path: '/x.ts' }), []);     // missing file_text
			assert.deepStrictEqual(extractAiChunks('create', { file_text: 42 }), []);     // wrong type
			assert.deepStrictEqual(extractAiChunks('edit', { path: '/x.ts' }), []);       // missing new_str
			assert.deepStrictEqual(extractAiChunks('str_replace', { new_str: null }), []);// wrong type
			assert.deepStrictEqual(extractAiChunks('insert', { new_str: 7 }), []);        // wrong type
		});

		test('str_replace_editor dispatches on command', () => {
			assert.deepStrictEqual(
				extractAiChunks('str_replace_editor', { command: 'create', path: '/x.ts', file_text: 'hi' }),
				['hi'],
			);
			assert.deepStrictEqual(
				extractAiChunks('str_replace_editor', { command: 'str_replace', path: '/x.ts', old_str: 'a', new_str: 'b' }),
				['b'],
			);
			assert.deepStrictEqual(
				extractAiChunks('str_replace_editor', { command: 'insert', path: '/x.ts', insert_line: 1, new_str: 'c' }),
				['c'],
			);
		});

		test('str_replace_editor non-edit commands return []', () => {
			assert.deepStrictEqual(extractAiChunks('str_replace_editor', { command: 'view', path: '/x.ts' }), []);
			assert.deepStrictEqual(extractAiChunks('str_replace_editor', { command: 'undo_edit', path: '/x.ts' }), []);
			assert.deepStrictEqual(extractAiChunks('str_replace_editor', { command: 'unknown' }), []);
			assert.deepStrictEqual(extractAiChunks('str_replace_editor', { path: '/x.ts' }), []); // missing command
		});

		test('apply_patch accepts a bare patch string', () => {
			const patch = [
				'*** Begin Patch',
				'*** Update File: /workspace/a.ts',
				'@@',
				' context',
				'+added line 1',
				'+added line 2',
				'-removed',
				'*** End Patch',
			].join('\n');
			assert.deepStrictEqual(extractAiChunks('apply_patch', patch), ['added line 1\nadded line 2\n']);
		});

		test('apply_patch accepts {input} and {patch} object wrappers', () => {
			const patch = '*** Update File: /a.ts\n+x\n';
			assert.deepStrictEqual(extractAiChunks('apply_patch', { input: patch }), ['x\n']);
			assert.deepStrictEqual(extractAiChunks('apply_patch', { patch }), ['x\n']);
		});

		test('apply_patch with forFilePath filters to one file', () => {
			const patch = [
				'*** Update File: /workspace/a.ts',
				'+a-line-1',
				'+a-line-2',
				'*** Add File: /workspace/b.ts',
				'+b-line-1',
				'*** Delete File: /workspace/c.ts',
				'-only-removed',
			].join('\n');
			assert.deepStrictEqual(
				extractAiChunks('apply_patch', patch, '/workspace/a.ts'),
				['a-line-1\na-line-2\n'],
			);
			assert.deepStrictEqual(
				extractAiChunks('apply_patch', patch, '/workspace/b.ts'),
				['b-line-1\n'],
			);
			// Delete-only file has no '+' lines.
			assert.deepStrictEqual(extractAiChunks('apply_patch', patch, '/workspace/c.ts'), []);
			// File not in patch.
			assert.deepStrictEqual(extractAiChunks('apply_patch', patch, '/workspace/missing.ts'), []);
		});

		test('apply_patch without forFilePath returns chunks for every touched file in order', () => {
			const patch = [
				'*** Update File: /a.ts',
				'+a',
				'*** Add File: /b.ts',
				'+b1',
				'+b2',
			].join('\n');
			assert.deepStrictEqual(extractAiChunks('apply_patch', patch), ['a\n', 'b1\nb2\n']);
		});

		test('apply_patch Move-to header is honored', () => {
			const patch = [
				'*** Move to: /new/place.ts',
				'+moved-and-changed',
			].join('\n');
			assert.deepStrictEqual(extractAiChunks('apply_patch', patch, '/new/place.ts'), ['moved-and-changed\n']);
		});

		test('apply_patch ignores +++ unified-diff marker', () => {
			const patch = [
				'*** Update File: /a.ts',
				'+++ /a.ts',           // unified-diff header, must be ignored
				'+real addition',
			].join('\n');
			assert.deepStrictEqual(extractAiChunks('apply_patch', patch), ['real addition\n']);
		});

		test('apply_patch handles malformed input', () => {
			assert.deepStrictEqual(extractAiChunks('apply_patch', null), []);
			assert.deepStrictEqual(extractAiChunks('apply_patch', 42), []);
			assert.deepStrictEqual(extractAiChunks('apply_patch', {}), []);
			assert.deepStrictEqual(extractAiChunks('apply_patch', { input: 42 }), []);
			assert.deepStrictEqual(extractAiChunks('apply_patch', ''), []);
			// '+' lines before any file header are dropped.
			assert.deepStrictEqual(extractAiChunks('apply_patch', '+orphan addition\n'), []);
		});

		test('git_apply_patch shares the apply_patch parser', () => {
			const patch = '*** Update File: /a.ts\n+gp\n';
			assert.deepStrictEqual(extractAiChunks('git_apply_patch', patch), ['gp\n']);
		});
	});
});
