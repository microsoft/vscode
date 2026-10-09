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
import { collectSnapshot, computeChangedPaths, createBuildFastPrerequisites, createBuildFastState, createBuildPlan, parseNullSeparatedPaths, runBuildFast, selectBuiltSnapshot, type BuildFastChanges, type BuildFastSnapshot, type BuildFastState, type OutputStatus, type StateReadResult } from '../build-fast.ts';
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
		const saved: BuildFastSnapshot = {
			head: 'saved', dirty: {
				'src/already-built.ts': 'same',
				'src/edited-again.ts': 'old',
				'src/reverted.ts': 'dirty',
				'src/deleted.ts': null,
			}
		};
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
			createBuildPlan(savedState(), environment, changes(), outputsPresent, false),
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
			createBuildPlan(savedState(), environment, changes([
				'extensions/configuration-editing/src/configurationEditingMain.ts',
				'extensions/copilot/src/extension.ts',
				'src/main.ts',
			]), outputsPresent, false),
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
			createBuildPlan({ state: undefined, reason: 'incremental state is missing' }, environment, changes(), outputsPresent, false),
			createBuildPlan(savedState(), environment, changes(['build/next/index.ts']), outputsPresent, false),
			createBuildPlan(savedState(), environment, changes(['gulpfile.mjs']), outputsPresent, false),
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
			createBuildPlan(savedState(), environment, changes(), { client: false, extensions: true, copilot: true }, false),
			{
				reason: 'client output is missing',
				changedPaths: [],
				client: 'full',
				extensions: 'skip',
				copilot: 'skip',
			}
		);
	});

	test('cold and forced client-only builds never select extension lanes', () => {
		assert.deepStrictEqual([
			createBuildPlan({ state: undefined, reason: 'incremental state is missing' }, environment, changes(), outputsPresent, false, true),
			createBuildPlan(savedState(), environment, changes(['build/next/index.ts']), outputsPresent, false, true),
			createBuildPlan(savedState(), environment, changes(), outputsPresent, true, true),
		].map(plan => [plan.client, plan.extensions, plan.copilot]), [
			['full', 'skip', 'skip'],
			['full', 'skip', 'skip'],
			['full', 'skip', 'skip'],
		]);
	});

	test('client-only updates preserve pending extension and dependency changes', () => {
		const previous = state({ 'extensions/git/src/git.ts': 'old' });
		const snapshot: BuildFastSnapshot = { head: 'next', dirty: { 'extensions/git/src/git.ts': 'new' } };
		const updated = createBuildFastState(previous, environment, snapshot, true);
		const pendingChanges = computeChangedPaths(updated.extensions, snapshot, ['package-lock.json']);
		const plan = createBuildPlan({ state: updated, reason: undefined }, environment, {
			client: [],
			extensions: pendingChanges,
			copilot: ['package-lock.json'],
		}, outputsPresent, false);
		assert.deepStrictEqual({
			snapshots: [updated.client, updated.extensions, updated.copilot],
			modes: [plan.client, plan.extensions, plan.copilot],
		}, {
			snapshots: [snapshot, previous.extensions, previous.copilot],
			modes: ['skip', 'full', 'full'],
		});
	});

	test('client-only initialization does not trust pre-existing non-client outputs', () => {
		const snapshot: BuildFastSnapshot = { head: 'saved', dirty: {} };
		const updated = createBuildFastState(undefined, environment, snapshot, true);
		const plan = createBuildPlan({ state: updated, reason: undefined }, environment, changes(), outputsPresent, false);
		assert.deepStrictEqual([plan.client, plan.extensions, plan.copilot], ['skip', 'full', 'full']);
	});

	test('incompatible state is not retained for unselected lanes', () => {
		const snapshot: BuildFastSnapshot = { head: 'next', dirty: {} };
		assert.deepStrictEqual([
			createBuildFastState({ ...state(), environment: 'old' }, environment, snapshot, true),
			createBuildFastState({ ...state(), recipe: 1 }, environment, snapshot, true),
			createBuildFastState({ ...state(), schema: 1 }, environment, snapshot, true),
		], Array.from({ length: 3 }, () => ({
			schema: 2, recipe: 4, environment, client: snapshot, extensions: undefined, copilot: undefined,
		})));
	});

	test('client-only no-op ignores missing extension outputs and extension edits', () => {
		const plan = createBuildPlan(savedState(), environment, changes(['extensions/git/src/git.ts']), { client: true, extensions: false, copilot: false }, false, true);
		assert.deepStrictEqual(plan, {
			reason: 'inputs and outputs are up to date',
			changedPaths: [],
			client: 'skip',
			extensions: 'skip',
			copilot: 'skip',
		});
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

});

