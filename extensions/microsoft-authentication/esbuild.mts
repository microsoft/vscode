/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'node:fs';
import * as path from 'node:path';
import { run } from '../esbuild-extension-common.mts';

const srcDir = path.join(import.meta.dirname, 'src');
const outDir = path.join(import.meta.dirname, 'dist');

const isWindows = process.platform === 'win32';
const isMacOS = process.platform === 'darwin';
const isLinux = !isWindows && !isMacOS;

const windowsArches = ['x64', 'arm64'];
const linuxArches = ['x64'];

const arch = process.env.VSCODE_ARCH || process.arch;

const msalRuntimeDistDir = path.join(import.meta.dirname, 'node_modules', '@azure', 'msal-node-runtime', 'dist');
const isMsalBinary = (file: string) => /^(lib)?msal.*\.(node|dll|dylib|so)$/.test(file);

/**
 * Copy every MSAL native binary from `srcDir` into `destDir` (created if needed).
 * No-op if `srcDir` does not exist (unsupported platform/arch).
 */
async function copyMsalBinaries(srcDir: string, destDir: string): Promise<void> {
	let files: string[];
	try {
		files = await fs.promises.readdir(srcDir);
	} catch {
		return;
	}
	await fs.promises.mkdir(destDir, { recursive: true });
	for (const file of files) {
		if (isMsalBinary(file)) {
			await fs.promises.copyFile(path.join(srcDir, file), path.join(destDir, file));
		}
	}
}

/**
 * Copy the native MSAL runtime broker binaries into the extension output directory, where MSAL's
 * `require('./msal-node-runtime')` resolves them.
 *
 * For Windows and macOS the target arch can differ from the build host (cross-arch / universal builds),
 * so we copy the binaries for the specific target arch out of the package's `dist/<platform>/<arch>/`.
 * Linux binaries are distro-specific, and `@azure/msal-node-runtime`'s own install script
 * (`copyBinaries.js`) already selects and flattens the correct binary for the build machine into the
 * package's `dist/` root — so we use the package as-is and copy those flattened binaries.
 */
async function copyNativeMsalFiles(outDir: string): Promise<void> {
	if (isWindows && windowsArches.includes(arch)) {
		await copyMsalBinaries(path.join(msalRuntimeDistDir, 'windows', arch), outDir);
	} else if (isMacOS) {
		await copyMsalBinaries(path.join(msalRuntimeDistDir, 'macos', arch), outDir);
	} else if (isLinux && linuxArches.includes(arch)) {
		await copyMsalBinaries(msalRuntimeDistDir, outDir);
	}
}

run({
	platform: 'node',
	entryPoints: {
		'extension': path.join(srcDir, 'extension.ts'),
	},
	srcDir,
	outdir: outDir,
	additionalOptions: {
		external: ['vscode', 'electron', './msal-node-runtime'],
		alias: {
			'keytar': path.resolve(import.meta.dirname, 'packageMocks', 'keytar', 'index.js'),
		},
	},
}, process.argv, copyNativeMsalFiles);
