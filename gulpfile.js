/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

// Increase max listeners for event emitters
require('events').EventEmitter.defaultMaxListeners = 100;

const gulp = require('gulp');
const util = require('./build/lib/util');
const path = require('path');
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

var ALL_EDITOR_TASKS = [
	// Always defined tasks
	'clean-client',
	'compile-client',
	'watch-client',
	'clean-client-build',
	'compile-client-build',
	'watch-client-build',

	// Editor tasks (defined in gulpfile.editor)
	'clean-optimized-editor',
	'optimize-editor',
	'clean-minified-editor',
	'minify-editor',
	'clean-editor-distro',
	'editor-distro',
	'analyze-editor-distro',

	// hygiene tasks
	'tslint',
	'hygiene',
];

var runningEditorTasks = process.argv.length > 2 && process.argv.slice(2).every(function (arg) { return (ALL_EDITOR_TASKS.indexOf(arg) !== -1); });

process.on('unhandledRejection', (reason, p) => {
	console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
	process.exit(1);
});

if (runningEditorTasks) {
	require(`./build/gulpfile.editor`);
	require(`./build/gulpfile.hygiene`);
} else {
	// Load all the gulpfiles only if running tasks other than the editor tasks
	const build = path.join(__dirname, 'build');
	require('glob').sync('gulpfile.*.js', { cwd: build })
		.forEach(f => require(`./build/${f}`));
}