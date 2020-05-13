/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as codesign from 'electron-osx-sign';
import * as path from 'path';
import * as util from '../lib/util';
import * as product from '../../product.json';

async function main(): Promise<void> {
	const buildDir = process.env['AGENT_BUILDDIRECTORY'];

	if (!buildDir) {
		throw new Error('$AGENT_BUILDDIRECTORY not set');
	}

	const appRoot = path.join(buildDir, 'VSCode-darwin');
	const appName = product.nameLong + '.app';
	const appFrameworkPath = path.join(appRoot, appName, 'Contents', 'Frameworks');
	const helperAppBaseName = product.nameShort;
	const gpuHelperAppName = helperAppBaseName + ' Helper (GPU).app';
	const pluginHelperAppName = helperAppBaseName + ' Helper (Plugin).app';
	const rendererHelperAppName = helperAppBaseName + ' Helper (Renderer).app';

	const defaultOpts: codesign.SignOptions = {
		app: path.join(appRoot, appName),
		platform: 'darwin',
		entitlements: path.join(__dirname, 'azure-pipelines', 'darwin', 'app-entitlements.plist'),
		hardenedRuntime: true,
		'pre-auto-entitlements': false,
		'pre-embed-provisioning-profile': false,
		keychain: path.join(buildDir, 'buildagent.keychain'),
		version: util.getElectronVersion(),
		identity: '99FM488X57',
		'gatekeeper-assess': false
	};

	const appOpts = {
		...defaultOpts,
		// TODO(deepak1556): Incorrectly declared type in electron-osx-sign
		ignore: (filePath: string) => {
			return filePath.includes(gpuHelperAppName) ||
				filePath.includes(pluginHelperAppName) ||
				filePath.includes(rendererHelperAppName);
		}
	};

	const gpuHelperOpts: codesign.SignOptions = {
		...defaultOpts,
		app: path.join(appFrameworkPath, gpuHelperAppName),
		entitlements: path.join(__dirname, 'azure-pipelines', 'darwin', 'helper-gpu-entitlements.plist'),
		'entitlements-inherit': path.join(__dirname, 'azure-pipelines', 'darwin', 'helper-gpu-entitlements.plist'),
	};

	const pluginHelperOpts: codesign.SignOptions = {
		...defaultOpts,
		app: path.join(appFrameworkPath, pluginHelperAppName),
		entitlements: path.join(__dirname, 'azure-pipelines', 'darwin', 'helper-plugin-entitlements.plist'),
		'entitlements-inherit': path.join(__dirname, 'azure-pipelines', 'darwin', 'helper-plugin-entitlements.plist'),
	};

	const rendererHelperOpts: codesign.SignOptions = {
		...defaultOpts,
		app: path.join(appFrameworkPath, rendererHelperAppName),
		entitlements: path.join(__dirname, 'azure-pipelines', 'darwin', 'helper-renderer-entitlements.plist'),
		'entitlements-inherit': path.join(__dirname, 'azure-pipelines', 'darwin', 'helper-renderer-entitlements.plist'),
	};

	await codesign.signAsync(appOpts as any);
	await codesign.signAsync(gpuHelperOpts);
	await codesign.signAsync(pluginHelperOpts);
	await codesign.signAsync(rendererHelperOpts);
}

if (require.main === module) {
	main().catch(err => {
		console.error(err);
		process.exit(1);
	});
}
