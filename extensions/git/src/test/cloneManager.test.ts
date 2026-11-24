/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CloneManager, type CloneOptions } from '../cloneManager';
import type { RepositoryCacheInfo } from '../repositoryCache';
import * as sinon from 'sinon';
import { CancellationTokenSource, ProgressLocation, window } from 'vscode';
import type { ICloneOptions } from '../git';

interface ICloneManagerHarness {
	cloneRepository(url: string, parentPath?: string, options?: CloneOptions): Promise<string | undefined>;
	doPostCloneAction?(target: string, postCloneAction?: 'none'): Promise<void>;
}

const tryOpenExistingRepository = Reflect.get(CloneManager.prototype, 'tryOpenExistingRepository') as (
	this: ICloneManagerHarness,
	cachedRepository: RepositoryCacheInfo[],
	url: string,
	options: CloneOptions,
) => Promise<string | undefined>;

suite('CloneManager', () => {
	teardown(() => sinon.restore());

	test('notification progress does not interpret clone URLs as links', async () => {
		const cloneRepository = Reflect.get(CloneManager.prototype, 'cloneRepository') as (
			this: {
				model: { git: { clone(url: string, options: ICloneOptions): Promise<string> } };
				doPostCloneAction(repositoryPath: string): Promise<void>;
			},
			url: string,
			parentPath: string
		) => Promise<string | undefined>;
		const titles: string[] = [];
		const cloned: string[] = [];
		sinon.stub(window, 'withProgress').callsFake(async (options, task) => {
			assert.strictEqual(options.location, ProgressLocation.Notification);
			titles.push(options.title!);
			const tokenSource = new CancellationTokenSource();
			try {
				return await task({ report: () => { } }, tokenSource.token);
			} finally {
				tokenSource.dispose();
			}
		});
		const urls = [
			'https://example.com/normal.git',
			'https://example.com/repo-[Open](command:test.noop).git',
			'https://example.com/repo-[Open](CoMmAnD:test.noop?%5B%22arg%22%5D "Title").git',
			'https://example.com/repo-\\[Open\\](command:test.noop).git',
			'https://example.com/repo-[Help](https://example.com).git',
			'https://example.com/repo-COMMAND:test.noop.git',
		];
		for (const url of urls) {
			await cloneRepository.call({
				model: { git: { clone: async originalUrl => { cloned.push(originalUrl); return '/repos/result'; } } },
				doPostCloneAction: async () => { },
			}, url, '/repos');
		}
		assert.deepStrictEqual({ titles, cloned }, {
			titles: [
				'Cloning git repository "https://example.com/normal.git"...',
				...urls.slice(1).map(() => 'Cloning git repository...')
			],
			cloned: urls,
		});
	});

	test('clones again when a cached repository path was deleted', async () => {
		const workspacePath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-git-clone-manager-'));
		const repositoryPath = path.join(workspacePath, 'deleted-repository');
		const calls: { url: string; parentPath: string | undefined }[] = [];
		try {
			const result = await tryOpenExistingRepository.call({
				cloneRepository: async (url, parentPath) => {
					calls.push({ url, parentPath });
					return '/repos/recloned';
				},
			}, [{ workspacePath, repositoryPath }], 'https://github.com/microsoft/vscode.git', { postCloneAction: 'none', parentPath: '/repos', returnRepositoryPath: true });

			assert.deepStrictEqual({ result, calls }, {
				result: '/repos/recloned',
				calls: [{ url: 'https://github.com/microsoft/vscode.git', parentPath: '/repos' }],
			});
		} finally {
			await fs.promises.rm(workspacePath, { recursive: true, force: true });
		}
	});

	test('clones again with the same options when a cached repository was deleted but its workspace still exists', async () => {
		const workspacePath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-git-clone-manager-'));
		const repositoryPath = path.join(workspacePath, 'deleted-repository');
		const calls: string[] = [];
		try {
			const result = await tryOpenExistingRepository.call({
				cloneRepository: async (url, parentPath, options) => {
					calls.push(`clone ${url} into ${parentPath} (recursive: ${options?.recursive})`);
					return '/repos/recloned';
				},
				doPostCloneAction: async target => {
					calls.push(`open ${target}`);
				},
			}, [{ workspacePath, repositoryPath }], 'https://github.com/microsoft/vscode.git', { postCloneAction: 'none', parentPath: '/repos', recursive: true });

			assert.deepStrictEqual({ result, calls }, {
				result: '/repos/recloned',
				calls: ['clone https://github.com/microsoft/vscode.git into /repos (recursive: true)'],
			});
		} finally {
			await fs.promises.rm(workspacePath, { recursive: true, force: true });
		}
	});

	test('opens a cached repository that still exists instead of cloning again', async () => {
		const workspacePath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-git-clone-manager-'));
		const repositoryPath = path.join(workspacePath, 'repository');
		const calls: string[] = [];
		try {
			await fs.promises.mkdir(repositoryPath);
			const result = await tryOpenExistingRepository.call({
				cloneRepository: async url => {
					calls.push(`clone ${url}`);
					return '/repos/recloned';
				},
				doPostCloneAction: async target => {
					calls.push(`open ${target}`);
				},
			}, [{ workspacePath, repositoryPath }], 'https://github.com/microsoft/vscode.git', { postCloneAction: 'none', parentPath: '/repos' });

			assert.deepStrictEqual({ result, calls }, {
				result: workspacePath,
				calls: [`open ${workspacePath}`],
			});
		} finally {
			await fs.promises.rm(workspacePath, { recursive: true, force: true });
		}
	});
});
