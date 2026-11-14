/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { Uri } from 'vscode';
import { PlannedCommit, parseProposals, reconcileCommits, resolveProposals } from '../agenticCommitPlanner';

const root = Uri.file('/repo').fsPath;

function fsPath(relative: string): string {
	return Uri.joinPath(Uri.file(root), relative).fsPath;
}

suite('agenticCommitPlanner', () => {
	suite('parseProposals', () => {
		test('no JSON array', () => {
			assert.deepStrictEqual(parseProposals('Sorry, I cannot help with that.'), []);
		});

		test('malformed JSON', () => {
			assert.deepStrictEqual(parseProposals('[{ "message": "a", '), []);
		});

		test('array wrapped in a code fence and prose', () => {
			const text = 'Here you go:\n```json\n[{ "message": "feat: a", "files": ["a.ts", "b.ts"] }]\n```\nHope this helps!';
			assert.deepStrictEqual(parseProposals(text), [{ message: 'feat: a', files: ['a.ts', 'b.ts'] }]);
		});

		test('entries that do not have the requested shape are dropped', () => {
			const text = JSON.stringify([
				{ message: 'feat: a', files: ['a.ts', 42, null, { path: 'b.ts' }, '', 'c.ts'] },
				{ message: 'feat: no files', files: [] },
				{ message: 'feat: files are not an array', files: 'd.ts' },
				{ message: 42, files: ['e.ts'] },
				{ message: '   ', files: ['f.ts'] },
				{ files: ['g.ts'] },
				'not an object',
				null,
				{ message: 'feat: only strings survive', files: ['h.ts'] }
			]);

			assert.deepStrictEqual(parseProposals(text), [
				{ message: 'feat: a', files: ['a.ts', 'c.ts'] },
				{ message: 'feat: only strings survive', files: ['h.ts'] }
			]);
		});
	});

	suite('resolveProposals', () => {
		test('drops files that are not changed, and files claimed by an earlier commit', () => {
			const changed = new Set([fsPath('a.ts'), fsPath('b.ts'), fsPath('src/c.ts')]);

			const proposals = [
				{ message: '  feat: a  ', files: ['a.ts', 'gone.ts', 'src/c.ts'] },
				{ message: 'feat: b', files: ['a.ts', 'b.ts'] },
				{ message: 'feat: nothing left', files: ['a.ts', 'gone.ts'] },
				{ message: 'feat: escaping the repository', files: ['../outside.ts'] }
			];

			assert.deepStrictEqual(resolveProposals(proposals, root, changed), [
				{ message: 'feat: a', files: [fsPath('a.ts'), fsPath('src/c.ts')] },
				{ message: 'feat: b', files: [fsPath('b.ts')] }
			]);
		});
	});

	suite('reconcileCommits', () => {
		test('files that are not changed anymore leave their commit, the rest is not included', () => {
			const commits: PlannedCommit[] = [
				{ id: 'commit-1', message: 'feat: a', files: [fsPath('a.ts'), fsPath('gone.ts')] },
				{ id: 'commit-2', message: 'feat: b', files: [fsPath('committed.ts')] }
			];

			const unassigned = reconcileCommits(commits, [fsPath('a.ts'), fsPath('new.ts')]);

			assert.deepStrictEqual({ commits, unassigned }, {
				commits: [
					{ id: 'commit-1', message: 'feat: a', files: [fsPath('a.ts')] },
					{ id: 'commit-2', message: 'feat: b', files: [] }
				],
				unassigned: [fsPath('new.ts')]
			});
		});
	});
});
