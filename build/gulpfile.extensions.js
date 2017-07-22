/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Increase max listeners for event emitters
require('events').EventEmitter.defaultMaxListeners = 100;

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

const extensionsPath = path.join(path.dirname(__dirname), 'extensions');

const compilations = glob.sync('**/tsconfig.json', {
	cwd: extensionsPath,
	ignore: ['**/out/**', '**/node_modules/**']
});

const getBaseUrl = out => `https://ticino.blob.core.windows.net/sourcemaps/${commit}/${out}`;
const languages = ['chs', 'cht', 'jpn', 'kor', 'deu', 'fra', 'esn', 'rus', 'ita'];

const tasks = compilations.map(function (tsconfigFile) {
	const absolutePath = path.join(extensionsPath, tsconfigFile);
	const relativeDirname = path.dirname(tsconfigFile);

	const tsOptions = require(absolutePath).compilerOptions;
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
	const i18n = path.join(__dirname, '..', 'i18n');
	const baseUrl = getBaseUrl(out);

	function createPipeline(build, emitError) {
		const reporter = createReporter();

		tsOptions.inlineSources = !!build;
		const compilation = tsb.create(tsOptions, null, null, err => reporter(err.toString()));

		return function () {
			const input = es.through();
			const tsFilter = filter(['**/*.ts', '!**/lib/lib*.d.ts', '!**/node_modules/**'], { restore: true });
			const output = input
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
				.pipe(build ? nlsDev.createAdditionalLanguageFiles(languages, i18n, out) : es.through())
				.pipe(reporter.end(emitError));

			return es.duplex(input, output);
		};
	}

	const srcOpts = { cwd: path.dirname(__dirname), base: srcBase };

	gulp.task(clean, cb => rimraf(out, cb));

	gulp.task(compile, [clean], () => {
		const pipeline = createPipeline(false, true);
		const input = gulp.src(src, srcOpts);

		return input
			.pipe(pipeline())
			.pipe(gulp.dest(out));
	});

	gulp.task(watch, [clean], () => {
		const pipeline = createPipeline(false);
		const input = gulp.src(src, srcOpts);
		const watchInput = watcher(src, srcOpts);

		return watchInput
			.pipe(util.incremental(pipeline, input))
			.pipe(gulp.dest(out));
	});

	gulp.task(cleanBuild, cb => rimraf(out, cb));

	gulp.task(compileBuild, [clean], () => {
		const pipeline = createPipeline(true, true);
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
			.pipe(util.incremental(() => pipeline(true), input))
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

gulp.task('clean-extensions', tasks.map(t => t.clean));
gulp.task('compile-extensions', tasks.map(t => t.compile));
gulp.task('watch-extensions', tasks.map(t => t.watch));

gulp.task('clean-extensions-build', tasks.map(t => t.cleanBuild));
gulp.task('compile-extensions-build', tasks.map(t => t.compileBuild));
gulp.task('watch-extensions-build', tasks.map(t => t.watchBuild));