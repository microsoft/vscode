/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { compress, CompressedObjectTreeModel, decompress } from '../../../../browser/ui/tree/compressedObjectTreeModel.js';
import { Iterable } from '../../../../common/iterator.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';
function resolve(treeElement) {
    const result = { element: treeElement.element };
    const children = Array.from(Iterable.from(treeElement.children), resolve);
    if (treeElement.incompressible) {
        result.incompressible = true;
    }
    if (children.length > 0) {
        result.children = children;
    }
    return result;
}
suite('CompressedObjectTree', function () {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('compress & decompress', function () {
        test('small', function () {
            const decompressed = { element: 1 };
            const compressed = { element: { elements: [1], incompressible: false } };
            assert.deepStrictEqual(resolve(compress(decompressed)), compressed);
            assert.deepStrictEqual(resolve(decompress(compressed)), decompressed);
        });
        test('no compression', function () {
            const decompressed = {
                element: 1, children: [
                    { element: 11 },
                    { element: 12 },
                    { element: 13 }
                ]
            };
            const compressed = {
                element: { elements: [1], incompressible: false },
                children: [
                    { element: { elements: [11], incompressible: false } },
                    { element: { elements: [12], incompressible: false } },
                    { element: { elements: [13], incompressible: false } }
                ]
            };
            assert.deepStrictEqual(resolve(compress(decompressed)), compressed);
            assert.deepStrictEqual(resolve(decompress(compressed)), decompressed);
        });
        test('single hierarchy', function () {
            const decompressed = {
                element: 1, children: [
                    {
                        element: 11, children: [
                            {
                                element: 111, children: [
                                    { element: 1111 }
                                ]
                            }
                        ]
                    }
                ]
            };
            const compressed = {
                element: { elements: [1, 11, 111, 1111], incompressible: false }
            };
            assert.deepStrictEqual(resolve(compress(decompressed)), compressed);
            assert.deepStrictEqual(resolve(decompress(compressed)), decompressed);
        });
        test('deep compression', function () {
            const decompressed = {
                element: 1, children: [
                    {
                        element: 11, children: [
                            {
                                element: 111, children: [
                                    { element: 1111 },
                                    { element: 1112 },
                                    { element: 1113 },
                                    { element: 1114 },
                                ]
                            }
                        ]
                    }
                ]
            };
            const compressed = {
                element: { elements: [1, 11, 111], incompressible: false },
                children: [
                    { element: { elements: [1111], incompressible: false } },
                    { element: { elements: [1112], incompressible: false } },
                    { element: { elements: [1113], incompressible: false } },
                    { element: { elements: [1114], incompressible: false } },
                ]
            };
            assert.deepStrictEqual(resolve(compress(decompressed)), compressed);
            assert.deepStrictEqual(resolve(decompress(compressed)), decompressed);
        });
        test('double deep compression', function () {
            const decompressed = {
                element: 1, children: [
                    {
                        element: 11, children: [
                            {
                                element: 111, children: [
                                    { element: 1112 },
                                    { element: 1113 },
                                ]
                            }
                        ]
                    },
                    {
                        element: 12, children: [
                            {
                                element: 121, children: [
                                    { element: 1212 },
                                    { element: 1213 },
                                ]
                            }
                        ]
                    }
                ]
            };
            const compressed = {
                element: { elements: [1], incompressible: false },
                children: [
                    {
                        element: { elements: [11, 111], incompressible: false },
                        children: [
                            { element: { elements: [1112], incompressible: false } },
                            { element: { elements: [1113], incompressible: false } },
                        ]
                    },
                    {
                        element: { elements: [12, 121], incompressible: false },
                        children: [
                            { element: { elements: [1212], incompressible: false } },
                            { element: { elements: [1213], incompressible: false } },
                        ]
                    }
                ]
            };
            assert.deepStrictEqual(resolve(compress(decompressed)), compressed);
            assert.deepStrictEqual(resolve(decompress(compressed)), decompressed);
        });
        test('incompressible leaf', function () {
            const decompressed = {
                element: 1, children: [
                    {
                        element: 11, children: [
                            {
                                element: 111, children: [
                                    { element: 1111, incompressible: true }
                                ]
                            }
                        ]
                    }
                ]
            };
            const compressed = {
                element: { elements: [1, 11, 111], incompressible: false },
                children: [
                    { element: { elements: [1111], incompressible: true } }
                ]
            };
            assert.deepStrictEqual(resolve(compress(decompressed)), compressed);
            assert.deepStrictEqual(resolve(decompress(compressed)), decompressed);
        });
        test('incompressible branch', function () {
            const decompressed = {
                element: 1, children: [
                    {
                        element: 11, children: [
                            {
                                element: 111, incompressible: true, children: [
                                    { element: 1111 }
                                ]
                            }
                        ]
                    }
                ]
            };
            const compressed = {
                element: { elements: [1, 11], incompressible: false },
                children: [
                    { element: { elements: [111, 1111], incompressible: true } }
                ]
            };
            assert.deepStrictEqual(resolve(compress(decompressed)), compressed);
            assert.deepStrictEqual(resolve(decompress(compressed)), decompressed);
        });
        test('incompressible chain', function () {
            const decompressed = {
                element: 1, children: [
                    {
                        element: 11, children: [
                            {
                                element: 111, incompressible: true, children: [
                                    { element: 1111, incompressible: true }
                                ]
                            }
                        ]
                    }
                ]
            };
            const compressed = {
                element: { elements: [1, 11], incompressible: false },
                children: [
                    {
                        element: { elements: [111], incompressible: true },
                        children: [
                            { element: { elements: [1111], incompressible: true } }
                        ]
                    }
                ]
            };
            assert.deepStrictEqual(resolve(compress(decompressed)), compressed);
            assert.deepStrictEqual(resolve(decompress(compressed)), decompressed);
        });
        test('incompressible tree', function () {
            const decompressed = {
                element: 1, children: [
                    {
                        element: 11, incompressible: true, children: [
                            {
                                element: 111, incompressible: true, children: [
                                    { element: 1111, incompressible: true }
                                ]
                            }
                        ]
                    }
                ]
            };
            const compressed = {
                element: { elements: [1], incompressible: false },
                children: [
                    {
                        element: { elements: [11], incompressible: true },
                        children: [
                            {
                                element: { elements: [111], incompressible: true },
                                children: [
                                    { element: { elements: [1111], incompressible: true } }
                                ]
                            }
                        ]
                    }
                ]
            };
            assert.deepStrictEqual(resolve(compress(decompressed)), compressed);
            assert.deepStrictEqual(resolve(decompress(compressed)), decompressed);
        });
    });
    function bindListToModel(list, model) {
        return model.onDidSpliceRenderedNodes(({ start, deleteCount, elements }) => {
            list.splice(start, deleteCount, ...elements);
        });
    }
    function toArray(list) {
        return list.map(i => i.element.elements);
    }
    suite('CompressedObjectTreeModel', function () {
        /**
         * Calls that test function twice, once with an empty options and
         * once with `diffIdentityProvider`.
         */
        function withSmartSplice(fn) {
            fn({});
            fn({ diffIdentityProvider: { getId: n => String(n) } });
        }
        test('ctor', () => {
            const model = new CompressedObjectTreeModel('test');
            assert(model);
            assert.strictEqual(model.size, 0);
        });
        test('flat', () => withSmartSplice(options => {
            const list = [];
            const model = new CompressedObjectTreeModel('test');
            const disposable = bindListToModel(list, model);
            model.setChildren(null, [
                { element: 0 },
                { element: 1 },
                { element: 2 }
            ], options);
            assert.deepStrictEqual(toArray(list), [[0], [1], [2]]);
            assert.strictEqual(model.size, 3);
            model.setChildren(null, [
                { element: 3 },
                { element: 4 },
                { element: 5 },
            ], options);
            assert.deepStrictEqual(toArray(list), [[3], [4], [5]]);
            assert.strictEqual(model.size, 3);
            model.setChildren(null, [], options);
            assert.deepStrictEqual(toArray(list), []);
            assert.strictEqual(model.size, 0);
            disposable.dispose();
        }));
        test('nested', () => withSmartSplice(options => {
            const list = [];
            const model = new CompressedObjectTreeModel('test');
            const disposable = bindListToModel(list, model);
            model.setChildren(null, [
                {
                    element: 0, children: [
                        { element: 10 },
                        { element: 11 },
                        { element: 12 },
                    ]
                },
                { element: 1 },
                { element: 2 }
            ], options);
            assert.deepStrictEqual(toArray(list), [[0], [10], [11], [12], [1], [2]]);
            assert.strictEqual(model.size, 6);
            model.setChildren(12, [
                { element: 120 },
                { element: 121 }
            ], options);
            assert.deepStrictEqual(toArray(list), [[0], [10], [11], [12], [120], [121], [1], [2]]);
            assert.strictEqual(model.size, 8);
            model.setChildren(0, [], options);
            assert.deepStrictEqual(toArray(list), [[0], [1], [2]]);
            assert.strictEqual(model.size, 3);
            model.setChildren(null, [], options);
            assert.deepStrictEqual(toArray(list), []);
            assert.strictEqual(model.size, 0);
            disposable.dispose();
        }));
        test('compressed', () => withSmartSplice(options => {
            const list = [];
            const model = new CompressedObjectTreeModel('test');
            const disposable = bindListToModel(list, model);
            model.setChildren(null, [
                {
                    element: 1, children: [{
                            element: 11, children: [{
                                    element: 111, children: [
                                        { element: 1111 },
                                        { element: 1112 },
                                        { element: 1113 },
                                    ]
                                }]
                        }]
                }
            ], options);
            assert.deepStrictEqual(toArray(list), [[1, 11, 111], [1111], [1112], [1113]]);
            assert.strictEqual(model.size, 6);
            model.setChildren(11, [
                { element: 111 },
                { element: 112 },
                { element: 113 },
            ], options);
            assert.deepStrictEqual(toArray(list), [[1, 11], [111], [112], [113]]);
            assert.strictEqual(model.size, 5);
            model.setChildren(113, [
                { element: 1131 }
            ], options);
            assert.deepStrictEqual(toArray(list), [[1, 11], [111], [112], [113, 1131]]);
            assert.strictEqual(model.size, 6);
            model.setChildren(1131, [
                { element: 1132 }
            ], options);
            assert.deepStrictEqual(toArray(list), [[1, 11], [111], [112], [113, 1131, 1132]]);
            assert.strictEqual(model.size, 7);
            model.setChildren(1131, [
                { element: 1132 },
                { element: 1133 },
            ], options);
            assert.deepStrictEqual(toArray(list), [[1, 11], [111], [112], [113, 1131], [1132], [1133]]);
            assert.strictEqual(model.size, 8);
            disposable.dispose();
        }));
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcHJlc3NlZE9iamVjdFRyZWVNb2RlbC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L2Jyb3dzZXIvdWkvdHJlZS9jb21wcmVzc2VkT2JqZWN0VHJlZU1vZGVsLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxRQUFRLEVBQUUseUJBQXlCLEVBQUUsVUFBVSxFQUErQyxNQUFNLDBEQUEwRCxDQUFDO0FBR3hLLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQVFuRixTQUFTLE9BQU8sQ0FBSSxXQUFzQztJQUN6RCxNQUFNLE1BQU0sR0FBUSxFQUFFLE9BQU8sRUFBRSxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDckQsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUUxRSxJQUFJLFdBQVcsQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUNoQyxNQUFNLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQztJQUM5QixDQUFDO0lBRUQsSUFBSSxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ3pCLE1BQU0sQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO0lBQzVCLENBQUM7SUFFRCxPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUM7QUFFRCxLQUFLLENBQUMsc0JBQXNCLEVBQUU7SUFFN0IsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxLQUFLLENBQUMsdUJBQXVCLEVBQUU7UUFFOUIsSUFBSSxDQUFDLE9B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