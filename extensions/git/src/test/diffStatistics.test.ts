/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { Uri } from 'vscode';
import { DiffChange } from '../api/git';
import { Status } from '../api/git.constants';
import { toDiffStatisticsMap } from '../repository';

function change(status: Status, originalPath: string, newPath: string, insertions: number, deletions: number): DiffChange {
	const originalUri = Uri.file(originalPath);
	const uri = Uri.file(newPath);

	return { status, uri, originalUri, renameUri: uri, insertions, deletions };
}

suite('diffStatistics', () => {

	test('toDiffStatisticsMap', () => {
		const map = toDiffStatisticsMap([
			change(Status.MODIFIED, '/repo/modified.txt', '/repo/modified.txt', 3, 1),
			change(Status.DELETED, '/repo/deleted.txt', '/repo/deleted.txt', 0, 7),
			// A rename is reported under its new path, while the resource of the Source
			// Control view is keyed on the original path
			change(Status.INDEX_RENAMED, '/repo/old.txt', '/repo/new.txt', 2, 2)
		]);

		assert.deepStrictEqual(Object.fromEntries(map), {
			[Uri.file('/repo/modified.txt').fsPath]: { insertions: 3, deletions: 1 },
			[Uri.file('/repo/deleted.txt').fsPath]: { insertions: 0, deletions: 7 },
			[Uri.file('/repo/new.txt').fsPath]: { insertions: 2, deletions: 2 },
			[Uri.file('/repo/old.txt').fsPath]: { insertions: 2, deletions: 2 }
		});
	});

	test('toDiffStatisticsMap - the original path of a rename does not shadow another change', () => {
		const map = toDiffStatisticsMap([
			// `old.txt` was renamed to `new.txt` and a new file was added in its place
			change(Status.INDEX_RENAMED, '/repo/old.txt', '/repo/new.txt', 2, 2),
			change(Status.INDEX_ADDED, '/repo/old.txt', '/repo/old.txt', 9, 0)
		]);

		assert.deepStrictEqual(Object.fromEntries(map), {
			[Uri.file('/repo/new.txt').fsPath]: { insertions: 2, deletions: 2 },
			[Uri.file('/repo/old.txt').fsPath]: { insertions: 9, deletions: 0 }
		});
	});
});
