/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import withDefaults, { nodePlugins } from '../shared.webpack.config.mjs';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import path from 'path';

const isWindows = process.platform === 'win32';
const isMacOS = process.platform === 'darwin';
const isLinux = !isWindows && !isMacOS;

const windowsArches = ['x64'];
const linuxArches = ['x64'];

let platformFolder;
switch (process.platform) {
	case 'win32':
		platformFolder = 'windows';
		break;
	case 'darwin':
		platformFolder = 'macos';
		break;
	case 'linux':
		platformFolder = 'linux';
		break;
	default:
		throw new Error(`Unsupported platform: ${process.platform}`);
}

const arch = process.env.VSCODE_ARCH || process.arch;
console.log(`Building Microsoft Authentication Extension for ${process.platform} (${arch})`);

const plugins = [...nodePlugins(import.meta.dirname)];
if (
	(isWindows && windowsArches.includes(arch)) ||
	isMacOS ||
	(isLinux && linuxArches.includes(arch))
) {
	plugins.push(new CopyWebpackPlugin({
		patterns: [
			{
				// The native files we need to ship with the extension
				from: `**/dist/${platformFolder}/${arch}/(lib|)msal*.(node|dll|dylib|so)`,
				to: '[name][ext]'
			}
		]
	}));
}

export default withDefaults({
	context: import.meta.dirname,
	entry: {
		extension: './src/extension.ts'
	},
	externals: {
		// The @azure/msal-node-runtime package requires this native node module (.node).
		// It is currently only included on Windows, but the package handles unsupported platforms
		// gracefully.
		'./msal-node-runtime': 'commonjs ./msal-node-runtime'
	},
	resolve: {
		alias: {
			'keytar': path.resolve(import.meta.dirname, 'packageMocks', 'keytar', 'index.js')
		}
	},
	plugins
});
