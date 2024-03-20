/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { EnvironmentVariableMutatorType } from 'vs/platform/terminal/common/environmentVariable';
import { IProcessEnvironment, isWindows } from 'vs/base/common/platform';
import { MergedEnvironmentVariableCollection } from 'vs/platform/terminal/common/environmentVariableCollection';
import { deserializeEnvironmentDescriptionMap, deserializeEnvironmentVariableCollection } from 'vs/platform/terminal/common/environmentVariableShared';
import { URI } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('EnvironmentVariable - MergedEnvironmentVariableCollection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('ctor', () => {
		test('Should keep entries that come after a Prepend or Append type mutators', () => {
			const merged = new MergedEnvironmentVariableCollection(new Map([
				['ext1', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a1', type: EnvironmentVariableMutatorType.Prepend, variable: 'A' }]
					])
				}],
				['ext2', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a2', type: EnvironmentVariableMutatorType.Append, variable: 'A' }]
					])
				}],
				['ext3', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a3', type: EnvironmentVariableMutatorType.Prepend, variable: 'A' }]
					])
				}],
				['ext4', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a4', type: EnvironmentVariableMutatorType.Append, variable: 'A', options: { applyAtProcessCreation: true, applyAtShellIntegration: true } }]
					])
				}]
			]));
			deepStrictEqual([...merged.getVariableMap(undefined).entries()], [
				['A', [
					{ extensionIdentifier: 'ext4', type: EnvironmentVariableMutatorType.Append, value: 'a4', variable: 'A', options: { applyAtProcessCreation: true, applyAtShellIntegration: true } },
					{ extensionIdentifier: 'ext3', type: EnvironmentVariableMutatorType.Prepend, value: 'a3', variable: 'A', options: undefined },
					{ extensionIdentifier: 'ext2', type: EnvironmentVariableMutatorType.Append, value: 'a2', variable: 'A', options: undefined },
					{ extensionIdentifier: 'ext1', type: EnvironmentVariableMutatorType.Prepend, value: 'a1', variable: 'A', options: undefined }
				]]
			]);
		});

		test('Should remove entries that come after a Replace type mutator', () => {
			const merged = new MergedEnvironmentVariableCollection(new Map([
				['ext1', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a1', type: EnvironmentVariableMutatorType.Prepend, variable: 'A' }]
					])
				}],
				['ext2', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a2', type: EnvironmentVariableMutatorType.Append, variable: 'A' }]
					])
				}],
				['ext3', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a3', type: EnvironmentVariableMutatorType.Replace, variable: 'A' }]
					])
				}],
				['ext4', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a4', type: EnvironmentVariableMutatorType.Append, variable: 'A' }]
					])
				}]
			]));
			deepStrictEqual([...merged.getVariableMap(undefined).entries()], [
				['A', [
					{ extensionIdentifier: 'ext3', type: EnvironmentVariableMutatorType.Replace, value: 'a3', variable: 'A', options: undefined },
					{ extensionIdentifier: 'ext2', type: EnvironmentVariableMutatorType.Append, value: 'a2', variable: 'A', options: undefined },
					{ extensionIdentifier: 'ext1', type: EnvironmentVariableMutatorType.Prepend, value: 'a1', variable: 'A', options: undefined }
				]]
			], 'The ext4 entry should be removed as it comes after a Replace');
		});

		test('Appropriate workspace scoped entries are returned when querying for a particular workspace folder', () => {
			const scope1 = { workspaceFolder: { uri: URI.file('workspace1'), name: 'workspace1', index: 0 } };
			const scope2 = { workspaceFolder: { uri: URI.file('workspace2'), name: 'workspace2', index: 3 } };
			const merged = new MergedEnvironmentVariableCollection(new Map([
				['ext1', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a1', type: EnvironmentVariableMutatorType.Prepend, scope: scope1, variable: 'A' }]
					])
				}],
				['ext2', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a2', type: EnvironmentVariableMutatorType.Append, variable: 'A' }]
					])
				}],
				['ext3', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a3', type: EnvironmentVariableMutatorType.Prepend, scope: scope2, variable: 'A' }]
					])
				}],
				['ext4', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a4', type: EnvironmentVariableMutatorType.Append, variable: 'A' }]
					])
				}]
			]));
			deepStrictEqual([...merged.getVariableMap(scope2).entries()], [
				['A', [
					{ extensionIdentifier: 'ext4', type: EnvironmentVariableMutatorType.Append, value: 'a4', variable: 'A', options: undefined },
					{ extensionIdentifier: 'ext3', type: EnvironmentVariableMutatorType.Prepend, value: 'a3', scope: scope2, variable: 'A', options: undefined },
					{ extensionIdentifier: 'ext2', type: EnvironmentVariableMutatorType.Append, value: 'a2', variable: 'A', options: undefined },
				]]
			]);
		});

		test('Workspace scoped entries are not included when looking for global entries', () => {
			const scope1 = { workspaceFolder: { uri: URI.file('workspace1'), name: 'workspace1', index: 0 } };
			const scope2 = { workspaceFolder: { uri: URI.file('workspace2'), name: 'workspace2', index: 3 } };
			const merged = new MergedEnvironmentVariableCollection(new Map([
				['ext1', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a1', type: EnvironmentVariableMutatorType.Prepend, scope: scope1, variable: 'A' }]
					])
				}],
				['ext2', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a2', type: EnvironmentVariableMutatorType.Append, variable: 'A' }]
					])
				}],
				['ext3', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a3', type: EnvironmentVariableMutatorType.Prepend, scope: scope2, variable: 'A' }]
					])
				}],
				['ext4', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a4', type: EnvironmentVariableMutatorType.Append, variable: 'A' }]
					])
				}]
			]));
			deepStrictEqual([...merged.getVariableMap(undefined).entries()], [
				['A', [
					{ extensionIdentifier: 'ext4', type: EnvironmentVariableMutatorType.Append, value: 'a4', variable: 'A', options: undefined },
					{ extensionIdentifier: 'ext2', type: EnvironmentVariableMutatorType.Append, value: 'a2', variable: 'A', options: undefined },
				]]
			]);
		});

		test('Workspace scoped description entries are properly filtered for each extension', () => {
			const scope1 = { workspaceFolder: { uri: URI.file('workspace1'), name: 'workspace1', index: 0 } };
			const scope2 = { workspaceFolder: { uri: URI.file('workspace2'), name: 'workspace2', index: 3 } };
			const merged = new MergedEnvironmentVariableCollection(new Map([
				['ext1', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a1', type: EnvironmentVariableMutatorType.Prepend, scope: scope1, variable: 'A' }]
					]),
					descriptionMap: deserializeEnvironmentDescriptionMap([
						['A-key-scope1', { description: 'ext1 scope1 description', scope: scope1 }],
						['A-key-scope2', { description: 'ext1 scope2 description', scope: scope2 }],
					])
				}],
				['ext2', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a2', type: EnvironmentVariableMutatorType.Append, variable: 'A' }]
					]),
					descriptionMap: deserializeEnvironmentDescriptionMap([
						['A-key', { description: 'ext2 global description' }],
					])
				}],
				['ext3', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a3', type: EnvironmentVariableMutatorType.Prepend, scope: scope2, variable: 'A' }]
					]),
					descriptionMap: deserializeEnvironmentDescriptionMap([
						['A-key', { description: 'ext3 scope2 description', scope: scope2 }],
					])
				}],
				['ext4', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a4', type: EnvironmentVariableMutatorType.Append, variable: 'A' }]
					])
				}]
			]));
			deepStrictEqual([...merged.getDescriptionMap(scope1).entries()], [
				['ext1', 'ext1 scope1 description'],
			]);
			deepStrictEqual([...merged.getDescriptionMap(undefined).entries()], [
				['ext2', 'ext2 global description'],
			]);
		});
	});

	suite('applyToProcessEnvironment', () => {
		test('should apply the collection to an environment', async () => {
			const merged = new MergedEnvironmentVariableCollection(new Map([
				['ext', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a', type: EnvironmentVariableMutatorType.Replace, variable: 'A' }],
						['B', { value: 'b', type: EnvironmentVariableMutatorType.Append, variable: 'B' }],
						['C', { value: 'c', type: EnvironmentVariableMutatorType.Prepend, variable: 'C' }]
					])
				}]
			]));
			const env: IProcessEnvironment = {
				A: 'foo',
				B: 'bar',
				C: 'baz'
			};
			await merged.applyToProcessEnvironment(env, undefined);
			deepStrictEqual(env, {
				A: 'a',
				B: 'barb',
				C: 'cbaz'
			});
		});

		test('should apply the appropriate workspace scoped entries to an environment', async () => {
			const scope1 = { workspaceFolder: { uri: URI.file('workspace1'), name: 'workspace1', index: 0 } };
			const scope2 = { workspaceFolder: { uri: URI.file('workspace2'), name: 'workspace2', index: 3 } };
			const merged = new MergedEnvironmentVariableCollection(new Map([
				['ext', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a', type: EnvironmentVariableMutatorType.Replace, scope: scope1, variable: 'A' }],
						['B', { value: 'b', type: EnvironmentVariableMutatorType.Append, scope: scope2, variable: 'B' }],
						['C', { value: 'c', type: EnvironmentVariableMutatorType.Prepend, variable: 'C' }]
					])
				}]
			]));
			const env: IProcessEnvironment = {
				A: 'foo',
				B: 'bar',
				C: 'baz'
			};
			await merged.applyToProcessEnvironment(env, scope1);
			deepStrictEqual(env, {
				A: 'a',
				B: 'bar', // This is not changed because the scope does not match
				C: 'cbaz'
			});
		});

		test('should apply the collection to environment entries with no values', async () => {
			const merged = new MergedEnvironmentVariableCollection(new Map([
				['ext', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a', type: EnvironmentVariableMutatorType.Replace, variable: 'A' }],
						['B', { value: 'b', type: EnvironmentVariableMutatorType.Append, variable: 'B' }],
						['C', { value: 'c', type: EnvironmentVariableMutatorType.Prepend, variable: 'C' }]
					])
				}]
			]));
			const env: IProcessEnvironment = {};
			await merged.applyToProcessEnvironment(env, undefined);
			deepStrictEqual(env, {
				A: 'a',
				B: 'b',
				C: 'c'
			});
		});

		test('should apply to variable case insensitively on Windows only', async () => {
			const merged = new MergedEnvironmentVariableCollection(new Map([
				['ext', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a', type: EnvironmentVariableMutatorType.Replace, variable: 'a' }],
						['b', { value: 'b', type: EnvironmentVariableMutatorType.Append, variable: 'b' }],
						['c', { value: 'c', type: EnvironmentVariableMutatorType.Prepend, variable: 'c' }]
					])
				}]
			]));
			const env: IProcessEnvironment = {
				A: 'A',
				B: 'B',
				C: 'C'
			};
			await merged.applyToProcessEnvironment(env, undefined);
			if (isWindows) {
				deepStrictEqual(env, {
					A: 'a',
					B: 'Bb',
					C: 'cC'
				});
			} else {
				deepStrictEqual(env, {
					a: 'a',
					A: 'A',
					b: 'b',
					B: 'B',
					c: 'c',
					C: 'C'
				});
			}
		});
	});

	suite('diff', () => {
		test('should return undefined when collectinos are the same', () => {
			const merged1 = new MergedEnvironmentVariableCollection(new Map([
				['ext1', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a', type: EnvironmentVariableMutatorType.Replace, variable: 'A' }]
					])
				}]
			]));
			const merged2 = new MergedEnvironmentVariableCollection(new Map([
				['ext1', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a', type: EnvironmentVariableMutatorType.Replace, variable: 'A' }]
					])
				}]
			]));
			const diff = merged1.diff(merged2, undefined);
			strictEqual(diff, undefined);
		});
		test('should generate added diffs from when the first entry is added', () => {
			const merged1 = new MergedEnvironmentVariableCollection(new Map([]));
			const merged2 = new MergedEnvironmentVariableCollection(new Map([
				['ext1', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a', type: EnvironmentVariableMutatorType.Replace, variable: 'A' }]
					])
				}]
			]));
			const diff = merged1.diff(merged2, undefined)!;
			strictEqual(diff.changed.size, 0);
			strictEqual(diff.removed.size, 0);
			const entries = [...diff.added.entries()];
			deepStrictEqual(entries, [
				['A', [{ extensionIdentifier: 'ext1', value: 'a', type: EnvironmentVariableMutatorType.Replace, variable: 'A', options: undefined }]]
			]);
		});

		test('should generate added diffs from the same extension', () => {
			const merged1 = new MergedEnvironmentVariableCollection(new Map([
				['ext1', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a', type: EnvironmentVariableMutatorType.Replace, variable: 'A' }]
					])
				}]
			]));
			const merged2 = new MergedEnvironmentVariableCollection(new Map([
				['ext1', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a', type: EnvironmentVariableMutatorType.Replace, variable: 'A' }],
						['B', { value: 'b', type: EnvironmentVariableMutatorType.Append, variable: 'B' }]
					])
				}]
			]));
			const diff = merged1.diff(merged2, undefined)!;
			strictEqual(diff.changed.size, 0);
			strictEqual(diff.removed.size, 0);
			const entries = [...diff.added.entries()];
			deepStrictEqual(entries, [
				['B', [{ extensionIdentifier: 'ext1', value: 'b', type: EnvironmentVariableMutatorType.Append, variable: 'B', options: undefined }]]
			]);
		});

		test('should generate added diffs from a different extension', () => {
			const merged1 = new MergedEnvironmentVariableCollection(new Map([
				['ext1', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a1', type: EnvironmentVariableMutatorType.Prepend, variable: 'A' }]
					])
				}]
			]));

			const merged2 = new MergedEnvironmentVariableCollection(new Map([
				['ext2', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a2', type: EnvironmentVariableMutatorType.Append, variable: 'A' }]
					])
				}],
				['ext1', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a1', type: EnvironmentVariableMutatorType.Prepend, variable: 'A' }]
					])
				}]
			]));
			const diff = merged1.diff(merged2, undefined)!;
			strictEqual(diff.changed.size, 0);
			strictEqual(diff.removed.size, 0);
			deepStrictEqual([...diff.added.entries()], [
				['A', [{ extensionIdentifier: 'ext2', value: 'a2', type: EnvironmentVariableMutatorType.Append, variable: 'A', options: undefined }]]
			]);

			const merged3 = new MergedEnvironmentVariableCollection(new Map([
				['ext1', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a1', type: EnvironmentVariableMutatorType.Prepend, variable: 'A' }]
					])
				}],
				// This entry should get removed
				['ext2', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a2', type: EnvironmentVariableMutatorType.Append, variable: 'A' }]
					])
				}]
			]));
			const diff2 = merged1.diff(merged3, undefined)!;
			strictEqual(diff2.changed.size, 0);
			strictEqual(diff2.removed.size, 0);
			deepStrictEqual([...diff.added.entries()], [...diff2.added.entries()], 'Swapping the order of the entries in the other collection should yield the same result');
		});

		test('should remove entries in the diff that come after a Replace', () => {
			const merged1 = new MergedEnvironmentVariableCollection(new Map([
				['ext1', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a1', type: EnvironmentVariableMutatorType.Replace, variable: 'A' }]
					])
				}]
			]));
			const merged4 = new MergedEnvironmentVariableCollection(new Map([
				['ext1', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a1', type: EnvironmentVariableMutatorType.Replace, variable: 'A' }]
					])
				}],
				// This entry should get removed as it comes after a replace
				['ext2', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a2', type: EnvironmentVariableMutatorType.Append, variable: 'A' }]
					])
				}]
			]));
			const diff = merged1.diff(merged4, undefined);
			strictEqual(diff, undefined, 'Replace should ignore any entries after it');
		});

		test('should generate removed diffs', () => {
			const merged1 = new MergedEnvironmentVariableCollection(new Map([
				['ext1', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a', type: EnvironmentVariableMutatorType.Replace, variable: 'A' }],
						['B', { value: 'b', type: EnvironmentVariableMutatorType.Replace, variable: 'B' }]
					])
				}]
			]));
			const merged2 = new MergedEnvironmentVariableCollection(new Map([
				['ext1', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a', type: EnvironmentVariableMutatorType.Replace, variable: 'A' }]
					])
				}]
			]));
			const diff = merged1.diff(merged2, undefined)!;
			strictEqual(diff.changed.size, 0);
			strictEqual(diff.added.size, 0);
			deepStrictEqual([...diff.removed.entries()], [
				['B', [{ extensionIdentifier: 'ext1', value: 'b', type: EnvironmentVariableMutatorType.Replace, variable: 'B', options: undefined }]]
			]);
		});

		test('should generate changed diffs', () => {
			const merged1 = new MergedEnvironmentVariableCollection(new Map([
				['ext1', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a1', type: EnvironmentVariableMutatorType.Replace, variable: 'A' }],
						['B', { value: 'b', type: EnvironmentVariableMutatorType.Replace, variable: 'B' }]
					])
				}]
			]));
			const merged2 = new MergedEnvironmentVariableCollection(new Map([
				['ext1', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a2', type: EnvironmentVariableMutatorType.Replace, variable: 'A' }],
						['B', { value: 'b', type: EnvironmentVariableMutatorType.Append, variable: 'B' }]
					])
				}]
			]));
			const diff = merged1.diff(merged2, undefined)!;
			strictEqual(diff.added.size, 0);
			strictEqual(diff.removed.size, 0);
			deepStrictEqual([...diff.changed.entries()], [
				['A', [{ extensionIdentifier: 'ext1', value: 'a2', type: EnvironmentVariableMutatorType.Replace, variable: 'A', options: undefined }]],
				['B', [{ extensionIdentifier: 'ext1', value: 'b', type: EnvironmentVariableMutatorType.Append, variable: 'B', options: undefined }]]
			]);
		});

		test('should generate diffs with added, changed and removed', () => {
			const merged1 = new MergedEnvironmentVariableCollection(new Map([
				['ext1', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a1', type: EnvironmentVariableMutatorType.Replace, variable: 'A' }],
						['B', { value: 'b', type: EnvironmentVariableMutatorType.Prepend, variable: 'B' }]
					])
				}]
			]));
			const merged2 = new MergedEnvironmentVariableCollection(new Map([
				['ext1', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a2', type: EnvironmentVariableMutatorType.Replace, variable: 'A' }],
						['C', { value: 'c', type: EnvironmentVariableMutatorType.Append, variable: 'C' }]
					])
				}]
			]));
			const diff = merged1.diff(merged2, undefined)!;
			deepStrictEqual([...diff.added.entries()], [
				['C', [{ extensionIdentifier: 'ext1', value: 'c', type: EnvironmentVariableMutatorType.Append, variable: 'C', options: undefined }]],
			]);
			deepStrictEqual([...diff.removed.entries()], [
				['B', [{ extensionIdentifier: 'ext1', value: 'b', type: EnvironmentVariableMutatorType.Prepend, variable: 'B', options: undefined }]]
			]);
			deepStrictEqual([...diff.changed.entries()], [
				['A', [{ extensionIdentifier: 'ext1', value: 'a2', type: EnvironmentVariableMutatorType.Replace, variable: 'A', options: undefined }]]
			]);
		});

		test('should only generate workspace specific diffs', () => {
			const scope1 = { workspaceFolder: { uri: URI.file('workspace1'), name: 'workspace1', index: 0 } };
			const scope2 = { workspaceFolder: { uri: URI.file('workspace2'), name: 'workspace2', index: 3 } };
			const merged1 = new MergedEnvironmentVariableCollection(new Map([
				['ext1', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a1', type: EnvironmentVariableMutatorType.Replace, scope: scope1, variable: 'A' }],
						['B', { value: 'b', type: EnvironmentVariableMutatorType.Prepend, variable: 'B' }]
					])
				}]
			]));
			const merged2 = new MergedEnvironmentVariableCollection(new Map([
				['ext1', {
					map: deserializeEnvironmentVariableCollection([
						['A-key', { value: 'a2', type: EnvironmentVariableMutatorType.Replace, scope: scope1, variable: 'A' }],
						['C', { value: 'c', type: EnvironmentVariableMutatorType.Append, scope: scope2, variable: 'C' }]
					])
				}]
			]));
			const diff = merged1.diff(merged2, scope1)!;
			strictEqual(diff.added.size, 0);
			deepStrictEqual([...diff.removed.entries()], [
				['B', [{ extensionIdentifier: 'ext1', value: 'b', type: EnvironmentVariableMutatorType.Prepend, variable: 'B', options: undefined }]]
			]);
			deepStrictEqual([...diff.changed.entries()], [
				['A', [{ extensionIdentifier: 'ext1', value: 'a2', type: EnvironmentVariableMutatorType.Replace, scope: scope1, variable: 'A', options: undefined }]]
			]);
		});
	});
});
