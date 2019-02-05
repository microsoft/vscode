/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const util = require('./lib/util');
const compilation = require('./lib/compilation');
const { compileExtensionsBuildTask } = require('./gulpfile.extensions');

// Full compile, including nls and inline sources in sourcemaps, for build
const compileClientBuildTask = util.task.series(util.rimraf('out-build'), compilation.compileTask('src', 'out-build', true));
compileClientBuildTask.displayName = 'compile-client-build';

// All Build
const compileBuildTask = util.task.parallel(compileClientBuildTask, compileExtensionsBuildTask);
compileBuildTask.displayName = 'compile-build';

exports.compileBuildTask = compileBuildTask;