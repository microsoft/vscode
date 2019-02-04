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
gulp.task('compile-client', util.task.series(util.rimraf('out'), compilation.compileTask('src', 'out', false)));
gulp.task('watch-client', util.task.series(util.rimraf('out'), compilation.watchTask('out', false)));

// Full compile, including nls and inline sources in sourcemaps, for build
gulp.task('compile-client-build', util.task.series(util.rimraf('out-build'), compilation.compileTask('src', 'out-build', true)));

// Default
gulp.task('default', ['compile']);

// All
gulp.task('compile', ['monaco-typecheck', 'compile-client', 'compile-extensions']);
gulp.task('watch', [/* 'monaco-typecheck-watch', */ 'watch-client', 'watch-extensions']);

// All Build
gulp.task('compile-build', ['compile-client-build', 'compile-extensions-build']);

process.on('unhandledRejection', (reason, p) => {
	console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
	process.exit(1);
});

// Load all the gulpfiles only if running tasks other than the editor tasks
const build = path.join(__dirname, 'build');
require('glob').sync('gulpfile.*.js', { cwd: build })
	.forEach(f => require(`./build/${f}`));
