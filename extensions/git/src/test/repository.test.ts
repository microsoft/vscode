/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { Memento } from 'vscode';
import { Repository } from '../repository';

class InMemoryMemento implements Memento {
	private store = new Map<string, unknown>();

	constructor(initial?: Record<string, unknown>) {
		if (initial) {
			for (const key of Object.keys(initial)) {
				this.store.set(key, initial[key]);
			}
		}
	}

	get<T>(key: string): T | undefined;
	get<T>(key: string, defaultValue: T): T;
	get<T>(key: string, defaultValue?: T): T | undefined {
		if (this.store.has(key)) {
			return this.store.get(key) as T;
		}

		return defaultValue;
	}

	update(key: string, value: any): Thenable<void> {
		this.store.set(key, value);
		return Promise.resolve();
	}

	keys(): readonly string[] {
		return Array.from(this.store.keys());
	}
}

type RepositoryTestPatch = {
	repository: {
		deleteBranch: (name: string, force?: boolean) => Promise<void>;
		config: (...args: any[]) => Promise<void>;
	};
	run: (op: any, fn: any) => Promise<any>;
};

function createRepository(root: string, globalState: Memento): Repository {
	const repository = Object.create(Repository.prototype) as Record<string, unknown>;
	repository.repository = {
		root,
		rootRealPath: undefined,
		dotGit: undefined,
		kind: 'repository'
	};
	repository.globalState = globalState;
	return repository as unknown as Repository;
}

suite('Repository', () => {
	suite('branch pinning', () => {
		test('pins branches per repository root and restores them', () => {
			const globalState = new InMemoryMemento();
			const repoA = createRepository('/workspace/repo-a', globalState);
			const repoB = createRepository('/workspace/repo-b', globalState);

			assert.strictEqual(repoA.isBranchPinned('main'), false);
			assert.strictEqual(repoB.isBranchPinned('main'), false);

			repoA.pinBranch('main');
			repoA.pinBranch('main');
			repoA.pinBranch('release');
			repoB.pinBranch('main');

			assert.deepStrictEqual(
				globalState.get<string[]>('pinnedBranches:/workspace/repo-a'),
				['main', 'release']
			);
			assert.deepStrictEqual(
				globalState.get<string[]>('pinnedBranches:/workspace/repo-b'),
				['main']
			);
			assert.strictEqual(repoA.isBranchPinned('main'), true);
			assert.strictEqual(repoA.isBranchPinned('release'), true);
			assert.strictEqual(repoB.isBranchPinned('release'), false);

			repoA.unpinBranch('main');
			repoA.unpinBranch('main');

			assert.strictEqual(repoA.isBranchPinned('main'), false);
			assert.strictEqual(repoA.isBranchPinned('release'), true);
			assert.deepStrictEqual(
				globalState.get<string[]>('pinnedBranches:/workspace/repo-a'),
				['release']
			);
		});

		test('deleting a branch unpins it', async () => {
			const globalState = new InMemoryMemento();
			const repository = createRepository('/workspace/repo-a', globalState);

			let deletedBranch: string | undefined;

			// mocks internal git behaviour
			(repository as unknown as RepositoryTestPatch).repository.deleteBranch = async (name: string) => {
				deletedBranch = name;
			};

			(repository as unknown as RepositoryTestPatch).repository.config = async () => { };

			(repository as unknown as RepositoryTestPatch).run = async (_op: any, fn: any) => fn();

			repository.pinBranch('feature/test');

			assert.strictEqual(repository.isBranchPinned('feature/test'), true);

			await repository.deleteBranch('feature/test');

			assert.strictEqual(deletedBranch, 'feature/test');
			assert.strictEqual(repository.isBranchPinned('feature/test'), false);

			assert.deepStrictEqual(
				globalState.get<string[]>('pinnedBranches:/workspace/repo-a'),
				[]
			);
		});

		test('unpinning a non-pinned branch does not change state', () => {
			const globalState = new InMemoryMemento();
			const repo = createRepository('/workspace/repo-a', globalState);

			repo.pinBranch('main');

			assert.deepStrictEqual(
				globalState.get<string[]>('pinnedBranches:/workspace/repo-a'),
				['main']
			);

			repo.unpinBranch('does-not-exist');

			assert.deepStrictEqual(
				globalState.get<string[]>('pinnedBranches:/workspace/repo-a'),
				['main']
			);
		});
	});
});
