/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariableCollection';
import { strictEqual, deepStrictEqual, throws } from 'assert';
import { EnvironmentVariableMutatorType } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { IProcessEnvironment } from 'vs/base/common/platform';

suite('EnvironmentVariable - EnvironmentVariableCollection', () => {
	test('should construct correctly with no arguments', () => {
		const c = new EnvironmentVariableCollection();
		strictEqual(c.entries.size, 0);
	});

	test('should construct correctly with 3 arguments', () => {
		const c = new EnvironmentVariableCollection(
			['A', 'B', 'C'],
			['a', 'b', 'c'],
			[1, 2, 3]
		);
		const keys = [...c.entries.keys()];
		deepStrictEqual(keys, ['A', 'B', 'C']);
		deepStrictEqual(c.entries.get('A'), { value: 'a', type: EnvironmentVariableMutatorType.Replace });
		deepStrictEqual(c.entries.get('B'), { value: 'b', type: EnvironmentVariableMutatorType.Append });
		deepStrictEqual(c.entries.get('C'), { value: 'c', type: EnvironmentVariableMutatorType.Prepend });
	});

	test('should throw when ctor arguments have differing length', () => {
		throws(() => new EnvironmentVariableCollection(['A'], ['a'], []));
		throws(() => new EnvironmentVariableCollection([], ['a'], [1]));
		throws(() => new EnvironmentVariableCollection(['A'], [], []));
	});

	test('getNewAdditions should return undefined when there are no new additions', () => {
		const c1 = new EnvironmentVariableCollection(
			['A', 'B', 'C'],
			['a', 'b', 'c'],
			[1, 2, 3]
		);
		const c2 = new EnvironmentVariableCollection(
			['A', 'B', 'C'],
			['a', 'b', 'c'],
			[1, 2, 3]
		);
		const newAdditions = c1.getNewAdditions(c2);
		strictEqual(newAdditions, undefined);
	});

	test('getNewAdditions should return only new additions in another collection', () => {
		const c1 = new EnvironmentVariableCollection(
			['A', 'B', 'C'],
			['a', 'b', 'c'],
			[1, 2, 3]
		);
		const c2 = new EnvironmentVariableCollection(
			['B', 'D', 'C'],
			['b', 'd', 'c'],
			[2, 1, 3]
		);
		const newAdditions = c1.getNewAdditions(c2)!;
		const keys = [...newAdditions.keys()];
		deepStrictEqual(keys, ['D']);
		deepStrictEqual(newAdditions.get('D'), { value: 'd', type: EnvironmentVariableMutatorType.Replace });
	});

	test('applyToProcessEnvironment should apply the collection to an environment', () => {
		const c = new EnvironmentVariableCollection(
			['A', 'B', 'C'],
			['a', 'b', 'c'],
			[1, 2, 3]
		);
		const env: IProcessEnvironment = {
			A: 'foo',
			B: 'bar',
			C: 'baz'
		};
		c.applyToProcessEnvironment(env);
		deepStrictEqual(env, {
			A: 'a',
			B: 'barb',
			C: 'cbaz'
		});
	});

	test('applyToProcessEnvironment should apply the collection to environment entries with no values', () => {
		const c = new EnvironmentVariableCollection(
			['A', 'B', 'C'],
			['a', 'b', 'c'],
			[1, 2, 3]
		);
		const env: IProcessEnvironment = {
		};
		c.applyToProcessEnvironment(env);
		deepStrictEqual(env, {
			A: 'a',
			B: 'b',
			C: 'c'
		});
	});

	// TODO: Implement and test multiple mutators applying to one variable
});
