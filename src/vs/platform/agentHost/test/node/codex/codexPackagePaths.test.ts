/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
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
			// four segments up to recover `<root>` for resolveCodexBinaryPath.
			const root = join('home', 'me', 'vscode');
			const pkgJson = join(root, 'node_modules', '@openai', 'codex', 'package.json');
			assert.strictEqual(await resolveCodexDevSdkRoot(() => pkgJson), root);
		});

		test('returns undefined when resolution throws (e.g. built product without the devDependency)', async () => {
			assert.strictEqual(await resolveCodexDevSdkRoot(() => { throw new Error('Cannot find module'); }), undefined);
		});
	});

	suite('resolveCodexBinaryPath', () => {
		let root: string;
		let mainPackage: string;

		setup(async () => {
			root = await realpath(await mkdtemp(join(tmpdir(), 'codex-package-paths-')));
			mainPackage = join(root, 'node_modules', '@openai', 'codex');
		});

		teardown(async () => {
			await rm(root, { recursive: true, force: true });
		});

		async function writePackage(packageDir: string): Promise<void> {
			await mkdir(packageDir, { recursive: true });
			await writeFile(join(packageDir, 'package.json'), JSON.stringify({ name: '@openai/codex' }));
		}

		async function writeBinary(packageDir: string, triple = 'x86_64-unknown-linux-musl', binaryName = 'codex', mode = 0o755): Promise<string> {
			const binDir = join(packageDir, 'vendor', triple, 'bin');
			await mkdir(binDir, { recursive: true });
			const binaryPath = join(binDir, binaryName);
			await writeFile(binaryPath, '', { mode });
			return binaryPath;
		}

		test('resolves a hoisted platform dependency', async () => {
			await writePackage(mainPackage);
			const platformPackage = join(root, 'node_modules', '@openai', 'codex-linux-x64');
			await writePackage(platformPackage);
			const binaryPath = await writeBinary(platformPackage);
			assert.strictEqual(await resolveCodexBinaryPath(root, 'linux-x64'), binaryPath);
		});

		test('resolves a nested platform dependency', async () => {
			await writePackage(mainPackage);
			const hoistedPackage = join(root, 'node_modules', '@openai', 'codex-linux-x64');
			await writePackage(hoistedPackage);
			await writeBinary(hoistedPackage);
			const platformPackage = join(mainPackage, 'node_modules', '@openai', 'codex-linux-x64');
			await writePackage(platformPackage);
			const binaryPath = await writeBinary(platformPackage);
			assert.strictEqual(await resolveCodexBinaryPath(root, 'linux-x64'), binaryPath);
		});

		test('resolves a symlinked main package and its private platform alias', async () => {
			// pnpm keeps the platform alias in the main package's private dependency tree.
			const storedMain = join(root, 'store', 'main', 'node_modules', '@openai', 'codex');
			const storedPlatform = join(root, 'store', 'platform', 'node_modules', '@openai', 'codex');
			await writePackage(storedMain);
			await writePackage(storedPlatform);
			const binaryPath = await writeBinary(storedPlatform);
			await mkdir(join(root, 'node_modules', '@openai'), { recursive: true });
			await symlink(storedMain, mainPackage, 'junction');
			await symlink(storedPlatform, join(root, 'store', 'main', 'node_modules', '@openai', 'codex-linux-x64'), 'junction');
			assert.strictEqual(await resolveCodexBinaryPath(root, 'linux-x64'), binaryPath);
		});

		test('uses the selected SDK when multiple installations exist', async () => {
			const roots = [root, join(root, 'other-sdk')];
			const expected: string[] = [];
			for (const sdkRoot of roots) {
				await writePackage(join(sdkRoot, 'node_modules', '@openai', 'codex'));
				const platformPackage = join(sdkRoot, 'node_modules', '@openai', 'codex-linux-x64');
				await writePackage(platformPackage);
				expected.push(await writeBinary(platformPackage));
			}
			assert.deepStrictEqual(await Promise.all(roots.map(sdkRoot => resolveCodexBinaryPath(sdkRoot, 'linux-x64'))), expected);
		});

		test('falls back to the main package vendor directory', async () => {
			await writePackage(mainPackage);
			const binaryPath = await writeBinary(mainPackage);
			assert.strictEqual(await resolveCodexBinaryPath(root, 'linux-x64'), binaryPath);
		});

		test('prefers the platform package over the main package vendor directory', async () => {
			await writePackage(mainPackage);
			await writeBinary(mainPackage);
			const platformPackage = join(root, 'node_modules', '@openai', 'codex-linux-x64');
			await writePackage(platformPackage);
			const binaryPath = await writeBinary(platformPackage);
			assert.strictEqual(await resolveCodexBinaryPath(root, 'linux-x64'), binaryPath);
		});

		test('rejects a missing platform binary instead of using the main package vendor directory', async () => {
			await writePackage(mainPackage);
			await writeBinary(mainPackage);
			await writePackage(join(root, 'node_modules', '@openai', 'codex-linux-x64'));
			await assert.rejects(resolveCodexBinaryPath(root, 'linux-x64'), /Codex binary not executable:.*codex-linux-x64/);
		});

		test('rejects when neither package provides a binary', async () => {
			await writePackage(mainPackage);
			await assert.rejects(resolveCodexBinaryPath(root, 'linux-x64'), /Codex binary not executable:/);
		});

		test('does not hide an invalid platform package behind the vendor fallback', async () => {
			await writePackage(mainPackage);
			await writeBinary(mainPackage);
			const platformPackage = join(root, 'node_modules', '@openai', 'codex-linux-x64');
			await mkdir(platformPackage, { recursive: true });
			await writeFile(join(platformPackage, 'package.json'), '{');
			await assert.rejects(resolveCodexBinaryPath(root, 'linux-x64'), { code: 'ERR_INVALID_PACKAGE_CONFIG' });
		});

		test('does not resolve a different main package from an ancestor directory', async () => {
			await writePackage(mainPackage);
			await writeBinary(mainPackage);
			await assert.rejects(resolveCodexBinaryPath(join(root, 'missing-sdk'), 'linux-x64'), { code: 'ENOENT' });
		});

		test('uses the Windows executable name for a Windows target', async () => {
			await writePackage(mainPackage);
			const platformPackage = join(root, 'node_modules', '@openai', 'codex-win32-arm64');
			await writePackage(platformPackage);
			const binaryPath = await writeBinary(platformPackage, 'aarch64-pc-windows-msvc', 'codex.exe');
			assert.strictEqual(await resolveCodexBinaryPath(root, 'win32-arm64'), binaryPath);
		});

		(isWindows ? test.skip : test)('rejects a binary without executable permission', async () => {
			await writePackage(mainPackage);
			await writeBinary(mainPackage, 'x86_64-unknown-linux-musl', 'codex', 0o644);
			await assert.rejects(resolveCodexBinaryPath(root, 'linux-x64'), /Codex binary not executable:/);
		});
	});
});
