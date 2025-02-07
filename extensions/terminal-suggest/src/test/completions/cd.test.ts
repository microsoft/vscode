/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import cdSpec from '../../completions/cd';
import { testPaths, type ISuiteSpec } from '../helpers';

export const cdTestSuiteSpec: ISuiteSpec = {
	name: 'cd',
	completionSpecs: cdSpec,
	availableCommands: 'cd',
	testSpecs: [
		// Typing a path
		{ input: '.|', expectedCompletions: ['cd'], expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		{ input: './|', expectedCompletions: ['cd'], expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		{ input: './.|', expectedCompletions: ['cd'], expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },

		// Typing the command
		{ input: 'c|', expectedCompletions: ['cd'], expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		{ input: 'cd|', expectedCompletions: ['cd'], expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },

		// Basic arguments
		{ input: 'cd |', expectedCompletions: ['~', '-'], expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },
		{ input: 'cd -|', expectedCompletions: ['-'], expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },
		{ input: 'cd ~|', expectedCompletions: ['~'], expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },

		// Relative paths
		{ input: 'cd c|', expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },
		{ input: 'cd child|', expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },
		{ input: 'cd .|', expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },
		{ input: 'cd ./|', expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },
		{ input: 'cd ./child|', expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },
		{ input: 'cd ..|', expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },

		// Relative directories (changes cwd due to /)
		{ input: 'cd child/|', expectedResourceRequests: { type: 'folders', cwd: testPaths.cwdChild } },
		{ input: 'cd ../|', expectedResourceRequests: { type: 'folders', cwd: testPaths.cwdParent } },
		{ input: 'cd ../sibling|', expectedResourceRequests: { type: 'folders', cwd: testPaths.cwdParent } },
	]
};
