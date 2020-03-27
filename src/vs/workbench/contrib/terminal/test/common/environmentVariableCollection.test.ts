/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { EnvironmentVariableMutatorType } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { MergedEnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariableCollection';
import { deserializeEnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariableShared';

suite.only('EnvironmentVariable - MergedEnvironmentVariableCollection', () => {
	suite('applyToProcessEnvironment', () => {
		test('should apply the collection to an environment', () => {
			const merged = new MergedEnvironmentVariableCollection(new Map([
				['ext', deserializeEnvironmentVariableCollection([
					['A', { value: 'a', type: EnvironmentVariableMutatorType.Replace }],
					['B', { value: 'b', type: EnvironmentVariableMutatorType.Append }],
					['C', { value: 'c', type: EnvironmentVariableMutatorType.Prepend }]
				])]
			]));
			const env: IProcessEnvironment = {
				A: 'foo',
				B: 'bar',
				C: 'baz'
			};
			merged.applyToProcessEnvironment(env);
			deepStrictEqual(env, {
				A: 'a',
				B: 'barb',
				C: 'cbaz'
			});
		});

		test('should apply the collection to environment entries with no values', () => {
			const merged = new MergedEnvironmentVariableCollection(new Map([
				['ext', deserializeEnvironmentVariableCollection([
					['A', { value: 'a', type: EnvironmentVariableMutatorType.Replace }],
					['B', { value: 'b', type: EnvironmentVariableMutatorType.Append }],
					['C', { value: 'c', type: EnvironmentVariableMutatorType.Prepend }]
				])]
			]));
			const env: IProcessEnvironment = {};
			merged.applyToProcessEnvironment(env);
			deepStrictEqual(env, {
				A: 'a',
				B: 'b',
				C: 'c'
			});
		});
	});

	suite('diff', () => {
		test('should generate added diffs from the same extension', () => {
			const merged1 = new MergedEnvironmentVariableCollection(new Map([
				['ext1', deserializeEnvironmentVariableCollection([
					['A', { value: 'a', type: EnvironmentVariableMutatorType.Replace }]
				])]
			]));
			const merged2 = new MergedEnvironmentVariableCollection(new Map([
				['ext1', deserializeEnvironmentVariableCollection([
					['A', { value: 'a', type: EnvironmentVariableMutatorType.Replace }],
					['B', { value: 'b', type: EnvironmentVariableMutatorType.Append }]
				])]
			]));
			const diff = merged1.diff(merged2);
			strictEqual(diff.changed.size, 0);
			strictEqual(diff.removed.size, 0);
			const entries = [...diff.added.entries()];
			deepStrictEqual(entries, [
				['B', [{ extensionIdentifier: 'ext1', value: 'b', type: EnvironmentVariableMutatorType.Append }]]
			]);
		});

		test('should generate added diffs from a different extension', () => {
			const merged1 = new MergedEnvironmentVariableCollection(new Map([
				['ext1', deserializeEnvironmentVariableCollection([
					['A', { value: 'a1', type: EnvironmentVariableMutatorType.Replace }]
				])]
			]));
			const merged2 = new MergedEnvironmentVariableCollection(new Map([
				['ext2', deserializeEnvironmentVariableCollection([
					['A', { value: 'a2', type: EnvironmentVariableMutatorType.Replace }]
				])]
			]));
			const diff = merged1.diff(merged2);
			strictEqual(diff.changed.size, 0);
			strictEqual(diff.removed.size, 0);
			const entries = [...diff.added.entries()];
			deepStrictEqual(entries, [
				['A', [{ extensionIdentifier: 'ext2', value: 'a2', type: EnvironmentVariableMutatorType.Replace }]]
			]);
		});

		test('should generate removed diffs', () => {
			const merged1 = new MergedEnvironmentVariableCollection(new Map([
				['ext1', deserializeEnvironmentVariableCollection([
					['A', { value: 'a', type: EnvironmentVariableMutatorType.Replace }],
					['B', { value: 'b', type: EnvironmentVariableMutatorType.Replace }]
				])]
			]));
			const merged2 = new MergedEnvironmentVariableCollection(new Map([
				['ext1', deserializeEnvironmentVariableCollection([
					['A', { value: 'a', type: EnvironmentVariableMutatorType.Replace }]
				])]
			]));
			const diff = merged1.diff(merged2);
			strictEqual(diff.changed.size, 0);
			strictEqual(diff.added.size, 0);
			const entries = [...diff.removed.entries()];
			deepStrictEqual(entries, [
				['B', [{ extensionIdentifier: 'ext1', value: 'b', type: EnvironmentVariableMutatorType.Replace }]]
			]);
		});

		test('should generate changed diffs', () => {
			// TODO: Implement
		});

		test('should generate diffs with added, changed and removed', () => {
			// TODO: Implement
		});
	});
});
