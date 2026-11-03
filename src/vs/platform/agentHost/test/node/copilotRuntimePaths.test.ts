/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, realpath, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, relative } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getRandomTestPath } from '../../../../base/test/node/testUtils.js';
import { resolveCopilotRuntimePaths } from '../../node/copilot/copilotRuntimePaths.js';

suite('resolveCopilotRuntimePaths', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let testDir: string;

	setup(() => {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'copilotRuntimePaths');
	});

	teardown(() => rm(testDir, { recursive: true, force: true }));

	/**
	 * Creates the `@github/copilot-sdk-<platform>` packages of every platform candidate of this
	 * machine in `scopeDir`.
	 */
	async function createPlatformPackages(scopeDir: string): Promise<void> {
		const candidates = process.platform === 'linux' ? [`linux-${process.arch}`, `linuxmusl-${process.arch}`] : [`${process.platform}-${process.arch}`];
		const runtimeName = process.platform === 'win32' ? 'copilot-runtime.exe' : 'copilot-runtime';
		for (const candidate of candidates) {
			const packageDir = join(scopeDir, `copilot-sdk-${candidate}`);
			const prebuildsDir = join(packageDir, 'prebuilds', candidate);
			await mkdir(prebuildsDir, { recursive: true });
			await writeFile(join(prebuildsDir, runtimeName), '');
			await writeFile(join(prebuildsDir, 'runtime.node'), '');
			await mkdir(join(packageDir, 'copilot-sdk'), { recursive: true });
			await writeFile(join(packageDir, 'copilot-sdk', 'index.js'), '');
		}
	}

	test('finds the platform package in the @github folder of node_modules', async () => {
		const scopeDir = join(testDir, 'node_modules', '@github');
		await createPlatformPackages(scopeDir);

		const { runtimePath } = await resolveCopilotRuntimePaths(URI.file(join(testDir, 'node_modules')));

		assert.strictEqual(relative(scopeDir, runtimePath).startsWith('copilot-sdk-'), true, runtimePath);
	});

	test('finds the platform package next to the real folder of @github/copilot-sdk', async () => {
		// pnpm's isolated layout links only the direct dependencies into node_modules; the optional
		// dependencies of @github/copilot-sdk are next to its real folder in the virtual store.
		const storeScopeDir = join(testDir, 'node_modules', '.pnpm', '@github+copilot-sdk@1.0.0', 'node_modules', '@github');
		await mkdir(join(storeScopeDir, 'copilot-sdk'), { recursive: true });
		await createPlatformPackages(storeScopeDir);
		await mkdir(join(testDir, 'node_modules', '@github'), { recursive: true });
		await symlink(join(storeScopeDir, 'copilot-sdk'), join(testDir, 'node_modules', '@github', 'copilot-sdk'), 'junction');

		const { runtimePath } = await resolveCopilotRuntimePaths(URI.file(join(testDir, 'node_modules')));

		assert.strictEqual(relative(await realpath(storeScopeDir), runtimePath).startsWith('copilot-sdk-'), true, runtimePath);
	});
});
