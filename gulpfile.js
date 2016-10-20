/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

// Increase max listeners for event emitters
require('events').EventEmitter.defaultMaxListeners = 100;

const gulp = require('gulp');
const json = require('gulp-json-editor');
const buffer = require('gulp-buffer');
const filter = require('gulp-filter');
const mocha = require('gulp-mocha');
const es = require('event-stream');
const util = require('./build/lib/util');
const remote = require('gulp-remote-src');
const zip = require('gulp-vinyl-zip');
const path = require('path');
const assign = require('object-assign');
const glob = require('glob');
const pkg = require('./package.json');
const compilation = require('./build/lib/compilation');

// Fast compile for development time
gulp.task('clean-client', util.rimraf('out'));
gulp.task('compile-client', ['clean-client'], compilation.compileTask('out', false));
gulp.task('watch-client', ['clean-client'], compilation.watchTask('out', false));

// Full compile, including nls and inline sources in sourcemaps, for build
gulp.task('clean-client-build', util.rimraf('out-build'));
gulp.task('compile-client-build', ['clean-client-build'], compilation.compileTask('out-build', true));
gulp.task('watch-client-build', ['clean-client-build'], compilation.watchTask('out-build', true));

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
	const repo = process.env['VSCODE_MIXIN_REPO'];

	if (!repo) {
		console.log('Missing VSCODE_MIXIN_REPO, skipping mixin');
		return;
	}

	const quality = process.env['VSCODE_QUALITY'];

	if (!quality) {
		console.log('Missing VSCODE_QUALITY, skipping mixin');
		return;
	}

	const url = `https://github.com/${ repo }/archive/${ pkg.distro }.zip`;
	const opts = { base: '' };
	const username = process.env['VSCODE_MIXIN_USERNAME'];
	const password = process.env['VSCODE_MIXIN_PASSWORD'];

	if (username || password) {
		opts.auth = { user: username || '', pass: password || '' };
	}

	console.log('Mixing in sources from \'' + url + '\':');

	let all = remote(url, opts)
		.pipe(zip.src())
		.pipe(filter(function (f) { return !f.isDirectory(); }))
		.pipe(util.rebase(1));

	if (quality) {
		const build = all.pipe(filter('build/**'));
		const productJsonFilter = filter('product.json', { restore: true });

		const mixin = all
			.pipe(filter('quality/' + quality + '/**'))
			.pipe(util.rebase(2))
			.pipe(productJsonFilter)
			.pipe(buffer())
			.pipe(json(function (patch) {
				const original = require('./product.json');
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

var ALL_EDITOR_TASKS = [
	'clean-optimized-editor',
	'optimize-editor',
	'clean-minified-editor',
	'minify-editor',
	'clean-editor-distro',
	'editor-distro',
	'analyze-editor-distro'
];
var runningEditorTasks = process.argv.slice(2).every(function(arg) {
	return (ALL_EDITOR_TASKS.indexOf(arg) !== -1);
});

if (runningEditorTasks) {
	require(`./build/gulpfile.editor`);
} else {
	// Load all the gulpfiles only if running tasks other than the editor tasks
	const build = path.join(__dirname, 'build');
	glob.sync('gulpfile.*.js', { cwd: build })
		.forEach(f => require(`./build/${ f }`));
}