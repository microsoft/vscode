/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, realpath, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, relative } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getRandomTestPath } from '../../../../../base/test/node/testUtils.js';
import { codexBinaryTriple, codexPackageSuffix, resolveCodexBinaryPath, resolveCodexDevSdkRoot } from '../../../node/codex/codexSdk.js';

suite('codex package paths', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('codexPackageSuffix', () => {

		test('every supported (platform, arch) returns the npm optionalDependencies suffix', () => {
			// The build pipeline and codexBinaryTriple both rely on the runtime
			// reaching exactly one of these strings. New supported platforms
			// must update this table, the build's `getSdkTargetForBuild`, AND
			// codexBinaryTriple in lockstep.
			assert.deepStrictEqual({
				'darwin-x64': codexPackageSuffix('darwin', 'x64'),
				'darwin-arm64': codexPackageSuffix('darwin', 'arm64'),
				'linux-x64': codexPackageSuffix('linux', 'x64'),
				'linux-arm64': codexPackageSuffix('linux', 'arm64'),
				'win32-x64': codexPackageSuffix('win32', 'x64'),
				'win32-arm64': codexPackageSuffix('win32', 'arm64'),
			}, {
				'darwin-x64': 'darwin-x64',
				'darwin-arm64': 'darwin-arm64',
				'linux-x64': 'linux-x64',
				'linux-arm64': 'linux-arm64',
				'win32-x64': 'win32-x64',
				'win32-arm64': 'win32-arm64',
			});
		});

		test('never returns a -musl suffix on Linux (Codex is statically musl-linked)', () => {
			// Regression guard: at one point during the per-platform refactor
			// the helper still appended `-musl` for musl Linux hosts. Codex's
			// `linux-<arch>` package serves both glibc and musl, so the suffix
			// must NOT be added.
			assert.strictEqual(codexPackageSuffix('linux', 'x64'), 'linux-x64');
			assert.strictEqual(codexPackageSuffix('linux', 'arm64'), 'linux-arm64');
		});

		test('returns undefined for unsupported platforms and architectures', () => {
			assert.strictEqual(codexPackageSuffix('freebsd' as NodeJS.Platform, 'x64'), undefined);
			assert.strictEqual(codexPackageSuffix('aix' as NodeJS.Platform, 'arm64'), undefined);
			assert.strictEqual(codexPackageSuffix('darwin', 'ia32'), undefined);
			assert.strictEqual(codexPackageSuffix('linux', 'arm'), undefined);
			assert.strictEqual(codexPackageSuffix('win32', 'mips'), undefined);
		});
	});

	suite('codexBinaryTriple', () => {

		test('every suffix produced by codexPackageSuffix maps to a rust target triple', () => {
			// The two helpers are paired: the downloader picks a package via
			// codexPackageSuffix, then this function tells _startConnection
			// which `vendor/<triple>/bin/codex` exists inside it. A suffix
			// without a matching triple would crash at spawn — so this test
			// guards the union.
			assert.deepStrictEqual({
				'linux-x64': codexBinaryTriple('linux-x64'),
				'linux-arm64': codexBinaryTriple('linux-arm64'),
				'darwin-x64': codexBinaryTriple('darwin-x64'),
				'darwin-arm64': codexBinaryTriple('darwin-arm64'),
				'win32-x64': codexBinaryTriple('win32-x64'),
				'win32-arm64': codexBinaryTriple('win32-arm64'),
			}, {
				'linux-x64': 'x86_64-unknown-linux-musl',
				'linux-arm64': 'aarch64-unknown-linux-musl',
				'darwin-x64': 'x86_64-apple-darwin',
				'darwin-arm64': 'aarch64-apple-darwin',
				'win32-x64': 'x86_64-pc-windows-msvc',
				'win32-arm64': 'aarch64-pc-windows-msvc',
			});
		});

		test('returns undefined for unknown suffixes', () => {
			assert.strictEqual(codexBinaryTriple('linux-x64-musl'), undefined);
			assert.strictEqual(codexBinaryTriple('darwin-arm'), undefined);
			assert.strictEqual(codexBinaryTriple(''), undefined);
		});
	});

	suite('resolveCodexDevSdkRoot', () => {

		test('returns the directory containing node_modules when @openai/codex resolves', async () => {
			// `require.resolve('@openai/codex/package.json')` yields
			// `<root>/node_modules/@openai/codex/package.json`; the helper walks
			// four segments up to recover `<root>` — the dir `_startConnection`
			// joins `node_modules/@openai/codex-<target>` onto.
			const root = join('home', 'me', 'vscode');
			const pkgJson = join(root, 'node_modules', '@openai', 'codex', 'package.json');
			assert.strictEqual(await resolveCodexDevSdkRoot(() => pkgJson), root);
		});

		test('returns undefined when resolution throws (e.g. built product without the devDependency)', async () => {
			assert.strictEqual(await resolveCodexDevSdkRoot(() => { throw new Error('Cannot find module'); }), undefined);
		});
	});

	suite('resolveCodexBinaryPath', () => {

		let testDir: string;

		setup(async () => {
			const dir = getRandomTestPath(tmpdir(), 'vsctests', 'codexPackagePaths');
			await mkdir(dir, { recursive: true });
			// The real path: the result of a link's real path is compared below (macOS's tmpdir is a link).
			testDir = await realpath(dir);
		});

		teardown(() => rm(testDir, { recursive: true, force: true }));

		/**
		 * Creates `@openai/codex` and its `darwin-arm64` platform package in the `node_modules`
		 * folder `nodeModules`.
		 */
		async function createCodexPackages(nodeModules: string): Promise<void> {
			await mkdir(join(nodeModules, '@openai', 'codex'), { recursive: true });
			const binDir = join(nodeModules, '@openai', 'codex-darwin-arm64', 'vendor', 'aarch64-apple-darwin', 'bin');
			await mkdir(binDir, { recursive: true });
			await writeFile(join(binDir, 'codex'), '');
		}

		test('finds the platform package next to @openai/codex (downloaded SDK, flat node_modules) or next to its real folder (pnpm\'s isolated layout), returns its real path, and otherwise returns the first path', async () => {
			const flatRoot = join(testDir, 'flat');
			await createCodexPackages(join(flatRoot, 'node_modules'));

			// pnpm's isolated layout: node_modules/@openai/codex links to the package in the virtual
			// store, whose own node_modules folder links to its optional dependencies, each in its own
			// folder of the virtual store.
			const isolatedRoot = join(testDir, 'isolated');
			const storeNodeModules = join(isolatedRoot, 'node_modules', '.pnpm', '@openai+codex@1.0.0', 'node_modules');
			const platformStoreNodeModules = join(isolatedRoot, 'node_modules', '.pnpm', '@openai+codex@1.0.0-darwin-arm64', 'node_modules');
			await createCodexPackages(platformStoreNodeModules);
			await mkdir(join(storeNodeModules, '@openai', 'codex'), { recursive: true });
			await symlink(join(platformStoreNodeModules, '@openai', 'codex-darwin-arm64'), join(storeNodeModules, '@openai', 'codex-darwin-arm64'), 'junction');
			await mkdir(join(isolatedRoot, 'node_modules', '@openai'), { recursive: true });
			await symlink(join(storeNodeModules, '@openai', 'codex'), join(isolatedRoot, 'node_modules', '@openai', 'codex'), 'junction');

			const missingRoot = join(testDir, 'missing');

			const resolve = async (root: string) => relative(testDir, await resolveCodexBinaryPath(root, 'darwin-arm64', 'aarch64-apple-darwin', 'darwin')).split('\\').join('/');
			assert.deepStrictEqual({
				flat: await resolve(flatRoot),
				isolated: await resolve(isolatedRoot),
				missing: await resolve(missingRoot),
			}, {
				flat: 'flat/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex',
				isolated: 'isolated/node_modules/.pnpm/@openai+codex@1.0.0-darwin-arm64/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex',
				missing: 'missing/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex',
			});
		});
	});
});
