"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mkdirTestSuiteSpec = void 0;
require("mocha");
const helpers_1 = require("../../helpers");
const mkdir_1 = __importDefault(require("../../../completions/upstream/mkdir"));
const allOptions = [
    '--context <context>',
    '--help',
    '--mode <mode>',
    '--parents',
    '--verbose',
    '--version',
    '-Z <context>',
    '-m <mode>',
    '-p',
    '-v',
];
const expectedCompletions = [{ label: 'mkdir', description: mkdir_1.default.description }];
exports.mkdirTestSuiteSpec = {
    name: 'mkdir',
    completionSpecs: mkdir_1.default,
    availableCommands: 'mkdir',
    testSpecs: [
        // Empty input
        { input: '|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        // Typing the command
        { input: 'm|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        { input: 'mkdir|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        // Basic options
        { input: 'mkdir |', expectedCompletions: allOptions, expectedResourceRequests: { type: 'folders', cwd: helpers_1.testPaths.cwd } },
        // Duplicate option
        // TODO: Duplicate options should not be presented https://github.com/microsoft/vscode/issues/239607
        // { input: 'mkdir -Z -|', expectedCompletions: removeArrayEntries(allOptions, '-z') },
        // { input: 'mkdir -Z -m -|', expectedCompletions: removeArrayEntries(allOptions, '-z', '-m') },
    ]
};
//# sourceMappingURL=mkdir.test.js.map