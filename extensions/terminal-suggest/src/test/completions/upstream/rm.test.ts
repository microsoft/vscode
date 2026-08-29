/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import { testPaths, type ISuiteSpec } from '../../helpers';
import rmSpec from '../../../completions/upstream/rm';

const allOptions = [
	'-P',
	'-R',
	'-d',
	'-f',
	'-i',
	'-r',
	'-v',
];
const expectedCompletions = [{ label: 'rm', description: (rmSpec as Fig.Subcommand).description }];
export const rmTestSuiteSpec: ISuiteSpec = {
	name: 'rm',
	completionSpecs: rmSpec,
	availableCommands: 'rm',
	testSpecs: [
		// Empty input
		{ input: '|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },

		// Typing the command
		{ input: 'r|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		{ input: 'rm|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },

		// Basic options
		{ input: 'rm |', expectedCompletions: allOptions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },

		// Duplicate option
		// TODO: Duplicate options should not be presented https://github.com/microsoft/vscode/issues/239607
		// { input: `rm -${allOptions[0]} -|`, expectedCompletions: removeArrayEntries(allOptions, allOptions[0]) },
		// { input: `rm -${allOptions[0]} -${allOptions[1]} -|`, expectedCompletions: removeArrayEntries(allOptions, allOptions[0], allOptions[1]) },
	]
};
