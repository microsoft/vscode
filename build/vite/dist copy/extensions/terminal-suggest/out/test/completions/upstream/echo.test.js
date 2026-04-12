"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.echoTestSuiteSpec = void 0;
require("mocha");
const helpers_1 = require("../../helpers");
const echo_1 = __importDefault(require("../../../completions/upstream/echo"));
const allOptions = [
    '-E',
    '-e',
    '-n',
];
const echoExpectedCompletions = [{ label: 'echo', description: echo_1.default.description }];
exports.echoTestSuiteSpec = {
    name: 'echo',
    completionSpecs: echo_1.default,
    availableCommands: 'echo',
    testSpecs: [
        // Empty input
        { input: '|', expectedCompletions: echoExpectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        // Typing the command
        { input: 'e|', expectedCompletions: echoExpectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        { input: 'ec|', expectedCompletions: echoExpectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        { input: 'ech|', expectedCompletions: echoExpectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        { input: 'echo|', expectedCompletions: echoExpectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        // Basic options
        { input: 'echo |', expectedCompletions: allOptions },
        // Duplicate option
        // TODO: Duplicate options should not be presented https://github.com/microsoft/vscode/issues/239607
        // { input: 'echo -e -|', expectedCompletions: removeArrayEntries(allOptions, '-e') },
        // { input: 'echo -e -E -|', expectedCompletions: removeArrayEntries(allOptions, '-e', '-E') },
    ]
};
//# sourceMappingURL=echo.test.js.map