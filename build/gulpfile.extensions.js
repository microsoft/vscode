/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Increase max listeners for event emitters
require('events').EventEmitter.defaultMaxListeners = 100;
<<<<<<< HEAD

<<<<<<< HEAD
const gulp = require('gulp');
const path = require('path');
const tsb = require('gulp-tsb');
const es = require('event-stream');
const filter = require('gulp-filter');
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
=======
=======
>>>>>>>  commiy
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
>>>>>>> commit

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

	const cleanTask = util.rimraf(out);
	cleanTask.displayName = `clean-extension-${name}`;

	const compileTask_ = () => {
		const pipeline = createPipeline(false, true);
=======
	gulp.task(clean, function (cb) {
		rimraf(out, cb);
	});
	gulp.task(compile, [clean], function () {
		const pipeline = createPipeline(false);
>>>>>>>  commiy
		const input = gulp.src(src, srcOpts);

		return input
			.pipe(pipeline())
			.pipe(gulp.dest(out));
<<<<<<< HEAD
	};
	compileTask_.displayName = `compile-extension-${name}`;
	const compileTask = util.task.series(cleanTask, compileTask_);

	const watchTask_ = () => {
		const pipeline = createPipeline(false);
		const input = gulp.src(src, srcOpts);
		const watchInput = watcher(src, srcOpts);

		return watchInput
			.pipe(util.incremental(pipeline, input))
			.pipe(gulp.dest(out));
	};
	watchTask_.displayName = `watch-extension-${name}`;
	const watchTask = util.task.series(cleanTask, watchTask_);

	const compileBuildTask_ = () => {
		const pipeline = createPipeline(true, true);
=======
	});
	gulp.task(watch, [clean], function () {
		const pipeline = createPipeline(false),
		input = gulp.src(src, srcOpts),
		watchInput = watcher(src, srcOpts);
		return watchInput
			.pipe(util.incremental(pipeline, input))
			.pipe(gulp.dest(out));
	});
	gulp.task(cleanBuild, function (cb) {
		rimraf(out, cb);
	});
	gulp.task(compileBuild, [clean], function () {
		const pipeline = createPipeline(true);
>>>>>>>  commiy
		const input = gulp.src(src, srcOpts);

		return input
			.pipe(pipeline())
			.pipe(gulp.dest(out));
	};
	compileBuildTask_.displayName = `compile-build-extension-${name}`;
	const compileBuildTask = util.task.series(cleanTask, compileBuildTask_);

<<<<<<< HEAD
	// Tasks
	gulp.task('compile-extension:' + name, compileTask);
	gulp.task('watch-extension:' + name, watchTask);

=======
		return watchInput
			.pipe(util.incremental(function () { return pipeline(true); }, input))
			.pipe(gulp.dest(out));
	});
>>>>>>>  commiy
	return {
		compileTask: compileTask,
		watchTask: watchTask,
		compileBuildTask: compileBuildTask
	};
});

<<<<<<< HEAD
const compileExtensionsTask = util.task.parallel(...tasks.map(t => t.compileTask));
compileExtensionsTask.displayName = 'compile-extensions';
gulp.task(compileExtensionsTask.displayName, compileExtensionsTask);
exports.compileExtensionsTask = compileExtensionsTask;

const watchExtensionsTask = util.task.parallel(...tasks.map(t => t.watchTask));
watchExtensionsTask.displayName = 'watch-extensions';
gulp.task(watchExtensionsTask.displayName, watchExtensionsTask);
exports.watchExtensionsTask = watchExtensionsTask;

const compileExtensionsBuildTask = util.task.parallel(...tasks.map(t => t.compileBuildTask));
compileExtensionsBuildTask.displayName = 'compile-extensions-build';
exports.compileExtensionsBuildTask = compileExtensionsBuildTask;
=======
gulp.task('clean-extensions', tasks.map(function (t) { return t.clean; }));
gulp.task('compile-extensions', tasks.map(function (t) { return t.compile; }));
gulp.task('watch-extensions', tasks.map(function (t) { return t.watch; }));
gulp.task('clean-extensions-build', tasks.map(function (t) { return t.cleanBuild; }));
gulp.task('compile-extensions-build', tasks.map(function (t) { return t.compileBuild; }));
gulp.task('watch-extensions-build', tasks.map(function (t) { return t.watchBuild; }));
>>>>>>>  commiy
