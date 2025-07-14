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

/**
 * @param {boolean} disableMangle
 */
function makeCompileBuildTask(disableMangle) {
	return task.series(
		util.rimraf('out-build'),
		date.writeISODate('out-build'),
		compilation.compileApiProposalNamesTask,
		compilation.compileTask('src', 'out-build', true, { disableMangle })
	);
}

// Local/PR compile, including nls and inline sources in sourcemaps, minification, no mangling
const compileBuildWithoutManglingTask = task.define('compile-build-without-mangling', makeCompileBuildTask(true));
gulp.task(compileBuildWithoutManglingTask);
exports.compileBuildWithoutManglingTask = compileBuildWithoutManglingTask;

// CI compile, including nls and inline sources in sourcemaps, mangling, minification, for build
const compileBuildWithManglingTask = task.define('compile-build-with-mangling', makeCompileBuildTask(false));
gulp.task(compileBuildWithManglingTask);
exports.compileBuildWithManglingTask = compileBuildWithManglingTask;
