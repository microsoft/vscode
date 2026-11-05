/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CloneManager, resolveDefaultCloneDirectory } from '../cloneManager';
import type { RepositoryCacheInfo } from '../repositoryCache';
import * as sinon from 'sinon';
import { CancellationTokenSource, OpenDialogOptions, ProgressLocation, window, workspace, WorkspaceConfiguration, Uri } from 'vscode';
import type { ICloneOptions } from '../git';

interface ICloneManagerHarness {
	cloneRepository(url: string, parentPath?: string): Promise<string | undefined>;
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

	suite('resolveDefaultCloneDirectory', () => {
		const originalEnv = { ...process.env };
		teardown(() => {
			process.env = { ...originalEnv };
		});

		test('falls back to os.homedir when falsy or empty', () => {
			assert.strictEqual(resolveDefaultCloneDirectory(), os.homedir());
			assert.strictEqual(resolveDefaultCloneDirectory(null), os.homedir());
			assert.strictEqual(resolveDefaultCloneDirectory(''), os.homedir());
		});

		test('resolves tilde to user home', () => {
			assert.strictEqual(resolveDefaultCloneDirectory('~'), os.homedir());
			assert.strictEqual(resolveDefaultCloneDirectory('~/repos/my-project'), `${os.homedir()}/repos/my-project`);
		});

		test('resolves ${userHome} variable', () => {
			assert.strictEqual(resolveDefaultCloneDirectory('${userHome}'), os.homedir());
			assert.strictEqual(resolveDefaultCloneDirectory('${userHome}/repos/accuris'), `${os.homedir()}/repos/accuris`);
		});

		test('resolves ${env:VAR} variables', () => {
			process.env['TEST_CLONE_ROOT'] = '/custom/clone/root';
			assert.strictEqual(resolveDefaultCloneDirectory('${env:TEST_CLONE_ROOT}/repos'), '/custom/clone/root/repos');
			assert.strictEqual(resolveDefaultCloneDirectory('${env:NONEXISTENT_VAR}/repos'), '/repos');
		});

		test('resolves combination of variables', () => {
			process.env['TEST_PROJECT_SUBDIR'] = 'subfolder';
			assert.strictEqual(
				resolveDefaultCloneDirectory('${userHome}/${env:TEST_PROJECT_SUBDIR}/repos'),
				`${os.homedir()}/subfolder/repos`
			);
		});
	});

	test('cloneRepository resolves defaultCloneDirectory variables in showOpenDialog', async () => {
		const cloneRepository = Reflect.get(CloneManager.prototype, 'cloneRepository') as (
			this: {
				telemetryReporter: { sendTelemetryEvent: () => void };
			},
			url: string
		) => Promise<string | undefined>;

		sinon.stub(workspace, 'getConfiguration').returns({
			get: <T>(section: string, defaultValue?: T) => {
				if (section === 'defaultCloneDirectory') {
					return '${userHome}/custom-clone-folder' as unknown as T;
				}
				return defaultValue as T;
			},
			has: () => true,
			inspect: () => undefined,
			update: async () => { }
		} satisfies WorkspaceConfiguration);

		let openedDefaultUri: Uri | undefined;
		sinon.stub(window, 'showOpenDialog').callsFake(async (options?: OpenDialogOptions) => {
			openedDefaultUri = options?.defaultUri;
			return undefined; // simulate user cancel
		});

		await cloneRepository.call({
			telemetryReporter: { sendTelemetryEvent: () => { } }
		}, 'https://github.com/microsoft/vscode.git');

		assert.strictEqual(openedDefaultUri?.fsPath, path.join(os.homedir(), 'custom-clone-folder'));
	});
});
