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

const windowsArches = ['x64'];
const linuxArches = ['x64'];

let platformFolder: string;
switch (process.platform) {
	case 'win32': platformFolder = 'windows'; break;
	case 'darwin': platformFolder = 'macos'; break;
	case 'linux': platformFolder = 'linux'; break;
	default: throw new Error(`Unsupported platform: ${process.platform}`);
}

const arch = process.env.VSCODE_ARCH || process.arch;

/**
 * Copy native MSAL runtime binaries to the output directory.
 */
async function copyNativeMsalFiles(outDir: string): Promise<void> {
	if (
		!(isWindows && windowsArches.includes(arch)) &&
		!isMacOS &&
		!(isLinux && linuxArches.includes(arch))
	) {
		return;
	}

	const msalRuntimeDir = path.join(import.meta.dirname, 'node_modules', '@azure', 'msal-node-runtime', 'dist', platformFolder, arch);
	try {
		const files = await fs.promises.readdir(msalRuntimeDir);
		for (const file of files) {
			if (/^(lib)?msal.*\.(node|dll|dylib|so)$/.test(file)) {
				await fs.promises.copyFile(path.join(msalRuntimeDir, file), path.join(outDir, file));
			}
		}
	} catch {
		// Skip if directory doesn't exist (unsupported platform/arch)
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
		external: ['vscode', './msal-node-runtime'],
		alias: {
			'keytar': path.resolve(import.meta.dirname, 'packageMocks', 'keytar', 'index.js'),
		},
	},
}, process.argv, copyNativeMsalFiles);
