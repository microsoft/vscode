/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
const watcher = require('@parcel/watcher');
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const util = require('./util');
const minimatch = require('minimatch');
const buildfile = require('./src/buildfile');

const srcFolder = path.join(__dirname, 'src2');
const dstFolder = path.join(__dirname, 'out'); // TODO@jrieken out-build

const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');

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
		// buildfile.workerSharedProcess,
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

	} else if (item.name.match(/\/(node|electron-main)\//) || item.name.endsWith('.desktop.main')) {
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
	logLevel: 'silent',
	bundle: true,
	minify: false,
	external: ['electron'].concat(npmDependencies),
	format: 'esm',
	outdir: dstFolder,
	loader: {
		'.ttf': 'file',
		'.svg': 'file',
		'.png': 'file',
		'.sh': 'file',
	}
};

if (minify) {
	commonOptions.minifyWhitespace = true;
	commonOptions.minifySyntax = true;
	commonOptions.minifyIdentifiers = true;
}

(async () => {

	/** @type {Promise<import ('esbuild').BuildContext>[]} */
	const tasks = [];

	for (const [platform, entryPoints] of Object.entries(entryPointsByPlatform)) {
		if (entryPoints.length === 0) {
			continue;
		}
		const ctx = build({
			...commonOptions,
			// @ts-ignore
			platform,
			entryPoints,
		});
		tasks.push(ctx);
	}


	const context = await Promise.all(tasks);

	if (watch) {


		let currentRebuild = undefined;
		let doOneMoreRebuild = false;
		const rebuild = async () => {

			if (currentRebuild) {
				doOneMoreRebuild = true;
				return;
			}

			const t1 = Date.now();
			doOneMoreRebuild = false;
			const build = Promise.all(context.map(ctx => ctx.rebuild()));
			currentRebuild = build.finally(() => {
				console.log(`Rebuilt in ${Date.now() - t1}ms`);
				currentRebuild = undefined;
				if (doOneMoreRebuild) {
					rebuild();
				}
			});
		};

		watcher.subscribe(__dirname, (error, events) => {
			for (const event of events) {
				console.log(`File change detected: ${event.path}`);
			}
			rebuild();
		}, {
			ignore: [
				`**/.git/**`,
				`**/node_modules/**`,
				`**/out/**`,
				`**/*.txt`,
			]
		});

	} else {
		// cleanup
		context.forEach(ctx => ctx.dispose());
	}

})();

copyResources([
	'main.js',
	'bootstrap.js',
	'bootstrap-amd.js',
	'bootstrap-meta.js',
	'bootstrap-fork.js',
	'bootstrap-node.js',
	'bootstrap-window.js',
	'vs/base/common/performance.js',
	'vs/platform/environment/node/userDataPath.js',
	'vs/base/common/jsonc.js',
	'vs/base/node/nls.js',
	'vs/code/electron-sandbox/workbench/workbench-dev.html',
	'vs/base/parts/sandbox/electron-sandbox/preload.js',
	'vs/base/parts/sandbox/electron-sandbox/preload-aux.js',
	'vs/code/electron-sandbox/workbench/workbench.js'
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
 * @returns {Promise<import('esbuild').BuildContext<import ('esbuild').BuildOptions>>}
 */
async function build(opts) {

	const t1 = Date.now();


	const ctx = await esbuild.context(opts);

	const result = await ctx.rebuild();
	if (result.errors.length > 0) {
		console.error(result.errors);
	}

	const warnings = result.warnings.filter(candidate => {
		if (candidate.id === 'suspicious-nullish-coalescing') {
			return false;
		}
		return true;
	});

	if (warnings.length > 0) {
		console.error(warnings);
	}

	// @ts-expect-error
	console.log(`Built in ${Date.now() - t1}ms \n- ${opts.entryPoints.map(entry => entry.in).join('\n- ')} `);

	return ctx;
}
