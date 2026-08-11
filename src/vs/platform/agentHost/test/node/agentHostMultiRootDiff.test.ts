/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isLinux } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { ISessionFileDiff } from '../../common/state/sessionState.js';
import { dedupeSessionFileDiffs, evaluateMultiRootDiffSources } from '../../node/agentHostMultiRootDiff.js';

function created(uri: string): ISessionFileDiff {
	return { after: { uri, content: { uri } } };
}

function deleted(uri: string): ISessionFileDiff {
	return { before: { uri, content: { uri } } };
}

function renamed(fromUri: string, toUri: string): ISessionFileDiff {
	return { before: { uri: fromUri, content: { uri: fromUri } }, after: { uri: toUri, content: { uri: toUri } } };
}

suite('agentHostMultiRootDiff', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('dedupeSessionFileDiffs', () => {
		test('keeps the first (git) occurrence of a duplicated file across lists', () => {
			const gitDiff = created('file:///repo/a.ts');
			const dbDiff = created('file:///repo/a.ts');

			const merged = dedupeSessionFileDiffs([[gitDiff], [dbDiff]]);

			assert.deepStrictEqual(merged, [gitDiff]);
		});

		test('keeps genuinely distinct files and preserves order', () => {
			const a = created('file:///repo/a.ts');
			const b = created('file:///repo/b.ts');
			const c = deleted('file:///repo/c.ts');

			const merged = dedupeSessionFileDiffs([[a, b], [c]]);

			assert.deepStrictEqual(merged, [a, b, c]);
		});

		test('keys renames on their destination and deletions on their source', () => {
			const rename = renamed('file:///repo/old.ts', 'file:///repo/new.ts');
			const dbEditOfDestination = created('file:///repo/new.ts');
			const deletion = deleted('file:///repo/gone.ts');

			const merged = dedupeSessionFileDiffs([[rename, deletion], [dbEditOfDestination]]);

			assert.deepStrictEqual(merged, [rename, deletion]);
		});

		test('same-repo case-variant file: URIs collapse only on case-insensitive platforms', () => {
			const upper = created('file:///repo/File.ts');
			const lower = created('file:///repo/file.ts');

			const merged = dedupeSessionFileDiffs([[upper, lower]]);

			assert.strictEqual(merged.length, isLinux ? 2 : 1);
		});

		test('non-file scheme URIs keep exact identity (no case folding)', () => {
			const upper = created('vscode-notebook-cell:///nb.ipynb#Ch0');
			const lower = created('vscode-notebook-cell:///nb.ipynb#ch0');

			const merged = dedupeSessionFileDiffs([[upper, lower]]);

			assert.deepStrictEqual(merged, [upper, lower]);
		});

		test('ignores diffs without any URI', () => {
			const empty: ISessionFileDiff = {};
			const real = created('file:///repo/a.ts');

			const merged = dedupeSessionFileDiffs([[empty, real]]);

			assert.deepStrictEqual(merged, [real]);
		});
	});

	suite('evaluateMultiRootDiffSources', () => {
		test('all sources available => complete', () => {
			const a = [created('file:///repo/a.ts')];
			const b: readonly ISessionFileDiff[] = [];

			assert.deepStrictEqual(evaluateMultiRootDiffSources([a, b]), {
				outcome: 'complete',
				availableSources: [a, b],
			});
		});

		test('some sources unavailable => partial, availables preserved in order', () => {
			const a = [created('file:///repo/a.ts')];
			const c = [created('file:///repo/c.ts')];

			assert.deepStrictEqual(evaluateMultiRootDiffSources([a, undefined, c]), {
				outcome: 'partial',
				availableSources: [a, c],
			});
		});

		test('no source available => failed', () => {
			assert.deepStrictEqual(evaluateMultiRootDiffSources([undefined, undefined]), {
				outcome: 'failed',
				availableSources: [],
			});
		});

		test('zero sources => failed (degenerate no-target case)', () => {
			assert.deepStrictEqual(evaluateMultiRootDiffSources([]), {
				outcome: 'failed',
				availableSources: [],
			});
		});
	});
});
