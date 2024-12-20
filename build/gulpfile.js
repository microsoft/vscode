/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

// Increase max listeners for event emitters
require('events').EventEmitter.defaultMaxListeners = 100;

const gulp = require('gulp');
const util = require('./lib/util');
const task = require('./lib/task');
const { transpileClientSWC, transpileTask, compileTask, watchTask, compileApiProposalNamesTask, watchApiProposalNamesTask } = require('./lib/compilation');
const { monacoTypecheckTask/* , monacoTypecheckWatchTask */ } = require('./gulpfile.editor');
const { compileExtensionsTask, watchExtensionsTask, compileExtensionMediaTask } = require('./gulpfile.extensions');

// API proposal names
gulp.task(compileApiProposalNamesTask);
gulp.task(watchApiProposalNamesTask);

// SWC Client Transpile
const transpileClientSWCTask = task.define('transpile-client-esbuild', task.series(util.rimraf('out'), transpileTask('src', 'out', true)));
gulp.task(transpileClientSWCTask);

// Transpile only
const transpileClientTask = task.define('transpile-client', task.series(util.rimraf('out'), transpileTask('src', 'out')));
gulp.task(transpileClientTask);

// Fast compile for development time
const compileClientTask = task.define('compile-client', task.series(util.rimraf('out'), compileApiProposalNamesTask, compileTask('src', 'out', false)));
gulp.task(compileClientTask);

const watchClientTask = task.define('watch-client', task.series(util.rimraf('out'), task.parallel(watchTask('out', false), watchApiProposalNamesTask)));
gulp.task(watchClientTask);

// All
const _compileTask = task.define('compile', task.parallel(monacoTypecheckTask, compileClientTask, compileExtensionsTask, compileExtensionMediaTask));
gulp.task(_compileTask);

gulp.task(task.define('watch', task.parallel(/* monacoTypecheckWatchTask, */ watchClientTask, watchExtensionsTask)));

// Default
gulp.task('default', _compileTask);

process.on('unhandledRejection', (reason, p) => {
	console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
	process.exit(1);
});

// Load all the gulpfiles only if running tasks other than the editor tasks
require('glob').sync('gulpfile.*.js', { cwd: __dirname })
	.forEach(f => require(`./${f}`));
