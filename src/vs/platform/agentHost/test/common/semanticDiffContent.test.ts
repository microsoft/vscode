/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildSemanticDiffContentUri, getSemanticDiffGroupFiles, ISemanticDiffContentRequest, parseSemanticDiffContentUri, projectSemanticDiffContent, SEMANTIC_DIFF_CONTENT_SCHEME } from '../../common/semanticDiffContent.js';
import { createSemanticDiffExample } from './semanticDiffFixtures.js';

suite('Semantic diff content', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const request: ISemanticDiffContentRequest = {
		sessionUri: 'copilot:/session',
		comparison: 'commitRange',
		baseRevision: 'a'.repeat(40),
		targetRevision: 'b'.repeat(64),
		side: 'modified',
		path: 'src/new name.ts',
		oldPath: 'src/old.ts',
		status: 'renamed',
		hunks: [{ oldStart: 0, oldCount: 0, newStart: 1, newCount: 2 }, { oldStart: 7, oldCount: 1, newStart: 8, newCount: 0 }],
	};

	test('content references round-trip and keep the display path out of the request', () => {
		const uri = buildSemanticDiffContentUri(request, '/repo/src/new name.ts');
		assert.deepStrictEqual({
			scheme: uri.scheme,
			path: uri.path,
			parsed: parseSemanticDiffContentUri(URI.parse(uri.toString())),
		}, { scheme: SEMANTIC_DIFF_CONTENT_SCHEME, path: '/repo/src/new name.ts', parsed: request });
	});

	test('content references reject traversal, unknown sides, and malformed hunks', () => {
		const invalid: Partial<Record<keyof ISemanticDiffContentRequest, unknown>>[] = [
			{ path: '../outside.ts' },
			{ path: '/absolute.ts' },
			{ oldPath: 'a//b.ts' },
			{ baseRevision: 'HEAD' },
			{ targetRevision: null },
			{ comparison: 'workingTree' },
			{ comparison: 'branch' },
			{ side: 'both' },
			{ status: 'copied' },
			{ hunks: [] },
			{ hunks: [[1, 1, 1]] },
			{ hunks: [[1, -1, 1, 1]] },
		];
		const parsed = invalid.map(override => {
			const query = JSON.parse(buildSemanticDiffContentUri(request, '/display').query);
			return parseSemanticDiffContentUri(URI.from({ scheme: SEMANTIC_DIFF_CONTENT_SCHEME, path: '/display', query: JSON.stringify({ ...query, ...override }) }));
		});
		assert.deepStrictEqual(parsed, invalid.map(() => undefined));
	});

	test('applies only the selected hunks to the base, preserving line terminators', () => {
		const base = 'a\nb\nc\nd\ne\nf';
		const target = 'start\na\nB\nc\nd\nf\nend';
		// Real zero-context hunks: insert "start", replace "b", delete "e", replace the unterminated last line.
		const insertStart = { oldStart: 0, oldCount: 0, newStart: 1, newCount: 1 };
		const replaceB = { oldStart: 2, oldCount: 1, newStart: 3, newCount: 1 };
		const deleteE = { oldStart: 5, oldCount: 1, newStart: 5, newCount: 0 };
		const replaceLast = { oldStart: 6, oldCount: 1, newStart: 6, newCount: 2 };
		assert.deepStrictEqual({
			none: projectSemanticDiffContent(base, target, []),
			all: projectSemanticDiffContent(base, target, [insertStart, replaceB, deleteE, replaceLast]),
			insertOnly: projectSemanticDiffContent(base, target, [insertStart]),
			deleteOnly: projectSemanticDiffContent(base, target, [deleteE]),
			lastOnly: projectSemanticDiffContent(base, target, [replaceLast]),
			addedFile: projectSemanticDiffContent('', 'x\ny\n', [{ oldStart: 0, oldCount: 0, newStart: 1, newCount: 2 }]),
			deletedFile: projectSemanticDiffContent('x\ny\n', '', [{ oldStart: 1, oldCount: 2, newStart: 0, newCount: 0 }]),
		}, {
			none: base,
			all: target,
			insertOnly: 'start\na\nb\nc\nd\ne\nf',
			deleteOnly: 'a\nb\nc\nd\nf',
			lastOnly: 'a\nb\nc\nd\ne\nf\nend',
			addedFile: 'x\ny\n',
			deletedFile: '',
		});
	});

	test('rejects hunks outside either file or out of order', () => {
		assert.throws(() => projectSemanticDiffContent('a\n', 'a\n', [{ oldStart: 3, oldCount: 1, newStart: 1, newCount: 1 }]));
		assert.throws(() => projectSemanticDiffContent('a\nb\nc\n', 'a\nB\nC\n', [{ oldStart: 3, oldCount: 1, newStart: 3, newCount: 1 }, { oldStart: 2, oldCount: 1, newStart: 2, newCount: 1 }]));
	});

	test('selects each file of a group with only the hunks that group owns', () => {
		const { analysis } = createSemanticDiffExample();
		const groupId = analysis.groups[0].id;
		assert.deepStrictEqual(getSemanticDiffGroupFiles(analysis, groupId).map(({ file, hunks }) => ({ path: file.path, hunks: hunks.length })),
			analysis.files
				.map(file => ({ path: file.path, hunks: analysis.hunks.filter(hunk => hunk.fileId === file.id && hunk.classification.groupId === groupId).length }))
				.filter(file => file.hunks > 0));
	});
});
