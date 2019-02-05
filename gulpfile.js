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
const { monacoTypecheckTask/* , monacoTypecheckWatchTask */ } = require('./build/gulpfile.editor');
const { compileExtensionsTask, watchExtensionsTask } = require('./build/gulpfile.extensions');

// Fast compile for development time
const compileClientTask = util.task.series(util.rimraf('out'), compilation.compileTask('src', 'out', false));
compileClientTask.displayName = 'compile-client';
gulp.task(compileClientTask.displayName, compileClientTask);

const watchClientTask = util.task.series(util.rimraf('out'), compilation.watchTask('out', false));
watchClientTask.displayName = 'watch-client';
gulp.task(watchClientTask.displayName, watchClientTask);

// All
const compileTask = util.task.parallel(monacoTypecheckTask, compileClientTask, compileExtensionsTask);
compileTask.displayName = 'compile';
gulp.task(compileTask.displayName, compileTask);

gulp.task('watch', util.task.parallel(/* monacoTypecheckWatchTask, */ watchClientTask, watchExtensionsTask));

// Default
gulp.task('default', compileTask);

process.on('unhandledRejection', (reason, p) => {
	console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
	process.exit(1);
});

// Load all the gulpfiles only if running tasks other than the editor tasks
const build = path.join(__dirname, 'build');
require('glob').sync('gulpfile.*.js', { cwd: build })
	.forEach(f => require(`./build/${f}`));
