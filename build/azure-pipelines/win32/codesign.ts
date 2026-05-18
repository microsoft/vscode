/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { $, usePwsh } from 'zx';
import { printBanner, spawnCodesignProcess, streamProcessOutputAndCheckResult } from '../common/codesign.ts';
import { e } from '../common/publish.ts';

// These prebuilt native modules are shipped pre-signed by GitHub in the
// @github/copilot SDK. signtool's append (/as) path rejects them with
// 0x800700C1 (ERROR_BAD_EXE_FORMAT), failing the whole ESRP submission.
// Move them aside before signing and restore them after.
const COPILOT_PREBUILT_NODE_FILES = ['runtime.node', 'win32-native.node', 'icu-native.node'];
const COPILOT_PREBUILT_RELDIR = path.join(
	'@github', 'copilot', 'sdk', 'prebuilds'
);

function findCopilotPrebuiltNodes(rootDir: string): string[] {
	const results: string[] = [];
	if (!fs.existsSync(rootDir)) {
		return results;
	}
	const walk = (dir: string) => {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.isFile() && COPILOT_PREBUILT_NODE_FILES.includes(entry.name)) {
				const normalized = full.replace(/\\/g, '/');
				if (normalized.includes(COPILOT_PREBUILT_RELDIR.replace(/\\/g, '/') + '/win32-')) {
					results.push(full);
				}
			}
		}
	};
	walk(rootDir);
	return results;
}

// `fs.renameSync` fails with EXDEV when src and dest live on different volumes
// (the build agent has artifacts on D: but os.tmpdir() is on C:). Fall back to
// copy + unlink in that case.
function moveFileCrossDevice(src: string, dest: string): void {
	try {
		fs.renameSync(src, dest);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'EXDEV') {
			throw err;
		}
		fs.copyFileSync(src, dest);
		fs.unlinkSync(src);
	}
}

function stashCopilotPrebuilts(folders: string[]): Array<{ original: string; stashed: string }> {
	const stash = path.join(os.tmpdir(), `copilot-prebuilds-${crypto.randomBytes(8).toString('hex')}`);
	fs.mkdirSync(stash, { recursive: true });
	const moved: Array<{ original: string; stashed: string }> = [];
	for (const folder of folders) {
		for (const file of findCopilotPrebuiltNodes(folder)) {
			const stashed = path.join(stash, crypto.randomBytes(8).toString('hex') + '-' + path.basename(file));
			moveFileCrossDevice(file, stashed);
			moved.push({ original: file, stashed });
			console.log(`[codesign] excluded from signing (pre-signed upstream): ${file}`);
		}
	}
	return moved;
}

function restoreCopilotPrebuilts(moved: Array<{ original: string; stashed: string }>): void {
	for (const { original, stashed } of moved) {
		try {
			moveFileCrossDevice(stashed, original);
		} catch (err) {
			console.error(`[codesign] failed to restore ${original} from ${stashed}: ${err}`);
		}
	}
}

async function main() {
	usePwsh();

	const arch = e('VSCODE_ARCH');
	const esrpCliDLLPath = e('EsrpCliDllPath');
	const codeSigningFolderPath = e('CodeSigningFolderPath');

	// Temporarily move pre-signed Copilot SDK native modules out of the sign roots
	// to work around signtool 0x800700C1 (ERROR_BAD_EXE_FORMAT) on these files.
	const signFolders = codeSigningFolderPath.split(',').map(f => f.trim()).filter(f => f.length > 0);
	const stashed = stashCopilotPrebuilts(signFolders);

	// Start the code sign processes in parallel
	// 1. Codesign executables and shared libraries
	// 2. Codesign Powershell scripts
	// 3. Codesign context menu appx package (insiders only)
	try {
		const codesignTask1 = spawnCodesignProcess(esrpCliDLLPath, 'sign-windows', codeSigningFolderPath, '*.dll,*.exe,*.node');
		const codesignTask2 = spawnCodesignProcess(esrpCliDLLPath, 'sign-windows-appx', codeSigningFolderPath, '*.ps1,*.psm1,*.psd1,*.ps1xml');
		const codesignTask3 = process.env['VSCODE_QUALITY'] !== 'exploration'
			? spawnCodesignProcess(esrpCliDLLPath, 'sign-windows-appx', codeSigningFolderPath, '*.appx')
			: undefined;

		// Codesign executables and shared libraries
		printBanner('Codesign executables and shared libraries');
		await streamProcessOutputAndCheckResult('Codesign executables and shared libraries', codesignTask1);

		// Codesign Powershell scripts
		printBanner('Codesign Powershell scripts');
		await streamProcessOutputAndCheckResult('Codesign Powershell scripts', codesignTask2);

		if (codesignTask3) {
			// Codesign context menu appx package
			printBanner('Codesign context menu appx package');
			await streamProcessOutputAndCheckResult('Codesign context menu appx package', codesignTask3);
		}
	} finally {
		// Restore the pre-signed Copilot SDK native modules so they ship in the
		// packaged artifacts below.
		restoreCopilotPrebuilts(stashed);
	}

	// Create build artifact directory
	await $`New-Item -ItemType Directory -Path .build/win32-${arch} -Force`;

	// Package client
	if (process.env['BUILT_CLIENT']) {
		printBanner('Package client');
		const clientArchivePath = `.build/win32-${arch}/VSCode-win32-${arch}.zip`;
		await $`7z.exe a -tzip ${clientArchivePath} ../VSCode-win32-${arch}/* "-xr!CodeSignSummary*.md"`.pipe(process.stdout);
		await $`7z.exe l ${clientArchivePath}`.pipe(process.stdout);
	}

	// Package server
	if (process.env['BUILT_SERVER']) {
		printBanner('Package server');
		const serverArchivePath = `.build/win32-${arch}/vscode-server-win32-${arch}.zip`;
		await $`7z.exe a -tzip ${serverArchivePath} ../vscode-server-win32-${arch}`.pipe(process.stdout);
		await $`7z.exe l ${serverArchivePath}`.pipe(process.stdout);
	}

	// Package server (web)
	if (process.env['BUILT_WEB']) {
		printBanner('Package server (web)');
		const webArchivePath = `.build/win32-${arch}/vscode-server-win32-${arch}-web.zip`;
		await $`7z.exe a -tzip ${webArchivePath} ../vscode-server-win32-${arch}-web`.pipe(process.stdout);
		await $`7z.exe l ${webArchivePath}`.pipe(process.stdout);
	}

	// Sign setup
	if (process.env['BUILT_CLIENT']) {
		printBanner('Sign setup packages (system, user)');
		const task = $`npm exec -- npm-run-all2 -lp "gulp vscode-win32-${arch}-system-setup -- --sign" "gulp vscode-win32-${arch}-user-setup -- --sign"`;
		await streamProcessOutputAndCheckResult('Sign setup packages (system, user)', task);
	}
}

main().then(() => {
	process.exit(0);
}, err => {
	console.error(`ERROR: ${err}`);
	process.exit(1);
});
