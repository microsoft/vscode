/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check
'use strict';

const gulp = require('gulp');
const path = require('path');
const es = require('event-stream');
const util = require('./lib/util');
const task = require('./lib/task');
const common = require('./lib/optimize');
const product = require('../product.json');
const rename = require('gulp-rename');
const replace = require('gulp-replace');
const filter = require('gulp-filter');
const json = require('gulp-json-editor');
const _ = require('underscore');
const deps = require('./dependencies');
const vfs = require('vinyl-fs');
const packageJson = require('../package.json');

const { compileBuildTask } = require('./gulpfile.compile');
gulp.task(task.define('compile-gitpod', compileBuildTask));
const { compileExtensionsBuildTask } = require('./gulpfile.extensions');
gulp.task(task.define('compile-extensions-gitpod', compileExtensionsBuildTask));

gulp.task(task.define('watch-init', require('./lib/compilation').watchTask('out', false)));

const root = path.dirname(__dirname);
const commit = util.getVersion(root);
const date = new Date().toISOString();

const gitpodWebResources = [
	// Workbench
	'out-build/vs/{base,platform,editor,workbench,gitpod}/**/*.{svg,png}',
	'out-build/vs/code/browser/workbench/*.html',
	'out-build/vs/base/browser/ui/codicons/codicon/**',
	'out-build/vs/**/markdown.css',

	// Webview
	'out-build/vs/workbench/contrib/webview/browser/pre/**',

	// Extension Worker
	'out-build/vs/workbench/services/extensions/worker/extensionHostWorkerMain.js',
	'out-build/vs/workbench/services/extensions/worker/extensionHostWorkerMain.js.map',

	// Excludes
	'!out-build/vs/**/{node,electron-browser,electron-sandbox,electron-main}/**',
	'!out-build/vs/editor/standalone/**',
	'!out-build/vs/workbench/**/*-tb.png',
	'!**/test/**'
];

const gitpodServerResources = [
	// Server
	'out-build/gitpod-cli.js',
	'out-build/gitpod.js',
	'out-build/bootstrap.js',
	'out-build/bootstrap-fork.js',
	'out-build/bootstrap-node.js',
	'out-build/bootstrap-amd.js',
	'out-build/paths.js',
	'out-build/gitpodUriTransformer.js',

	// Excludes
	'!out-build/vs/**/{node,browser,electron-browser,electron-sandbox,electron-main}/**',
	'!out-build/vs/editor/standalone/**',
	'!**/test/**'
];

const buildfile = require('../src/buildfile');

const gitpodWebEntryPoints = _.flatten([
	buildfile.entrypoint('vs/workbench/workbench.web.api'),
	buildfile.base,
	buildfile.workerExtensionHost,
	buildfile.workerNotebook,
	buildfile.keyboardMaps,
	buildfile.workbenchWeb
]);

const gitpodServerEntryPoints = _.flatten([
	buildfile.entrypoint('vs/gitpod/node/cli'),
	buildfile.entrypoint('vs/gitpod/node/server'),
	buildfile.entrypoint('vs/workbench/services/extensions/node/extensionHostProcess'),
	buildfile.entrypoint('vs/platform/files/node/watcher/unix/watcherApp'),
	buildfile.entrypoint('vs/platform/files/node/watcher/nsfw/watcherApp')
]);

const outGitpodWeb = 'out-gitpod-web';

const optimizeGitpodWebTask = task.define('optimize-gitpod-web', task.series(
	util.rimraf(outGitpodWeb),
	common.optimizeTask({
		src: 'out-build',
		entryPoints: _.flatten(gitpodWebEntryPoints),
		resources: gitpodWebResources,
		loaderConfig: common.loaderConfig(),
		out: outGitpodWeb,
		bundleInfo: undefined,
		header: [
			'/*!--------------------------------------------------------',
			' * Copyright (C) TypeFox. All rights reserved.',
			' *--------------------------------------------------------*/'
		].join('\n')
	})
));
gulp.task(optimizeGitpodWebTask);

