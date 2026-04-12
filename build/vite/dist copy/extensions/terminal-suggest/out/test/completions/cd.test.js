"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cdTestSuiteSpec = void 0;
require("mocha");
const cd_1 = __importDefault(require("../../completions/cd"));
const helpers_1 = require("../helpers");
const expectedCompletions = ['-'];
const cdExpectedCompletions = [{ label: 'cd', description: cd_1.default.description }];
exports.cdTestSuiteSpec = {
    name: 'cd',
    completionSpecs: cd_1.default,
    availableCommands: 'cd',
    testSpecs: [
        // Typing a path
        { input: '.|', expectedCompletions: cdExpectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        { input: './|', expectedCompletions: cdExpectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        { input: './.|', expectedCompletions: cdExpectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        // Typing the command
        { input: 'c|', expectedCompletions: cdExpectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        { input: 'cd|', expectedCompletions: cdExpectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        // Basic arguments
        { input: 'cd |', expectedCompletions, expectedResourceRequests: { type: 'folders', cwd: helpers_1.testPaths.cwd } },
        { input: 'cd -|', expectedCompletions, expectedResourceRequests: { type: 'folders', cwd: helpers_1.testPaths.cwd } },
        // Relative paths
        { input: 'cd c|', expectedCompletions, expectedResourceRequests: { type: 'folders', cwd: helpers_1.testPaths.cwd } },
        { input: 'cd child|', expectedCompletions, expectedResourceRequests: { type: 'folders', cwd: helpers_1.testPaths.cwd } },
        { input: 'cd .|', expectedCompletions, expectedResourceRequests: { type: 'folders', cwd: helpers_1.testPaths.cwd } },
        { input: 'cd ./|', expectedCompletions, expectedResourceRequests: { type: 'folders', cwd: helpers_1.testPaths.cwd } },
        { input: 'cd ./child|', expectedCompletions, expectedResourceRequests: { type: 'folders', cwd: helpers_1.testPaths.cwd } },
        { input: 'cd ..|', expectedCompletions, expectedResourceRequests: { type: 'folders', cwd: helpers_1.testPaths.cwd } },
        // Relative directories (changes cwd due to /)
        { input: 'cd child/|', expectedCompletions, expectedResourceRequests: { type: 'folders', cwd: helpers_1.testPaths.cwdChild } },
        // Paths with .. are handled by the completion service to avoid double-navigation (no cwd resolution)
        { input: 'cd ../|', expectedCompletions, expectedResourceRequests: { type: 'folders' } },
        { input: 'cd ../sibling|', expectedCompletions, expectedResourceRequests: { type: 'folders' } },
    ]
};
//# sourceMappingURL=cd.test.js.map