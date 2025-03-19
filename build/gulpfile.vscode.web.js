/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const gulp = require('gulp');
const path = require('path');
const es = require('event-stream');
const util = require('./lib/util');
const { getVersion } = require('./lib/getVersion');
const task = require('./lib/task');
const optimize = require('./lib/optimize');
const { readISODate } = require('./lib/date');
const product = require('../product.json');
const rename = require('gulp-rename');
const filter = require('gulp-filter');
const { getProductionDependencies } = require('./lib/dependencies');
const vfs = require('vinyl-fs');
const packageJson = require('../package.json');
const { compileBuildWithManglingTask } = require('./gulpfile.compile');
const extensions = require('./lib/extensions');
const VinylFile = require('vinyl');

const REPO_ROOT = path.dirname(__dirname);
const BUILD_ROOT = path.dirname(REPO_ROOT);
const WEB_FOLDER = path.join(REPO_ROOT, 'remote', 'web');

const commit = getVersion(REPO_ROOT);
const quality = product.quality;
const version = (quality && quality !== 'stable') ? `${packageJson.version}-${quality}` : packageJson.version;

const vscodeWebResourceIncludes = [

	// NLS
	'out-build/nls.messages.js',

	// Accessibility Signals
	'out-build/vs/platform/accessibilitySignal/browser/media/*.mp3',

	// Welcome
	'out-build/vs/workbench/contrib/welcomeGettingStarted/common/media/**/*.{svg,png}',

	// Extensions
	'out-build/vs/workbench/contrib/extensions/browser/media/{theme-icon.png,language-icon.svg}',
	'out-build/vs/workbench/services/extensionManagement/common/media/*.{svg,png}',

	// Webview
	'out-build/vs/workbench/contrib/webview/browser/pre/*.{js,html}',

	// Tree Sitter highlights
	'out-build/vs/editor/common/languages/highlights/*.scm',

	// Extension Host Worker
	'out-build/vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html',
];
exports.vscodeWebResourceIncludes = vscodeWebResourceIncludes;

const vscodeWebResources = [

	// Includes
	...vscodeWebResourceIncludes,

	// Excludes
	'!out-build/vs/**/{node,electron-sandbox,electron-main,electron-utility}/**',
	'!out-build/vs/editor/standalone/**',
	'!out-build/vs/workbench/**/*-tb.png',
	'!out-build/vs/code/**/*-dev.html',
	'!**/test/**'
];

const buildfile = require('./buildfile');

const vscodeWebEntryPoints = [
	buildfile.workerEditor,
	buildfile.workerExtensionHost,
	buildfile.workerNotebook,
	buildfile.workerLanguageDetection,
	buildfile.workerLocalFileSearch,
	buildfile.workerOutputLinks,
	buildfile.workerBackgroundTokenization,
	buildfile.keyboardMaps,
	buildfile.workbenchWeb,
	buildfile.entrypoint('vs/workbench/workbench.web.main.internal') // TODO@esm remove line when we stop supporting web-amd-esm-bridge
].flat();

/**
 * @param extensionsRoot {string} The location where extension will be read from
 * @param {object} product The parsed product.json file contents
 */
const createVSCodeWebFileContentMapper = (extensionsRoot, product) => {
	return path => {
		if (path.endsWith('vs/platform/product/common/product.js')) {
			return content => {
				const productConfiguration = JSON.stringify({
					...product,
					version,
					commit,
					date: readISODate('out-build')
				});
				return content.replace('/*BUILD->INSERT_PRODUCT_CONFIGURATION*/', () => productConfiguration.substr(1, productConfiguration.length - 2) /* without { and }*/);
			};
		} else if (path.endsWith('vs/workbench/services/extensionManagement/browser/builtinExtensionsScannerService.js')) {
			return content => {
				const builtinExtensions = JSON.stringify(extensions.scanBuiltinExtensions(extensionsRoot));
				return content.replace('/*BUILD->INSERT_BUILTIN_EXTENSIONS*/', () => builtinExtensions.substr(1, builtinExtensions.length - 2) /* without [ and ]*/);
			};
		}

		return undefined;
	};
};
exports.createVSCodeWebFileContentMapper = createVSCodeWebFileContentMapper;

const bundleVSCodeWebTask = task.define('bundle-vscode-web', task.series(
	util.rimraf('out-vscode-web'),
	optimize.bundleTask(
		{
			out: 'out-vscode-web',
			esm: {
				src: 'out-build',
				entryPoints: vscodeWebEntryPoints,
				resources: vscodeWebResources,
				fileContentMapper: createVSCodeWebFileContentMapper('.build/web/extensions', product)
			}
		}
	)
));

