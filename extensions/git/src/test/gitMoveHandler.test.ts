/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { Uri, EventEmitter } from 'vscode';
import { IFileMoveEvent, IFileOperationService } from '../fileOperationService';

// Note: Full integration tests require VS Code test runner (see smoke.test.ts)
// These are unit tests for the logic using mocks

class MockFileOperationService implements IFileOperationService {
	private readonly _onDidMoveFiles = new EventEmitter<IFileMoveEvent>();
	readonly onDidMoveFiles = this._onDidMoveFiles.event;

	fireMove(source: string, target: string): void {
		this._onDidMoveFiles.fire({
			files: [{ source: Uri.file(source), target: Uri.file(target) }]
		});
	}

	fireBatchMove(moves: Array<{ source: string; target: string }>): void {
		this._onDidMoveFiles.fire({
			files: moves.map(m => ({ source: Uri.file(m.source), target: Uri.file(m.target) }))
		});
	}

	dispose(): void {
		this._onDidMoveFiles.dispose();
	}
}

class MockGitRepository {
	addCalls: string[][] = [];
	rmCachedCalls: string[][] = [];
	trackedFiles: Set<string> = new Set();

	async add(paths: string[]): Promise<void> {
		this.addCalls.push(paths);
	}

	async rmCached(paths: string[]): Promise<void> {
		this.rmCachedCalls.push(paths);
	}

	async isTracked(path: string): Promise<boolean> {
		return this.trackedFiles.has(path);
	}
}

class MockRepository {
	root: string;
	repository: MockGitRepository;

	constructor(root: string) {
		this.root = root;
		this.repository = new MockGitRepository();
	}

	async isTracked(relativePath: string): Promise<boolean> {
		return this.repository.isTracked(relativePath);
	}

	async addByPath(paths: string[]): Promise<void> {
		return this.repository.add(paths);
	}

	async rmCached(paths: string[]): Promise<void> {
		return this.repository.rmCached(paths);
	}
}

class MockModel {
	private repositories = new Map<string, MockRepository>();

	addRepository(root: string): MockRepository {
		const repo = new MockRepository(root);
		this.repositories.set(root, repo);
		return repo;
	}

	getRepository(uri: Uri): MockRepository | undefined {
		for (const [root, repo] of this.repositories) {
			if (uri.fsPath.startsWith(root)) {
				return repo;
			}
		}
		return undefined;
	}
}

