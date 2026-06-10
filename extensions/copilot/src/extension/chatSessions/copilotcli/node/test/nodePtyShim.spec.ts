/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LogServiceImpl } from '../../../../../platform/log/common/logService';
import { copyNodePtyFiles, resolveNodePtySourcePath } from '../nodePtyShim';

describe('nodePtyShim', () => {
	let testDir: string;
	const logService = new LogServiceImpl([]);

	beforeEach(async () => {
		testDir = await mkdtemp(join(tmpdir(), 'copilot-node-pty-shim-'));
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	it('prefers build output when present', async () => {
		const buildDir = join(testDir, 'node_modules', 'node-pty', 'build', 'Release');
		const prebuildDir = join(testDir, 'node_modules', 'node-pty', 'prebuilds', process.platform + '-' + process.arch);
		await mkdir(buildDir, { recursive: true });
		await mkdir(prebuildDir, { recursive: true });

		await expect(resolveNodePtySourcePath(testDir, logService)).resolves.toBe(buildDir);
	});

	it('falls back to prebuilds when build output is absent', async () => {
		const prebuildDir = join(testDir, 'node_modules', 'node-pty', 'prebuilds', process.platform + '-' + process.arch);
		await mkdir(prebuildDir, { recursive: true });

		await expect(resolveNodePtySourcePath(testDir, logService)).resolves.toBe(prebuildDir);
	});

	it('throws when node-pty binaries are missing', async () => {
		await expect(resolveNodePtySourcePath(testDir, logService)).rejects.toThrow('Unable to find node-pty binaries');
	});

	it('copies node-pty files into the SDK prebuilds folder', async () => {
		const extensionPath = join(testDir, 'extension');
		const sourceDir = join(testDir, 'source');
		await mkdir(sourceDir, { recursive: true });
		await writeFile(join(sourceDir, 'pty.node'), 'native-binary');
		await writeFile(join(sourceDir, 'spawn-helper'), 'spawn-helper');

		await copyNodePtyFiles(extensionPath, sourceDir, logService);

		const sdkNodePtyDir = join(extensionPath, 'node_modules', '@github', 'copilot', 'sdk', 'prebuilds', process.platform + '-' + process.arch);
		await expect(readFile(join(sdkNodePtyDir, 'pty.node'), 'utf8')).resolves.toBe('native-binary');
		await expect(readFile(join(sdkNodePtyDir, 'spawn-helper'), 'utf8')).resolves.toBe('spawn-helper');
	});
});