const minifyVSCodeWebTask = task.define('minify-vscode-web', task.series(
	bundleVSCodeWebTask,
	util.rimraf('out-vscode-web-min'),
	optimize.minifyTask('out-vscode-web', `https://main.vscode-cdn.net/sourcemaps/${commit}/core`)
));
gulp.task(minifyVSCodeWebTask);

function packageTask(sourceFolderName, destinationFolderName) {
	const destination = path.join(BUILD_ROOT, destinationFolderName);

	return () => {
		const json = require('gulp-json-editor');

		const src = gulp.src(sourceFolderName + '/**', { base: '.' })
			.pipe(rename(function (path) { path.dirname = path.dirname.replace(new RegExp('^' + sourceFolderName), 'out'); }));

		const extensions = gulp.src('.build/web/extensions/**', { base: '.build/web', dot: true });

		const loader = gulp.src('build/loader.min', { base: 'build', dot: true }).pipe(rename('out/vs/loader.js')); // TODO@esm remove line when we stop supporting web-amd-esm-bridge

		const sources = es.merge(src, extensions, loader)
			.pipe(filter(['**', '!**/*.js.map'], { dot: true }))
			// TODO@esm remove me once we stop supporting our web-esm-bridge
			.pipe(es.through(function (file) {
				if (file.relative === 'out/vs/workbench/workbench.web.main.internal.css') {
					this.emit('data', new VinylFile({
						contents: file.contents,
						path: file.path.replace('workbench.web.main.internal.css', 'workbench.web.main.css'),
						base: file.base
					}));
				}
				this.emit('data', file);
			}));

		const name = product.nameShort;
		const packageJsonStream = gulp.src(['remote/web/package.json'], { base: 'remote/web' })
			.pipe(json({ name, version }));

		const license = gulp.src(['remote/LICENSE'], { base: 'remote', allowEmpty: true });

		const productionDependencies = getProductionDependencies(WEB_FOLDER);
		const dependenciesSrc = productionDependencies.map(d => path.relative(REPO_ROOT, d)).map(d => [`${d}/**`, `!${d}/**/{test,tests}/**`, `!${d}/.bin/**`]).flat();

		const deps = gulp.src(dependenciesSrc, { base: 'remote/web', dot: true })
			.pipe(filter(['**', '!**/package-lock.json']))
			.pipe(util.cleanNodeModules(path.join(__dirname, '.webignore')));

		const favicon = gulp.src('resources/server/favicon.ico', { base: 'resources/server' });
		const manifest = gulp.src('resources/server/manifest.json', { base: 'resources/server' });
		const pwaicons = es.merge(
			gulp.src('resources/server/code-192.png', { base: 'resources/server' }),
			gulp.src('resources/server/code-512.png', { base: 'resources/server' })
		);

		const all = es.merge(
			packageJsonStream,
			license,
			sources,
			deps,
			favicon,
			manifest,
			pwaicons
		);

		const result = all
			.pipe(util.skipDirectories())
			.pipe(util.fixWin32DirectoryPermissions());

		return result.pipe(vfs.dest(destination));
	};
}

const compileWebExtensionsBuildTask = task.define('compile-web-extensions-build', task.series(
	task.define('clean-web-extensions-build', util.rimraf('.build/web/extensions')),
	task.define('bundle-web-extensions-build', () => extensions.packageAllLocalExtensionsStream(true, false).pipe(gulp.dest('.build/web'))),
	task.define('bundle-marketplace-web-extensions-build', () => extensions.packageMarketplaceExtensionsStream(true).pipe(gulp.dest('.build/web'))),
	task.define('bundle-web-extension-media-build', () => extensions.buildExtensionMedia(false, '.build/web/extensions')),
));
gulp.task(compileWebExtensionsBuildTask);

const dashed = (/** @type {string} */ str) => (str ? `-${str}` : ``);

['', 'min'].forEach(minified => {
	const sourceFolderName = `out-vscode-web${dashed(minified)}`;
	const destinationFolderName = `vscode-web`;

	const vscodeWebTaskCI = task.define(`vscode-web${dashed(minified)}-ci`, task.series(
		compileWebExtensionsBuildTask,
		minified ? minifyVSCodeWebTask : bundleVSCodeWebTask,
		util.rimraf(path.join(BUILD_ROOT, destinationFolderName)),
		packageTask(sourceFolderName, destinationFolderName)
	));
	gulp.task(vscodeWebTaskCI);

	const vscodeWebTask = task.define(`vscode-web${dashed(minified)}`, task.series(
		compileBuildWithManglingTask,
		vscodeWebTaskCI
	));
	gulp.task(vscodeWebTask);
});
