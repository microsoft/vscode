"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rmdirTestSuiteSpec = void 0;
require("mocha");
const helpers_1 = require("../../helpers");
const rmdir_1 = __importDefault(require("../../../completions/upstream/rmdir"));
const allOptions = [
    '-p',
];
const expectedCompletions = [{ label: 'rmdir', description: rmdir_1.default.description }];
exports.rmdirTestSuiteSpec = {
    name: 'rmdir',
    completionSpecs: rmdir_1.default,
    availableCommands: 'rmdir',
    testSpecs: [
        // Empty input
        { input: '|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        // Typing the command
        { input: 'r|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        { input: 'rmdir|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        // Basic options
        { input: 'rmdir |', expectedCompletions: allOptions, expectedResourceRequests: { type: 'folders', cwd: helpers_1.testPaths.cwd } },
    ]
};
//# sourceMappingURL=rmdir.test.js.map