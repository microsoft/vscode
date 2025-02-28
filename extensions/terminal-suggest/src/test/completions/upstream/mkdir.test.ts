/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import { testPaths, type ISuiteSpec } from '../../helpers';
import mkdirSpec from '../../../completions/upstream/mkdir';

const allOptions = [
	'--context',
	'--help',
	'--mode',
	'--parents',
	'--verbose',
	'--version',
	'-Z',
	'-m',
	'-p',
	'-v',
];
const expectedCompletions = [{ label: 'mkdir', description: (mkdirSpec as any).description }];
export const mkdirTestSuiteSpec: ISuiteSpec = {
	name: 'mkdir',
	completionSpecs: mkdirSpec,
	availableCommands: 'mkdir',
	testSpecs: [
		// Empty input
		{ input: '|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },

		// Typing the command
		{ input: 'm|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		{ input: 'mkdir|', expectedCompletions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },

		// Basic options
		{ input: 'mkdir |', expectedCompletions: allOptions, expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },

		// Duplicate option
		// TODO: Duplicate options should not be presented https://github.com/microsoft/vscode/issues/239607
		// { input: 'mkdir -Z -|', expectedCompletions: removeArrayEntries(allOptions, '-z') },
		// { input: 'mkdir -Z -m -|', expectedCompletions: removeArrayEntries(allOptions, '-z', '-m') },
	]
};
