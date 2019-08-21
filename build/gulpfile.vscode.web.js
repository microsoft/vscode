/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const gulp = require('gulp');
const path = require('path');
const es = require('event-stream');
const util = require('./lib/util');
const task = require('./lib/task');
const common = require('./lib/optimize');
const product = require('../product.json');
const rename = require('gulp-rename');
const filter = require('gulp-filter');
const json = require('gulp-json-editor');
const _ = require('underscore');
const deps = require('./dependencies');
const vfs = require('vinyl-fs');
const packageJson = require('../package.json');
const { compileBuildTask } = require('./gulpfile.compile');

const REPO_ROOT = path.dirname(__dirname);
const commit = util.getVersion(REPO_ROOT);
const BUILD_ROOT = path.dirname(REPO_ROOT);
const WEB_FOLDER = path.join(REPO_ROOT, 'remote', 'web');

const productionDependencies = deps.getProductionDependencies(WEB_FOLDER);

const nodeModules = Object.keys(product.dependencies || {})
	.concat(_.uniq(productionDependencies.map(d => d.name)));

const vscodeWebResources = [

	// Workbench
	'out-build/vs/{base,platform,editor,workbench}/**/*.{svg,png,html}',
	'out-build/vs/base/browser/ui/octiconLabel/octicons/**',
	'out-build/vs/**/markdown.css',

	// Webview
	'out-build/vs/workbench/contrib/webview/browser/pre/*.js',

	// Extension Worker
	'out-build/vs/workbench/services/extensions/worker/extensionHostWorkerMain.js',

	// Excludes
	'!out-build/vs/**/{node,electron-browser,electron-main}/**',
	'!out-build/vs/editor/standalone/**',
	'!out-build/vs/workbench/**/*-tb.png',
	'!**/test/**'
];

const buildfile = require('../src/buildfile');

const vscodeWebEntryPoints = [
	buildfile.workbenchWeb,
	buildfile.serviceWorker,
	buildfile.workerExtensionHost,
	buildfile.keyboardMaps,
	buildfile.base
];

const optimizeVSCodeWebTask = task.define('optimize-vscode-web', task.series(
	util.rimraf('out-vscode-web'),
	common.optimizeTask({
		src: 'out-build',
		entryPoints: _.flatten(vscodeWebEntryPoints),
		otherSources: [],
		resources: vscodeWebResources,
		loaderConfig: common.loaderConfig(nodeModules),
		out: 'out-vscode-web',
		bundleInfo: undefined
	})
));

const minifyVSCodeWebTask = task.define('minify-vscode-web', task.series(
	optimizeVSCodeWebTask,
	util.rimraf('out-vscode-web-min'),
	common.minifyTask('out-vscode-web', `https://ticino.blob.core.windows.net/sourcemaps/${commit}/core`)
));
gulp.task(minifyVSCodeWebTask);

function packageTask(sourceFolderName, destinationFolderName) {
	const destination = path.join(BUILD_ROOT, destinationFolderName);

	return () => {
		const src = gulp.src(sourceFolderName + '/**', { base: '.' })
			.pipe(rename(function (path) { path.dirname = path.dirname.replace(new RegExp('^' + sourceFolderName), 'out'); }))
			.pipe(filter(['**', '!**/*.js.map']));

		const sources = es.merge(src);

		let version = packageJson.version;
		const quality = product.quality;

		if (quality && quality !== 'stable') {
			version += '-' + quality;
		}

		const name = product.nameShort;
		const packageJsonStream = gulp.src(['remote/web/package.json'], { base: 'remote/web' })
			.pipe(json({ name, version }));

		const date = new Date().toISOString();

		const productJsonStream = gulp.src(['product.json'], { base: '.' })
			.pipe(json({ commit, date }));

		const license = gulp.src(['remote/LICENSE'], { base: 'remote' });

		const dependenciesSrc = _.flatten(productionDependencies.map(d => path.relative(REPO_ROOT, d.path)).map(d => [`${d}/**`, `!${d}/**/{test,tests}/**`, `!${d}/.bin/**`]));

		const deps = gulp.src(dependenciesSrc, { base: 'remote/web', dot: true })
			.pipe(filter(['**', '!**/package-lock.json']))
			.pipe(util.cleanNodeModules(path.join(__dirname, '.nativeignore')));

		const favicon = gulp.src('resources/server/favicon.ico', { base: 'resources/server' });

		let all = es.merge(
			packageJsonStream,
			productJsonStream,
			license,
			sources,
			deps,
			favicon
		);

		let result = all
			.pipe(util.skipDirectories())
			.pipe(util.fixWin32DirectoryPermissions());

		return result.pipe(vfs.dest(destination));
	};
}

const dashed = (str) => (str ? `-${str}` : ``);

['', 'min'].forEach(minified => {
	const sourceFolderName = `out-vscode-web${dashed(minified)}`;
	const destinationFolderName = `vscode-web`;

	const vscodeWebTaskCI = task.define(`vscode-web${dashed(minified)}-ci`, task.series(
		minified ? minifyVSCodeWebTask : optimizeVSCodeWebTask,
		util.rimraf(path.join(BUILD_ROOT, destinationFolderName)),
		packageTask(sourceFolderName, destinationFolderName)
	));
	gulp.task(vscodeWebTaskCI);

	const vscodeWebTask = task.define(`vscode-web${dashed(minified)}`, task.series(
		compileBuildTask,
		vscodeWebTaskCI
	));
	gulp.task(vscodeWebTask);
});
