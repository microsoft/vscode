/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Increase max listeners for event emitters
require('events').EventEmitter.defaultMaxListeners = 100;

var gulp = require('gulp');
var json = require('gulp-json-editor');
var buffer = require('gulp-buffer');
var tsb = require('gulp-tsb');
var filter = require('gulp-filter');
var mocha = require('gulp-mocha');
var es = require('event-stream');
var watch = require('./build/lib/watch');
var nls = require('./build/lib/nls');
var util = require('./build/lib/util');
var reporter = require('./build/lib/reporter')();
var remote = require('gulp-remote-src');
var zip = require('gulp-vinyl-zip');
var path = require('path');
var bom = require('gulp-bom');
var sourcemaps = require('gulp-sourcemaps');
var _ = require('underscore');
var assign = require('object-assign');
var quiet = !!process.env['VSCODE_BUILD_QUIET'];
var monacodts = require('./build/monaco/api');
var fs = require('fs');

var rootDir = path.join(__dirname, 'src');
var tsOptions = {
	target: 'ES5',
	declaration: true,
	module: 'amd',
	verbose: !quiet,
	preserveConstEnums: true,
	experimentalDecorators: true,
	sourceMap: true,
	rootDir: rootDir,
	sourceRoot: util.toFileUri(rootDir)
};

function createCompile(build, emitError) {
	var opts = _.clone(tsOptions);
	opts.inlineSources = !!build;

	var ts = tsb.create(opts, null, null, quiet ? null : function (err) {
		reporter(err.toString());
	});

	return function (token) {
		var utf8Filter = filter('**/test/**/*utf8*', { restore: true });
		var tsFilter = filter(['**/*.ts'], { restore: true });
		var noDeclarationsFilter = filter(['**/*', '!**/*.d.ts'], { restore: true });

		var input = es.through();
		var output = input
			.pipe(utf8Filter)
			.pipe(bom())
			.pipe(utf8Filter.restore)
			.pipe(tsFilter)
			.pipe(util.loadSourcemaps())
			.pipe(ts(token))
			.pipe(noDeclarationsFilter)
			.pipe(build ? nls() : es.through())
			.pipe(noDeclarationsFilter.restore)
			.pipe(sourcemaps.write('.', {
				addComment: false,
				includeContent: !!build,
				sourceRoot: tsOptions.sourceRoot
			}))
			.pipe(tsFilter.restore)
			.pipe(quiet ? es.through() : reporter.end(emitError));

		return es.duplex(input, output);
	};
}

function compileTask(out, build) {
	var compile = createCompile(build, true);

	return function () {
		var src = gulp.src('src/**', { base: 'src' });

		return src
			.pipe(compile())
			.pipe(gulp.dest(out))
			.pipe(monacodtsTask(out, false));
	};
}

function watchTask(out, build) {
	var compile = createCompile(build);

	return function () {
		var src = gulp.src('src/**', { base: 'src' });
		var watchSrc = watch('src/**', { base: 'src' });

		return watchSrc
			.pipe(util.incremental(compile, src, true))
			.pipe(gulp.dest(out))
			.pipe(monacodtsTask(out, true));
	};
}

function monacodtsTask(out, isWatch) {

	var filesToWatchMap = {};
	monacodts.getFilesToWatch(out).forEach(function(filePath) {
		filesToWatchMap[path.normalize(filePath)] = true;
	});

	var timer = -1;

	var runSoon = function(howSoon) {
		if (timer !== -1) {
			clearTimeout(timer);
			timer = -1;
		}
		timer = setTimeout(function() {
			timer = -1;
			runNow();
		}, howSoon);
	};

	var runNow = function() {
		if (timer !== -1) {
			clearTimeout(timer);
			timer = -1;
		}
		// if (reporter.hasErrors()) {
		// 	monacodts.complainErrors();
		// 	return;
		// }
		var result = monacodts.run(out);
		if (!result.isTheSame) {
			if (isWatch) {
				fs.writeFileSync(result.filePath, result.content);
			} else {
				resultStream.emit('error', 'monaco.d.ts is no longer up to date. Please run gulp watch and commit the new file.');
			}
		}
	};

	if (isWatch) {
		watch('build/monaco/*').pipe(es.through(function() {
			runSoon(500);
		}));
	}

	var resultStream = es.through(function(data) {
		var filePath = path.normalize(data.path);
		if (isWatch && filesToWatchMap[filePath]) {
			runSoon(5000);
		}
		this.emit('data', data);
	}, function(end) {
		runNow();
		this.emit('end');
	});

	return resultStream;
}

// Fast compile for development time
gulp.task('clean-client', util.rimraf('out'));
gulp.task('compile-client', ['clean-client'], compileTask('out', false));
gulp.task('watch-client', ['clean-client'], watchTask('out', false));

// Full compile, including nls and inline sources in sourcemaps, for build
gulp.task('clean-client-build', util.rimraf('out-build'));
gulp.task('compile-client-build', ['clean-client-build'], compileTask('out-build', true));
gulp.task('watch-client-build', ['clean-client-build'], watchTask('out-build', true));

// Default
gulp.task('default', ['compile']);

// All
gulp.task('clean', ['clean-client', 'clean-extensions']);
gulp.task('compile', ['compile-client', 'compile-extensions']);
gulp.task('watch', ['watch-client', 'watch-extensions']);

// All Build
gulp.task('clean-build', ['clean-client-build', 'clean-extensions-build']);
gulp.task('compile-build', ['compile-client-build', 'compile-extensions-build']);
gulp.task('watch-build', ['watch-client-build', 'watch-extensions-build']);

gulp.task('test', function () {
	return gulp.src('test/all.js')
		.pipe(mocha({ ui: 'tdd', delay: true }))
		.once('end', function () { process.exit(); });
});

gulp.task('mixin', function () {
	var repo = process.env['VSCODE_MIXIN_REPO'];

	if (!repo) {
		console.log('Missing VSCODE_MIXIN_REPO, skipping mixin');
		return;
	}

	var quality = process.env['VSCODE_QUALITY'];

	if (!quality) {
		console.log('Missing VSCODE_QUALITY, skipping mixin');
		return;
	}

	var url = 'https://github.com/' + repo + '/archive/master.zip';
	var opts = { base: '' };
	var username = process.env['VSCODE_MIXIN_USERNAME'];
	var password = process.env['VSCODE_MIXIN_PASSWORD'];

	if (username || password) {
		opts.auth = { user: username || '', pass: password || '' };
	}

	console.log('Mixing in sources from \'' + url + '\':');

	var all = remote(url, opts)
		.pipe(zip.src())
		.pipe(filter(function (f) { return !f.isDirectory(); }))
		.pipe(util.rebase(1));

	if (quality) {
		var build = all.pipe(filter('build/**'));
		var productJsonFilter = filter('product.json', { restore: true });

		var mixin = all
			.pipe(filter('quality/' + quality + '/**'))
			.pipe(util.rebase(2))
			.pipe(productJsonFilter)
			.pipe(buffer())
			.pipe(json(function (patch) {
				var original = require('./product.json');
				return assign(original, patch);
			}))
			.pipe(productJsonFilter.restore);

		all = es.merge(build, mixin);
	}

	return all
		.pipe(es.mapSync(function (f) {
			console.log(f.relative);
			return f;
		}))
		.pipe(gulp.dest('.'));
});

require('./build/gulpfile.hygiene');
require('./build/gulpfile.vscode');
require('./build/gulpfile.editor');
require('./build/gulpfile.extensions');
