/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*global require,process,__dirname*/

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

var tasks = compilations.map(function(tsconfigFile) {
	var absolutePath = path.join(extensionsPath, tsconfigFile);
	var options = require(absolutePath).compilerOptions;
	options.verbose = !quiet;

	var globRelativeDirname = path.dirname(tsconfigFile);
	var name = globRelativeDirname.replace(/\//g, '-');
	var clean = 'clean-extension:' + name;
	var compile = 'compile-extension:' + name;
	var compileBuild = 'compile-build-extension:' + name;
	var watch = 'watch-extension:' + name;

	var deps = [
		'src/vs/vscode.d.ts',
		'src/typings/mocha.d.ts',
		'extensions/declares.d.ts',
		'extensions/node.d.ts',
		'extensions/lib.core.d.ts'
	];

	var pipeline = (function () {
		var reporter = quiet ? null : createReporter();
		var compilation = tsb.create(options, null, null, quiet ? null : function (err) { reporter(err.toString()); });

		return function (build) {
			var input = es.through();
			var tsFilter = filter(['**/*.ts', '!**/lib/lib*.d.ts', '!**/node_modules/**'], { restore: true });
			var output;
			if (build) {
				output = input
					.pipe(tsFilter)
					.pipe(sourcemaps.init())
						.pipe(compilation())
						.pipe(nlsDev.rewriteLocalizeCalls())
					.pipe(sourcemaps.write('.', {
						addComment: false,
						includeContent: false
					}))
					.pipe(tsFilter.restore)
					.pipe(quiet ? es.through() : reporter.end());

			} else {
				output = input
					.pipe(tsFilter)
					.pipe(compilation())
					.pipe(tsFilter.restore)
					.pipe(quiet ? es.through() : reporter.end());
			}

			return es.duplex(input, output);
		};
	})();

	var root = path.join('extensions', globRelativeDirname);
	var sources = path.join(root, '**');
	var base = path.join(root, 'src');
	var out = path.join(root, 'out');

	var sourcesOpts = { cwd: path.dirname(__dirname), base: base };
	var depsOpts = { cwd: path.dirname(__dirname)	};

	gulp.task(clean, function (cb) {
		rimraf(out, cb);
	});

	gulp.task(compile, [clean], function () {
		var src = es.merge(gulp.src(sources, sourcesOpts), gulp.src(deps, depsOpts));

		return src
			.pipe(pipeline(false))
			.pipe(gulp.dest(out));
	});

	gulp.task(compileBuild, [clean], function () {
		var src = es.merge(gulp.src(sources, sourcesOpts), gulp.src(deps, depsOpts));

		return src
			.pipe(pipeline(true))
			.pipe(gulp.dest(out));
	});

	gulp.task(watch, [clean], function () {
		var src = es.merge(gulp.src(sources, sourcesOpts), gulp.src(deps, depsOpts));
		var watchSrc = es.merge(watcher(sources, sourcesOpts), watcher(deps, depsOpts));

		return watchSrc
			.pipe(util.incremental(pipeline, src))
			.pipe(gulp.dest(out));
	});

	return {
		clean: clean,
		compile: compile,
		compileBuild: compileBuild,
		watch: watch
	};
});

gulp.task('clean-extensions', tasks.map(function (t) { return t.clean; }));
gulp.task('compile-extensions', tasks.map(function (t) { return t.compile; }));
gulp.task('compile-build-extensions', tasks.map(function (t) { return t.compileBuild; }));
gulp.task('watch-extensions', tasks.map(function (t) { return t.watch; }));