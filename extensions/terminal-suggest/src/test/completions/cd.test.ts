/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import cdSpec from '../../completions/cd';
import { testPaths, type ISuiteSpec } from '../helpers';

const expectedCompletions = ['-'];
const cdExpectedCompletions = [{ label: 'cd', description: (cdSpec as Fig.Subcommand).description }];
export const cdTestSuiteSpec: ISuiteSpec = {
	name: 'cd',
	completionSpecs: cdSpec,
	availableCommands: 'cd',
	testSpecs: [
		// Typing a path
		{ input: '.|', expectedCompletions: cdExpectedCompletions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		{ input: './|', expectedCompletions: cdExpectedCompletions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		{ input: './.|', expectedCompletions: cdExpectedCompletions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },

		// Typing the command
		{ input: 'c|', expectedCompletions: cdExpectedCompletions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		{ input: 'cd|', expectedCompletions: cdExpectedCompletions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },

		// Basic arguments
		{ input: 'cd |', expectedCompletions, expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },
		{ input: 'cd -|', expectedCompletions, expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },

		// Relative paths
		{ input: 'cd c|', expectedCompletions, expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },
		{ input: 'cd child|', expectedCompletions, expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },
		{ input: 'cd .|', expectedCompletions, expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },
		{ input: 'cd ./|', expectedCompletions, expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },
		{ input: 'cd ./child|', expectedCompletions, expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },
		{ input: 'cd ..|', expectedCompletions, expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },

		// Relative directories (changes cwd due to /)
		{ input: 'cd child/|', expectedCompletions, expectedResourceRequests: { type: 'folders', cwd: testPaths.cwdChild } },
		{ input: 'cd ../|', expectedCompletions, expectedResourceRequests: { type: 'folders', cwd: testPaths.cwdParent } },
		{ input: 'cd ../sibling|', expectedCompletions, expectedResourceRequests: { type: 'folders', cwd: testPaths.cwdParent } },
	]
};
