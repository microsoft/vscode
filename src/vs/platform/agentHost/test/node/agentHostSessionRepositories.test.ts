/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { resolveSessionRepositories } from '../../node/agentHostSessionRepositories.js';
import { createNoopGitService } from '../common/sessionTestHelpers.js';

/**
 * Builds a typed {@link IAgentHostGitService} fake whose `getRepositoryRoot`
 * returns a canned repository root per working directory (keyed by URI
 * string), and `undefined` for any directory absent from the map (i.e. a
 * non-git directory). All other members delegate to the shared no-op fake.
 */
function createFakeGitService(repositoryRoots: ReadonlyMap<string, URI>): IAgentHostGitService {
	return {
		...createNoopGitService(),
		getRepositoryRoot: async (workingDirectory: URI) => repositoryRoots.get(workingDirectory.toString()),
	};
}

suite('agentHostSessionRepositories', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('dedupes working directories that resolve to the same repository root', async () => {
		const repositoryRoot = URI.file('/repos/app');
		const primaryDirectory = URI.file('/repos/app');
		const subdirectory = URI.file('/repos/app/packages/web');
		const gitService = createFakeGitService(new Map([
			[primaryDirectory.toString(), repositoryRoot],
			[subdirectory.toString(), repositoryRoot],
		]));

		const result = await resolveSessionRepositories([primaryDirectory, subdirectory], gitService);

		assert.deepStrictEqual(result, {
			gitRepositories: [repositoryRoot],
			nonGitDirectories: [],
		});
	});

	test('reports non-git directories and keeps unique roots in input order', async () => {
		const repositoryOne = URI.file('/repos/one');
		const repositoryTwo = URI.file('/repos/two');
		const gitDirectoryOne = URI.file('/repos/one');
		const nonGitDirectory = URI.file('/tmp/scratch');
		const gitDirectoryTwo = URI.file('/repos/two/src');
		const gitService = createFakeGitService(new Map([
			[gitDirectoryOne.toString(), repositoryOne],
			[gitDirectoryTwo.toString(), repositoryTwo],
		]));

		const result = await resolveSessionRepositories([gitDirectoryOne, nonGitDirectory, gitDirectoryTwo], gitService);

		assert.deepStrictEqual(result, {
			gitRepositories: [repositoryOne, repositoryTwo],
			nonGitDirectories: [nonGitDirectory],
		});
	});

	test('with onRootError, a failing root is reported and treated as non-git while others resolve', async () => {
		const repositoryOne = URI.file('/repos/one');
		const failingDirectory = URI.file('/repos/broken');
		const gitDirectoryTwo = URI.file('/repos/two');
		const repositoryTwo = URI.file('/repos/two');
		const gitService: IAgentHostGitService = {
			...createNoopGitService(),
			getRepositoryRoot: async (workingDirectory: URI) => {
				if (workingDirectory.toString() === failingDirectory.toString()) {
					throw new Error('git spawn failed');
				}
				return new Map([
					[repositoryOne.toString(), repositoryOne],
					[gitDirectoryTwo.toString(), repositoryTwo],
				]).get(workingDirectory.toString());
			},
		};

		const reported: Array<{ directory: string; message: string }> = [];
		const result = await resolveSessionRepositories(
			[repositoryOne, failingDirectory, gitDirectoryTwo],
			gitService,
			(directory, error) => reported.push({ directory: directory.toString(), message: error instanceof Error ? error.message : String(error) }),
		);

		assert.deepStrictEqual({ result, reported }, {
			result: {
				gitRepositories: [repositoryOne, repositoryTwo],
				nonGitDirectories: [failingDirectory],
			},
			reported: [{ directory: failingDirectory.toString(), message: 'git spawn failed' }],
		});
	});

	test('without onRootError, a failing root rejects the whole resolution', async () => {
		const failingDirectory = URI.file('/repos/broken');
		const gitService: IAgentHostGitService = {
			...createNoopGitService(),
			getRepositoryRoot: async () => {
				throw new Error('git spawn failed');
			},
		};

		await assert.rejects(
			() => resolveSessionRepositories([failingDirectory], gitService),
			/git spawn failed/,
		);
	});

	test('bounds concurrent repository-root probes and preserves input order', async () => {
		const directories = Array.from({ length: 20 }, (_, i) => URI.file(`/repos/dir-${i}`));
		let active = 0;
		let maxActive = 0;
		const pending: Array<() => void> = [];
		const gitService: IAgentHostGitService = {
			...createNoopGitService(),
			getRepositoryRoot: (workingDirectory: URI) => {
				active++;
				maxActive = Math.max(maxActive, active);
				return new Promise<URI>(resolve => {
					pending.push(() => {
						active--;
						resolve(workingDirectory);
					});
				});
			},
		};

		const resultPromise = resolveSessionRepositories(directories, gitService);
		let settled = false;
		void resultPromise.then(() => { settled = true; });
		// Drain probes one at a time, yielding so the limiter can start the next
		// queued probe, until the whole resolution settles.
		while (!settled) {
			pending.shift()?.();
			await Promise.resolve();
		}
		const result = await resultPromise;

		assert.deepStrictEqual({ maxActive, gitRepositories: result.gitRepositories }, {
			maxActive: 5,
			gitRepositories: directories,
		});
	});
});
