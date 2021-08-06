/*!--------------------------------------------------------
* Copyright (C) Gitpod. All rights reserved.
*--------------------------------------------------------*/

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
const _ = require('underscore');
const { getProductionDependencies } = require('./lib/dependencies');
const vfs = require('vinyl-fs');
const packageJson = require('../package.json');

const { compileBuildTask } = require('./gulpfile.compile');
gulp.task(task.define('compile-web-server', compileBuildTask));
const { compileExtensionsCi } = require('./gulpfile.extensions');

gulp.task(task.define('watch-init', require('./lib/compilation').watchTask('out', false)));

const root = path.dirname(__dirname);
const commit = util.getVersion(root);
const date = new Date().toISOString();

/**
 * @param {{
 * 	qualifier: string
 *  header?: string
 * }} options
 */
function defineTasks(options) {
	const qualifier = options.qualifier;
	const webResources = [
		// Workbench
		'out-build/vs/{base,platform,editor,workbench}/**/*.{svg,png,jpg}',
		`out-build/vs/${qualifier}/browser/workbench/*.html`,
		'out-build/vs/base/browser/ui/codicons/codicon/**',
		'out-build/vs/**/markdown.css',

		// Webview
		'out-build/vs/workbench/contrib/webview/browser/pre/**',

		// Extension Worker
		'out-build/vs/workbench/services/extensions/worker/extensionHostWorkerMain.js',
		'out-build/vs/workbench/services/extensions/worker/extensionHostWorkerMain.js.map',
		'out-build/vs/workbench/services/extensions/worker/*.html',

		// Excludes
		'!out-build/vs/**/{node,electron-browser,electron-sandbox,electron-main}/**',
		'!out-build/vs/editor/standalone/**',
		'!out-build/vs/workbench/**/*-tb.png',
		'!**/test/**'
	];

	const serverResources = [
		// Server
		`out-build/${qualifier}-cli.js`,
		`out-build/${qualifier}.js`,
		'out-build/bootstrap.js',
		'out-build/bootstrap-fork.js',
		'out-build/bootstrap-node.js',
		'out-build/bootstrap-amd.js',
		'out-build/paths.js',
		'out-build/serverUriTransformer.js',
		'out-build/vs/base/common/performance.js',

		// Excludes
		'!out-build/vs/**/{node,browser,electron-browser,electron-sandbox,electron-main}/**',
		'!out-build/vs/editor/standalone/**',
		'!**/test/**'
	];

	const buildfile = require('../src/buildfile');

	const webEntryPoints = _.flatten([
		buildfile.entrypoint('vs/workbench/workbench.web.api'),
		buildfile.base,
		buildfile.workerExtensionHost,
		buildfile.workerNotebook,
		buildfile.keyboardMaps,
		buildfile.workbenchWeb
	]).map(p => {
		if (p.name === 'vs/code/browser/workbench/workbench') {
			return {
				...p,
				name: `vs/${qualifier}/browser/workbench/workbench`
			};
		}
		return p;
	});

	const serverEntryPoints = _.flatten([
		buildfile.entrypoint(`vs/${qualifier}/node/cli`),
		buildfile.entrypoint(`vs/${qualifier}/node/server`),
		buildfile.entrypoint('vs/workbench/services/extensions/node/extensionHostProcess'),
		buildfile.entrypoint('vs/platform/files/node/watcher/unix/watcherApp'),
		buildfile.entrypoint('vs/platform/files/node/watcher/nsfw/watcherApp')
	]);

	const outWeb = `out-${qualifier}-web`;

	const optimizeWebTask = task.define(`optimize-${qualifier}-web`, task.series(
		util.rimraf(outWeb),
		common.optimizeTask({
			src: 'out-build',
			entryPoints: _.flatten(webEntryPoints),
			resources: webResources,
			loaderConfig: common.loaderConfig(),
			out: outWeb,
			bundleInfo: undefined,
			header: options?.header
		})
	));
	gulp.task(optimizeWebTask);

	const outServer = `out-${qualifier}-server`;

	const optimizeServerTask = task.define(`optimize-${qualifier}-server`, task.series(
		util.rimraf(outServer),
		common.optimizeTask({
			src: 'out-build',
			entryPoints: _.flatten(serverEntryPoints),
			resources: serverResources,
			loaderConfig: common.loaderConfig(),
			out: outServer,
			bundleInfo: undefined,
			header: options?.header
		})
	));
	gulp.task(optimizeServerTask);

	const optimizeWebServerTask = task.define(`optimize-${qualifier}`, task.parallel(optimizeWebTask, optimizeServerTask));
	gulp.task(optimizeWebServerTask);

	const outWebMin = outWeb + '-min';

	const minifyWebTask = task.define(`minify-${qualifier}-web`, task.series(
		optimizeWebTask,
		util.rimraf(outWebMin),
		common.minifyTask(outWeb)
	));
	gulp.task(minifyWebTask);

	const outServerMin = outServer + '-min';

	const minifyServerTask = task.define(`minify-${qualifier}-server`, task.series(
		optimizeServerTask,
		util.rimraf(outServerMin),
		common.minifyTask(outServer, '/out')
	));
	gulp.task(minifyWebTask);

	const minifyWebServerTask = task.define(`minify-${qualifier}`, task.parallel(minifyWebTask, minifyServerTask));
	gulp.task(minifyWebServerTask);

	/**
	 * @param {string} sourceFolderName
	 * @param {string} destinationFolderName
	 */
	function packageWebTask(sourceFolderName, destinationFolderName) {
		const destination = path.join(path.dirname(root), destinationFolderName);

		return () => {
			const json = require('gulp-json-editor');

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

			const base = 'remote/web';

			const dependenciesSrc = _.flatten(getProductionDependencies(path.join(root, base))
				.map(d => path.relative(root, d.path))
				.map(d => [`${d}/**`, `!${d}/**/{test,tests}/**`, `!${d}/.bin/**`]));

			const runtimeDependencies = gulp.src(dependenciesSrc, { base, dot: true })
				.pipe(filter(['**', '!**/package-lock.json', '!**/yarn.lock']))
				.pipe(util.cleanNodeModules(path.join(__dirname, '.webignore')));

			const name = product.applicationName;
			const packageJsonStream = gulp.src([base + '/package.json'], { base })
				.pipe(json({ name, version }));

			const indexStream = gulp.src([`out-build/vs/${qualifier}/browser/workbench/workbench.html`], { base: `out-build/vs/${qualifier}/browser/workbench` })
				.pipe(rename('index.html'))
				.pipe(replace('static/', ''));

			const manifest = gulp.src(`resources/${qualifier}/manifest.json`, { base: 'resources/' + qualifier })
				.pipe(json({
					name: product.nameLong,
					'short_name': product.nameShort
				}));

			let all = es.merge(
				packageJsonStream,
				productJsonStream,
				// license,
				sources,
				runtimeDependencies,
				indexStream,
				// favicon,
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
			const json = require('gulp-json-editor');

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

			const base = 'remote';
			const dependenciesSrc = _.flatten(getProductionDependencies(path.join(root, base))
				.map(d => path.relative(root, d.path))
				.map(d => [`${d}/**`, `!${d}/**/{test,tests}/**`, `!${d}/.bin/**`]));

			const runtimeDependencies = gulp.src(dependenciesSrc, { base, dot: true })
				.pipe(filter(['**', '!**/package-lock.json', '!**/yarn.lock']))
				.pipe(util.cleanNodeModules(path.join(__dirname, '.moduleignore')));

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
		const destination = qualifier + '-pkg';
		const destinationWeb = qualifier + '-pkg-web';
		const destinationServer = qualifier + '-pkg-server';

		const webRoot = path.join(path.dirname(root), destinationWeb);
		const packageWeb = task.define(`package-${qualifier}-web${dashed(minified)}`, task.series(
			util.rimraf(webRoot),
			packageWebTask(outWeb + dashed(minified), destinationWeb)
		));
		gulp.task(packageWeb);

		const serverRoot = path.join(path.dirname(root), destinationServer);
		const packageServer = task.define(`package-${qualifier}-server${dashed(minified)}`, task.series(
			util.rimraf(serverRoot),
			packageServerTask(outServer + dashed(minified), destinationServer)
		));
		gulp.task(packageServer);

		const packageRoot = path.join(path.dirname(root), destination);
		const packageWebServer = task.define(`package-${qualifier}${dashed(minified)}`, task.series(
			task.parallel(packageWeb, packageServer),
			util.rimraf(packageRoot),
			() => gulp.src(path.join(webRoot, '**'), { base: webRoot }).pipe(gulp.dest(packageRoot)),
			() => gulp.src(path.join(serverRoot, '**'), { base: serverRoot }).pipe(gulp.dest(packageRoot))
		));
		gulp.task(packageWebServer);

		const webServerTask = task.define(`${qualifier}${dashed(minified)}`, task.series(
			compileBuildTask,
			compileExtensionsCi,
			minified ? minifyWebServerTask : optimizeWebServerTask,
			packageWebServer
		));
		gulp.task(webServerTask);
	});
}

defineTasks({
	qualifier: 'server'
});
exports.defineTasks = defineTasks;
