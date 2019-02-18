/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const util = require('./lib/util');
const task = require('./lib/task');
const compilation = require('./lib/compilation');
const { compileExtensionsBuildTask } = require('./gulpfile.extensions');

// Full compile, including nls and inline sources in sourcemaps, for build
const compileClientBuildTask = task.define('compile-client-build', task.series(util.rimraf('out-build'), compilation.compileTask('src', 'out-build', true)));

// All Build
const compileBuildTask = task.define('compile-build', task.parallel(compileClientBuildTask, compileExtensionsBuildTask));
exports.compileBuildTask = compileBuildTask;