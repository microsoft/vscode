/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { WorkingDirectoryOriginKind, type WorkingDirectory } from '../../common/state/protocol/channels-session/state.js';
import { materializedWorkingDirectoryInfo, resolveWorkingDirectoryInfo } from '../../node/agentHostWorkingDirectoryInfo.js';
import { WorktreeIsolation, WORKTREE_META_REPOSITORY_ROOT } from '../../node/shared/worktreeIsolation.js';
import { createNoopGitService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

suite('agentHostWorkingDirectoryInfo', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('leaves unestablished folder provenance unspecified', async () => {
		const directory = URI.file('/workspace/folder');
		assert.deepStrictEqual(await resolveWorkingDirectoryInfo([directory], createNoopGitService()), [
			{ uri: directory.toString() },
		]);
	});

	test('does not classify supplied folders from linked-worktree detection', async () => {
		const main = URI.file('/workspace/repository');
		const worktree = URI.file('/workspace/repository.worktrees/feature');
		const subdirectory = URI.joinPath(worktree, 'packages/client');
		const other = URI.file('/workspace/other');
		const probes: string[] = [];
		const gitService = {
			...createNoopGitService(),
			getRepositoryRoot: async (directory: URI) => {
				probes.push(directory.toString());
				return directory.toString() === subdirectory.toString() ? worktree : directory;
			},
			getWorktreeRoots: async (directory: URI) => {
				probes.push(directory.toString());
				return directory.toString() === worktree.toString() ? [main, worktree] : [other];
			},
		};

		assert.deepStrictEqual({
			directories: await resolveWorkingDirectoryInfo([other, subdirectory], gitService),
			probes,
		}, {
			directories: [{ uri: other.toString() }, { uri: subdirectory.toString() }],
			probes: [],
		});
	});

	test('matches recorded worktree provenance by directory rather than list position', async () => {
		const main = URI.file('/workspace/repository');
		const worktree = URI.file('/workspace/repository.worktrees/feature');
		const other = URI.file('/workspace/other');
		const subdirectory = URI.joinPath(worktree, 'packages/client');
		assert.deepStrictEqual(await resolveWorkingDirectoryInfo([other, subdirectory], createNoopGitService(), {
			branchName: 'feature',
			repositoryRoot: main,
			worktreePath: worktree,
		}), [
			{ uri: other.toString() },
			{ uri: subdirectory.toString(), origin: { kind: WorkingDirectoryOriginKind.Worktree, mainWorktree: main.toString() } },
		]);
	});

	test('retains recorded worktree provenance while its checkout is absent', async () => {
		const main = URI.file('/workspace/repository');
		const worktree = URI.file('/workspace/repository.worktrees/archived');
		const subdirectory = URI.joinPath(worktree, 'src');
		assert.deepStrictEqual(await resolveWorkingDirectoryInfo([subdirectory], createNoopGitService(), {
			branchName: 'archived',
			repositoryRoot: main,
			worktreePath: worktree,
		}), [
			{ uri: subdirectory.toString(), origin: { kind: WorkingDirectoryOriginKind.Worktree, mainWorktree: main.toString() } },
		]);
	});

	test('does not assign an enclosing worktree to an independent nested repository', async () => {
		const worktree = URI.file('/workspace/repository.worktrees/feature');
		const nested = URI.joinPath(worktree, 'vendor/independent');
		const gitService = {
			...createNoopGitService(),
			getRepositoryRoot: async () => nested,
			getWorktreeRoots: async () => [nested],
		};
		assert.deepStrictEqual(await resolveWorkingDirectoryInfo([nested], gitService, {
			branchName: 'feature',
			repositoryRoot: URI.file('/workspace/repository'),
			worktreePath: worktree,
		}), [
			{ uri: nested.toString() },
		]);
	});

	test('retains recorded preparation provenance when Git is unavailable', async () => {
		const directory = URI.file('/workspace/repository.worktrees/feature');
		const main = URI.file('/workspace/repository');
		const gitService = {
			...createNoopGitService(),
			getRepositoryRoot: async (): Promise<URI | undefined> => { throw new Error('Git unavailable'); },
		};
		assert.deepStrictEqual(await resolveWorkingDirectoryInfo([directory], gitService, {
			branchName: 'feature',
			worktreePath: directory,
			repositoryRoot: main,
		}), [
			{ uri: directory.toString(), origin: { kind: WorkingDirectoryOriginKind.Worktree, mainWorktree: main.toString() } },
		]);
	});

	test('does not derive a main worktree from an incomplete record', async () => {
		const directory = URI.file('/workspace/repository.worktrees/feature');
		assert.deepStrictEqual(await resolveWorkingDirectoryInfo([directory], createNoopGitService(), {
			branchName: 'feature',
			worktreePath: directory,
		}), [
			{ uri: directory.toString() },
		]);
	});

	test('reads existing preparation facts without repairing repository metadata during listing', async () => {
		const database = disposables.add(new TestSessionDatabase());
		const main = URI.file('/workspace/repository');
		const recordedRoot = URI.file('/workspace/repository.worktrees/parent');
		const worktree = URI.file('/workspace/repository.worktrees/feature');
		await Promise.all([
			database.setMetadata('copilot.worktree.branchName', 'feature'),
			database.setMetadata('copilot.worktree.path', worktree.toString()),
			database.setMetadata(WORKTREE_META_REPOSITORY_ROOT, recordedRoot.toString()),
		]);
		const gitService = { ...createNoopGitService(), getWorktreeRoots: async () => [main, recordedRoot, worktree] };
		const isolation = disposables.add(new WorktreeIsolation(
			{ _serviceBrand: undefined, generateBranchName: async () => 'feature' },
			gitService,
			createSessionDataService(database),
			new NullLogService(),
		));
		const metadata = await isolation.readWorktreeMetadata(URI.parse('copilot:/recorded'), { repair: false });
		assert.deepStrictEqual({
			directories: await resolveWorkingDirectoryInfo([worktree], gitService, metadata),
			storedRoot: await database.getMetadata(WORKTREE_META_REPOSITORY_ROOT),
		}, {
			directories: [{ uri: worktree.toString(), origin: { kind: WorkingDirectoryOriginKind.Worktree, mainWorktree: main.toString() } }],
			storedRoot: recordedRoot.toString(),
		});
	});

	test('read-only metadata does not guess a missing main worktree from its path', async () => {
		const database = disposables.add(new TestSessionDatabase());
		const worktree = URI.file('/workspace/repository.worktrees/feature');
		await Promise.all([
			database.setMetadata('copilot.worktree.branchName', 'feature'),
			database.setMetadata('copilot.worktree.path', worktree.toString()),
		]);
		const gitService = createNoopGitService();
		const isolation = disposables.add(new WorktreeIsolation(
			{ _serviceBrand: undefined, generateBranchName: async () => 'feature' },
			gitService,
			createSessionDataService(database),
			new NullLogService(),
		));
		const metadata = await isolation.readWorktreeMetadata(URI.parse('copilot:/recorded'), { repair: false });
		assert.deepStrictEqual({
			directories: await resolveWorkingDirectoryInfo([worktree], gitService, metadata),
			storedRoot: await database.getMetadata(WORKTREE_META_REPOSITORY_ROOT),
		}, {
			directories: [{ uri: worktree.toString() }],
			storedRoot: undefined,
		});
	});

	test('materialization lifts legacy directories without inventing provenance', () => {
		assert.deepStrictEqual(materializedWorkingDirectoryInfo(['file:///workspace/old'], ['file:///workspace/old'], undefined), [
			{ uri: 'file:///workspace/old' },
		]);
	});

	test('materialization replaces only matching directory facts and preserves other entries', () => {
		const main = URI.file('/workspace/repository');
		const worktree = URI.file('/workspace/repository.worktrees/feature');
		const other: WorkingDirectory = { uri: 'file:///workspace/other', repo: 'https://example.com/team/other', origin: { kind: WorkingDirectoryOriginKind.Local } };
		assert.deepStrictEqual(materializedWorkingDirectoryInfo([worktree.toString(), other.uri], [main.toString(), other], {
			branchName: 'feature',
			repositoryRoot: main,
			worktreePath: worktree,
		}), [
			{ uri: worktree.toString(), origin: { kind: WorkingDirectoryOriginKind.Worktree, mainWorktree: main.toString() } },
			other,
		]);
	});
});
