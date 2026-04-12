"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rmTestSuiteSpec = void 0;
require("mocha");
const helpers_1 = require("../../helpers");
const rm_1 = __importDefault(require("../../../completions/upstream/rm"));
const allOptions = [
    '-P',
    '-R',
    '-d',
    '-f',
    '-i',
    '-r',
    '-v',
];
const expectedCompletions = [{ label: 'rm', description: rm_1.default.description }];
exports.rmTestSuiteSpec = {
    name: 'rm',
    completionSpecs: rm_1.default,
    availableCommands: 'rm',
    testSpecs: [
        // Empty input
        { input: '|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        // Typing the command
        { input: 'r|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        { input: 'rm|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        // Basic options
        { input: 'rm |', expectedCompletions: allOptions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        // Duplicate option
        // TODO: Duplicate options should not be presented https://github.com/microsoft/vscode/issues/239607
        // { input: `rm -${allOptions[0]} -|`, expectedCompletions: removeArrayEntries(allOptions, allOptions[0]) },
        // { input: `rm -${allOptions[0]} -${allOptions[1]} -|`, expectedCompletions: removeArrayEntries(allOptions, allOptions[0], allOptions[1]) },
    ]
};
//# sourceMappingURL=rm.test.js.map