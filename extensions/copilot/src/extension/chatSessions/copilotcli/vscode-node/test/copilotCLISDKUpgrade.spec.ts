/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import { isBinaryFile } from 'isbinaryfile';
import * as path from 'path';
import { beforeAll, describe, it } from 'vitest';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';
import { copyRipgrepShim } from '../../../copilotcli/node/ripgrepShim';

describe('CopilotCLI SDK Upgrade', function () {
	const extensionPath = path.join(__dirname, '..', '..', '..', '..', '..', '..');
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
			// computer use
			path.join('prebuilds', 'darwin-arm64', 'computer.node'),
			path.join('prebuilds', 'darwin-x64', 'computer.node'),
			path.join('prebuilds', 'linux-arm64', 'computer.node'),
			path.join('prebuilds', 'linux-x64', 'computer.node'),
			path.join('prebuilds', 'win32-arm64', 'computer.node'),
			path.join('prebuilds', 'win32-x64', 'computer.node'),
			// win32 native module (formerly win_error_mode)
			path.join('prebuilds', 'win32-arm64', 'win32.node'),
			path.join('prebuilds', 'win32-x64', 'win32.node'),
			// Second copy of computer.node / win32.node re-shipped by the @github/copilot/sdk subpackage
			// (previously hidden by a broad sdk/prebuilds/** exclusion that masked the node-pty files we used to shim in at test setup).
			path.join('sdk', 'prebuilds', 'darwin-arm64', 'computer.node'),
			path.join('sdk', 'prebuilds', 'darwin-x64', 'computer.node'),
			path.join('sdk', 'prebuilds', 'linux-arm64', 'computer.node'),
			path.join('sdk', 'prebuilds', 'linux-x64', 'computer.node'),
			path.join('sdk', 'prebuilds', 'win32-arm64', 'computer.node'),
			path.join('sdk', 'prebuilds', 'win32-x64', 'computer.node'),
			path.join('sdk', 'prebuilds', 'win32-arm64', 'win32.node'),
			path.join('sdk', 'prebuilds', 'win32-x64', 'win32.node'),
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

		// Exclude ripgrep files that we copy over in src/extension/chatSessions/copilotcli/node/ripgrepShim.ts (until we get better API/solution from SDK)
		const ripgrepFilesWeCopy = path.join(copilotSDKPath, 'sdk', 'ripgrep', 'bin');

		const errors: string[] = [];
		// Look for new binaries
		for (const binary of existingBinaries) {
			if (binary.startsWith(ripgrepFilesWeCopy)) {
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
			if (binary.startsWith(ripgrepFilesWeCopy)) {
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
		await import('@github/copilot/sdk');
	});
});

async function copyBinaries(extensionPath: string) {
	const copilotSDKPath = path.join(extensionPath, 'node_modules', '@github', 'copilot');
	const vscodeRipgrepPath = path.join(copilotSDKPath, 'ripgrep', 'bin', process.platform + '-' + process.arch);
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
