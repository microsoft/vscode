/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';
import { makeUniversalApp } from 'vscode-universal-bundler';
import { spawn } from '@malept/cross-spawn-promise';

const root = path.dirname(path.dirname(__dirname));

async function main(buildDir?: string) {
	const arch = process.env['VSCODE_ARCH'];

	if (!buildDir) {
		throw new Error('Build dir not provided');
	}

	const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));
	const appName = product.nameLong + '.app';
	const x64AppPath = path.join(buildDir, 'VSCode-darwin-x64', appName);
	const arm64AppPath = path.join(buildDir, 'VSCode-darwin-arm64', appName);
	const x64AsarPath = path.join(x64AppPath, 'Contents', 'Resources', 'app', 'node_modules.asar');
	const arm64AsarPath = path.join(arm64AppPath, 'Contents', 'Resources', 'app', 'node_modules.asar');
	const outAppPath = path.join(buildDir, `VSCode-darwin-${arch}`, appName);
	const productJsonPath = path.resolve(outAppPath, 'Contents', 'Resources', 'app', 'product.json');

	await makeUniversalApp({
		x64AppPath,
		arm64AppPath,
		x64AsarPath,
		arm64AsarPath,
		filesToSkip: [
			'product.json',
			'Credits.rtf',
			'CodeResources',
			'fsevents.node',
			'Info.plist', // TODO@deepak1556: regressed with 11.4.2 internal builds
			'MainMenu.nib', // Generated sequence is not deterministic with Xcode 13
			'.npmrc'
		],
		outAppPath,
		force: true
	});

	const productJson = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
	Object.assign(productJson, {
		darwinUniversalAssetId: 'darwin-universal'
	});
	fs.writeFileSync(productJsonPath, JSON.stringify(productJson, null, '\t'));

	// Verify if native module architecture is correct
	const findOutput = await spawn('find', [outAppPath, '-name', 'kerberos.node']);
	const lipoOutput = await spawn('lipo', ['-archs', findOutput.replace(/\n$/, '')]);
	if (lipoOutput.replace(/\n$/, '') !== 'x86_64 arm64') {
		throw new Error(`Invalid arch, got : ${lipoOutput}`);
	}
}

if (require.main === module) {
	main(process.argv[2]).catch(err => {
		console.error(err);
		process.exit(1);
	});
}
