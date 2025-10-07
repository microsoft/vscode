/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import { testPaths, type ISuiteSpec } from '../../helpers';
import touchSpec from '../../../completions/upstream/touch';

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
const expectedCompletions = [{ label: 'touch', description: (touchSpec as Fig.Subcommand).description }];

export const touchTestSuiteSpec: ISuiteSpec = {
	name: 'touch',
	completionSpecs: touchSpec,
	availableCommands: 'touch',
	testSpecs: [
		// Empty input
		{ input: '|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },

		// Typing the command
		{ input: 't|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		{ input: 'touch|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },

		// Basic options
		{ input: 'touch |', expectedCompletions: allOptions, expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },
	]
};
