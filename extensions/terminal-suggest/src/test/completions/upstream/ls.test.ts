/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import { testPaths, type ISuiteSpec } from '../../helpers';
import lsSpec from '../../../completions/upstream/ls';

const allOptions = [
	'-%',
	'-,',
	'--color',
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

export function removeEntry<T>(array: T[], element: T): T[] {
	const index = array.indexOf(element);
	if (index > -1) {
		array.splice(index, 1);
	}
	return array;
}

export const lsTestSuiteSpec: ISuiteSpec = {
	name: 'ls',
	completionSpecs: lsSpec,
	availableCommands: 'ls',
	testSpecs: [
		// Empty input
		{ input: '|', expectedCompletions: ['ls'], expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },

		// Typing the command
		{ input: 'l|', expectedCompletions: ['ls'], expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		{ input: 'ls|', expectedCompletions: ['ls'], expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },

		// Basic options
		// TODO: The spec wants file paths and folders (which seems like it should only be folders),
		//       but neither are requested
		{ input: 'ls |', expectedCompletions: allOptions, expectedResourceRequests: undefined }, // { type: 'folders', cwd: testPaths.cwd }
		{ input: 'ls -|', expectedCompletions: allOptions, expectedResourceRequests: undefined }, // { type: 'folders', cwd: testPaths.cwd }

		// Filtering options should request all options so client side can filter
		{ input: 'ls -a|', expectedCompletions: allOptions, expectedResourceRequests: undefined }, // { type: 'folders', cwd: testPaths.cwd }

		// Duplicate option
		// TODO: Duplicate options should not be presented
		// { input: 'ls -a -|', expectedCompletions: removeEntry(allOptions, '-a'), expectedResourceRequests: undefined }, // { type: 'folders', cwd: testPaths.cwd }

		// Relative paths
		{ input: 'ls c|', expectedCompletions: allOptions, expectedResourceRequests: undefined }, // { type: 'folders', cwd: testPaths.cwd }
		{ input: 'ls child|', expectedCompletions: allOptions, expectedResourceRequests: undefined }, // { type: 'folders', cwd: testPaths.cwd }
		{ input: 'ls .|', expectedCompletions: allOptions, expectedResourceRequests: undefined }, // { type: 'folders', cwd: testPaths.cwd }
		{ input: 'ls ./|', expectedCompletions: allOptions, expectedResourceRequests: undefined }, // { type: 'folders', cwd: testPaths.cwd }
		{ input: 'ls ./child|', expectedCompletions: allOptions, expectedResourceRequests: undefined }, // { type: 'folders', cwd: testPaths.cwd }
		{ input: 'ls ..|', expectedCompletions: allOptions, expectedResourceRequests: undefined }, // { type: 'folders', cwd: testPaths.cwd }

		// Relative directories (changes cwd due to /)
		{ input: 'ls child/|', expectedCompletions: allOptions, expectedResourceRequests: undefined }, // { type: 'folders', cwd: testPaths.cwdChild }
		{ input: 'ls ../|', expectedCompletions: allOptions, expectedResourceRequests: undefined }, // { type: 'folders', cwd: testPaths.cwdParent }
		{ input: 'ls ../sibling|', expectedCompletions: allOptions, expectedResourceRequests: undefined }, // { type: 'folders', cwd: testPaths.cwdParent }
	]
};
