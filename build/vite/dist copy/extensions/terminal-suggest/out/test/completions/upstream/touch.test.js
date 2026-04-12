"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.touchTestSuiteSpec = void 0;
require("mocha");
const helpers_1 = require("../../helpers");
const touch_1 = __importDefault(require("../../../completions/upstream/touch"));
const allOptions = [
    '-A <time>',
    '-a',
    '-c',
    '-f',
    '-h',
    '-m',
    '-r <file>',
    '-t <timestamp>',
];
const expectedCompletions = [{ label: 'touch', description: touch_1.default.description }];
exports.touchTestSuiteSpec = {
    name: 'touch',
    completionSpecs: touch_1.default,
    availableCommands: 'touch',
    testSpecs: [
        // Empty input
        { input: '|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        // Typing the command
        { input: 't|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        { input: 'touch|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        // Basic options
        { input: 'touch |', expectedCompletions: allOptions, expectedResourceRequests: { type: 'folders', cwd: helpers_1.testPaths.cwd } },
    ]
};
//# sourceMappingURL=touch.test.js.map