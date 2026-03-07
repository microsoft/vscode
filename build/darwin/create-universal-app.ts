/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import fs from 'fs';
import minimatch from 'minimatch';
import { makeUniversalApp } from 'vscode-universal-bundler';

const root = path.dirname(path.dirname(import.meta.dirname));

async function main(buildDir?: string) {
	const arch = process.env['VSCODE_ARCH'];

	if (!buildDir) {
		throw new Error('Build dir not provided');
	}

	const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));
	const appName = product.nameLong + '.app';
	const x64AppPath = path.join(buildDir, 'VSCode-darwin-x64', appName);
	const arm64AppPath = path.join(buildDir, 'VSCode-darwin-arm64', appName);
	const asarRelativePath = path.join('Contents', 'Resources', 'app', 'node_modules.asar');
	const outAppPath = path.join(buildDir, `VSCode-darwin-${arch}`, appName);
	const productJsonPath = path.resolve(outAppPath, 'Contents', 'Resources', 'app', 'product.json');

	// Copilot SDK ships platform-specific binaries in separate npm packages with
	// architecture in the package name (e.g. @github/copilot-darwin-x64,
	// @github/copilot-darwin-arm64). npm only installs the one matching the host,
	// so the x64 build is missing @github/copilot-darwin-arm64 and vice-versa.
	//
	// The universal app merger requires both builds to have identical file trees.
	// To satisfy that, we copy each missing copilot platform package from the
	// other build. The binaries are then excluded from comparison (filesToSkip)
	// and the x64 binary is tagged as arch-specific (x64ArchFiles) so the merger
	// keeps both.
	//
	// This workaround would go away if the SDK moved to a single @github/copilot
	// package with the binary at a fixed path (like @vscode/ripgrep does).
	for (const plat of ['darwin-x64', 'darwin-arm64']) {
		for (const base of [
			path.join('Contents', 'Resources', 'app', 'node_modules'),
			path.join('Contents', 'Resources', 'app', 'node_modules.asar.unpacked'),
		]) {
			const rel = path.join(base, '@github', `copilot-${plat}`);
			const inX64 = path.join(x64AppPath, rel);
			const inArm64 = path.join(arm64AppPath, rel);

			if (fs.existsSync(inX64) && !fs.existsSync(inArm64)) {
				fs.mkdirSync(path.dirname(inArm64), { recursive: true });
				fs.cpSync(inX64, inArm64, { recursive: true });
			} else if (fs.existsSync(inArm64) && !fs.existsSync(inX64)) {
				fs.mkdirSync(path.dirname(inX64), { recursive: true });
				fs.cpSync(inArm64, inX64, { recursive: true });
			}
		}
	}

	const filesToSkip = [
		'**/CodeResources',
		'**/Credits.rtf',
		'**/policies/{*.mobileconfig,**/*.plist}',
		'**/node_modules/@github/copilot-darwin-x64/**',
		'**/node_modules/@github/copilot-darwin-arm64/**',
		'**/node_modules.asar.unpacked/@github/copilot-darwin-x64/**',
		'**/node_modules.asar.unpacked/@github/copilot-darwin-arm64/**',
	];

	await makeUniversalApp({
		x64AppPath,
		arm64AppPath,
		asarPath: asarRelativePath,
		outAppPath,
		force: true,
		mergeASARs: true,
		x64ArchFiles: '{*/kerberos.node,**/extensions/microsoft-authentication/dist/libmsalruntime.dylib,**/extensions/microsoft-authentication/dist/msal-node-runtime.node,**/node_modules/@github/copilot-darwin-*/copilot}',
		filesToSkipComparison: (file: string) => {
			for (const expected of filesToSkip) {
				if (minimatch(file, expected)) {
					return true;
				}
			}
			return false;
		}
	});

	const productJson = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
	Object.assign(productJson, {
		darwinUniversalAssetId: 'darwin-universal'
	});
	fs.writeFileSync(productJsonPath, JSON.stringify(productJson, null, '\t'));
}

if (import.meta.main) {
	main(process.argv[2]).catch(err => {
		console.error(err);
		process.exit(1);
	});
}
