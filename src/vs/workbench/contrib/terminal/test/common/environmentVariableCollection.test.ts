/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { EnvironmentVariableMutatorType } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { MergedEnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariableCollection';
import { deserializeEnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariableShared';

suite('EnvironmentVariable - MergedEnvironmentVariableCollection', () => {
	// test('getAdditions should return undefined when there are no new additions', () => {
	// 	const c1 = deserializeEnvironmentVariableCollection({
	// 		variables: ['A', 'B', 'C'],
	// 		values: ['a', 'b', 'c'],
	// 		types: [1, 2, 3]
	// 	}
	// 	);
	// 	const c2 = deserializeEnvironmentVariableCollection({
	// 		variables: ['A', 'B', 'C'],
	// 		values: ['a', 'b', 'c'],
	// 		types: [1, 2, 3]
	// 	}
	// 	);
	// 	const newAdditions = c1.getNewAdditions(c2);
	// 	strictEqual(newAdditions, undefined);
	// });

	// test('getNewAdditions should return only new additions in another collection', () => {
	// 	const c1 = deserializeEnvironmentVariableCollection({
	// 		variables: ['A', 'B', 'C'],
	// 		values: ['a', 'b', 'c'],
	// 		types: [1, 2, 3]
	// 	}
	// 	);
	// 	const c2 = deserializeEnvironmentVariableCollection({
	// 		variables: ['B', 'D', 'C'],
	// 		values: ['b', 'd', 'c'],
	// 		types: [2, 1, 3]
	// 	}
	// 	);
	// 	const newAdditions = c1.getNewAdditions(c2)!;
	// 	const keys = [...newAdditions.keys()];
	// 	deepStrictEqual(keys, ['D']);
	// 	deepStrictEqual(newAdditions.get('D'), { value: 'd', type: EnvironmentVariableMutatorType.Replace });
	// });

	test('applyToProcessEnvironment should apply the collection to an environment', () => {
		const merged = new MergedEnvironmentVariableCollection(deserializeEnvironmentVariableCollection([
			['A', { value: 'a', type: EnvironmentVariableMutatorType.Replace }],
			['B', { value: 'b', type: EnvironmentVariableMutatorType.Append }],
			['C', { value: 'c', type: EnvironmentVariableMutatorType.Prepend }]
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

	test('applyToProcessEnvironment should apply the collection to environment entries with no values', () => {
		const merged = new MergedEnvironmentVariableCollection(deserializeEnvironmentVariableCollection([
			['A', { value: 'a', type: EnvironmentVariableMutatorType.Replace }],
			['B', { value: 'b', type: EnvironmentVariableMutatorType.Append }],
			['C', { value: 'c', type: EnvironmentVariableMutatorType.Prepend }]
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
