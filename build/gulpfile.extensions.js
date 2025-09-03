/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Increase max listeners for event emitters
require('events').EventEmitter.defaultMaxListeners = 100;

const gulp = require('gulp');
const path = require('path');
const nodeUtil = require('util');
const es = require('event-stream');
const filter = require('gulp-filter');
const util = require('./lib/util');
const { getVersion } = require('./lib/getVersion');
const task = require('./lib/task');
const watcher = require('./lib/watch');
const createReporter = require('./lib/reporter').createReporter;
const glob = require('glob');
const root = path.dirname(__dirname);
const commit = getVersion(root);
const plumber = require('gulp-plumber');
const ext = require('./lib/extensions');

// To save 250ms for each gulp startup, we are caching the result here
// const compilations = glob.sync('**/tsconfig.json', {
// 	cwd: extensionsPath,
// 	ignore: ['**/out/**', '**/node_modules/**']
// });
const compilations = [
	'extensions/configuration-editing/tsconfig.json',
	'extensions/css-language-features/client/tsconfig.json',
	'extensions/css-language-features/server/tsconfig.json',
	'extensions/debug-auto-launch/tsconfig.json',
	'extensions/debug-server-ready/tsconfig.json',
	'extensions/emmet/tsconfig.json',
	'extensions/extension-editing/tsconfig.json',
	'extensions/git/tsconfig.json',
	'extensions/git-base/tsconfig.json',
	'extensions/github/tsconfig.json',
	'extensions/github-authentication/tsconfig.json',
	'extensions/grunt/tsconfig.json',
	'extensions/gulp/tsconfig.json',
	'extensions/html-language-features/client/tsconfig.json',
	'extensions/html-language-features/server/tsconfig.json',
	'extensions/ipynb/tsconfig.json',
	'extensions/jake/tsconfig.json',
	'extensions/json-language-features/client/tsconfig.json',
	'extensions/json-language-features/server/tsconfig.json',
	'extensions/markdown-language-features/tsconfig.json',
	'extensions/markdown-math/tsconfig.json',
	'extensions/media-preview/tsconfig.json',
	'extensions/merge-conflict/tsconfig.json',
	'extensions/terminal-suggest/tsconfig.json',
	'extensions/microsoft-authentication/tsconfig.json',
	'extensions/notebook-renderers/tsconfig.json',
	'extensions/npm/tsconfig.json',
	'extensions/php-language-features/tsconfig.json',
	'extensions/references-view/tsconfig.json',
	'extensions/search-result/tsconfig.json',
	'extensions/simple-browser/tsconfig.json',
	'extensions/tunnel-forwarding/tsconfig.json',
	'extensions/typescript-language-features/web/tsconfig.json',
	'extensions/typescript-language-features/tsconfig.json',
	'extensions/vscode-api-tests/tsconfig.json',
	'extensions/vscode-colorize-tests/tsconfig.json',
	'extensions/vscode-colorize-perf-tests/tsconfig.json',
	'extensions/vscode-test-resolver/tsconfig.json',

	'.vscode/extensions/vscode-selfhost-test-provider/tsconfig.json',
	'.vscode/extensions/vscode-selfhost-import-aid/tsconfig.json',
];

const getBaseUrl = out => `https://main.vscode-cdn.net/sourcemaps/${commit}/${out}`;

