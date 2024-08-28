/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';
import * as minimatch from 'minimatch';
import { makeUniversalApp } from 'vscode-universal-bundler';
import { spawn } from '@malept/cross-spawn-promise';
import { isESM } from '../lib/esm';

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
	const asarRelativePath = path.join('Contents', 'Resources', 'app', 'node_modules.asar');
	const outAppPath = path.join(buildDir, `VSCode-darwin-${arch}`, appName);
	const productJsonPath = path.resolve(outAppPath, 'Contents', 'Resources', 'app', 'product.json');

	const filesToSkip = [
		'**/CodeResources',
		'**/Credits.rtf',
	];

	const canAsar = !isESM('ASAR disabled in universal build'); // TODO@esm ASAR disabled in ESM

	await makeUniversalApp({
		x64AppPath,
		arm64AppPath,
		asarPath: canAsar ? asarRelativePath : undefined,
		outAppPath,
		force: true,
		mergeASARs: canAsar,
		x64ArchFiles: '*/kerberos.node',
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