const outGitpodServer = 'out-gitpod-server';

const optimizeGitpodServerTask = task.define('optimize-gitpod-server', task.series(
	util.rimraf(outGitpodServer),
	common.optimizeTask({
		src: 'out-build',
		entryPoints: _.flatten(gitpodServerEntryPoints),
		resources: gitpodServerResources,
		loaderConfig: common.loaderConfig(),
		out: outGitpodServer,
		bundleInfo: undefined,
		header: [
			'/*!--------------------------------------------------------',
			' * Copyright (C) TypeFox. All rights reserved.',
			' *--------------------------------------------------------*/'
		].join('\n')
	})
));
gulp.task(optimizeGitpodServerTask);

const optimizeGitpodTask = task.define('optimize-gitpod', task.parallel(optimizeGitpodWebTask, optimizeGitpodServerTask));
gulp.task(optimizeGitpodTask);

const outGitpodWebMin = outGitpodWeb + '-min';

const minifyGitpodWebTask = task.define('minify-gitpod-web', task.series(
	optimizeGitpodWebTask,
	util.rimraf(outGitpodWebMin),
	common.minifyTask(outGitpodWeb, '/out')
));
gulp.task(minifyGitpodWebTask);

const outGitpodServerMin = outGitpodServer + '-min';

const minifyGitpodServerTask = task.define('minify-gitpod-server', task.series(
	optimizeGitpodServerTask,
	util.rimraf(outGitpodServerMin),
	common.minifyTask(outGitpodServer)
));
gulp.task(minifyGitpodWebTask);

const minifyGitpodTask = task.define('minify-gitpod', task.parallel(minifyGitpodWebTask, minifyGitpodServerTask));
gulp.task(minifyGitpodTask);

/**
 * @param {string} sourceFolderName
 * @param {string} destinationFolderName
 */
function packageWebTask(sourceFolderName, destinationFolderName) {
	const destination = path.join(path.dirname(root), destinationFolderName);

	return () => {
		const src = gulp.src(sourceFolderName + '/**', { base: '.' })
			.pipe(rename(function (path) { path.dirname = path.dirname.replace(new RegExp('^' + sourceFolderName), 'out'); }));

		const sources = es.merge(src);

		let version = packageJson.version;
		const quality = product.quality;

		if (quality && quality !== 'stable') {
			version += '-' + quality;
		}

		const productJsonStream = gulp.src(['product.json'], { base: '.' })
			.pipe(json({ commit, date }));

		// const license = gulp.src(['remote/LICENSE'], { base: 'remote' });

		const base = 'remote/web';

		const dependenciesSrc = _.flatten(deps.getProductionDependencies(path.join(root, base))
			.map(d => path.relative(root, d.path))
			.map(d => [`${d}/**`, `!${d}/**/{test,tests}/**`, `!${d}/.bin/**`]));

		const runtimeDependencies = gulp.src(dependenciesSrc, { base, dot: true })
			.pipe(filter(['**', '!**/package-lock.json']))
			.pipe(util.cleanNodeModules(path.join(__dirname, '.nativeignore')));

		const name = product.applicationName;
		const packageJsonStream = gulp.src([base + '/package.json'], { base })
			.pipe(json({ name, version }));

		const indexStream = gulp.src(['out-build/vs/code/browser/workbench/workbench.html'], { base: 'out-build/vs/code/browser/workbench' })
			.pipe(rename('index.html'))
			.pipe(replace('static/', ''));

		const favicon = gulp.src('resources/gitpod/favicon.ico', { base: 'resources/gitpod' });
		const manifest = gulp.src('resources/gitpod/manifest.json', { base: 'resources/gitpod' })
			.pipe(json({
				name: product.nameLong,
				'short_name': product.nameShort
			}));

		/* const pwaicons = es.merge(
			gulp.src('resources/gitpod/code-192.png', { base: 'resources/gitpod' }),
			gulp.src('resources/gitpod/code-512.png', { base: 'resources/gitpod' })
		); */

		let all = es.merge(
			packageJsonStream,
			productJsonStream,
			// license,
			sources,
			runtimeDependencies,
			indexStream,
			favicon,
			manifest,
			// pwaicons
		);

		let result = all
			.pipe(util.skipDirectories())
			.pipe(util.fixWin32DirectoryPermissions());

		return result.pipe(vfs.dest(destination));
	};
}

