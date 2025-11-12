/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
//@ts-check
import gulp from 'gulp';
import util from './lib/util.js';
import date from './lib/date.js';
import task from './lib/task.js';
import compilation from './lib/compilation.js';

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
export const compileBuildWithoutManglingTask = task.define('compile-build-without-mangling', makeCompileBuildTask(true));
gulp.task(compileBuildWithoutManglingTask);

// CI compile, including nls and inline sources in sourcemaps, mangling, minification, for build
export const compileBuildWithManglingTask = task.define('compile-build-with-mangling', makeCompileBuildTask(false));
gulp.task(compileBuildWithManglingTask);
