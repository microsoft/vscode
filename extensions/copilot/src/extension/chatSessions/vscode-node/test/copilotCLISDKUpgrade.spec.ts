/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import { isBinaryFile } from 'isbinaryfile';
import * as path from 'path';
import { beforeAll, describe, it } from 'vitest';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { copyNodePtyFiles } from '../../copilotcli/node/nodePtyShim';
import { copyRipgrepShim } from '../../copilotcli/node/ripgrepShim';

describe('CopilotCLI SDK Upgrade', function () {
	const extensionPath = path.join(__dirname, '..', '..', '..', '..', '..');
	const copilotSDKPath = path.join(extensionPath, 'node_modules', '@github', 'copilot');
	beforeAll(async function () {
		await copyBinaries(extensionPath);
	});
	it('should be able to load the SDK without errors', async function () {
		await import('@github/copilot/sdk');
	});

	it('should not contain new native binaries nor removed native binaries', async function () {
		// This is a very basic check to ensure that when the Copilot CLI SDK is upgraded,
		// we are aware of any changes to the native binaries it contains.
		// Such changes may require us to update our extension packaging or other handling.
		const existingBinaries = new Set(await findAllBinaries(copilotSDKPath));
		const knownBinaries = new Set([
			// node-pty related files (already accounted for in SDK, using VS Code node-pty).
			path.join('prebuilds', 'darwin-arm64', 'pty.node'),
			path.join('prebuilds', 'darwin-x64', 'pty.node'),
			path.join('prebuilds', 'linux-arm64', 'pty.node'),
			path.join('prebuilds', 'linux-x64', 'pty.node'),
			path.join('prebuilds', 'win32-arm64', 'conpty', 'OpenConsole.exe'),
			path.join('prebuilds', 'win32-arm64', 'conpty', 'conpty.dll'),
			path.join('prebuilds', 'win32-arm64', 'conpty.node'),
			path.join('prebuilds', 'win32-arm64', 'conpty.pdb'),
			path.join('prebuilds', 'win32-arm64', 'conpty_console_list.node'),
			path.join('prebuilds', 'win32-arm64', 'conpty_console_list.pdb'),
			path.join('prebuilds', 'win32-x64', 'conpty', 'OpenConsole.exe'),
			path.join('prebuilds', 'win32-x64', 'conpty', 'conpty.dll'),
			path.join('prebuilds', 'win32-x64', 'conpty.node'),
			path.join('prebuilds', 'win32-x64', 'conpty.pdb'),
			path.join('prebuilds', 'win32-x64', 'conpty_console_list.node'),
			path.join('prebuilds', 'win32-x64', 'conpty_console_list.pdb'),
			// ripgrep
			path.join('ripgrep', 'bin', 'win32-arm64', 'rg.exe'),
			path.join('ripgrep', 'bin', 'win32-x64', 'rg.exe'),
			path.join('prebuilds', 'darwin-arm64', 'spawn-helper'),
			path.join('prebuilds', 'darwin-x64', 'spawn-helper'),
			path.join('ripgrep', 'bin', 'darwin-arm64', 'rg'),
			path.join('ripgrep', 'bin', 'darwin-x64', 'rg'),
			path.join('ripgrep', 'bin', 'linux-x64', 'rg'),
			path.join('ripgrep', 'bin', 'linux-arm64', 'rg'),
			// sharp related files
			path.join('sharp', 'node_modules', '@img', 'sharp-wasm32', 'lib', 'sharp-wasm32.node.wasm'),
			// sharp related files, files copied by us.
			path.join('sdk', 'sharp', 'node_modules', '@img', 'sharp-wasm32', 'lib', 'sharp-wasm32.node.wasm'),
			// parsing commands for shell.
			'tree-sitter-bash.wasm',
			'tree-sitter-powershell.wasm',
			'tree-sitter.wasm',
			'tree-sitter-c_sharp.wasm',
			'tree-sitter-c.wasm',
			'tree-sitter-cpp.wasm',
			'tree-sitter-css.wasm',
			'tree-sitter-html.wasm',
			'tree-sitter-java.wasm',
			'tree-sitter-php.wasm',
			'tree-sitter-go.wasm',
			'tree-sitter-json.wasm',
			'tree-sitter-javascript.wasm',
			'tree-sitter-python.wasm',
			'tree-sitter-ruby.wasm',
			'tree-sitter-tsx.wasm',
			'tree-sitter-rust.wasm',
			'tree-sitter-typescript.wasm',
			'tree-sitter-scala.wasm',
		].map(p => path.join(copilotSDKPath, p)));

		// Exclude ripgrep files that we copy over in src/extension/agents/copilotcli/node/ripgrepShim.ts (until we get better API/solution from SDK)
		const ripgrepFilesWeCopy = path.join(copilotSDKPath, 'sdk', 'ripgrep', 'bin');
		// Exclude nodepty files that we copy over in src/extension/agents/copilotcli/node/nodePtyShim.ts (until we get better API/solution from SDK)
		const nodeptyFilesWeCopy = path.join(copilotSDKPath, 'sdk', 'prebuilds');

		const errors: string[] = [];
		// Look for new binaries
		for (const binary of existingBinaries) {
			if (binary.startsWith(ripgrepFilesWeCopy) || binary.startsWith(nodeptyFilesWeCopy)) {
				continue;
			}
			const binaryName = path.basename(binary);
			if (binaryName.startsWith('keytar') || binaryName.startsWith('clipboard')) {
				continue;
			}
			if (!knownBinaries.has(binary)) {
				errors.push(`Unexpected native binary found in Copilot CLI SDK: ${path.relative(copilotSDKPath, binary)}`);
			}
		}
		// Look for removed binaries.
		for (const binary of knownBinaries) {
			if (binary.startsWith(ripgrepFilesWeCopy) || binary.startsWith(nodeptyFilesWeCopy)) {
				continue;
			}
			if (!existingBinaries.has(binary)) {
				errors.push(`Expected native binary missing from Copilot CLI SDK: ${path.relative(copilotSDKPath, binary)}`);
			}
		}

		if (errors.length > 0) {
			throw new Error(errors.join('\n'));
		}
	});

	it('should be able to load the @github/copilot module without errors', async function () {
		await copyNodePtyFiles(
			extensionPath,
			path.join(copilotSDKPath, 'prebuilds', process.platform + '-' + process.arch),
			new TestLogService()
		);
		await import('@github/copilot/sdk');
	});
});

