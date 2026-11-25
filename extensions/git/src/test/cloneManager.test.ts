/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CloneManager } from '../cloneManager';
import type { RepositoryCacheInfo } from '../repositoryCache';
import * as sinon from 'sinon';
import { CancellationTokenSource, ProgressLocation, QuickPickItem, window } from 'vscode';
import type { ICloneOptions } from '../git';

interface ICloneManagerHarness {
	cloneRepository(url: string, parentPath?: string): Promise<string | undefined>;
	chooseExistingRepository?(existingCachedRepositories: RepositoryCacheInfo[]): Promise<RepositoryCacheInfo | 'cloneAgain' | undefined>;
	doPostCloneAction?(target: string, postCloneAction?: 'none'): Promise<void>;
}

const tryOpenExistingRepository = Reflect.get(CloneManager.prototype, 'tryOpenExistingRepository') as (
	this: ICloneManagerHarness,
	cachedRepository: RepositoryCacheInfo[],
	url: string,
	postCloneAction?: 'none',
	parentPath?: string,
	ref?: string,
	returnRepositoryPath?: boolean,
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
			}, [{ workspacePath, repositoryPath }], 'https://github.com/microsoft/vscode.git', 'none', '/repos', undefined, true);

			assert.deepStrictEqual({ result, calls }, {
				result: '/repos/recloned',
				calls: [{ url: 'https://github.com/microsoft/vscode.git', parentPath: '/repos' }],
			});
		} finally {
			await fs.promises.rm(workspacePath, { recursive: true, force: true });
		}
	});

	test('asks before reusing a single cached clone unless the caller wants it silently', async () => {
		const workspacePath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-git-clone-manager-'));
		const url = 'https://github.com/microsoft/vscode.git';
		const quickPicks: string[][] = [];
		const cloned: (string | undefined)[] = [];
		const opened: string[] = [];
		sinon.stub(window, 'showQuickPick').callsFake(async (items: readonly QuickPickItem[] | Thenable<readonly QuickPickItem[]>) => {
			const resolved = await items;
			quickPicks.push(resolved.map(item => item.label));
			return resolved[resolved.length - 1];
		});
		const harness: ICloneManagerHarness = {
			cloneRepository: async (_url, parentPath) => {
				cloned.push(parentPath);
				return '/repos/recloned';
			},
			chooseExistingRepository: Reflect.get(CloneManager.prototype, 'chooseExistingRepository'),
			doPostCloneAction: async target => { opened.push(target); },
		};
		try {
			const cache = [{ workspacePath, repositoryPath: workspacePath }];
			const fromCommand = await tryOpenExistingRepository.call(harness, cache, url);
			const fromApi = await tryOpenExistingRepository.call(harness, cache, url, 'none', undefined, undefined, true);

			assert.deepStrictEqual({ fromCommand, fromApi, quickPicks, cloned, opened }, {
				fromCommand: '/repos/recloned',
				fromApi: workspacePath,
				quickPicks: [[path.basename(workspacePath), 'Clone again']],
				cloned: [undefined],
				opened: [workspacePath],
			});
		} finally {
			await fs.promises.rm(workspacePath, { recursive: true, force: true });
		}
	});
});
