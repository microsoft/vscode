/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const util = require('./util');
const minimatch = require('minimatch');

const srcFolder = path.join(__dirname, 'src2');
const dstFolder = path.join(__dirname, 'out');

const npmDependencies = [
	'@microsoft/1ds-core-js',
	'@microsoft/1ds-post-js',
	'@parcel/watcher',
	'@vscode/iconv-lite-umd',
	'@vscode/ripgrep',
	'@vscode/sqlite3',
	'@vscode/sudo-prompt',
	'@vscode/vscode-languagedetection',
	'electron',
	'graceful-fs',
	'http-proxy-agent',
	'https-proxy-agent',
	'jschardet',
	'keytar',
	'minimist',
	'native-is-elevated',
	'native-keymap',
	'native-watchdog',
	'node-pty',
	'spdlog',
	'tas-client-umd',
	'v8-inspect-profiler',
	'vscode-oniguruma',
	'vscode-policy-watcher',
	'vscode-proxy-agent',
	'vscode-regexpp',
	'vscode-textmate',
	'xterm',
	'xterm-addon-canvas',
	'xterm-addon-search',
	'xterm-addon-serialize',
	'xterm-addon-unicode11',
	'xterm-addon-webgl',
	'xterm-headless',
	'yauzl',
	'yazl',

	'@vscode/windows-registry',
	'windows-foreground-love',
	'windows-mutex',
	'windows-process-tree',
];

/** @type {{ [ext: string]: import('esbuild').Loader; }} */
const commonLoaders = {
	'.ttf': 'file',
	'.svg': 'file',
	'.png': 'file',
	'.sh': 'file',
};

build({
	entryPoints: [`${srcFolder}/vs/workbench/workbench.desktop.main.js`],
	platform: 'node',
	external: npmDependencies,
	bundle: true,
	outdir: path.join(__dirname, 'out/'),
	loader: commonLoaders,
	format: 'esm'
});

build({
	entryPoints: [`${srcFolder}/vs/code/electron-main/main.js`],
	platform: 'node',
	external: npmDependencies,
	bundle: true,
	outdir: path.join(__dirname, 'out/'),
	loader: commonLoaders,
	format: 'esm'
});

copyResources([
	'main.js',
	'bootstrap.js',
	'bootstrap-node.js',
	'vs/base/common/performance.js',
	'vs/platform/environment/node/userDataPath.js',
	'vs/base/common/stripComments.js',
	'vs/base/node/languagePacks.js',
	'vs/code/electron-sandbox/workbench/workbench-dev.html',
	'vs/base/parts/sandbox/electron-browser/preload.js',
	'bootstrap-window.js',
	'vs/code/electron-sandbox/workbench/workbench.js',
	'vs/code/electron-browser/sharedProcess/sharedProcess-dev.html',
]);

/**
 * @param {string[]} patterns
 */
function copyResources(patterns) {
	/** @type {string[]} */
	const files = [];
	util.readdir(srcFolder, files);
	for (const filePath of files) {
		if (matchesPatterns(filePath, patterns)) {
			const fileContents = fs.readFileSync(filePath);
			writeDestFile(filePath, fileContents);
		}
	}
}

/**
 * @param {string} filePath
 * @param {string[]} patterns
 */
function matchesPatterns(filePath, patterns) {
	const relativeFilePath = path.relative(srcFolder, filePath);
	for (const pattern of patterns) {
		if (minimatch(relativeFilePath, pattern)) {
			return true;
		}
	}
	return false;
}

/**
 * @param {string} srcFilePath
 * @param {string | Buffer} fileContents
 */
function writeDestFile(srcFilePath, fileContents) {
	const destFilePath = srcFilePath.replace(srcFolder, dstFolder);
	util.ensureDir(path.dirname(destFilePath));
	fs.writeFileSync(destFilePath, fileContents);
}

/**
 * @param {import ('esbuild').BuildOptions} opts
 */
function build(opts) {
	esbuild.build(opts).then((result) => {
		if (result.errors.length > 0) {
			console.error(result.errors);
		}
		if (result.warnings.length > 0) {
			console.error(result.warnings);
		}
	});
}
