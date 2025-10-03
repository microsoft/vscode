/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import { testPaths, type ISuiteSpec } from '../../helpers';
import rmdirSpec from '../../../completions/upstream/rmdir';

const allOptions = [
	'-p',
];
// eslint-disable-next-line local/code-no-any-casts
const expectedCompletions = [{ label: 'rmdir', description: (rmdirSpec as any).description }];

export const rmdirTestSuiteSpec: ISuiteSpec = {
	name: 'rmdir',
	completionSpecs: rmdirSpec,
	availableCommands: 'rmdir',
	testSpecs: [
		// Empty input
		{ input: '|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },

		// Typing the command
		{ input: 'r|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		{ input: 'rmdir|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },

		// Basic options
		{ input: 'rmdir |', expectedCompletions: allOptions, expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },
	]
};