/**
 * @param {string} sourceFolderName
 * @param {string} destinationFolderName
 */
function packageServerTask(sourceFolderName, destinationFolderName) {
	const destination = path.join(path.dirname(root), destinationFolderName);

	return () => {
		const src = gulp.src(sourceFolderName + '/**', { base: '.' })
			.pipe(rename(function (path) { path.dirname = path.dirname.replace(new RegExp('^' + sourceFolderName), 'out'); }));

		const extensions = gulp.src('.build/extensions/**', { base: '.build', dot: true });

		const sources = es.merge(src, extensions);

		let version = packageJson.version;
		const quality = product.quality;

		if (quality && quality !== 'stable') {
			version += '-' + quality;
		}

		const productJsonStream = gulp.src(['product.json'], { base: '.' })
			.pipe(json({ commit, date }));

		// const license = gulp.src(['remote/LICENSE'], { base: 'remote' });

		const base = 'remote';
		const dependenciesSrc = _.flatten(deps.getProductionDependencies(path.join(root, base))
			.map(d => path.relative(root, d.path))
			.map(d => [`${d}/**`, `!${d}/**/{test,tests}/**`, `!${d}/.bin/**`]));

		const runtimeDependencies = gulp.src(dependenciesSrc, { base, dot: true })
			.pipe(filter(['**', '!**/package-lock.json']))
			.pipe(util.cleanNodeModules(path.join(__dirname, '.nativeignore')));

		const name = product.applicationName;
		const packageJsonStream = gulp.src([base + '/package.json'], { base })
			.pipe(json({ name, version }));

		let all = es.merge(
			packageJsonStream,
			productJsonStream,
			// license,
			sources,
			runtimeDependencies
		);

		let result = all
			.pipe(util.skipDirectories())
			.pipe(util.fixWin32DirectoryPermissions());

		return result.pipe(vfs.dest(destination));
	};
}

const dashed = (str) => (str ? `-${str}` : ``);

['', 'min'].forEach(minified => {
	const destination = `gitpod-pkg`;
	const destinationWeb = `gitpod-pkg-web`;
	const destinationServer = `gitpod-pkg-server`;

	const webRoot = path.join(path.dirname(root), destinationWeb);
	const packageGitpodWeb = task.define(`package-gitpod-web${dashed(minified)}`, task.series(
		util.rimraf(webRoot),
		packageWebTask(outGitpodWeb + dashed(minified), destinationWeb)
	));
	gulp.task(packageGitpodWeb);

	const serverRoot = path.join(path.dirname(root), destinationServer);
	const packageGitpodServer = task.define(`package-gitpod-server${dashed(minified)}`, task.series(
		util.rimraf(serverRoot),
		packageServerTask(outGitpodServer + dashed(minified), destinationServer)
	));
	gulp.task(packageGitpodServer);

	const packageRoot = path.join(path.dirname(root), destination);
	const packageGitpod = task.define(`package-gitpod${dashed(minified)}`, task.series(
		task.parallel(packageGitpodWeb, packageGitpodServer),
		util.rimraf(packageRoot),
		() => gulp.src(path.join(webRoot, '**'), { base: webRoot }).pipe(gulp.dest(packageRoot)),
		() => gulp.src(path.join(serverRoot, '**'), { base: serverRoot }).pipe(gulp.dest(packageRoot))
	));
	gulp.task(packageGitpod);

	const gitpodTask = task.define(`gitpod${dashed(minified)}`, task.series(
		compileBuildTask,
		compileExtensionsBuildTask,
		minified ? minifyGitpodTask : optimizeGitpodTask,
		packageGitpod
	));
	gulp.task(gitpodTask);
});