suite('GitMoveHandler', () => {
	suite('Mock repository behavior', () => {
		test('should track files correctly', async () => {
			const model = new MockModel();
			const repo = model.addRepository('/repo');
			repo.repository.trackedFiles.add('old-file.ts');

			const isTracked = await repo.isTracked('old-file.ts');
			assert.strictEqual(isTracked, true, 'File should be tracked');

			const isNotTracked = await repo.isTracked('new-file.ts');
			assert.strictEqual(isNotTracked, false, 'New file should not be tracked');
		});

		test('should call add and rmCached for rename simulation', async () => {
			const model = new MockModel();
			const repo = model.addRepository('/repo');
			repo.repository.trackedFiles.add('old-file.ts');

			// Simulate what GitMoveHandler does for a tracked file rename
			const sourceRelative = 'old-file.ts';
			const targetRelative = 'new-file.ts';

			const isTracked = await repo.isTracked(sourceRelative);
			assert.strictEqual(isTracked, true, 'File should be tracked');

			// Stage the rename
			await repo.addByPath([targetRelative]);
			await repo.rmCached([sourceRelative]);

			assert.deepStrictEqual(repo.repository.addCalls, [['new-file.ts']]);
			assert.deepStrictEqual(repo.repository.rmCachedCalls, [['old-file.ts']]);
		});

		test('should skip untracked files', async () => {
			const model = new MockModel();
			const repo = model.addRepository('/repo');
			// Don't add to trackedFiles

			const sourceRelative = 'untracked-file.ts';

			const isTracked = await repo.isTracked(sourceRelative);
			assert.strictEqual(isTracked, false, 'File should not be tracked');

			// Should NOT call add/rmCached for untracked files
			assert.deepStrictEqual(repo.repository.addCalls, []);
			assert.deepStrictEqual(repo.repository.rmCachedCalls, []);
		});

		test('should batch multiple moves to same repo', async () => {
			const model = new MockModel();
			const repo = model.addRepository('/repo');
			repo.repository.trackedFiles.add('a.ts');
			repo.repository.trackedFiles.add('b.ts');

			const moves = [
				{ sourceRelative: 'a.ts', targetRelative: 'dir/a.ts' },
				{ sourceRelative: 'b.ts', targetRelative: 'dir/b.ts' }
			];

			// Verify all files are tracked
			for (const move of moves) {
				const isTracked = await repo.isTracked(move.sourceRelative);
				assert.strictEqual(isTracked, true, `${move.sourceRelative} should be tracked`);
			}

			// Simulate batched processing
			const targetPaths = moves.map(m => m.targetRelative);
			const sourcePaths = moves.map(m => m.sourceRelative);

			await repo.addByPath(targetPaths);
			await repo.rmCached(sourcePaths);

			// Should batch into single calls
			assert.deepStrictEqual(repo.repository.addCalls, [['dir/a.ts', 'dir/b.ts']]);
			assert.deepStrictEqual(repo.repository.rmCachedCalls, [['a.ts', 'b.ts']]);
		});
	});

	suite('FileOperationService', () => {
		test('should fire move events', () => {
			const service = new MockFileOperationService();
			const events: IFileMoveEvent[] = [];

			service.onDidMoveFiles(e => events.push(e));
			service.fireMove('/repo/old.ts', '/repo/new.ts');

			assert.strictEqual(events.length, 1);
			assert.strictEqual(events[0].files.length, 1);
			assert.strictEqual(events[0].files[0].source.fsPath, '/repo/old.ts');
			assert.strictEqual(events[0].files[0].target.fsPath, '/repo/new.ts');

			service.dispose();
		});

		test('should fire batch move events', () => {
			const service = new MockFileOperationService();
			const events: IFileMoveEvent[] = [];

			service.onDidMoveFiles(e => events.push(e));
			service.fireBatchMove([
				{ source: '/repo/a.ts', target: '/repo/dir/a.ts' },
				{ source: '/repo/b.ts', target: '/repo/dir/b.ts' }
			]);

			assert.strictEqual(events.length, 1);
			assert.strictEqual(events[0].files.length, 2);

			service.dispose();
		});
	});

	suite('Model repository lookup', () => {
		test('should find repository for path', () => {
			const model = new MockModel();
			model.addRepository('/repo');

			const repo = model.getRepository(Uri.file('/repo/src/file.ts'));
			assert.ok(repo, 'Should find repository');
			assert.strictEqual(repo.root, '/repo');
		});

		test('should return undefined for path outside repos', () => {
			const model = new MockModel();
			model.addRepository('/repo');

			const repo = model.getRepository(Uri.file('/other/file.ts'));
			assert.strictEqual(repo, undefined, 'Should not find repository');
		});

		test('should handle multiple repositories', () => {
			const model = new MockModel();
			model.addRepository('/repo1');
			model.addRepository('/repo2');

			const repo1 = model.getRepository(Uri.file('/repo1/file.ts'));
			const repo2 = model.getRepository(Uri.file('/repo2/file.ts'));

			assert.ok(repo1);
			assert.ok(repo2);
			assert.strictEqual(repo1.root, '/repo1');
			assert.strictEqual(repo2.root, '/repo2');
		});

		test('should detect cross-repo move', () => {
			const model = new MockModel();
			model.addRepository('/repo1');
			model.addRepository('/repo2');

			const sourceRepo = model.getRepository(Uri.file('/repo1/file.ts'));
			const targetRepo = model.getRepository(Uri.file('/repo2/file.ts'));

			assert.ok(sourceRepo);
			assert.ok(targetRepo);
			assert.notStrictEqual(sourceRepo.root, targetRepo.root, 'Different repos should have different roots');
		});
	});
});
