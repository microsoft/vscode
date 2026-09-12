/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { suite, test, type TestContext } from 'node:test';
import typescriptPackage from 'typescript/package.json' with { type: 'json' };
import { ensureCopilotSdkCanvasPatch, type CopilotSdkCanvasPatchManifest } from '../../npm/copilotSdkCanvasPatch.ts';
import { dirs } from '../../npm/dirs.ts';
import { collectInputFiles, computeState } from '../../npm/installStateHash.ts';

const before = {
	'package.json': JSON.stringify({
		name: '@github/copilot-sdk',
		version: '1.0.13',
		type: 'module',
		exports: { '.': { types: './dist/index.d.ts', import: './dist/client.js', require: './dist/cjs/client.js' } },
	}) + '\n',
	'README.md': 'SDK carrier fixture, not the Copilot runtime.\n',
	'dist/client.js': 'export const canvas = false;\n',
	'dist/index.d.ts': 'export declare const canvas: false;\n',
	'dist/cjs/client.js': 'exports.canvas = false;\n',
	'dist/cjs/package.json': '{"type":"commonjs"}\n',
};
const after = {
	...before,
	'dist/client.js': 'export const canvas = true;\n',
	'dist/index.d.ts': 'export declare const canvas: true;\n',
	'dist/cjs/client.js': 'exports.canvas = true;\n',
	'dist/helper.js': 'export const retained = null;\n',
};
const patch = [
	'diff --git a/dist/client.js b/dist/client.js',
	'--- a/dist/client.js',
	'+++ b/dist/client.js',
	'@@ -1 +1 @@',
	'-export const canvas = false;',
	'+export const canvas = true;',
	'diff --git a/dist/index.d.ts b/dist/index.d.ts',
	'--- a/dist/index.d.ts',
	'+++ b/dist/index.d.ts',
	'@@ -1 +1 @@',
	'-export declare const canvas: false;',
	'+export declare const canvas: true;',
	'diff --git a/dist/cjs/client.js b/dist/cjs/client.js',
	'--- a/dist/cjs/client.js',
	'+++ b/dist/cjs/client.js',
	'@@ -1 +1 @@',
	'-exports.canvas = false;',
	'+exports.canvas = true;',
	'diff --git a/dist/helper.js b/dist/helper.js',
	'new file mode 100644',
	'--- /dev/null',
	'+++ b/dist/helper.js',
	'@@ -0,0 +1 @@',
	'+export const retained = null;',
	'',
].join('\n');

function hash(contents: string): string {
	return createHash('sha256').update(contents).digest('hex');
}

function hashes(files: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
	return Object.fromEntries(Object.entries(files).map(([file, contents]) => [file, hash(contents)]));
}

function writeFiles(directory: string, files: Readonly<Record<string, string>>): void {
	for (const [file, contents] of Object.entries(files)) {
		const target = path.join(directory, file);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, contents);
	}
}

function fixture(t: TestContext) {
	const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-sdk-canvas-patch-')));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const scopes = ['', 'remote'];
	const packages = scopes.map(scope => path.join(root, scope, 'node_modules', '@github', 'copilot-sdk'));
	for (const directory of packages) {
		writeFiles(directory, before);
	}
	const manifestPath = path.join(root, 'build', 'npm', 'copilot-sdk-canvas.json');
	const manifest: CopilotSdkCanvasPatchManifest = {
		schemaVersion: 1,
		packageName: '@github/copilot-sdk',
		packageVersion: '1.0.13',
		patchFile: 'copilot-sdk-canvas.patch',
		patchSha256: hash(patch),
		before: hashes(before),
		after: hashes(after),
	};
	const saveManifest = (value: CopilotSdkCanvasPatchManifest) => writeFiles(root, {
		'build/npm/copilot-sdk-canvas.json': JSON.stringify(value),
	});
	saveManifest(manifest);
	writeFiles(root, { 'build/npm/copilot-sdk-canvas.patch': patch });
	return { root, packages, manifestPath, manifest, saveManifest };
}

function readFiles(directory: string, files: Readonly<Record<string, string>>): Record<string, string> {
	return Object.fromEntries(Object.keys(files).map(file => [file, fs.readFileSync(path.join(directory, file), 'utf8')]));
}

