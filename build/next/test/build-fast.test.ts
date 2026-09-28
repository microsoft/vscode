/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { suite, test } from 'node:test';
import { collectSnapshot, computeChangedPaths, createBuildFastPrerequisites, createBuildPlan, parseNullSeparatedPaths, selectBuiltSnapshot, type BuildFastSnapshot, type BuildFastState, type OutputStatus, type StateReadResult } from '../build-fast.ts';
import { applyIncrementalClientChanges, getOutputRelativePath } from '../transpile.ts';

const environment = 'test-environment';
const outputsPresent: OutputStatus = { client: true, extensions: true, copilot: true };

suite('build-fast planning', () => {
	test('parses NUL-separated Git paths', () => {
		assert.deepStrictEqual(
			parseNullSeparatedPaths(Buffer.from('src/one.ts\0extensions/two file.ts\0')),
			['src/one.ts', 'extensions/two file.ts']
		);
	});

	test('detects dirty edits, reverts, and committed changes', () => {
		const saved = state({
			'src/already-built.ts': 'same',
			'src/edited-again.ts': 'old',
			'src/reverted.ts': 'dirty',
			'src/deleted.ts': null,
		});
		const current: BuildFastSnapshot = {
			head: 'current',
			dirty: {
				'src/already-built.ts': 'same',
				'src/edited-again.ts': 'new',
				'src/deleted.ts': null,
				'src/untracked.ts': 'untracked',
			}
		};

		assert.deepStrictEqual(
			computeChangedPaths(saved, current, ['src/committed.ts']),
			['src/committed.ts', 'src/edited-again.ts', 'src/reverted.ts', 'src/untracked.ts']
		);
	});

	test('records the pre-build snapshot when inputs change during the build', () => {
		const before: BuildFastSnapshot = { head: 'before', dirty: { 'src/file.ts': 'old' } };
		const unchangedAfter: BuildFastSnapshot = { head: 'before', dirty: { 'src/file.ts': 'old' } };
		const after: BuildFastSnapshot = { head: 'before', dirty: { 'src/file.ts': 'new' } };

		assert.deepStrictEqual([
			selectBuiltSnapshot(before, unchangedAfter),
			selectBuiltSnapshot(before, after),
		], [
			{ snapshot: unchangedAfter, inputsChanged: false },
			{ snapshot: before, inputsChanged: true },
		]);
	});

	test('creates a clean no-op plan', () => {
		assert.deepStrictEqual(
			createBuildPlan(savedState(), environment, [], outputsPresent, false),
			{
				reason: 'inputs and outputs are up to date',
				changedPaths: [],
				client: 'skip',
				extensions: 'skip',
				copilot: 'skip',
			}
		);
	});

	test('routes client, extension, and Copilot changes independently', () => {
		assert.deepStrictEqual(
			createBuildPlan(savedState(), environment, [
				'extensions/configuration-editing/src/configurationEditingMain.ts',
				'extensions/copilot/src/extension.ts',
				'src/main.ts',
			], outputsPresent, false),
			{
				reason: '3 input path(s) changed',
				changedPaths: [
					'extensions/configuration-editing/src/configurationEditingMain.ts',
					'extensions/copilot/src/extension.ts',
					'src/main.ts',
				],
				client: 'incremental',
				extensions: 'full',
				copilot: 'full',
			}
		);
	});

	test('falls back fully for missing state and build inputs', () => {
		assert.deepStrictEqual([
			createBuildPlan({ state: undefined, reason: 'incremental state is missing' }, environment, [], outputsPresent, false),
			createBuildPlan(savedState(), environment, ['build/next/index.ts'], outputsPresent, false),
			createBuildPlan(savedState(), environment, ['gulpfile.mjs'], outputsPresent, false),
		], [
			{
				reason: 'incremental state is missing',
				changedPaths: [],
				client: 'full',
				extensions: 'full',
				copilot: 'full',
			},
			{
				reason: 'build configuration or dependencies changed',
				changedPaths: ['build/next/index.ts'],
				client: 'full',
				extensions: 'full',
				copilot: 'full',
			},
			{
				reason: 'build configuration or dependencies changed',
				changedPaths: ['gulpfile.mjs'],
				client: 'full',
				extensions: 'full',
				copilot: 'full',
			}
		]);
	});

	test('rebuilds only the lane with a missing output', () => {
		assert.deepStrictEqual(
			createBuildPlan(savedState(), environment, [], { client: false, extensions: true, copilot: true }, false),
			{
				reason: 'client output is missing',
				changedPaths: [],
				client: 'full',
				extensions: 'skip',
				copilot: 'skip',
			}
		);
	});

	test('regenerates changed or deleted generated metadata', () => {
		assert.deepStrictEqual([
			createBuildFastPrerequisites(false, ['src/vscode-dts/vscode.proposed.example.d.ts']),
			createBuildFastPrerequisites(false, ['src/vs/platform/extensions/common/extensionsApiProposals.ts']),
			createBuildFastPrerequisites(false, ['src/vs/workbench/services/extensions/common/extensionPoints.json']),
		], [
			{
				tasks: ['compile-api-proposal-names'],
				clientChangedPaths: [
					'src/vscode-dts/vscode.proposed.example.d.ts',
					'src/vs/platform/extensions/common/extensionsApiProposals.ts',
				],
			},
			{
				tasks: ['compile-api-proposal-names'],
				clientChangedPaths: ['src/vs/platform/extensions/common/extensionsApiProposals.ts'],
			},
			{
				tasks: ['compile-extension-point-names'],
				clientChangedPaths: ['src/vs/workbench/services/extensions/common/extensionPoints.json'],
			},
		]);
	});

	test('snapshots a tracked file replaced by a directory', async () => {
		const repoRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-build-fast-git-'));
		try {
			runGit(repoRoot, ['init']);
			runGit(repoRoot, ['config', 'user.email', 'build-fast@example.com']);
			runGit(repoRoot, ['config', 'user.name', 'Build Fast Test']);
			await write(repoRoot, 'src/entry', 'file');
			runGit(repoRoot, ['add', 'src/entry']);
			runGit(repoRoot, ['commit', '-m', 'initial']);

			await fs.promises.rm(path.join(repoRoot, 'src/entry'));
			await write(repoRoot, 'src/entry/child.txt', 'child');

			const snapshot = await collectSnapshot(repoRoot);
			assert.deepStrictEqual(snapshot.dirty, {
				'src/entry': null,
				'src/entry/child.txt': createHash('sha256').update('child').digest('hex'),
			});
		} finally {
			await fs.promises.rm(repoRoot, { recursive: true, force: true });
		}
	});
});

