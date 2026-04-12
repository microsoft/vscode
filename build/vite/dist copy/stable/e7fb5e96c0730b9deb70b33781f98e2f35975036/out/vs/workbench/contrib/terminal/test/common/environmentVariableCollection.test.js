/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { deepStrictEqual, strictEqual } from 'assert';
import { EnvironmentVariableMutatorType } from '../../../../../platform/terminal/common/environmentVariable.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { MergedEnvironmentVariableCollection } from '../../../../../platform/terminal/common/environmentVariableCollection.js';
import { deserializeEnvironmentDescriptionMap, deserializeEnvironmentVariableCollection } from '../../../../../platform/terminal/common/environmentVariableShared.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
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
            const env = {
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
            const env = {
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
            const env = {};
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
            const env = {
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
            }
            else {
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
            const diff = merged1.diff(merged2, undefined);
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
            const diff = merged1.diff(merged2, undefined);
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
            const diff = merged1.diff(merged2, undefined);
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
            const diff2 = merged1.diff(merged3, undefined);
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
            const diff = merged1.diff(merged2, undefined);
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
            const diff = merged1.diff(merged2, undefined);
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
            const diff = merged1.diff(merged2, undefined);
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
            const diff = merged1.diff(merged2, scope1);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL3Rlc3QvY29tbW9uL2Vudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxXQUFXLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDdEQsT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDaEgsT0FBTyxFQUF1QixTQUFTLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RixPQUFPLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSwwRUFBMEUsQ0FBQztBQUMvSCxPQUFPLEVBQUUsb0NBQW9DLEVBQUUsd0NBQXdDLEVBQUUsTUFBTSxzRUFBc0UsQ0FBQztBQUN0SyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFbkcsS0FBSyxDQUFDLDJEQUEyRCxFQUFFLEdBQUcsRUFBRTtJQUN2RSx1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFO1FBQ2xCLElBQUksQ0FBQyx1RUFBdUUsRUFBRSxHQUFHLEVBQUU7WUFDbEYsTUFBTSxNQUFNLEdBQUcsSUFBSSxtQ0FBbUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQztnQkFDOUQsQ0FBQyxNQUFNLEVBQUU7d0JBQ1IsR0FBRyxFQUFFLHdDQUF3QyxDQUFDOzRCQUM3QyxDQUFDLE9BQU8sRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLDhCQUE4QixDQUFDLE9BQU8sRUFBRSxRQUFRLEVB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