const tasks = compilations.map(function (tsconfigFile) {
	const absolutePath = path.join(root, tsconfigFile);
	const relativeDirname = path.dirname(tsconfigFile.replace(/^(.*\/)?extensions\//i, ''));

	const overrideOptions = {};
	overrideOptions.sourceMap = true;

	const name = relativeDirname.replace(/\//g, '-');

	const srcRoot = path.dirname(tsconfigFile);
	const srcBase = path.join(srcRoot, 'src');
	const src = path.join(srcBase, '**');
	const srcOpts = { cwd: root, base: srcBase, dot: true };

	const out = path.join(srcRoot, 'out');
	const baseUrl = getBaseUrl(out);

	function createPipeline(build, emitError, transpileOnly) {
		const tsb = require('./lib/tsb');
		const sourcemaps = require('gulp-sourcemaps');

		const reporter = createReporter('extensions');

		overrideOptions.inlineSources = Boolean(build);
		overrideOptions.base = path.dirname(absolutePath);

		const compilation = tsb.create(absolutePath, overrideOptions, { verbose: false, transpileOnly, transpileOnlyIncludesDts: transpileOnly, transpileWithEsbuild: true }, err => reporter(err.toString()));

		const pipeline = function () {
			const input = es.through();
			const tsFilter = filter(['**/*.ts', '!**/lib/lib*.d.ts', '!**/node_modules/**'], { restore: true, dot: true });
			const output = input
				.pipe(plumber({
					errorHandler: function (err) {
						if (err && !err.__reporter__) {
							reporter(err);
						}
					}
				}))
				.pipe(tsFilter)
				.pipe(util.loadSourcemaps())
				.pipe(compilation())
				.pipe(build ? util.stripSourceMappingURL() : es.through())
				.pipe(sourcemaps.write('.', {
					sourceMappingURL: !build ? null : f => `${baseUrl}/${f.relative}.map`,
					addComment: !!build,
					includeContent: !!build,
					// note: trailing slash is important, else the source URLs in V8's file coverage are incorrect
					sourceRoot: '../src/',
				}))
				.pipe(tsFilter.restore)
				.pipe(reporter.end(emitError));

			return es.duplex(input, output);
		};

		// add src-stream for project files
		pipeline.tsProjectSrc = () => {
			return compilation.src(srcOpts);
		};
		return pipeline;
	}

	const cleanTask = task.define(`clean-extension-${name}`, util.rimraf(out));

	const transpileTask = task.define(`transpile-extension:${name}`, task.series(cleanTask, () => {
		const pipeline = createPipeline(false, true, true);
		const nonts = gulp.src(src, srcOpts).pipe(filter(['**', '!**/*.ts']));
		const input = es.merge(nonts, pipeline.tsProjectSrc());

		return input
			.pipe(pipeline())
			.pipe(gulp.dest(out));
	}));

	const compileTask = task.define(`compile-extension:${name}`, task.series(cleanTask, () => {
		const pipeline = createPipeline(false, true);
		const nonts = gulp.src(src, srcOpts).pipe(filter(['**', '!**/*.ts']));
		const input = es.merge(nonts, pipeline.tsProjectSrc());

		return input
			.pipe(pipeline())
			.pipe(gulp.dest(out));
	}));

	const watchTask = task.define(`watch-extension:${name}`, task.series(cleanTask, () => {
		const pipeline = createPipeline(false);
		const nonts = gulp.src(src, srcOpts).pipe(filter(['**', '!**/*.ts']));
		const input = es.merge(nonts, pipeline.tsProjectSrc());
		const watchInput = watcher(src, { ...srcOpts, ...{ readDelay: 200 } });

		return watchInput
			.pipe(util.incremental(pipeline, input))
			.pipe(gulp.dest(out));
	}));

	const compileBuildTask = task.define(`compile-build-extension-${name}`, task.series(cleanTask, () => {
		const pipeline = createPipeline(true, true);
		const nonts = gulp.src(src, srcOpts).pipe(filter(['**', '!**/*.ts']));
		const input = es.merge(nonts, pipeline.tsProjectSrc());

		return input
			.pipe(pipeline())
			.pipe(gulp.dest(out));
	}));

	// Tasks
	gulp.task(transpileTask);
	gulp.task(compileTask);
	gulp.task(watchTask);

	return { transpileTask, compileTask, watchTask, compileBuildTask };
});

const transpileExtensionsTask = task.define('transpile-extensions', task.parallel(...tasks.map(t => t.transpileTask)));
gulp.task(transpileExtensionsTask);

const compileExtensionsTask = task.define('compile-extensions', task.parallel(...tasks.map(t => t.compileTask)));
gulp.task(compileExtensionsTask);
exports.compileExtensionsTask = compileExtensionsTask;

const watchExtensionsTask = task.define('watch-extensions', task.parallel(...tasks.map(t => t.watchTask)));
gulp.task(watchExtensionsTask);
exports.watchExtensionsTask = watchExtensionsTask;

const compileExtensionsBuildLegacyTask = task.define('compile-extensions-build-legacy', task.parallel(...tasks.map(t => t.compileBuildTask)));
gulp.task(compileExtensionsBuildLegacyTask);

//#region Extension media

const compileExtensionMediaTask = task.define('compile-extension-media', () => ext.buildExtensionMedia(false));
gulp.task(compileExtensionMediaTask);
exports.compileExtensionMediaTask = compileExtensionMediaTask;

const watchExtensionMedia = task.define('watch-extension-media', () => ext.buildExtensionMedia(true));
gulp.task(watchExtensionMedia);
exports.watchExtensionMedia = watchExtensionMedia;

const compileExtensionMediaBuildTask = task.define('compile-extension-media-build', () => ext.buildExtensionMedia(false, '.build/extensions'));
gulp.task(compileExtensionMediaBuildTask);
exports.compileExtensionMediaBuildTask = compileExtensionMediaBuildTask;

//#endregion

//#region Azure Pipelines

/**
 * Cleans the build directory for extensions
 */
const cleanExtensionsBuildTask = task.define('clean-extensions-build', util.rimraf('.build/extensions'));
exports.cleanExtensionsBuildTask = cleanExtensionsBuildTask;

/**
 * brings in the marketplace extensions for the build
 */
const bundleMarketplaceExtensionsBuildTask = task.define('bundle-marketplace-extensions-build', () => ext.packageMarketplaceExtensionsStream(false).pipe(gulp.dest('.build')));

/**
 * Compiles the non-native extensions for the build
 * @note this does not clean the directory ahead of it. See {@link cleanExtensionsBuildTask} for that.
 */
const compileNonNativeExtensionsBuildTask = task.define('compile-non-native-extensions-build', task.series(
	bundleMarketplaceExtensionsBuildTask,
	task.define('bundle-non-native-extensions-build', () => ext.packageNonNativeLocalExtensionsStream(false, false).pipe(gulp.dest('.build')))
));
gulp.task(compileNonNativeExtensionsBuildTask);
exports.compileNonNativeExtensionsBuildTask = compileNonNativeExtensionsBuildTask;

/**
 * Compiles the native extensions for the build
 * @note this does not clean the directory ahead of it. See {@link cleanExtensionsBuildTask} for that.
 */
const compileNativeExtensionsBuildTask = task.define('compile-native-extensions-build', () => ext.packageNativeLocalExtensionsStream(false, false).pipe(gulp.dest('.build')));
gulp.task(compileNativeExtensionsBuildTask);
exports.compileNativeExtensionsBuildTask = compileNativeExtensionsBuildTask;

/**
 * Compiles the extensions for the build.
 * This is essentially a helper task that combines {@link cleanExtensionsBuildTask}, {@link compileNonNativeExtensionsBuildTask} and {@link compileNativeExtensionsBuildTask}
 */
const compileAllExtensionsBuildTask = task.define('compile-extensions-build', task.series(
	cleanExtensionsBuildTask,
	bundleMarketplaceExtensionsBuildTask,
	task.define('bundle-extensions-build', () => ext.packageAllLocalExtensionsStream(false, false).pipe(gulp.dest('.build'))),
));
gulp.task(compileAllExtensionsBuildTask);
exports.compileAllExtensionsBuildTask = compileAllExtensionsBuildTask;

// This task is run in the compilation stage of the CI pipeline. We only compile the non-native extensions since those can be fully built regardless of platform.
// This defers the native extensions to the platform specific stage of the CI pipeline.
gulp.task(task.define('extensions-ci', task.series(compileNonNativeExtensionsBuildTask, compileExtensionMediaBuildTask)));

const compileExtensionsBuildPullRequestTask = task.define('compile-extensions-build-pr', task.series(
	cleanExtensionsBuildTask,
	bundleMarketplaceExtensionsBuildTask,
	task.define('bundle-extensions-build-pr', () => ext.packageAllLocalExtensionsStream(false, true).pipe(gulp.dest('.build'))),
));
gulp.task(compileExtensionsBuildPullRequestTask);

// This task is run in the compilation stage of the PR pipeline. We compile all extensions in it to verify compilation.
gulp.task(task.define('extensions-ci-pr', task.series(compileExtensionsBuildPullRequestTask, compileExtensionMediaBuildTask)));

//#endregion

const compileWebExtensionsTask = task.define('compile-web', () => buildWebExtensions(false));
gulp.task(compileWebExtensionsTask);
exports.compileWebExtensionsTask = compileWebExtensionsTask;

const watchWebExtensionsTask = task.define('watch-web', () => buildWebExtensions(true));
gulp.task(watchWebExtensionsTask);
exports.watchWebExtensionsTask = watchWebExtensionsTask;

/**
 * @param {boolean} isWatch
 */
async function buildWebExtensions(isWatch) {
	const extensionsPath = path.join(root, 'extensions');
	const webpackConfigLocations = await nodeUtil.promisify(glob)(
		path.join(extensionsPath, '**', 'extension-browser.webpack.config.js'),
		{ ignore: ['**/node_modules'] }
	);
	return ext.webpackExtensions('packaging web extension', isWatch, webpackConfigLocations.map(configPath => ({ configPath })));
}