suite('incremental client output', () => {
	test('transpiles TypeScript, copies resources and declarations, and removes deleted outputs', async () => {
		const repoRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-build-fast-'));
		try {
			await write(repoRoot, 'src/sample.ts', 'export const value: number = 1;\n');
			await write(repoRoot, 'src/sample.d.ts', 'export declare const value: number;\n');
			await write(repoRoot, 'src/data.json', '{"value":1}\n');

			await applyIncrementalClientChanges(repoRoot, 'out', ['src/sample.ts', 'src/sample.d.ts', 'src/data.json']);

			const initial = {
				js: await fs.promises.readFile(path.join(repoRoot, 'out/sample.js'), 'utf8'),
				declaration: await fs.promises.readFile(path.join(repoRoot, 'out/sample.d.ts'), 'utf8'),
				resource: await fs.promises.readFile(path.join(repoRoot, 'out/data.json'), 'utf8'),
			};
			assert.deepStrictEqual({
				jsContainsType: initial.js.includes(': number'),
				jsContainsValue: initial.js.includes('const value = 1'),
				declaration: initial.declaration,
				resource: initial.resource,
			}, {
				jsContainsType: false,
				jsContainsValue: true,
				declaration: 'export declare const value: number;\n',
				resource: '{"value":1}\n',
			});

			await fs.promises.rm(path.join(repoRoot, 'src/sample.ts'));
			await applyIncrementalClientChanges(repoRoot, 'out', ['src/sample.ts']);
			assert.strictEqual(fs.existsSync(path.join(repoRoot, 'out/sample.js')), false);
		} finally {
			await fs.promises.rm(repoRoot, { recursive: true, force: true });
		}
	});

	test('preserves BOM behavior and resolves output collisions like a full build', async () => {
		const repoRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-build-fast-'));
		try {
			await write(repoRoot, 'src/vs/test/fixtures/utf8/resource.txt', 'hello');
			await write(repoRoot, 'src/collision.ts', 'export const source: string = "ts";\n');
			await write(repoRoot, 'src/collision.js', 'export const source = "js";\n');

			await applyIncrementalClientChanges(repoRoot, 'out', [
				'src/vs/test/fixtures/utf8/resource.txt',
				'src/collision.ts',
			]);

			assert.deepStrictEqual({
				bom: [...(await fs.promises.readFile(path.join(repoRoot, 'out/vs/test/fixtures/utf8/resource.txt'))).subarray(0, 3)],
				collision: await fs.promises.readFile(path.join(repoRoot, 'out/collision.js'), 'utf8'),
				declarationOutput: getOutputRelativePath('sample.d.ts'),
				typeScriptOutput: getOutputRelativePath('sample.ts'),
			}, {
				bom: [0xef, 0xbb, 0xbf],
				collision: 'export const source = "js";\n',
				declarationOutput: 'sample.d.ts',
				typeScriptOutput: 'sample.js',
			});
		} finally {
			await fs.promises.rm(repoRoot, { recursive: true, force: true });
		}
	});

	test('handles file and directory transitions without racing writes', async () => {
		const repoRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-build-fast-'));
		try {
			await write(repoRoot, 'src/tree', 'file');
			await applyIncrementalClientChanges(repoRoot, 'out', ['src/tree']);

			await fs.promises.rm(path.join(repoRoot, 'src/tree'));
			await write(repoRoot, 'src/tree/child.txt', 'child');
			await applyIncrementalClientChanges(repoRoot, 'out', ['src/tree', 'src/tree/child.txt']);
			const directoryOutput = await fs.promises.readFile(path.join(repoRoot, 'out/tree/child.txt'), 'utf8');

			await fs.promises.rm(path.join(repoRoot, 'src/tree'), { recursive: true });
			await write(repoRoot, 'src/tree', 'file-again');
			await applyIncrementalClientChanges(repoRoot, 'out', ['src/tree/child.txt', 'src/tree']);

			assert.deepStrictEqual({
				directoryOutput,
				fileOutput: await fs.promises.readFile(path.join(repoRoot, 'out/tree'), 'utf8'),
			}, {
				directoryOutput: 'child',
				fileOutput: 'file-again',
			});
		} finally {
			await fs.promises.rm(repoRoot, { recursive: true, force: true });
		}
	});
});

function state(dirty: Readonly<Record<string, string | null>> = {}): BuildFastState {
	return {
		schema: 1,
		recipe: 1,
		head: 'saved',
		environment,
		dirty,
	};
}

function savedState(): StateReadResult {
	return { state: state(), reason: undefined };
}

async function write(repoRoot: string, relativePath: string, contents: string): Promise<void> {
	const filePath = path.join(repoRoot, relativePath);
	await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
	await fs.promises.writeFile(filePath, contents);
}

function runGit(repoRoot: string, args: readonly string[]): void {
	execFileSync('git', args, { cwd: repoRoot, stdio: 'ignore' });
}
