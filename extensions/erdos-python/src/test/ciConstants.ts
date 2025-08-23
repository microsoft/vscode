// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

//
// Constants that pertain to CI processes/tests only. No dependencies on vscode!
//
export const PYTHON_VIRTUAL_ENVS_LOCATION = process.env.PYTHON_VIRTUAL_ENVS_LOCATION;
export const IS_APPVEYOR = process.env.APPVEYOR === 'true';
export const IS_TRAVIS = process.env.TRAVIS === 'true';
export const IS_VSTS = process.env.TF_BUILD !== undefined;
export const IS_GITHUB_ACTIONS = process.env.GITHUB_ACTIONS === 'true';
export const IS_CI_SERVER = IS_TRAVIS || IS_APPVEYOR || IS_VSTS || IS_GITHUB_ACTIONS;

// Control JUnit-style output logging for reporting purposes.
let reportJunit: boolean = false;
if (IS_CI_SERVER && process.env.MOCHA_REPORTER_JUNIT !== undefined) {
    reportJunit = process.env.MOCHA_REPORTER_JUNIT.toLowerCase() === 'true';
}
export const MOCHA_REPORTER_JUNIT: boolean = reportJunit;
export const IS_CI_SERVER_TEST_DEBUGGER = process.env.IS_CI_SERVER_TEST_DEBUGGER === '1';
