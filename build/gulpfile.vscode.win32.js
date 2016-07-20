/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const gulp = require('gulp');
const util = require('./lib/util');

function buildWin32Setup() {

}

gulp.task('clean-vscode-win32-setup', util.rimraf('.build/win32/setup'));
gulp.task('vscode-win32-setup', ['clean-vscode-win32-setup', 'vscode-win32-min'], buildWin32Setup('ia32'));
