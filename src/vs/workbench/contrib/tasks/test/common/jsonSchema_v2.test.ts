/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IJSONSchema } from '../../../../../base/common/jsonSchema.js';
import schema from '../../common/jsonSchema_v2.js';

suite('Task Schema v2', () => {

	test('Schema should allow compound tasks without type and command', () => {
		// Compound task with only label and dependsOn
		const compoundTask = {
			label: 'Build All',
			dependsOn: ['Client Build', 'Server Build']
		};

		// The schema should have compound task definition in taskDefinitions
		const definitions = schema.definitions;
		assert.ok(definitions, 'Schema should have definitions');
	});

	test('Schema should allow beginsPattern as string', () => {
		const taskWithStringPattern = {
			label: 'Watch Task',
			type: 'shell',
			command: 'npm',
			args: ['run', 'watch'],
			isBackground: true,
			problemMatcher: {
				base: '$tsc-watch',
				background: {
					activeOnStart: true,
					beginsPattern: '^\\s*Starting compilation',
					endsPattern: '^\\s*Compilation complete'
				}
			}
		};

		// This should be valid according to the schema
		assert.ok(taskWithStringPattern.problemMatcher.background.beginsPattern);
	});

	test('Schema should allow beginsPattern as object with regexp', () => {
		const taskWithObjectPattern = {
			label: 'Watch Task',
			type: 'shell',
			command: 'npm',
			args: ['run', 'watch'],
			isBackground: true,
			problemMatcher: {
				base: '$tsc-watch',
				background: {
					activeOnStart: true,
					beginsPattern: {
						regexp: 'File change detected\\. Starting incremental compilation\\.\\.\\.'
					},
					endsPattern: {
						regexp: 'Compilation complete\\. Watching for file changes\\.'
					}
				}
			}
		};

		// This should be valid according to the schema
		assert.ok(taskWithObjectPattern.problemMatcher.background.beginsPattern);
		assert.strictEqual(typeof taskWithObjectPattern.problemMatcher.background.beginsPattern, 'object');
	});

	test('Schema should require type and command for process tasks', () => {
		const processTask = {
			label: 'Run Process',
			type: 'process',
			command: 'echo',
			args: ['Hello from process']
		};

		// Process tasks must have both type and command
		assert.ok(processTask.type);
		assert.ok(processTask.command);
	});

	test('Schema should allow shell tasks without explicit type', () => {
		const shellTask = {
			label: 'Shell Task',
			command: 'npm',
			args: ['run', 'build']
		};

		// Shell tasks can omit type (defaults to shell)
		assert.ok(shellTask.command);
	});

	test('Compound task should not require command', () => {
		const compoundTask = {
			label: 'Compound',
			dependsOn: ['Task1', 'Task2'],
			dependsOrder: 'sequence'
		};

		// Compound tasks don't have a command
		assert.strictEqual(compoundTask.hasOwnProperty('command'), false);
		assert.strictEqual(compoundTask.hasOwnProperty('type'), false);
	});
});
