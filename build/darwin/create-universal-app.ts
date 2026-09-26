/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import fs from 'fs';
import minimatch from 'minimatch';
import { makeUniversalApp } from 'vscode-universal-bundler';

const root = path.dirname(path.dirname(import.meta.dirname));

const nodeModulesBases = [
	path.join('Contents', 'Resources', 'app', 'node_modules'),
	path.join('Contents', 'Resources', 'app', 'node_modules.asar.unpacked')
];

/**
 * Ensures a directory exists in both the x64 and arm64 app bundles by copying
 * it from whichever build has it to the one that does not. This is needed for
 * platform-specific native module directories that npm only installs for the
 * host architecture.
 */
function crossCopyPlatformDir(x64AppPath: string, arm64AppPath: string, relativePath: string): void {
	const inX64 = path.join(x64AppPath, relativePath);
	const inArm64 = path.join(arm64AppPath, relativePath);

	if (fs.existsSync(inX64) && !fs.existsSync(inArm64)) {
		fs.mkdirSync(inArm64, { recursive: true });
		fs.cpSync(inX64, inArm64, { recursive: true });
	} else if (fs.existsSync(inArm64) && !fs.existsSync(inX64)) {
		fs.mkdirSync(inX64, { recursive: true });
		fs.cpSync(inArm64, inX64, { recursive: true });
	}
}

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
	
	crossCopyPlatformDir(x64AppPath, arm64AppPath, path.join('Contents', 'Resources', 'app', 'node-compile-cache'));

	// Platform-specific packages and binaries definition for dynamic iteration
	for (const plat of ['darwin-x64', 'darwin-arm64']) {
		for (const base of nodeModulesBases) {
			const githubPackages = [
				path.join('@github', `copilot-${plat}`),
				path.join('@github', `copilot-sdk-${plat}`),
				path.join('@github', 'copilot', 'prebuilds', plat),
				path.join('@github', 'copilot', 'tgrep', 'bin', plat),
				path.join('@github', 'copilot', 'sdk', 'tgrep', 'bin', plat)
			];

			const vscodePackages = [
				path.join('@vscode', `os-proxy-resolver-${plat}`),
				path.join('@vscode', 'ripgrep-universal', 'bin', plat)
			];

			for (const pkgPath of [...githubPackages, ...vscodePackages]) {
				crossCopyPlatformDir(x64AppPath, arm64AppPath, path.join(base, pkgPath));
			}
		}

		const copilotExtensionNodeModules = path.join('Contents', 'Resources', 'app', 'extensions', 'copilot', 'node_modules');
		const copilotExtensionBinaries = [
			path.join('@github', 'copilot', 'sdk', 'prebuilds', plat),
			path.join('@github', 'copilot', 'sdk', 'ripgrep', 'bin', plat),
			path.join('@github', 'copilot', 'sdk', 'tgrep', 'bin', plat),
			path.join('@github', 'copilot', 'tgrep', 'bin', plat)
		];

		for (const extBin of copilotExtensionBinaries) {
			crossCopyPlatformDir(x64AppPath, arm64AppPath, path.join(copilotExtensionNodeModules, extBin));
		}
	}

	for (const base of nodeModulesBases) {
		for (const mxcArch of ['x64', 'arm64']) {
			crossCopyPlatformDir(x64AppPath, arm64AppPath, path.join(base, '@microsoft', 'mxc-sdk', 'bin', mxcArch));
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
		'**/node_modules/@github/copilot-sdk-darwin-x64/**',
		'**/node_modules/@github/copilot-sdk-darwin-arm64/**',
		'**/node_modules.asar.unpacked/@github/copilot-sdk-darwin-x64/**',
		'**/node_modules.asar.unpacked/@github/copilot-sdk-darwin-arm64/**',
		'**/node_modules/@vscode/os-proxy-resolver-darwin-x64/**',
		'**/node_modules/@vscode/os-proxy-resolver-darwin-arm64/**',
		'**/node_modules.asar.unpacked/@vscode/os-proxy-resolver-darwin-x64/**',
		'**/node_modules.asar.unpacked/@vscode/os-proxy-resolver-darwin-arm64/**',
		'**/node_modules/@github/copilot/prebuilds/darwin-x64/**',
		'**/node_modules/@github/copilot/prebuilds/darwin-arm64/**',
		'**/node_modules.asar.unpacked/@github/copilot/prebuilds/darwin-x64/**',
		'**/node_modules.asar.unpacked/@github/copilot/prebuilds/darwin-arm64/**',
		'**/node_modules/@github/copilot/tgrep/bin/darwin-x64/**',
		'**/node_modules/@github/copilot/tgrep/bin/darwin-arm64/**',
		'**/node_modules.asar.unpacked/@github/copilot/tgrep/bin/darwin-x64/**',
		'**/node_modules.asar.unpacked/@github/copilot/tgrep/bin/darwin-arm64/**',
		'**/node_modules/@github/copilot/sdk/tgrep/bin/darwin-x64/**',
		'**/node_modules/@github/copilot/sdk/tgrep/bin/darwin-arm64/**',
		'**/node_modules.asar.unpacked/@github/copilot/sdk/tgrep/bin/darwin-x64/**',
		'**/node_modules.asar.unpacked/@github/copilot/sdk/tgrep/bin/darwin-arm64/**',
		'**/node_modules/@github/copilot/sdk/prebuilds/darwin-x64/**',
		'**/node_modules/@github/copilot/sdk/prebuilds/darwin-arm64/**',
		'**/node_modules/@github/copilot/sdk/ripgrep/bin/darwin-x64/**',
		'**/node_modules/@github/copilot/sdk/ripgrep/bin/darwin-arm64/**',
		'**/node_modules/@vscode/ripgrep-universal/bin/darwin-x64/**',
		'**/node_modules/@vscode/ripgrep-universal/bin/darwin-arm64/**',
		'**/node_modules.asar.unpacked/@vscode/ripgrep-universal/bin/darwin-x64/**',
		'**/node_modules.asar.unpacked/@vscode/ripgrep-universal/bin/darwin-arm64/**',
		'**/node_modules/@microsoft/mxc-sdk/bin/**',
		'**/node_modules.asar.unpacked/@microsoft/mxc-sdk/bin/**',
	];

	await makeUniversalApp({
		x64AppPath,
		arm64AppPath,
		asarPath: asarRelativePath,
		outAppPath,
		force: true,
		mergeASARs: true,
		singleArchFiles: '{**/@github/copilot-darwin-*,**/@github/copilot-darwin-*/**,**/@github/copilot-sdk-darwin-*,**/@github/copilot-sdk-darwin-*/**,**/@github/copilot/prebuilds/darwin-*,**/@github/copilot/prebuilds/darwin-*/**,**/@github/copilot/tgrep/bin/darwin-*,**/@github/copilot/tgrep/bin/darwin-*/**,**/@github/copilot/sdk/tgrep/bin/darwin-*,**/@github/copilot/sdk/tgrep/bin/darwin-*/**,**/@github/copilot/sdk/prebuilds/darwin-*,**/@github/copilot/sdk/prebuilds/darwin-*/**,**/@github/copilot/sdk/ripgrep/bin/darwin-*,**/@github/copilot/sdk/ripgrep/bin/darwin-*/**,**/@vscode/ripgrep-universal/bin/darwin-*,**/@vscode/ripgrep-universal/bin/darwin-*/**,**/@vscode/os-proxy-resolver-darwin-*,**/@vscode/os-proxy-resolver-darwin-*/**,**/@microsoft/mxc-sdk/bin/*,**/@microsoft/mxc-sdk/bin/*/**}',
		x64ArchFiles: '{*/kerberos.node,**/extensions/microsoft-authentication/dist/libmsalruntime.dylib,**/extensions/microsoft-authentication/dist/msal-node-runtime.node,**/node_modules/@github/copilot-darwin-*/**,**/node_modules/@github/copilot-sdk-darwin-*/**,**/node_modules/@github/copilot/prebuilds/darwin-*/*,**/node_modules/@github/copilot/tgrep/bin/darwin-*/*,**/node_modules/@github/copilot/sdk/tgrep/bin/darwin-*/*,**/node_modules.asar.unpacked/@github/copilot-darwin-*/**,**/node_modules.asar.unpacked/@github/copilot-sdk-darwin-*/**,**/node_modules.asar.unpacked/@github/copilot/prebuilds/darwin-*/*,**/node_modules.asar.unpacked/@github/copilot/tgrep/bin/darwin-*/*,**/node_modules.asar.unpacked/@github/copilot/sdk/tgrep/bin/darwin-*/*,**/extensions/copilot/node_modules/@github/copilot/sdk/prebuilds/darwin-*/*,**/extensions/copilot/node_modules/@github/copilot/sdk/ripgrep/bin/darwin-*/*,**/extensions/copilot/node_modules/@github/copilot/sdk/tgrep/bin/darwin-*/*,**/extensions/copilot/node_modules/@github/copilot/tgrep/bin/darwin-*/*,**/node_modules/@vscode/ripgrep-universal/bin/darwin-*/*,**/node_modules.asar.unpacked/@vscode/ripgrep-universal/bin/darwin-*/*,**/node_modules/@vscode/os-proxy-resolver-darwin-*/**,**/node_modules.asar.unpacked/@vscode/os-proxy-resolver-darwin-*/**,**/node_modules/@microsoft/mxc-sdk/bin/**,**/node_modules.asar.unpacked/@microsoft/mxc-sdk/bin/**}',
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
