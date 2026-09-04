/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import { testPaths, type ISuiteSpec } from '../helpers';
import cargoSpec from '../../completions/cargo';

const cargoExpectedCompletions = [{ label: 'cargo', description: (cargoSpec as Fig.Subcommand).description }];

const allSubcommandsAndOptions = [
	'build', 'b', 'run', 'r', 'test', 't', 'check', 'c',
	'clippy', 'fmt', 'add', 'remove', 'clean', 'doc', 'd',
	'publish', 'update', 'new', 'init',
	'-F', '--features', '--all-features', '--no-default-features',
	'-h', '--help', '-V', '--version'
];

export const cargoTestSuiteSpec: ISuiteSpec = {
	name: 'cargo',
	completionSpecs: cargoSpec,
	availableCommands: 'cargo',
	testSpecs: [
		// Empty input
		{ input: '|', expectedCompletions: cargoExpectedCompletions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },

		// Typing the command
		{ input: 'c|', expectedCompletions: cargoExpectedCompletions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		{ input: 'car|', expectedCompletions: cargoExpectedCompletions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		{ input: 'cargo|', expectedCompletions: cargoExpectedCompletions, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },

		// Basic options and subcommands
		{ input: 'cargo |', expectedCompletions: allSubcommandsAndOptions },
	]
};
