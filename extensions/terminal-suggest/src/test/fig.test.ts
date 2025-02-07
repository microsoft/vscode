/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { testPaths, type ISuiteSpec } from './helpers';

export const figGenericTestSuites: ISuiteSpec[] = [
	{
		name: 'Fig name and description only',
		completionSpecs: [
			{
				name: 'foo',
				description: 'Foo',
			}
		],
		availableCommands: 'foo',
		testSpecs: [
			// Typing a path
			{ input: '|', expectedCompletions: ['foo'], expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
			{ input: 'f|', expectedCompletions: ['foo'], expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
			{ input: 'fo|', expectedCompletions: ['foo'], expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
			{ input: 'foo|', expectedCompletions: ['foo'], expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },

			// Basic arguments (fallback)
			{ input: 'foo |', expectedCompletions: [], expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } }
		]
	},
	{
		name: 'Fig top-level args files only',
		completionSpecs: [
			{
				name: 'foo',
				description: 'Foo',
				args: {
					template: 'filepaths',
					isVariadic: true,
				}
			}
		],
		availableCommands: 'foo',
		testSpecs: [
			{ input: 'foo |', expectedCompletions: [], expectedResourceRequests: { type: 'files', cwd: testPaths.cwd } },
		]
	},
	{
		name: 'Fig top-level args folders only',
		completionSpecs: [
			{
				name: 'foo',
				description: 'Foo',
				args: {
					template: 'folders',
					isVariadic: true,
				}
			}
		],
		availableCommands: 'foo',
		testSpecs: [
			{ input: 'foo |', expectedCompletions: [], expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },
		]
	},
	{
		name: 'Fig top-level args files and folders',
		completionSpecs: [
			{
				name: 'foo',
				description: 'Foo',
				args: {
					template: ['filepaths', 'folders'],
					isVariadic: true,
				}
			}
		],
		availableCommands: 'foo',
		testSpecs: [
			{ input: 'foo |', expectedCompletions: [], expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		]
	},
	{
		name: 'Fig top-level options',
		completionSpecs: [
			{
				name: 'foo',
				description: 'Foo',
				options: [
					{ name: '--bar', description: 'Bar' },
					{ name: '--baz', description: 'Baz' }
				]
			}
		],
		availableCommands: 'foo',
		testSpecs: [
			{ input: 'foo |', expectedCompletions: ['--bar', '--baz'] },
			{ input: 'foo bar|', expectedCompletions: ['--bar', '--baz'] },
			// TODO: Duplicate options should not be presented https://github.com/microsoft/vscode/issues/239607
			// { input: 'foo --bar |', expectedCompletions: ['--baz'] },
			// { input: 'foo --baz |', expectedCompletions: ['--bar'] },
		]
	},
	{
		name: 'Fig top-level option values',
		completionSpecs: [
			{
				name: 'foo',
				description: 'Foo',
				options: [
					{
						name: '--bar',
						description: 'Bar',
						args: {
							name: 'baz',
							suggestions: [
								'a',
								'b',
								'c',
							],
						}
					}
				]
			}
		],
		availableCommands: 'foo',
		testSpecs: [
			{ input: 'foo |', expectedCompletions: ['--bar'] },
			{ input: 'foo --bar |', expectedCompletions: ['a', 'b', 'c'] },
			// TODO: All options should be suggested here? https://github.com/microsoft/vscode/issues/239713
			// { input: 'foo --bar a|', expectedCompletions: ['a', 'b', 'c'] },
			// { input: 'foo --bar b|', expectedCompletions: ['a', 'b', 'c'] },
			// { input: 'foo --bar c|', expectedCompletions: ['a', 'b', 'c'] },
		]
	}
];
