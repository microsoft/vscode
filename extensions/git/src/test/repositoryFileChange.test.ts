/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as path from 'path';
import { Uri } from 'vscode';
import { Repository } from '../repository';

interface IFileChangeHarness {
	readonly isRepositoryHuge: false | { limit: number };
	readonly root: string;
	readonly dotGit: { path: string; commonPath?: string };
	readonly operations: { isIdle(): boolean };
	readonly logger: { trace(message: string): void };
	eventuallyUpdateWhenIdleAndWait(): void;
}

const onFileChange = Reflect.get(Repository.prototype, 'onFileChange') as (this: IFileChangeHarness, uri: Uri) => void;

suite('Repository - onFileChange', () => {
	const base = path.join(path.sep, 'repos');
	const root = path.join(base, 'worktree');
	const dotGit = path.join(base, 'main', '.git', 'worktrees', 'worktree');

	function scheduledUpdates(isRepositoryHuge: false | { limit: number }, paths: string[]): string[] {
		const scheduled: string[] = [];
		for (const changedPath of paths) {
			let updated = false;
			const harness: IFileChangeHarness = {
				isRepositoryHuge,
				root,
				dotGit: { path: dotGit, commonPath: path.join(base, 'main', '.git') },
				operations: { isIdle: () => true },
				logger: { trace: () => { } },
				eventuallyUpdateWhenIdleAndWait: () => { updated = true; }
			};
			onFileChange.call(harness, Uri.file(changedPath));
			if (updated) {
				scheduled.push(path.relative(base, changedPath));
			}
		}
		return scheduled;
	}

	test('a huge repository still refreshes when its root or git folder changes', () => {
		const paths = [
			root,
			path.join(root, 'src', 'file.ts'),
			dotGit,
			path.join(dotGit, 'index'),
			path.join(base, 'main', '.git', 'worktrees')
		];

		assert.deepStrictEqual({
			huge: scheduledUpdates({ limit: 10000 }, paths),
			notHuge: scheduledUpdates(false, paths)
		}, {
			huge: [
				path.join('worktree'),
				path.join('main', '.git', 'worktrees', 'worktree')
			],
			notHuge: paths.map(p => path.relative(base, p))
		});
	});
});
