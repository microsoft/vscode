/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Increase max listeners for event emitters
require('events').EventEmitter.defaultMaxListeners = 100;
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

		tsOptions.inlineSources = !!build;
		var compilation = tsb.create(tsOptions, null, null, err => reporter(err.toString()));

		return function () {
			const input = es.through();
			const tsFilter = filter(['**/*.ts', '!**/lib/lib*.d.ts', '!**/node_modules/**'], { restore: true });
			const output = input
				.pipe(tsFilter)
				.pipe(util.loadSourcemaps())
				.pipe(compilation())
				.pipe(build ? nlsDev.rewriteLocalizeCalls() : es.through())
				.pipe(sourcemaps.write('.', {
					addComment: false,
					includeContent: !!build,
					sourceRoot: function(file) {
						const levels = file.relative.split(path.sep).length;
						return '../'.repeat(levels) + 'src';
					}
				}))
				.pipe(tsFilter.restore)
				.pipe(build ? nlsDev.createAdditionalLanguageFiles(languages, i18n, out) : es.through())
				.pipe(reporter.end());

			return es.duplex(input, output);
		};
	}
	const srcOpts = { cwd: path.dirname(__dirname), base: srcBase };
	gulp.task(clean, function (cb) {
		rimraf(out, cb);
	});
	gulp.task(compile, [clean], function () {
		const pipeline = createPipeline(false);
		const input = gulp.src(src, srcOpts);

		return input
			.pipe(pipeline())
			.pipe(gulp.dest(out));
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
		const input = gulp.src(src, srcOpts);

		return input
			.pipe(pipeline())
			.pipe(gulp.dest(out));
	});

	gulp.task(watchBuild, [clean], function () {
		const pipeline = createPipeline(true);
		const input = gulp.src(src, srcOpts);
		const watchInput = watcher(src, srcOpts);

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