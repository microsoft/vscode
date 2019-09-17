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
const fs = require('fs');
const packageJson = require('../package.json');
const { compileBuildTask } = require('./gulpfile.compile');

const REPO_ROOT = path.dirname(__dirname);
const BUILD_ROOT = path.dirname(REPO_ROOT);
const WEB_FOLDER = path.join(REPO_ROOT, 'remote', 'web');

const commit = util.getVersion(REPO_ROOT);
const quality = product.quality;
const version = (quality && quality !== 'stable') ? `${packageJson.version}-${quality}` : packageJson.version;

const productionDependencies = deps.getProductionDependencies(WEB_FOLDER);

const nodeModules = Object.keys(product.dependencies || {})
	.concat(_.uniq(productionDependencies.map(d => d.name)));

const vscodeWebResourceIncludes = [

	// Workbench
	'out-build/vs/{base,platform,editor,workbench}/**/*.{svg,png}',
	'out-build/vs/code/browser/workbench/*.html',
	'out-build/vs/base/browser/ui/octiconLabel/octicons/**',
	'out-build/vs/base/browser/ui/codiconLabel/codicon/**',
	'out-build/vs/**/markdown.css',

	// Webview
	'out-build/vs/workbench/contrib/webview/browser/pre/*.js',

	// Extension Worker
	'out-build/vs/workbench/services/extensions/worker/extensionHostWorkerMain.js'
];
exports.vscodeWebResourceIncludes = vscodeWebResourceIncludes;

const vscodeWebResources = [

	// Includes
	...vscodeWebResourceIncludes,

	// Excludes
	'!out-build/vs/**/{node,electron-browser,electron-main}/**',
	'!out-build/vs/editor/standalone/**',
	'!out-build/vs/workbench/**/*-tb.png',
	'!**/test/**'
];

const buildfile = require('../src/buildfile');

const vscodeWebEntryPoints = _.flatten([
	buildfile.entrypoint('vs/workbench/workbench.web.api'),
	buildfile.base,
	buildfile.workerExtensionHost,
	buildfile.keyboardMaps,
	buildfile.workbenchWeb
]);
exports.vscodeWebEntryPoints = vscodeWebEntryPoints;

const optimizeVSCodeWebTask = task.define('optimize-vscode-web', task.series(
	util.rimraf('out-vscode-web'),
	common.optimizeTask({
		src: 'out-build',
		entryPoints: _.flatten(vscodeWebEntryPoints),
		otherSources: [],
		resources: vscodeWebResources,
		loaderConfig: common.loaderConfig(nodeModules),
		out: 'out-vscode-web',
		inlineAmdImages: true,
		bundleInfo: undefined
	})
));

const vscodeWebPatchProductTask = () => {
	const fullpath = path.join(process.cwd(), 'out-build', 'vs', 'platform', 'product', 'common', 'product.js');
	const contents = fs.readFileSync(fullpath).toString();
	const productConfiguration = JSON.stringify({
		...product,
		version,
		commit,
		date: new Date().toISOString()
	});
	const newContents = contents.replace('/*BUILD->INSERT_PRODUCT_CONFIGURATION*/', productConfiguration.substr(1, productConfiguration.length - 2) /* without { and }*/);
	fs.writeFileSync(fullpath, newContents);
};
exports.vscodeWebPatchProductTask = vscodeWebPatchProductTask;

const minifyVSCodeWebTask = task.define('minify-vscode-web', task.series(
	vscodeWebPatchProductTask,
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

		const name = product.nameShort;
		const packageJsonStream = gulp.src(['remote/web/package.json'], { base: 'remote/web' })
			.pipe(json({ name, version }));

		const license = gulp.src(['remote/LICENSE'], { base: 'remote' });

		const dependenciesSrc = _.flatten(productionDependencies.map(d => path.relative(REPO_ROOT, d.path)).map(d => [`${d}/**`, `!${d}/**/{test,tests}/**`, `!${d}/.bin/**`]));

		const deps = gulp.src(dependenciesSrc, { base: 'remote/web', dot: true })
			.pipe(filter(['**', '!**/package-lock.json']))
			.pipe(util.cleanNodeModules(path.join(__dirname, '.nativeignore')));

		const favicon = gulp.src('resources/server/favicon.ico', { base: 'resources/server' });
		const manifest = gulp.src('resources/server/manifest.json', { base: 'resources/server' });
		const pwaicons = es.merge(
			gulp.src('resources/server/code-192.png', { base: 'resources/server' }),
			gulp.src('resources/server/code-512.png', { base: 'resources/server' })
		);

		let all = es.merge(
			packageJsonStream,
			license,
			sources,
			deps,
			favicon,
			manifest,
			pwaicons
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
