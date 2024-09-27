/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

const gulp = require('gulp');
const util = require('./lib/util');
const date = require('./lib/date');
const task = require('./lib/task');
const compilation = require('./lib/compilation');
const optimize = require('./lib/optimize');

/**
 * @param {boolean} disableMangle
 */
function makeCompileBuildTask(disableMangle) {
	return task.series(
		util.rimraf('out-build'),
		util.buildWebNodePaths('out-build'),
		date.writeISODate('out-build'),
		compilation.compileApiProposalNamesTask,
		compilation.compileTask('src', 'out-build', true, { disableMangle }),
		optimize.optimizeLoaderTask('out-build', 'out-build', true)
	);
}

// Full compile, including nls and inline sources in sourcemaps, mangling, minification, for build
const compileBuildTask = task.define('compile-build', makeCompileBuildTask(false));
gulp.task(compileBuildTask);
exports.compileBuildTask = compileBuildTask;

// Full compile for PR ci, e.g no mangling
const compileBuildTaskPullRequest = task.define('compile-build-pr', makeCompileBuildTask(true));
gulp.task(compileBuildTaskPullRequest);
exports.compileBuildTaskPullRequest = compileBuildTaskPullRequest;
