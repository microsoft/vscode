/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Increase max listeners for event emitters
require('events').EventEmitter.defaultMaxListeners = 100;

var gulp = require('gulp');
var tsb = require('gulp-tsb');
var filter = require('gulp-filter');
var mocha = require('gulp-mocha');
var es = require('event-stream');
var watch = require('./build/lib/watch');
var nls = require('./build/lib/nls');
var style = require('./build/lib/style');
var copyrights = require('./build/lib/copyrights');
var util = require('./build/lib/util');
var reporter = require('./build/lib/reporter')();
var remote = require('gulp-remote-src');
var rename = require('gulp-rename');
var zip = require('gulp-vinyl-zip');
var path = require('path');
var bom = require('gulp-bom');
var sourcemaps = require('gulp-sourcemaps');
var _ = require('underscore');
var quiet = !!process.env['VSCODE_BUILD_QUIET'];

var rootDir = path.join(__dirname, 'src');
var tsOptions = {
	target: 'ES5',
	module: 'amd',
	verbose: !quiet,
	preserveConstEnums: true,
	experimentalDecorators: true,
	sourceMap: true,
	rootDir: rootDir,
	sourceRoot: util.toFileUri(rootDir)
};

function createCompile(build) {
	var opts = _.clone(tsOptions);
	opts.inlineSources = !!build;

	var ts = tsb.create(opts, null, null, quiet ? null : function (err) { reporter(err.toString()); });

	return function (token) {
		var utf8Filter = filter('**/test/**/*utf8*', { restore: true });
		var tsFilter = filter([
			'**/*.ts',
			'!vs/languages/typescript/common/lib/lib.**.ts'
		], { restore: true });

		var input = es.through();
		var output = input
			.pipe(utf8Filter)
			.pipe(bom())
			.pipe(utf8Filter.restore)
			.pipe(tsFilter)
			.pipe(util.loadSourcemaps())
			.pipe(ts(token))
			.pipe(build ? nls() : es.through())
			.pipe(sourcemaps.write('.', {
				addComment: false,
				includeContent: !!build,
				sourceRoot: tsOptions.sourceRoot
			}))
			.pipe(tsFilter.restore)
			.pipe(quiet ? es.through() : reporter());

		return es.duplex(input, output);
	};
}

function compileTask(out, build) {
	var compile = createCompile(build);

	return function () {
		var src = gulp.src('src/**', { base: 'src' });

		return src
			.pipe(compile())
			.pipe(gulp.dest(out));
	};
}

function watchTask(out, build) {
	var compile = createCompile(build);

	return function () {
		var src = gulp.src('src/**', { base: 'src' });
		var watchSrc = watch('src/**', { base: 'src' });

		return watchSrc
			.pipe(util.incremental(compile, src, true))
			.pipe(gulp.dest(out));
	};
}

// Fast compile for development time
gulp.task('clean-client', util.rimraf('out'));
gulp.task('compile-client', ['clean-client'], compileTask('out', false));
gulp.task('watch-client', ['clean-client'], watchTask('out', false));

// Full compile, including nls and inline sources in sourcemaps, for build
gulp.task('clean-build', util.rimraf('out-build'));
gulp.task('compile-build', ['clean-build'], compileTask('out-build', true));
gulp.task('watch-build', ['clean-build'], watchTask('out-build', true));

// Default
gulp.task('default', ['compile-all']);

// All
gulp.task('clean', ['clean-client', 'clean-plugins']);
gulp.task('compile', ['compile-client', 'compile-plugins']);
gulp.task('watch', ['watch-client', 'watch-plugins']);

var LINE_FEED_FILES = [
	'build/**/*',
	'extensions/**/*',
	'scripts/**/*',
	'src/**/*',
	'test/**/*',
	'!extensions/csharp-o/bin/**',
	'!extensions/**/out/**',
	'!**/node_modules/**',
	'!**/fixtures/**',
	'!**/*.{svg,exe,png,scpt,bat,cur,ttf,woff,eot}',
];

gulp.task('eol-style', function() {
	return gulp.src(LINE_FEED_FILES).pipe(style({complain:true}));
});
gulp.task('fix-eol-style', function() {
	return gulp.src(LINE_FEED_FILES, { base: '.' }).pipe(style({})).pipe(gulp.dest('.'));
});
var WHITESPACE_FILES = LINE_FEED_FILES.concat([
	'!**/lib/**',
	'!**/*.d.ts',
	'!extensions/typescript/server/**',
	'!test/assert.js',
	'!**/octicons/**',
	'!**/vs/languages/sass/test/common/example.scss',
	'!**/vs/languages/less/common/parser/less.grammar.txt',
	'!**/vs/languages/css/common/buildscripts/css-schema.xml',
	'!**/vs/languages/markdown/common/raw.marked.js',
	'!**/vs/base/common/winjs.base.raw.js',
	'!**/vs/base/node/terminateProcess.sh',
	'!extensions/csharp-o/gulpfile.js',
	'!**/vs/base/node/terminateProcess.sh',
	'!**/vs/text.js',
	'!**/vs/nls.js',
	'!**/vs/css.js',
	'!**/vs/loader.js',
	'!extensions/**/snippets/**',
	'!extensions/**/syntaxes/**',
	'!extensions/**/themes/**',
]);
gulp.task('whitespace-style', function() {
	return gulp.src(WHITESPACE_FILES).pipe(style({complain:true, whitespace:true}));
});
gulp.task('fix-whitespace-style', function() {
	return gulp.src(WHITESPACE_FILES, { base: '.' }).pipe(style({whitespace:true})).pipe(gulp.dest('.'));
});

gulp.task('copyrights', function() {
	return gulp.src(['src/vs/**/*.ts', 'src/vs/**/*.css', 'extensions/**/*.ts', 'extensions/**/*.css']).pipe(copyrights.copyrights());
});

gulp.task('insert-copyrights', function() {
	return gulp.src(['src/vs/**/*.ts', 'src/vs/**/*.css', 'extensions/**/*.ts', 'extensions/**/*.css']).pipe(copyrights.insertCopyrights());
});

gulp.task('test', function () {
	return gulp.src('test/all.js')
		.pipe(mocha({ ui: 'tdd', delay: true }))
		.once('end', function () { process.exit(); });
});

gulp.task('mixin', function () {
	var repo = process.env['VSCODE_MIXIN_REPO'];

	if (!repo) {
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
	return remote(url, opts)
		.pipe(zip.src())
		.pipe(rename(function (f) {
			f.dirname = f.dirname.replace(/^[^\/\\]+[\/\\]?/, '');
		}))
		.pipe(es.mapSync(function (f) {
			console.log(f.relative);
			return f;
		}))
		.pipe(gulp.dest('.'));
});

require('./build/gulpfile.vscode');
require('./build/gulpfile.editor');
require('./build/gulpfile.plugins');