suite('Copilot SDK canvas dependency patch', () => {
	test('installs both complete packages and verifies repeated/cached application without rewriting', t => {
		const data = fixture(t);
		const applied = ensureCopilotSdkCanvasPatch(data.root);
		const timestamp = new Date(1000);
		for (const directory of data.packages) {
			fs.utimesSync(path.join(directory, 'dist/client.js'), timestamp, timestamp);
		}
		const repeated = ensureCopilotSdkCanvasPatch(data.root);
		const checked = ensureCopilotSdkCanvasPatch(data.root, { checkOnly: true });
		assert.deepStrictEqual({
			applied: applied.map(item => item.status),
			repeated: repeated.map(item => item.status),
			checked: checked.map(item => item.status),
			files: data.packages.map(directory => readFiles(directory, after)),
			timestamps: data.packages.map(directory => fs.statSync(path.join(directory, 'dist/client.js')).mtimeMs),
			siblings: data.packages.map(directory => fs.readdirSync(path.dirname(directory))),
		}, {
			applied: ['applied', 'applied'],
			repeated: ['verified', 'verified'],
			checked: ['verified', 'verified'],
			files: [after, after],
			timestamps: [1000, 1000],
			siblings: [['copilot-sdk'], ['copilot-sdk']],
		});
	});

	test('check-only refuses an unpatched install without writing it', t => {
		const data = fixture(t);
		assert.throws(() => ensureCopilotSdkCanvasPatch(data.root, { checkOnly: true }), /not installed/);
		assert.deepStrictEqual(data.packages.map(directory => readFiles(directory, before)), [before, before]);
	});

	test('a corrupt second target prevents modification of the first target', t => {
		const data = fixture(t);
		fs.writeFileSync(path.join(data.packages[1], 'dist/client.js'), 'unexpected\n');
		assert.throws(() => ensureCopilotSdkCanvasPatch(data.root), /Unexpected or partially patched/);
		assert.deepStrictEqual(readFiles(data.packages[0], before), before);
	});

	test('rejects a partially patched package', t => {
		const data = fixture(t);
		fs.writeFileSync(path.join(data.packages[0], 'dist/index.d.ts'), after['dist/index.d.ts']);
		assert.throws(() => ensureCopilotSdkCanvasPatch(data.root), /Unexpected or partially patched/);
		assert.strictEqual(fs.readFileSync(path.join(data.packages[0], 'dist/client.js'), 'utf8'), before['dist/client.js']);
	});

	test('rejects a corrupt delta before touching packages', t => {
		const data = fixture(t);
		fs.appendFileSync(path.join(path.dirname(data.manifestPath), 'copilot-sdk-canvas.patch'), 'corrupt');
		assert.throws(() => ensureCopilotSdkCanvasPatch(data.root), /recorded SHA-256/);
		assert.deepStrictEqual(data.packages.map(directory => readFiles(directory, before)), [before, before]);
	});

	test('a mismatched postimage leaves both originals intact and removes staging', t => {
		const data = fixture(t);
		data.saveManifest({ ...data.manifest, after: { ...data.manifest.after, 'dist/helper.js': hash('different\n') } });
		assert.throws(() => ensureCopilotSdkCanvasPatch(data.root), /expected complete package/);
		assert.deepStrictEqual({
			files: data.packages.map(directory => readFiles(directory, before)),
			siblings: data.packages.map(directory => fs.readdirSync(path.dirname(directory))),
		}, { files: [before, before], siblings: [['copilot-sdk'], ['copilot-sdk']] });
	});

	test('restores the original package when replacement fails', t => {
		const data = fixture(t);
		const failure = new Error('Replacement failed');
		assert.throws(() => ensureCopilotSdkCanvasPatch(data.root, {
			fileOperations: {
				renameSync: (source, target) => {
					if (target === data.packages[0] && path.basename(source.toString()) === 'package') {
						throw failure;
					}
					fs.renameSync(source, target);
				},
				rmSync: fs.rmSync,
			},
		}), error => error === failure);
		assert.deepStrictEqual({
			files: data.packages.map(directory => readFiles(directory, before)),
			siblings: data.packages.map(directory => fs.readdirSync(path.dirname(directory))),
		}, { files: [before, before], siblings: [['copilot-sdk'], ['copilot-sdk']] });
	});

	test('preserves the original backup and both errors when rollback fails', t => {
		const data = fixture(t);
		const replacementFailure = new Error('Replacement failed');
		const rollbackFailure = new Error('Rollback failed');
		assert.throws(() => ensureCopilotSdkCanvasPatch(data.root, {
			fileOperations: {
				renameSync: (source, target) => {
					if (target === data.packages[0]) {
						throw path.basename(source.toString()) === 'package' ? replacementFailure : rollbackFailure;
					}
					fs.renameSync(source, target);
				},
				rmSync: fs.rmSync,
			},
		}), error => {
			assert.ok(error instanceof AggregateError);
			assert.deepStrictEqual(error.errors, [replacementFailure, rollbackFailure]);
			assert.match(error.message, /original package is retained/);
			return true;
		});
		const stagingName = fs.readdirSync(path.dirname(data.packages[0])).find(name => name.startsWith('.copilot-sdk-canvas-'));
		assert.ok(stagingName);
		const staging = path.join(path.dirname(data.packages[0]), stagingName);
		assert.deepStrictEqual({
			packageExists: fs.existsSync(data.packages[0]),
			original: readFiles(path.join(staging, 'original'), before),
			candidate: readFiles(path.join(staging, 'package'), after),
			remote: readFiles(data.packages[1], before),
		}, { packageExists: false, original: before, candidate: after, remote: before });
	});

	test('reports cleanup failure without hiding the original preparation error', t => {
		const data = fixture(t);
		const cleanupFailure = new Error('Cleanup failed');
		data.saveManifest({ ...data.manifest, after: { ...data.manifest.after, 'dist/helper.js': hash('different\n') } });
		assert.throws(() => ensureCopilotSdkCanvasPatch(data.root, {
			fileOperations: { renameSync: fs.renameSync, rmSync: () => { throw cleanupFailure; } },
		}), error => {
			assert.ok(error instanceof AggregateError);
			assert.strictEqual(error.errors.length, 2);
			assert.ok(error.errors[0] instanceof Error);
			assert.match(error.errors[0].message, /expected complete package/);
			assert.strictEqual(error.errors[1], cleanupFailure);
			return true;
		});
		assert.deepStrictEqual(data.packages.map(directory => readFiles(directory, before)), [before, before]);
	});

	test('surfaces post-replacement cleanup failure and permits a later repair', t => {
		const data = fixture(t);
		const cleanupFailure = new Error('Cleanup failed');
		assert.throws(() => ensureCopilotSdkCanvasPatch(data.root, {
			fileOperations: { renameSync: fs.renameSync, rmSync: () => { throw cleanupFailure; } },
		}), error => error === cleanupFailure);
		const stagingName = fs.readdirSync(path.dirname(data.packages[0])).find(name => name.startsWith('.copilot-sdk-canvas-'));
		assert.ok(stagingName);
		const backup = path.join(path.dirname(data.packages[0]), stagingName, 'original');
		assert.deepStrictEqual({
			root: readFiles(data.packages[0], after),
			remote: readFiles(data.packages[1], before),
			backup: readFiles(backup, before),
		}, { root: after, remote: before, backup: before });
		assert.deepStrictEqual({
			statuses: ensureCopilotSdkCanvasPatch(data.root).map(item => item.status),
			files: data.packages.map(directory => readFiles(directory, after)),
			backup: readFiles(backup, before),
		}, { statuses: ['verified', 'applied'], files: [after, after], backup: before });
	});

	test('includes an existing distro remote dependency tree', t => {
		const data = fixture(t);
		const distro = path.join(data.root, '.build', 'distro', 'npm', 'remote', 'node_modules', '@github', 'copilot-sdk');
		writeFiles(distro, before);
		assert.deepStrictEqual({
			applied: ensureCopilotSdkCanvasPatch(data.root).map(item => item.status),
			checked: ensureCopilotSdkCanvasPatch(data.root, { checkOnly: true }).map(item => item.status),
			files: [...data.packages, distro].map(directory => readFiles(directory, after)),
		}, { applied: ['applied', 'applied', 'applied'], checked: ['verified', 'verified', 'verified'], files: [after, after, after] });
	});

	test('an incomplete distro remote tree prevents modification of every target', t => {
		const data = fixture(t);
		fs.mkdirSync(path.join(data.root, '.build', 'distro', 'npm', 'remote'), { recursive: true });
		assert.throws(() => ensureCopilotSdkCanvasPatch(data.root), /Missing dependency directory/);
		assert.deepStrictEqual(data.packages.map(directory => readFiles(directory, before)), [before, before]);
	});

	test('rejects undeclared nested-dependency changes before copying or patching', t => {
		const data = fixture(t);
		for (const directory of data.packages) {
			writeFiles(directory, { 'node_modules/untouched/package.json': '{"name":"untouched"}\n' });
		}
		const modifiedPatch = patch + [
			'diff --git a/node_modules/untouched/package.json b/node_modules/untouched/package.json',
			'--- a/node_modules/untouched/package.json',
			'+++ b/node_modules/untouched/package.json',
			'@@ -1 +1 @@',
			'-{"name":"untouched"}',
			'+{"name":"changed"}',
			'',
		].join('\n');
		fs.writeFileSync(path.join(path.dirname(data.manifestPath), 'copilot-sdk-canvas.patch'), modifiedPatch);
		data.saveManifest({ ...data.manifest, patchSha256: hash(modifiedPatch) });
		assert.throws(() => ensureCopilotSdkCanvasPatch(data.root), /unexpected file/);
		assert.deepStrictEqual(data.packages.map(directory => ({
			files: readFiles(directory, before),
			dependency: fs.readFileSync(path.join(directory, 'node_modules', 'untouched', 'package.json'), 'utf8'),
		})), [
			{ files: before, dependency: '{"name":"untouched"}\n' },
			{ files: before, dependency: '{"name":"untouched"}\n' },
		]);
	});

	test('rejects symlink creation in the generated delta', t => {
		const data = fixture(t);
		const modifiedPatch = patch.replace('new file mode 100644', 'new file mode 120000');
		fs.writeFileSync(path.join(path.dirname(data.manifestPath), 'copilot-sdk-canvas.patch'), modifiedPatch);
		data.saveManifest({ ...data.manifest, patchSha256: hash(modifiedPatch) });
		assert.throws(() => ensureCopilotSdkCanvasPatch(data.root), /cannot contain symlinks/);
		assert.deepStrictEqual(data.packages.map(directory => readFiles(directory, before)), [before, before]);
	});

	test('rejects path traversal and package metadata replacement', t => {
		const data = fixture(t);
		data.saveManifest({ ...data.manifest, after: { ...data.manifest.after, '../outside': hash('x') } });
		assert.throws(() => ensureCopilotSdkCanvasPatch(data.root), /Invalid .* manifest/);
		data.saveManifest({ ...data.manifest, after: { ...data.manifest.after, 'package.json': hash('{}') } });
		assert.throws(() => ensureCopilotSdkCanvasPatch(data.root), /preserve published package metadata/);
		assert.deepStrictEqual(data.packages.map(directory => readFiles(directory, before)), [before, before]);
	});

	for (const link of ['node_modules', 'package', 'sdk-directory']) {
		test(`refuses a ${link} symlink without modifying its target`, t => {
			const data = fixture(t);
			const directory = link === 'node_modules'
				? path.join(data.root, 'node_modules')
				: link === 'package' ? data.packages[0] : path.join(data.packages[0], 'dist');
			const original = path.join(data.root, 'original');
			fs.renameSync(directory, original);
			fs.symlinkSync(original, directory, process.platform === 'win32' ? 'junction' : 'dir');
			assert.throws(() => ensureCopilotSdkCanvasPatch(data.root), /symlinked|Unexpected SDK package entry/);
			const client = link === 'node_modules' ? ['@github', 'copilot-sdk', 'dist', 'client.js']
				: link === 'package' ? ['dist', 'client.js'] : ['client.js'];
			assert.strictEqual(
				fs.readFileSync(path.join(original, ...client), 'utf8'),
				before['dist/client.js'],
			);
		});
	}

	test('preserves nested dependencies without patching or following their links', t => {
		const data = fixture(t);
		const dependency = path.join(data.root, 'dependency');
		writeFiles(dependency, { 'package.json': '{"name":"untouched"}\n' });
		for (const directory of data.packages) {
			fs.mkdirSync(path.join(directory, 'node_modules'));
			fs.symlinkSync(dependency, path.join(directory, 'node_modules', 'untouched'), process.platform === 'win32' ? 'junction' : 'dir');
		}
		const links = data.packages.map(directory => fs.readlinkSync(path.join(directory, 'node_modules', 'untouched')));
		ensureCopilotSdkCanvasPatch(data.root);
		assert.deepStrictEqual(data.packages.map(directory => ({
			link: fs.readlinkSync(path.join(directory, 'node_modules', 'untouched')),
			contents: fs.readFileSync(path.join(directory, 'node_modules', 'untouched', 'package.json'), 'utf8'),
		})), [
			{ link: links[0], contents: '{"name":"untouched"}\n' },
			{ link: links[1], contents: '{"name":"untouched"}\n' },
		]);
	});

	test('the patched package resolves both ESM and CommonJS exports', t => {
		const data = fixture(t);
		ensureCopilotSdkCanvasPatch(data.root);
		const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
			import assert from 'node:assert/strict';
			import { createRequire } from 'node:module';
			import { canvas } from '@github/copilot-sdk';
			const require = createRequire(import.meta.url);
			assert.equal(canvas, true);
			assert.equal(require('@github/copilot-sdk').canvas, true);
		`], { cwd: data.root, encoding: 'utf8' });
		assert.strictEqual(result.status, 0, result.stderr);
	});

	test('the patched declarations resolve through the published export map', t => {
		const data = fixture(t);
		ensureCopilotSdkCanvasPatch(data.root);
		const source = path.join(data.root, 'consumer.mts');
		fs.writeFileSync(source, 'import { canvas } from "@github/copilot-sdk";\nconst supported: true = canvas;\n');
		const compilerEntry = Object.entries(typescriptPackage.bin).find(([name]) => /^tsc\d*$/.test(name));
		assert.ok(compilerEntry, 'The installed TypeScript package must declare a compiler executable.');
		const compiler = path.resolve(path.dirname(fileURLToPath(import.meta.resolve('typescript/package.json'))), compilerEntry[1]);
		const result = spawnSync(process.execPath, [compiler, '--noEmit', '--module', 'nodenext', '--target', 'es2024', source], {
			cwd: data.root,
			encoding: 'utf8',
		});
		assert.strictEqual(result.status, 0, result.stdout + result.stderr);
	});

	test('install-state inputs include the carrier, payload and both postinstall paths', t => {
		const data = fixture(t);
		assert.deepStrictEqual(
			collectInputFiles(data.root).map(file => path.relative(data.root, file).split(path.sep).join('/')).filter(file => file.startsWith('build/npm/')),
			[
				'build/npm/postinstall.ts',
				'build/npm/fast-install.ts',
				'build/npm/installStateHash.ts',
				'build/npm/copilotSdkCanvasPatch.ts',
				'build/npm/copilot-sdk-canvas.json',
				'build/npm/copilot-sdk-canvas.patch',
			],
		);
	});

	test('changing the generated payload invalidates the install-state hash', t => {
		const data = fixture(t);
		const first = computeState({ repositoryRoot: data.root });
		fs.appendFileSync(path.join(path.dirname(data.manifestPath), 'copilot-sdk-canvas.patch'), '\n');
		const second = computeState({ repositoryRoot: data.root });
		assert.notStrictEqual(first.fileHashes['build/npm/copilot-sdk-canvas.patch'], second.fileHashes['build/npm/copilot-sdk-canvas.patch']);
	});

	test('CI dependency cache keys bind every postinstall input and reject missing inputs', t => {
		const data = fixture(t);
		for (const dir of dirs) {
			writeFiles(path.join(data.root, dir), {
				'package.json': '{"private":true,"type":"module"}\n',
				'package-lock.json': '{"packages":{}}\n',
				'.npmrc': '',
			});
		}
		writeFiles(data.root, { 'build/.cachesalt': 'canvas-cache-fixture\n' });
		const inputs = collectInputFiles(data.root).map(file => path.relative(data.root, file)).filter(file => file.startsWith(path.join('build', 'npm') + path.sep));
		const calculator = 'build/azure-pipelines/common/computeNodeModulesCacheKey.ts';
		for (const file of [calculator, 'build/npm/dirs.ts', ...inputs.filter(file => file.endsWith('.ts'))]) {
			writeFiles(data.root, { [file]: fs.readFileSync(path.resolve(import.meta.dirname, '../../..', file), 'utf8') });
		}
		const run = () => spawnSync(process.execPath, [path.join(data.root, calculator), 'compile', process.arch], {
			cwd: data.root,
			encoding: 'utf8',
		});
		const key = () => {
			const result = run();
			assert.strictEqual(result.status, 0, result.stdout + result.stderr);
			return result.stdout;
		};
		const initial = key();
		const changed = inputs.map(file => {
			const target = path.join(data.root, file);
			const contents = fs.readFileSync(target);
			fs.appendFileSync(target, '\n');
			const invalidated = key() !== initial;
			fs.writeFileSync(target, contents);
			return invalidated;
		});
		const restored = key();
		fs.unlinkSync(data.manifestPath);
		const missing = run();
		assert.deepStrictEqual({
			keyLength: initial.length,
			changed,
			restored: restored === initial,
			missing: { status: missing.status, reported: missing.stderr.includes('copilot-sdk-canvas.json') },
			packages: data.packages.map(directory => readFiles(directory, before)),
		}, {
			keyLength: 64,
			changed: inputs.map(() => true),
			restored: true,
			missing: { status: 1, reported: true },
			packages: [before, before],
		});
	});

	test('ignores an inherited Git context and an enclosing repository', t => {
		const data = fixture(t);
		const initialized = spawnSync('git', ['init', '--quiet', '--initial-branch=ulugbekna/sdk-patch-fixture', data.root], { encoding: 'utf8' });
		assert.strictEqual(initialized.status, 0, initialized.stderr);
		const helper = pathToFileURL(path.resolve(import.meta.dirname, '../../npm/copilotSdkCanvasPatch.ts')).href;
		const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
			import { ensureCopilotSdkCanvasPatch } from ${JSON.stringify(helper)};
			ensureCopilotSdkCanvasPatch(${JSON.stringify(data.root)});
		`], {
			cwd: data.root,
			env: {
				...process.env,
				GIT_DIR: path.join(data.root, 'not-a-repository'),
				GIT_WORK_TREE: path.join(data.root, 'not-the-package'),
				GIT_INDEX_FILE: path.join(data.root, 'unused-index'),
			},
			encoding: 'utf8',
		});
		assert.strictEqual(result.status, 0, result.stdout + result.stderr);
		assert.deepStrictEqual(data.packages.map(directory => readFiles(directory, after)), [after, after]);
		assert.strictEqual(fs.existsSync(path.join(data.root, 'unused-index')), false);
	});

	test('the real fast-install cached path still installs and verifies the SDK delta', t => {
		const data = fixture(t);
		writeFiles(data.root, { 'package.json': '{"private":true,"type":"module"}\n', '.nvmrc': process.versions.node });
		for (const file of ['fast-install.ts', 'installStateHash.ts', 'copilotSdkCanvasPatch.ts', 'dirs.ts']) {
			fs.copyFileSync(path.resolve(import.meta.dirname, '../../npm', file), path.join(data.root, 'build', 'npm', file));
		}
		const hashModule = pathToFileURL(path.join(data.root, 'build', 'npm', 'installStateHash.ts')).href;
		const saved = spawnSync(process.execPath, ['--input-type=module', '-e', `
			import { writeFileSync } from 'node:fs';
			import { computeState, stateFile } from ${JSON.stringify(hashModule)};
			writeFileSync(stateFile, JSON.stringify(computeState()));
		`], { cwd: data.root, encoding: 'utf8' });
		assert.strictEqual(saved.status, 0, saved.stdout + saved.stderr);
		const bin = path.join(data.root, 'bin');
		fs.mkdirSync(bin);
		const npm = path.join(bin, process.platform === 'win32' ? 'npm.cmd' : 'npm');
		fs.writeFileSync(npm, process.platform === 'win32' ? '@echo off\r\nexit /b 99\r\n' : '#!/bin/sh\nexit 99\n', { mode: 0o755 });
		const result = spawnSync(process.execPath, [path.join(data.root, 'build', 'npm', 'fast-install.ts')], {
			cwd: data.root,
			env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` },
			encoding: 'utf8',
			timeout: 10000,
		});
		assert.strictEqual(result.status, 0, result.stdout + result.stderr);
		assert.match(result.stdout, /All dependencies up to date/);
		assert.deepStrictEqual(data.packages.map(directory => readFiles(directory, after)), [after, after]);
	});
});
