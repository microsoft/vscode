/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { bufferToStream, VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { autorun, observableValue } from '../../../../../../base/common/observable.js';
import { joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { EMPTY_TREE_OBJECT } from '../../../../../../platform/agentHost/common/agentHostGitService.js';
import { IFileService, IFileStreamContent, IFileSystemWatcher } from '../../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { GitDiffChange, GitRepositoryState, IGitRepository, IGitService } from '../../../../../../workbench/contrib/git/common/gitService.js';
import { isIChatSessionFileChange2 } from '../../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { NativeCliSessionChanges } from '../../browser/nativeCliSessionChanges.js';
import { resolveNativeCliWorkspace } from '../../common/nativeCli.js';

class TestRepository extends mock<IGitRepository>() {
	override readonly rootUri = URI.file('/repository');
	override readonly state = observableValue<GitRepositoryState>(this, {
		HEAD: { name: 'main', commit: 'a'.repeat(40), type: 0 },
		remotes: [], indexChanges: [], workingTreeChanges: [], untrackedChanges: [], mergeChanges: [],
	});
	readonly diffs = new Map<string, GitDiffChange[]>();
	pending: Promise<GitDiffChange[]> | undefined;
	failure: Error | undefined;

	override async diffBetweenWithStats2(ref: string): Promise<GitDiffChange[]> {
		if (this.failure) {
			throw this.failure;
		}
		return this.pending ?? this.diffs.get(ref) ?? [];
	}
}

suite('Native CLI session changes', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const files = new Map<string, VSBuffer>();

	function createTracker(repository: TestRepository | undefined, baseRef?: string, opened: Event<IGitRepository> = Event.None): NativeCliSessionChanges {
		const git = new class extends mock<IGitService>() {
			override readonly onDidOpenRepository = opened;
			override async openRepository(): Promise<IGitRepository | undefined> { return repository; }
		}();
		const fileService = new class extends mock<IFileService>() {
			override async readFileStream(resource: URI): Promise<IFileStreamContent> {
				const value = files.get(resource.path);
				if (!value) {
					throw new Error(`Missing test file ${resource.path}`);
				}
				return upcastPartial<IFileStreamContent>({ value: bufferToStream(value) });
			}
			override createWatcher(): IFileSystemWatcher {
				return { onDidChange: Event.None, dispose: () => { } };
			}
		}();
		const workspace = resolveNativeCliWorkspace(URI.file('/repository'));
		assert.ok(workspace);
		return store.add(new NativeCliSessionChanges(workspace, baseRef, git, fileService, new NullLogService()));
	}

	function change(name: string, insertions: number, deletions: number, deleted = false): GitDiffChange {
		const uri = URI.file(`/repository/${name}`);
		return { uri, originalUri: uri, modifiedUri: deleted ? undefined : uri, insertions, deletions };
	}

	test('publishes tracked, deleted, binary and untracked changes with real diff resources', async () => {
		const repository = new TestRepository();
		repository.diffs.set('a'.repeat(40), [change('modified.ts', 4, 2), change('deleted.ts', 0, 3, true)]);
		const added = joinPath(repository.rootUri, 'new.txt');
		const binary = joinPath(repository.rootUri, 'image.bin');
		files.set(added.path, VSBuffer.fromString('one\ntwo\n'));
		files.set(binary.path, VSBuffer.wrap(new Uint8Array([0, 1, 2])));
		repository.state.set({ ...repository.state.get(), untrackedChanges: [added, binary].map(uri => ({ uri, originalUri: undefined, modifiedUri: uri })) }, undefined);
		const tracker = createTracker(repository);
		await tracker.initialize();

		assert.deepStrictEqual({
			changes: tracker.changes.get().map(change => ({ file: isIChatSessionFileChange2(change) ? change.uri.path : change.modifiedUri.path, original: change.originalUri?.scheme, modified: change.modifiedUri?.scheme, added: change.insertions, removed: change.deletions })),
			base: tracker.baseRef.get(),
			branch: tracker.workspace.get().folders[0].gitRepository?.branchName,
			repository: tracker.hasGitRepository.get(),
		}, {
			changes: [
				{ file: '/repository/new.txt', original: undefined, modified: 'file', added: 2, removed: 0 },
				{ file: '/repository/image.bin', original: undefined, modified: 'file', added: 0, removed: 0 },
				{ file: '/repository/modified.ts', original: 'git', modified: 'file', added: 4, removed: 2 },
				{ file: '/repository/deleted.ts', original: 'git', modified: undefined, added: 0, removed: 3 },
			],
			base: 'a'.repeat(40),
			branch: 'main',
			repository: true,
		});
	});

	test('retains the starting commit while separately refreshing uncommitted changes', async () => {
		const repository = new TestRepository();
		const tracker = createTracker(repository);
		await tracker.initialize();
		const nextCommit = 'b'.repeat(40);
		repository.state.set({ ...repository.state.get(), HEAD: { name: 'feature', commit: nextCommit, type: 0 } }, undefined);
		repository.diffs.set('a'.repeat(40), [change('committed.ts', 5, 0), change('working.ts', 1, 0)]);
		repository.diffs.set(nextCommit, [change('working.ts', 1, 0)]);
		await tracker.refresh();

		assert.deepStrictEqual({
			base: tracker.baseRef.get(),
			changesets: tracker.changesets.get().map(set => ({ id: set.id, files: set.changes.get().length })),
		}, { base: 'a'.repeat(40), changesets: [{ id: 'session', files: 2 }, { id: 'uncommitted', files: 1 }] });
	});

	test('unchanged refresh work counts avoid unnecessary changeset invalidations', async () => {
		const repository = new TestRepository();
		repository.diffs.set('a'.repeat(40), [change('file.ts', 2, 1)]);
		const tracker = createTracker(repository);
		await tracker.initialize();
		let renders = 0;
		store.add(autorun(reader => {
			tracker.changes.read(reader);
			renders++;
		}));
		for (let index = 0; index < 20; index++) {
			await tracker.refresh();
		}
		const unchangedRenders = renders;
		repository.diffs.set('a'.repeat(40), [change('file.ts', 3, 1)]);
		await tracker.refresh();
		assert.deepStrictEqual({ unchangedRenders, afterChange: renders }, { unchangedRenders: 1, afterChange: 2 });
	});

	test('includes untracked files in the default mixed working-tree group', async () => {
		const repository = new TestRepository();
		const resource = joinPath(repository.rootUri, 'mixed.txt');
		files.set(resource.path, VSBuffer.fromString('one\ntwo'));
		repository.state.set({ ...repository.state.get(), workingTreeChanges: [{ uri: resource, originalUri: undefined, modifiedUri: resource }] }, undefined);
		const tracker = createTracker(repository);
		await tracker.initialize();
		assert.deepStrictEqual(tracker.changes.get().map(change => ({ insertions: change.insertions, deletions: change.deletions, originalUri: change.originalUri })), [{ insertions: 2, deletions: 0, originalUri: undefined }]);
	});

	test('diffs read their originals from the baseline and HEAD, not from the modified working file', async () => {
		const repository = new TestRepository();
		const base = 'a'.repeat(40);
		const head = 'b'.repeat(40);
		repository.state.set({ ...repository.state.get(), HEAD: { name: 'main', type: 0, commit: head } }, undefined);
		repository.diffs.set(base, [change('file.ts', 3, 1)]);
		repository.diffs.set(head, [change('file.ts', 1, 1)]);
		const tracker = createTracker(repository, base);
		await tracker.initialize();
		assert.deepStrictEqual(tracker.changesets.get().map(changeset => {
			const change = changeset.changes.get()[0];
			return { original: change.originalUri?.scheme, ref: JSON.parse(change.originalUri!.query).ref, modified: change.modifiedUri?.scheme };
		}), [{ original: 'git', ref: base, modified: 'file' }, { original: 'git', ref: head, modified: 'file' }]);
	});

	test('follows repository facade replacements made by another session', async () => {
		const opened = store.add(new Emitter<IGitRepository>());
		const original = new TestRepository();
		const tracker = createTracker(original, undefined, opened.event);
		await tracker.initialize();
		const replacement = new TestRepository();
		replacement.state.set({ ...replacement.state.get(), HEAD: { name: 'new-branch', type: 0, commit: 'b'.repeat(40) } }, undefined);
		replacement.diffs.set('a'.repeat(40), [change('new.ts', 4, 0)]);
		opened.fire(replacement);
		await tracker.refresh();
		original.state.set({ ...original.state.get(), HEAD: { name: 'stale', type: 0, commit: 'c'.repeat(40) } }, undefined);
		assert.deepStrictEqual({
			branch: tracker.workspace.get().folders[0].gitRepository?.branchName,
			base: tracker.baseRef.get(),
			count: tracker.changes.get().length,
		}, { branch: 'new-branch', base: 'a'.repeat(40), count: 1 });
	});

	test('starts from the empty tree in an unborn repository and preserves a restored baseline', async () => {
		const repository = new TestRepository();
		repository.state.set({ ...repository.state.get(), HEAD: undefined }, undefined);
		const unborn = createTracker(repository);
		await unborn.initialize();
		const restored = createTracker(repository, 'c'.repeat(40));
		await restored.initialize();
		assert.deepStrictEqual([unborn.baseRef.get(), restored.baseRef.get()], [EMPTY_TREE_OBJECT, 'c'.repeat(40)]);
	});

	test('reports refresh failures without erasing the last known changes', async () => {
		const repository = new TestRepository();
		repository.diffs.set('a'.repeat(40), [change('file.ts', 2, 1)]);
		const tracker = createTracker(repository);
		await tracker.initialize();
		repository.failure = new Error('Git unavailable');
		await assert.rejects(tracker.refresh(), /Git unavailable/);
		assert.deepStrictEqual({
			count: tracker.changes.get().length,
			error: !!tracker.error.get(),
			loading: tracker.isLoading.get(),
		}, { count: 1, error: true, loading: false });
	});

	test('does not publish a delayed refresh after disposal', async () => {
		const repository = new TestRepository();
		const tracker = createTracker(repository);
		await tracker.initialize();
		const pending = new DeferredPromise<GitDiffChange[]>();
		repository.pending = pending.p;
		const refresh = tracker.refresh();
		tracker.dispose();
		await pending.complete([change('late.ts', 7, 0)]);
		await refresh;
		assert.deepStrictEqual(tracker.changes.get(), []);
	});

	test('keeps file browsing available for a folder without Git', async () => {
		const tracker = createTracker(undefined);
		await tracker.initialize();
		assert.deepStrictEqual({
			root: tracker.workspace.get().folders[0].root.path,
			repository: tracker.hasGitRepository.get(),
			changes: tracker.changes.get(),
		}, { root: '/repository', repository: false, changes: [] });
	});
});
