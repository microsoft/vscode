/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import { cp as copyFile } from '@vscode/fs-copyfile';
import * as assert from 'assert';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { getWorktreeIncludePaths } from '../worktree';

const isCaseInsensitiveFileSystem = process.platform === 'win32' || process.platform === 'darwin';

function rmDirWithRetry(directory: string): void {
	try { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { }
}

suite('worktree', () => {
	test('protects target-tracked files that differ only in case on case-insensitive file systems', () => {
		const root = path.join(path.parse(process.cwd()).root, 'repo');
		const includePaths = getWorktreeIncludePaths(
			root,
			['Cache/**'],
			'Cache/config.json',
			'',
			'cache/config.json'
		);

		// On case-insensitive file systems (Windows/macOS) the target-tracked
		// `cache/config.json` must protect the aliased ignored `Cache/config.json`.
		const expected = isCaseInsensitiveFileSystem ? [] : [path.join(root, 'Cache/config.json')];
		assert.deepStrictEqual(includePaths, expected);
	});

	test('collapses only wholly ignored directories', () => {
		const root = path.join(path.parse(process.cwd()).root, 'repo');
		const result = getWorktreeIncludePaths(
			root,
			['.env', '**/node_modules/**', 'partial/*.txt', 'app/**'],
			[
				'.env',
				'app/config.local',
				'build/node_modules/.bin/tool',
				'build/node_modules/pkg/index.js',
				'extensions/copilot/node_modules/pkg/index.js',
				'node_modules/.bin/tool',
				'partial/keep.txt',
				'partial/skip.bin',
				'unmatched/cache.bin',
			].join('\0'),
			[
				'build/node_modules/',
				'extensions/copilot/node_modules/',
				'node_modules/',
				'partial/',
				'unmatched/',
			].join('\0'),
			''
		);

		assert.deepStrictEqual(result.sort(), [
			path.join(root, '.env'),
			path.join(root, 'app/config.local'),
			path.join(root, 'build/node_modules/'),
			path.join(root, 'extensions/copilot/node_modules/'),
			path.join(root, 'node_modules/'),
			path.join(root, 'partial/keep.txt'),
		].sort());
	});

	test('supports trailing separators in glob patterns', () => {
		const root = path.join(path.parse(process.cwd()).root, 'repo');
		assert.deepStrictEqual(
			getWorktreeIncludePaths(root, ['**/node_modules/**/'], 'node_modules/pkg/index.js\0', 'node_modules/\0', ''),
			[path.join(root, 'node_modules/')]
		);
	});

	test('does not copy tracked siblings into a worktree', async () => {
		const repositoryRoot = fs.mkdtempSync(path.join(tmpdir(), 'vscode-git-include-'));
		const worktreePath = `${repositoryRoot}-worktree`;
		const fixtureRoot = path.join(repositoryRoot, 'worktree-test');
		const trackedFile = path.join(fixtureRoot, 'tracked.txt');
		const dependencyFile = path.join(fixtureRoot, 'node_modules', 'dependency', 'index.js');
		const runGit = (cwd: string, args: string[]) => childProcess.execFileSync('git', args, { cwd, encoding: 'utf8' });

		try {
			runGit(repositoryRoot, ['init', '-b', 'main']);
			runGit(repositoryRoot, ['config', 'user.name', 'test']);
			runGit(repositoryRoot, ['config', 'user.email', 'test@example.com']);
			runGit(repositoryRoot, ['config', 'commit.gpgsign', 'false']);
			fs.mkdirSync(path.dirname(dependencyFile), { recursive: true });
			fs.writeFileSync(path.join(repositoryRoot, '.gitignore'), 'worktree-test/node_modules/\n');
			fs.writeFileSync(trackedFile, 'committed');
			fs.writeFileSync(dependencyFile, 'dependency');
			runGit(repositoryRoot, ['add', '.']);
			runGit(repositoryRoot, ['commit', '-m', 'initial']);
			fs.writeFileSync(trackedFile, 'source change');
			runGit(repositoryRoot, ['worktree', 'add', '-b', 'agents/test', worktreePath, 'main']);

			const args = ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'];
			const includePaths = getWorktreeIncludePaths(
				repositoryRoot,
				['**/node_modules/**'],
				runGit(repositoryRoot, args),
				runGit(repositoryRoot, [...args, '--directory', '--no-empty-directory']),
				runGit(worktreePath, ['ls-files', '-z'])
			);

			for (const source of includePaths) {
				const target = path.join(worktreePath, path.relative(repositoryRoot, source));
				await fs.promises.mkdir(path.dirname(target), { recursive: true });
				await copyFile(source, target, { force: true, recursive: true, verbatimSymlinks: true });
			}

			assert.deepStrictEqual({
				includePaths: includePaths.map(includePath => path.relative(repositoryRoot, includePath)),
				tracked: fs.readFileSync(path.join(worktreePath, 'worktree-test', 'tracked.txt'), 'utf8'),
				dependency: fs.readFileSync(path.join(worktreePath, 'worktree-test', 'node_modules', 'dependency', 'index.js'), 'utf8'),
				status: runGit(worktreePath, ['status', '--porcelain']),
			}, {
				includePaths: [path.join('worktree-test', 'node_modules')],
				tracked: 'committed',
				dependency: 'dependency',
				status: '',
			});
		} finally {
			try { runGit(repositoryRoot, ['worktree', 'remove', '--force', worktreePath]); } catch { }
			rmDirWithRetry(repositoryRoot);
			rmDirWithRetry(worktreePath);
		}
	});

	test('does not overwrite paths tracked by the target ref', async () => {
		const repositoryRoot = fs.mkdtempSync(path.join(tmpdir(), 'vscode-git-include-'));
		const worktreePath = `${repositoryRoot}-worktree`;
		const sourceFile = path.join(repositoryRoot, 'cache', 'config.json');
		const runGit = (cwd: string, args: string[]) => childProcess.execFileSync('git', args, { cwd, encoding: 'utf8' });

		try {
			runGit(repositoryRoot, ['init', '-b', 'main']);
			runGit(repositoryRoot, ['config', 'user.name', 'test']);
			runGit(repositoryRoot, ['config', 'user.email', 'test@example.com']);
			runGit(repositoryRoot, ['config', 'commit.gpgsign', 'false']);
			fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
			fs.writeFileSync(sourceFile, 'target');
			runGit(repositoryRoot, ['add', '.']);
			runGit(repositoryRoot, ['commit', '-m', 'tracked target file']);
			runGit(repositoryRoot, ['branch', 'target']);
			runGit(repositoryRoot, ['rm', 'cache/config.json']);
			fs.writeFileSync(path.join(repositoryRoot, '.gitignore'), 'cache/\n');
			runGit(repositoryRoot, ['add', '.']);
			runGit(repositoryRoot, ['commit', '-m', 'ignore cache']);
			fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
			fs.writeFileSync(sourceFile, 'source');
			runGit(repositoryRoot, ['worktree', 'add', '-b', 'agents/test', worktreePath, 'target']);

			const args = ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'];
			const includePaths = getWorktreeIncludePaths(
				repositoryRoot,
				['cache/**'],
				runGit(repositoryRoot, args),
				runGit(repositoryRoot, [...args, '--directory', '--no-empty-directory']),
				runGit(worktreePath, ['ls-files', '-z'])
			);

			assert.deepStrictEqual({
				includePaths,
				target: fs.readFileSync(path.join(worktreePath, 'cache', 'config.json'), 'utf8'),
				status: runGit(worktreePath, ['status', '--porcelain']),
			}, {
				includePaths: [],
				target: 'target',
				status: '',
			});
		} finally {
			try { runGit(repositoryRoot, ['worktree', 'remove', '--force', worktreePath]); } catch { }
			rmDirWithRetry(repositoryRoot);
			rmDirWithRetry(worktreePath);
		}
	});
});
