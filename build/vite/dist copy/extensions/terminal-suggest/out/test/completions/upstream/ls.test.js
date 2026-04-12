"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lsTestSuiteSpec = void 0;
require("mocha");
const helpers_1 = require("../../helpers");
const ls_1 = __importDefault(require("../../../completions/upstream/ls"));
const allOptions = [
    '-%',
    '-,',
    '--color <when>',
    '-1',
    '-@',
    '-A',
    '-B',
    '-C',
    '-F',
    '-G',
    '-H',
    '-L',
    '-O',
    '-P',
    '-R',
    '-S',
    '-T',
    '-U',
    '-W',
    '-a',
    '-b',
    '-c',
    '-d',
    '-e',
    '-f',
    '-g',
    '-h',
    '-i',
    '-k',
    '-l',
    '-m',
    '-n',
    '-o',
    '-p',
    '-q',
    '-r',
    '-s',
    '-t',
    '-u',
    '-v',
    '-w',
    '-x',
];
const expectedCompletions = [{ label: 'ls', description: ls_1.default.description }];
exports.lsTestSuiteSpec = {
    name: 'ls',
    completionSpecs: ls_1.default,
    availableCommands: 'ls',
    testSpecs: [
        // Empty input
        { input: '|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        // Typing the command
        { input: 'l|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        { input: 'ls|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        // Basic options
        // TODO: The spec wants file paths and folders (which seems like it should only be folders),
        { input: 'ls |', expectedCompletions: allOptions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        { input: 'ls -|', expectedCompletions: allOptions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        { input: 'ls -a|', expectedCompletions: allOptions },
        // Duplicate option
        { input: 'ls -a -|', expectedCompletions: allOptions.filter(o => o !== '-a'), expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        // Relative paths
        { input: 'ls c|', expectedCompletions: allOptions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        { input: 'ls child|', expectedCompletions: allOptions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        { input: 'ls .|', expectedCompletions: allOptions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        { input: 'ls ./|', expectedCompletions: allOptions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        { input: 'ls ./child|', expectedCompletions: allOptions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        { input: 'ls ..|', expectedCompletions: allOptions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        // Relative directories (changes cwd due to /)
        { input: 'ls child/|', expectedCompletions: allOptions, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwdChild } },
        // Paths with .. are handled by the completion service to avoid double-navigation (no cwd resolution)
        { input: 'ls ../|', expectedCompletions: allOptions, expectedResourceRequests: { type: 'both' } },
        { input: 'ls ../sibling|', expectedCompletions: allOptions, expectedResourceRequests: { type: 'both' } },
    ]
};
//# sourceMappingURL=ls.test.js.map