/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Increase max listeners for event emitters
require('events').EventEmitter.defaultMaxListeners = 100;
<<<<<<< HEAD
var gulp = require('gulp'),
	path = require('path'),
	tsb = require('gulp-tsb'),
	es = require('event-stream'),
	filter = require('gulp-filter'),
	rimraf = require('rimraf'),
	util = require('./lib/util'),
	watcher = require('./lib/watch'),
	createReporter = require('./lib/reporter'),
	glob = require('glob'),
	sourcemaps = require('gulp-sourcemaps'),
	nlsDev = require('vscode-nls-dev'),
	extensionsPath = path.join(path.dirname(__dirname), 'extensions'),
compilations = glob.sync('**/tsconfig.json', {
	cwd: extensionsPath,
	ignore: ['**/out/**', '**/node_modules/**']
}),
languages = ['chs', 'cht', 'jpn', 'kor', 'deu', 'fra', 'esn', 'rus', 'ita'],
tasks = compilations.map(function(tsconfigFile) {
	var absolutePath = path.join(extensionsPath, tsconfigFile);
	var relativeDirname = path.dirname(tsconfigFile);
	var tsOptions = require(absolutePath).compilerOptions;
	tsOptions.verbose = false;
	tsOptions.sourceMap = true;
	var name = relativeDirname.replace(/\//g, '-');
	// Tasks
	var clean = 'clean-extension:' + name,
	compile = 'compile-extension:' + name,
	watch = 'watch-extension:' + name,
	cleanBuild = 'clean-extension-build:' + name,
	compileBuild = 'compile-extension-build:' + name,
	watchBuild = 'watch-extension-build:' + name,
	root = path.join('extensions', relativeDirname),
	srcBase = path.join(root, 'src'),
	src = path.join(srcBase, '**'),
	out = path.join(root, 'out'),
	i18n = path.join(__dirname, '..', 'i18n');
	function createPipeline(build) {
		var reporter = createReporter();
=======

const gulp = require('gulp');
const path = require('path');
const tsb = require('gulp-tsb');
const es = require('event-stream');
const filter = require('gulp-filter');
const rimraf = require('rimraf');
const util = require('./lib/util');
const watcher = require('./lib/watch');
const createReporter = require('./lib/reporter').createReporter;
const glob = require('glob');
const sourcemaps = require('gulp-sourcemaps');
const nlsDev = require('vscode-nls-dev');
const root = path.dirname(__dirname);
const commit = util.getVersion(root);
const plumber = require('gulp-plumber');
const _ = require('underscore');

const extensionsPath = path.join(path.dirname(__dirname), 'extensions');

const compilations = glob.sync('**/tsconfig.json', {
	cwd: extensionsPath,
	ignore: ['**/out/**', '**/node_modules/**']
});

const getBaseUrl = out => `https://ticino.blob.core.windows.net/sourcemaps/${commit}/${out}`;

const tasks = compilations.map(function (tsconfigFile) {
	const absolutePath = path.join(extensionsPath, tsconfigFile);
	const relativeDirname = path.dirname(tsconfigFile);

	const tsconfig = require(absolutePath);
	const tsOptions = _.assign({}, tsconfig.extends ? require(path.join(extensionsPath, relativeDirname, tsconfig.extends)).compilerOptions : {}, tsconfig.compilerOptions);
	tsOptions.verbose = false;
	tsOptions.sourceMap = true;

	const name = relativeDirname.replace(/\//g, '-');

	// Tasks
	const clean = 'clean-extension:' + name;
	const compile = 'compile-extension:' + name;
	const watch = 'watch-extension:' + name;

	// Build Tasks
	const cleanBuild = 'clean-extension-build:' + name;
	const compileBuild = 'compile-extension-build:' + name;
	const watchBuild = 'watch-extension-build:' + name;

	const root = path.join('extensions', relativeDirname);
	const srcBase = path.join(root, 'src');
	const src = path.join(srcBase, '**');
	const out = path.join(root, 'out');
	const baseUrl = getBaseUrl(out);

	let headerId, headerOut;
	let index = relativeDirname.indexOf('/');
	if (index < 0) {
		headerId = 'vscode.' + relativeDirname;
		headerOut = 'out';
	} else {
		headerId = 'vscode.' + relativeDirname.substr(0, index);
		headerOut = relativeDirname.substr(index + 1) + '/out';
	}

	function createPipeline(build, emitError) {
		const reporter = createReporter();
>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274

		tsOptions.inlineSources = !!build;
		tsOptions.base = path.dirname(absolutePath);

		const compilation = tsb.create(tsOptions, null, null, err => reporter(err.toString()));

		return function () {
			const input = es.through();
			const tsFilter = filter(['**/*.ts', '!**/lib/lib*.d.ts', '!**/node_modules/**'], { restore: true });
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
				.pipe(build ? nlsDev.rewriteLocalizeCalls() : es.through())
				.pipe(build ? util.stripSourceMappingURL() : es.through())
				.pipe(sourcemaps.write('.', {
					sourceMappingURL: !build ? null : f => `${baseUrl}/${f.relative}.map`,
					addComment: !!build,
					includeContent: !!build,
					sourceRoot: '../src'
				}))
				.pipe(tsFilter.restore)
				.pipe(build ? nlsDev.bundleMetaDataFiles(headerId, headerOut) : es.through())
				// Filter out *.nls.json file. We needed them only to bundle meta data file.
				.pipe(filter(['**', '!**/*.nls.json']))
				.pipe(reporter.end(emitError));

			return es.duplex(input, output);
		};
	}
	const srcOpts = { cwd: path.dirname(__dirname), base: srcBase };
<<<<<<< HEAD
	gulp.task(clean, function (cb) {
		rimraf(out, cb);
	});
	gulp.task(compile, [clean], function () {
		const pipeline = createPipeline(false);
=======

	gulp.task(clean, cb => rimraf(out, cb));

	gulp.task(compile, [clean], () => {
		const pipeline = createPipeline(false, true);
>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
		const input = gulp.src(src, srcOpts);

		return input
			.pipe(pipeline())
			.pipe(gulp.dest(out));
	});
<<<<<<< HEAD
	gulp.task(watch, [clean], function () {
		const pipeline = createPipeline(false),
		input = gulp.src(src, srcOpts),
		watchInput = watcher(src, srcOpts);
=======

	gulp.task(watch, [clean], () => {
		const pipeline = createPipeline(false);
		const input = gulp.src(src, srcOpts);
		const watchInput = watcher(src, srcOpts);

>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
		return watchInput
			.pipe(util.incremental(pipeline, input))
			.pipe(gulp.dest(out));
	});
<<<<<<< HEAD
	gulp.task(cleanBuild, function (cb) {
		rimraf(out, cb);
	});
	gulp.task(compileBuild, [clean], function () {
		const pipeline = createPipeline(true);
=======

	gulp.task(cleanBuild, cb => rimraf(out, cb));

	gulp.task(compileBuild, [clean], () => {
		const pipeline = createPipeline(true, true);
>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
		const input = gulp.src(src, srcOpts);

		return input
			.pipe(pipeline())
			.pipe(gulp.dest(out));
	});

	gulp.task(watchBuild, [clean], () => {
		const pipeline = createPipeline(true);
		const input = gulp.src(src, srcOpts);
		const watchInput = watcher(src, srcOpts);

		return watchInput
			.pipe(util.incremental(() => pipeline(), input))
			.pipe(gulp.dest(out));
	});
	return {
		clean: clean,
		compile: compile,
		watch: watch,
		cleanBuild: cleanBuild,
		compileBuild: compileBuild,
		watchBuild: watchBuild
	};
});

<<<<<<< HEAD
gulp.task('clean-extensions', tasks.map(function (t) { return t.clean; }));
gulp.task('compile-extensions', tasks.map(function (t) { return t.compile; }));
gulp.task('watch-extensions', tasks.map(function (t) { return t.watch; }));
gulp.task('clean-extensions-build', tasks.map(function (t) { return t.cleanBuild; }));
gulp.task('compile-extensions-build', tasks.map(function (t) { return t.compileBuild; }));
gulp.task('watch-extensions-build', tasks.map(function (t) { return t.watchBuild; }));
=======
gulp.task('clean-extensions', tasks.map(t => t.clean));
gulp.task('compile-extensions', tasks.map(t => t.compile));
gulp.task('watch-extensions', tasks.map(t => t.watch));

gulp.task('clean-extensions-build', tasks.map(t => t.cleanBuild));
gulp.task('compile-extensions-build', tasks.map(t => t.compileBuild));
gulp.task('watch-extensions-build', tasks.map(t => t.watchBuild));
>>>>>>> 36a2a4b9cf5709be280a891cfeeabf586daea274