suite('build-fast orchestration', () => {
	test('keeps lane state correct across client-only, default, edits, commits and failures', async () => {
		const repoRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-build-fast-run-'));
		try {
			runGit(repoRoot, ['init']);
			runGit(repoRoot, ['config', 'user.email', 'build-fast@example.com']);
			runGit(repoRoot, ['config', 'user.name', 'Build Fast Test']);
			await write(repoRoot, '.gitignore', '.build/\nout/\n**/out/\n**/dist/\n');
			await write(repoRoot, 'package.json', JSON.stringify({ type: 'module', scripts: { gulp: 'node build-task.ts' } }));
			await write(repoRoot, 'extensions/copilot/package.json', JSON.stringify({ scripts: { compile: 'node ../../build-task.ts copilot' } }));
			await write(repoRoot, 'src/main.ts', 'export const value: number = 1;\n');
			await write(repoRoot, 'src/data.json', '{"value":1}');
			await write(repoRoot, 'extensions/git/src/git.ts', 'export const version = 1;');
			await write(repoRoot, 'build-task.ts', `
					import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
					import { dirname } from 'node:path';
					const root = import.meta.dirname;
					const args = process.argv.slice(2);
					appendFileSync(root + '/.build/tasks', args.join(' ') + '\\n');
					if (existsSync(root + '/.build/fail')) { throw new Error('fixture failure'); }
					if (existsSync(root + '/.build/prerequisite-late')) {
						writeFileSync(root + '/src/late.ts', 'export const late = true;');
					}
					if (args.includes('compile-extensions')) { throw new Error('unexpected type check'); }
					const output = args.includes('transpile-extensions')
						? '/extensions/configuration-editing/out/configurationEditingMain.js'
						: args.includes('copilot') ? '/extensions/copilot/dist/extension.js' : undefined;
					if (output) {
						mkdirSync(dirname(root + output), { recursive: true });
						writeFileSync(root + output, 'built');
					}
				`);
			await write(repoRoot, 'build/next/index.ts', `
					import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
					const root = new URL('../../', import.meta.url);
					appendFileSync(new URL('.build/tasks', root), 'client\\n');
					if (existsSync(new URL('.build/fail', root))) { throw new Error('fixture failure'); }
					mkdirSync(new URL('out', root), { recursive: true });
					writeFileSync(new URL('out/main.js', root), readFileSync(new URL('src/main.ts', root)));
					if (existsSync(new URL('src/data.json', root))) {
						writeFileSync(new URL('out/data.json', root), readFileSync(new URL('src/data.json', root)));
					}
					if (existsSync(new URL('.build/late', root))) {
						writeFileSync(new URL('src/main.ts', root), 'export const value: number = 3;\\n');
					}
				`);
			runGit(repoRoot, ['add', '.']);
			runGit(repoRoot, ['commit', '-m', 'initial']);
			const tasksFile = path.join(repoRoot, '.build/tasks');
			const stateFile = path.join(repoRoot, '.build/build-fast/state.json');
			const results: object[] = [];
			const capture = async () => {
				const saved: BuildFastState = JSON.parse(await fs.promises.readFile(stateFile, 'utf8'));
				results.push({
					tasks: (await fs.promises.readFile(tasksFile, 'utf8')).trim().split('\n').sort(),
					lanes: [!!saved.client, !!saved.extensions, !!saved.copilot],
				});
				await fs.promises.writeFile(tasksFile, '');
			};

			await runBuildFast(repoRoot, false, true);
			await capture();
			await runBuildFast(repoRoot, false, true);
			await capture();
			await write(repoRoot, 'src/main.ts', 'export const value: number = 2;\n');
			await fs.promises.rm(path.join(repoRoot, 'src/data.json'));
			await runBuildFast(repoRoot, false, true);
			assert.deepStrictEqual({
				updated: (await fs.promises.readFile(path.join(repoRoot, 'out/main.js'), 'utf8')).includes('const value = 2'),
				deleted: fs.existsSync(path.join(repoRoot, 'out/data.json')),
			}, { updated: true, deleted: false });
			await capture();
			await runBuildFast(repoRoot, false);
			await capture();

			await write(repoRoot, 'extensions/git/src/git.ts', 'export const version = 2;');
			runGit(repoRoot, ['add', '.']);
			runGit(repoRoot, ['commit', '-m', 'edit extension']);
			await runBuildFast(repoRoot, false, true);
			await capture();
			await runBuildFast(repoRoot, false);
			await capture();
			await runBuildFast(repoRoot, false);
			await capture();

			await fs.promises.rm(path.join(repoRoot, 'out'), { recursive: true });
			await runBuildFast(repoRoot, false, true);
			await capture();
			await runBuildFast(repoRoot, true, true);
			await capture();
			await write(repoRoot, '.build/fail', '');
			await assert.rejects(runBuildFast(repoRoot, true, true), /prerequisites build failed/);
			assert.strictEqual(fs.existsSync(stateFile), false);
			await fs.promises.rm(path.join(repoRoot, '.build/fail'));
			await fs.promises.writeFile(tasksFile, '');
			await runBuildFast(repoRoot, false, true);
			await capture();

			await write(repoRoot, '.build/late', '');
			await runBuildFast(repoRoot, true, true);
			await capture();
			await fs.promises.rm(path.join(repoRoot, '.build/late'));
			await runBuildFast(repoRoot, false, true);
			await capture();
			assert.strictEqual((await fs.promises.readFile(path.join(repoRoot, 'out/main.js'), 'utf8')).includes('const value = 3'), true);

			await write(repoRoot, '.build/prerequisite-late', '');
			await write(repoRoot, 'src/vscode-dts/vscode.proposed.example.d.ts', 'export {};');
			await runBuildFast(repoRoot, false, true);
			await capture();
			assert.strictEqual(fs.existsSync(path.join(repoRoot, 'out/late.js')), false);
			await fs.promises.rm(path.join(repoRoot, '.build/prerequisite-late'));
			await runBuildFast(repoRoot, false, true);
			await capture();
			assert.strictEqual((await fs.promises.readFile(path.join(repoRoot, 'out/late.js'), 'utf8')).includes('const late = true'), true);

			const clientTasks = ['client', 'copy-codicons compile-api-proposal-names compile-extension-point-names'];
			assert.deepStrictEqual(results, [
				{ tasks: clientTasks, lanes: [true, false, false] },
				{ tasks: [''], lanes: [true, false, false] },
				{ tasks: [''], lanes: [true, false, false] },
				{ tasks: ['copilot', 'transpile-extensions compile-extension-media'], lanes: [true, true, true] },
				{ tasks: [''], lanes: [true, true, true] },
				{ tasks: ['transpile-extensions compile-extension-media'], lanes: [true, true, true] },
				{ tasks: [''], lanes: [true, true, true] },
				{ tasks: clientTasks, lanes: [true, true, true] },
				{ tasks: clientTasks, lanes: [true, true, true] },
				{ tasks: clientTasks, lanes: [true, false, false] },
				{ tasks: clientTasks, lanes: [true, false, false] },
				{ tasks: [''], lanes: [true, false, false] },
				{ tasks: ['compile-api-proposal-names'], lanes: [true, false, false] },
				{ tasks: [''], lanes: [true, false, false] },
			]);
		} finally {
			await fs.promises.rm(repoRoot, { recursive: true, force: true });
		}
	});
});

suite('build-fast Git discovery', () => {
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
	const snapshot: BuildFastSnapshot = { head: 'saved', dirty };
	return {
		schema: 2,
		recipe: 4,
		environment,
		client: snapshot,
		extensions: snapshot,
		copilot: snapshot,
	};
}

function changes(paths: readonly string[] = []): BuildFastChanges {
	return { client: paths, extensions: paths, copilot: paths };
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
