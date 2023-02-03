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
const buildfile = require('./src/buildfile');

const srcFolder = path.join(__dirname, 'src2');
const dstFolder = path.join(__dirname, 'out');


const allEntryPointFromTheAmdWorld = (function () {

	const mainEntryPoints = [
		buildfile.code
	].flat();

	const desktopEntryPoints = [
		buildfile.entrypoint('vs/workbench/workbench.desktop.main'),
		buildfile.base,
		buildfile.workerExtensionHost,
		buildfile.workerNotebook,
		buildfile.workerLanguageDetection,
		buildfile.workerSharedProcess,
		buildfile.workerLocalFileSearch,
		buildfile.workerProfileAnalysis,
		buildfile.workbenchDesktop,
	].flat();


	const webEntryPoints = [
		buildfile.entrypoint('vs/workbench/workbench.web.main'),
		buildfile.base,
		buildfile.workerExtensionHost,
		buildfile.workerNotebook,
		buildfile.workerLanguageDetection,
		buildfile.workerLocalFileSearch,
		buildfile.workerProfileAnalysis,
		buildfile.keyboardMaps,
		buildfile.workbenchWeb
	].flat();

	const seen = new Set();

	return [...mainEntryPoints, ...desktopEntryPoints, ...webEntryPoints].filter(item => {
		const res = seen.has(item.name);
		seen.add(item.name);
		return !res;
	});
})();

const pkgJSON = require('./package.json');
const npmDependencies = Object.keys(pkgJSON.dependencies).concat(Object.keys(pkgJSON.optionalDependencies));

/**
 *
 * @param {{name:string}} item
 */
function toInOut(item) {
	return {
		in: path.relative(__dirname, path.join(srcFolder, `${item.name}.ts`)),
		out: path.relative(dstFolder, path.join(dstFolder, item.name))
	};
}


/**
 * @type {Record<import('esbuild').Platform, {in:string, out:string}[]>}
 */
const entryPointsByPlatform = {
	'neutral': [],
	'browser': [],
	'node': [],
};

for (const item of allEntryPointFromTheAmdWorld) {
	const inOut = toInOut(item);
	if (item.name.match(/\/(common)\//)) { // any
		entryPointsByPlatform.neutral.push(inOut);

	} else if (item.name.match(/\/(browser|electron-sandbox|worker)\//) || item.name.endsWith('.web.main')) {
		entryPointsByPlatform.browser.push(inOut);

	} else if (item.name.match(/\/(node|electron-browser|electron-main)\//) || item.name.endsWith('.desktop.main')) {
		entryPointsByPlatform.node.push(inOut);

	} else {
		console.warn(`Unknown platform for ${item.name}. Falling back to NODE`);
		entryPointsByPlatform.node.push(inOut);
	}
}


/**
 * @type {import('esbuild').BuildOptions} BuildOptions
 */
const commonOptions = {
	bundle: true,
	minify: false,
	external: npmDependencies,
	format: 'esm',
	outdir: dstFolder,
	loader: {
		'.ttf': 'file',
		'.svg': 'file',
		'.png': 'file',
		'.sh': 'file',
	},
};

for (const [platform, entryPoints] of Object.entries(entryPointsByPlatform)) {
	if (entryPoints.length === 0) {
		continue;
	}
	build({
		...commonOptions,
		// @ts-ignore
		platform,
		entryPoints,
	});
}

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
