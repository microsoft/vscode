/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Increase max listeners for event emitters
require('events').EventEmitter.defaultMaxListeners = 100;

var gulp = require('gulp');
var path = require('path');
var tsb = require('gulp-tsb');
var es = require('event-stream');
var filter = require('gulp-filter');
var rimraf = require('rimraf');
var util = require('./lib/util');
var watcher = require('./lib/watch');
var createReporter = require('./lib/reporter');
var glob = require('glob');
var sourcemaps = require('gulp-sourcemaps');
var nlsDev = require('vscode-nls-dev');

var quiet = !!process.env['VSCODE_BUILD_QUIET'];
var extensionsPath = path.join(path.dirname(__dirname), 'extensions');

var compilations = glob.sync('**/tsconfig.json', {
	cwd: extensionsPath,
	ignore: '**/out/**'
});

var languages = ['chs', 'cht', 'jpn', 'kor', 'deu', 'fra', 'esn', 'rus', 'ita'];

var tasks = compilations.map(function(tsconfigFile) {
	var absolutePath = path.join(extensionsPath, tsconfigFile);
	var absoluteDirname = path.dirname(absolutePath);
	var relativeDirname = path.dirname(tsconfigFile);

	var tsOptions = require(absolutePath).compilerOptions;
	tsOptions.verbose = !quiet;
	tsOptions.sourceMap = true;
	tsOptions.sourceRoot = util.toFileUri(path.join(absoluteDirname, 'src'));

	var name = relativeDirname.replace(/\//g, '-');

	// Tasks
	var clean = 'clean-extension:' + name;
	var compile = 'compile-extension:' + name;
	var watch = 'watch-extension:' + name;

	// Build Tasks
	var cleanBuild = 'clean-extension-build:' + name;
	var compileBuild = 'compile-extension-build:' + name;
	var watchBuild = 'watch-extension-build:' + name;

	var root = path.join('extensions', relativeDirname);
	var srcBase = path.join(root, 'src');
	var src = path.join(srcBase, '**');
	var out = path.join(root, 'out');
	var i18n = path.join(__dirname, '..', 'i18n');

	function createPipeline(build) {
		var reporter = quiet ? null : createReporter();

		tsOptions.inlineSources = !!build;
		var compilation = tsb.create(tsOptions, null, null, quiet ? null : function (err) { reporter(err.toString()); });

		return function () {
			var input = es.through();
			var tsFilter = filter(['**/*.ts', '!**/lib/lib*.d.ts', '!**/node_modules/**'], { restore: true });
			var output = input
				.pipe(tsFilter)
				.pipe(util.loadSourcemaps())
				.pipe(compilation())
				.pipe(build ? nlsDev.rewriteLocalizeCalls() : es.through())
				.pipe(sourcemaps.write('.', {
					addComment: false,
					includeContent: !!build,
					sourceRoot: tsOptions.sourceRoot
				}))
				.pipe(tsFilter.restore)
				.pipe(build ? nlsDev.createAdditionalLanguageFiles(languages, i18n, out) : es.through())
				.pipe(quiet ? es.through() : reporter.end());

			return es.duplex(input, output);
		};
	};

	var srcOpts = { cwd: path.dirname(__dirname), base: srcBase };

	gulp.task(clean, function (cb) {
		rimraf(out, cb);
	});

	gulp.task(compile, [clean], function () {
		var pipeline = createPipeline(false);
		var input = gulp.src(src, srcOpts);

		return input
			.pipe(pipeline())
			.pipe(gulp.dest(out));
	});

	gulp.task(watch, [clean], function () {
		var pipeline = createPipeline(false);
		var input = gulp.src(src, srcOpts);
		var watchInput = watcher(src, srcOpts);

		return watchInput
			.pipe(util.incremental(pipeline, input))
			.pipe(gulp.dest(out));
	});

	gulp.task(cleanBuild, function (cb) {
		rimraf(out, cb);
	});

	gulp.task(compileBuild, [clean], function () {
		var pipeline = createPipeline(true);
		var input = gulp.src(src, srcOpts);

		return input
			.pipe(pipeline())
			.pipe(gulp.dest(out));
	});

	gulp.task(watchBuild, [clean], function () {
		var input = gulp.src(src, srcOpts);
		var watchInput = watcher(src, srcOpts);

		return watchInput
			.pipe(util.incremental(function () { return pipeline(true); }, input))
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

gulp.task('clean-extensions', tasks.map(function (t) { return t.clean; }));
gulp.task('compile-extensions', tasks.map(function (t) { return t.compile; }));
gulp.task('watch-extensions', tasks.map(function (t) { return t.watch; }));

gulp.task('clean-extensions-build', tasks.map(function (t) { return t.cleanBuild; }));
gulp.task('compile-extensions-build', tasks.map(function (t) { return t.compileBuild; }));
gulp.task('watch-extensions-build', tasks.map(function (t) { return t.watchBuild; }));