async function copyBinaries(extensionPath: string) {
	const nodePtyPrebuilds = path.join(extensionPath, 'node_modules', '@github', 'copilot', 'prebuilds', process.platform + '-' + process.arch);
	const vscodeRipgrepPath = path.join(extensionPath, 'node_modules', '@github', 'copilot', 'ripgrep', 'bin', process.platform + '-' + process.arch);
	await copyNodePtyFiles(extensionPath, nodePtyPrebuilds, new TestLogService());
	await copyRipgrepShim(extensionPath, vscodeRipgrepPath, new TestLogService());
}
async function findAllBinaries(dir: string): Promise<string[]> {
	const binaryFiles: string[] = [];
	const filesToIgnore = ['.DS_Store'];
	async function findFilesRecursively(dir: string): Promise<void> {
		try {
			await fs.access(dir);
		} catch {
			return;
		}

		const entries = await fs.readdir(dir, { withFileTypes: true });
		await Promise.all(entries.map(async (entry) => {
			const fullPath = path.join(dir, entry.name);
			if (filesToIgnore.includes(entry.name)) {
				return;
			}
			if (entry.isDirectory()) {
				await findFilesRecursively(fullPath);
			} else if (entry.isFile()) {
				const isBinary = await isBinaryFile(fullPath);
				if (isBinary) {
					binaryFiles.push(fullPath);
				}
			}
		}));
	}

	await findFilesRecursively(dir);
	return binaryFiles;
}
