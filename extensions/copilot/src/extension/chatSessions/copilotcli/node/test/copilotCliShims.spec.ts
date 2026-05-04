/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LogServiceImpl } from '../../../../../platform/log/common/logService';
import { ensureCopilotCLIShims } from '../copilotCli';

describe('Copilot CLI shims', () => {
	let testDir: string;
	const logService = new LogServiceImpl([]);

	beforeEach(async () => {
		testDir = await mkdtemp(join(tmpdir(), 'copilot-cli-shims-'));
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	it('creates ripgrep and node-pty shims before SDK import', async () => {
		const extensionPath = join(testDir, 'extension');
		const vscodeAppRoot = join(testDir, 'app');
		const ripgrepSourceDir = join(vscodeAppRoot, 'node_modules', '@vscode', 'ripgrep', 'bin');
		const nodePtySourceDir = join(vscodeAppRoot, 'node_modules', 'node-pty', 'prebuilds', process.platform + '-' + process.arch);
		await mkdir(ripgrepSourceDir, { recursive: true });
		await mkdir(nodePtySourceDir, { recursive: true });
		await writeFile(join(ripgrepSourceDir, 'rg'), 'ripgrep');
		await writeFile(join(nodePtySourceDir, 'pty.node'), 'native-binary');
		await writeFile(join(nodePtySourceDir, 'spawn-helper'), 'spawn-helper');

		await ensureCopilotCLIShims(extensionPath, vscodeAppRoot, logService);

		await expect(readFile(join(extensionPath, 'node_modules', '@github', 'copilot', 'shims.txt'), 'utf8')).resolves.toBe('Shims created successfully');
		const sdkRipgrepDir = join(extensionPath, 'node_modules', '@github', 'copilot', 'sdk', 'ripgrep', 'bin', process.platform + '-' + process.arch);
		await expect(readFile(join(sdkRipgrepDir, 'rg'), 'utf8')).resolves.toBe('ripgrep');
		const sdkNodePtyDir = join(extensionPath, 'node_modules', '@github', 'copilot', 'sdk', 'prebuilds', process.platform + '-' + process.arch);
		await expect(readFile(join(sdkNodePtyDir, 'pty.node'), 'utf8')).resolves.toBe('native-binary');
		await expect(readFile(join(sdkNodePtyDir, 'spawn-helper'), 'utf8')).resolves.toBe('spawn-helper');
	});

	it('skips shim creation for bundled installs when shims.txt already exists', async () => {
		const extensionPath = join(testDir, 'extension');
		const vscodeAppRoot = join(testDir, 'app');
		const placeholder = join(extensionPath, 'node_modules', '@github', 'copilot', 'shims.txt');
		await mkdir(join(extensionPath, 'node_modules', '@github', 'copilot'), { recursive: true });
		await writeFile(placeholder, 'already created');

		await ensureCopilotCLIShims(extensionPath, vscodeAppRoot, logService);

		await expect(readFile(placeholder, 'utf8')).resolves.toBe('already created');
		await expect(stat(join(extensionPath, 'node_modules', '@github', 'copilot', 'sdk'))).rejects.toThrow();
	});
});
