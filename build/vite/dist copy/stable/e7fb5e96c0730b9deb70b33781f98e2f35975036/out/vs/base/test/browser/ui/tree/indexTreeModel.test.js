/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { IndexTreeModel } from '../../../../browser/ui/tree/indexTreeModel.js';
import { timeout } from '../../../../common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';
import { DisposableStore } from '../../../../common/lifecycle.js';
function bindListToModel(list, model) {
    return model.onDidSpliceRenderedNodes(({ start, deleteCount, elements }) => {
        list.splice(start, deleteCount, ...elements);
    });
}
function toArray(list) {
    return list.map(i => i.element);
}
function toElements(node) {
    return node.children?.length ? { e: node.element, children: node.children.map(toElements) } : node.element;
}
const diffIdentityProvider = { getId: (n) => String(n) };
/**
 * Calls that test function twice, once with an empty options and
 * once with `diffIdentityProvider`.
 */
function withSmartSplice(fn) {
    fn({});
    fn({ diffIdentityProvider });
}
suite('IndexTreeModel', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const disposables = new DisposableStore();
    teardown(() => {
        disposables.clear();
    });
    test('ctor', () => {
        const list = [];
        const model = new IndexTreeModel('test', -1);
        assert(model);
        assert.strictEqual(list.length, 0);
    });
    test('insert', () => withSmartSplice(options => {
        const list = [];
        const model = new IndexTreeModel('test', -1);
        const disposable = bindListToModel(list, model);
        model.splice([0], 0, [
            { element: 0 },
            { element: 1 },
            { element: 2 }
        ], options);
        assert.deepStrictEqual(list.length, 3);
        assert.deepStrictEqual(list[0].element, 0);
        assert.deepStrictEqual(list[0].collapsed, false);
        assert.deepStrictEqual(list[0].depth, 1);
        assert.deepStrictEqual(list[1].element, 1);
        assert.deepStrictEqual(list[1].collapsed, false);
        assert.deepStrictEqual(list[1].depth, 1);
        assert.deepStrictEqual(list[2].element, 2);
        assert.deepStrictEqual(list[2].collapsed, false);
        assert.deepStrictEqual(list[2].depth, 1);
        disposable.dispose();
    }));
    test('deep insert', () => withSmartSplice(options => {
        const list = [];
        const model = new IndexTreeModel('test', -1);
        const disposable = bindListToModel(list, model);
        model.splice([0], 0, [
            {
                element: 0, children: [
                    { element: 10 },
                    { element: 11 },
                    { element: 12 },
                ]
            },
            { element: 1 },
            { element: 2 }
        ]);
        assert.deepStrictEqual(list.length, 6);
        assert.deepStrictEqual(list[0].element, 0);
        assert.deepStrictEqual(list[0].collapsed, false);
        assert.deepStrictEqual(list[0].depth, 1);
        assert.deepStrictEqual(list[1].element, 10);
        assert.deepStrictEqual(list[1].collapsed, false);
        assert.deepStrictEqual(list[1].depth, 2);
        assert.deepStrictEqual(list[2].element, 11);
        assert.deepStrictEqual(list[2].collapsed, false);
        assert.deepStrictEqual(list[2].depth, 2);
        assert.deepStrictEqual(list[3].element, 12);
        assert.deepStrictEqual(list[3].collapsed, false);
        assert.deepStrictEqual(list[3].depth, 2);
        assert.deepStrictEqual(list[4].element, 1);
        assert.deepStrictEqual(list[4].collapsed, false);
        assert.deepStrictEqual(list[4].depth, 1);
        assert.deepStrictEqual(list[5].element, 2);
        assert.deepStrictEqual(list[5].collapsed, false);
        assert.deepStrictEqual(list[5].depth, 1);
        disposable.dispose();
    }));
    test('deep insert collapsed', () => withSmartSplice(options => {
        const list = [];
        const model = new IndexTreeModel('test', -1);
        const disposable = bindListToModel(list, model);
        model.splice([0], 0, [
            {
                element: 0, collapsed: true, children: [
                    { element: 10 },
                    { element: 11 },
                    { element: 12 },
                ]
            },
            { element: 1 },
            { element: 2 }
        ], options);
        assert.deepStrictEqual(list.length, 3);
        assert.deepStrictEqual(list[0].element, 0);
        assert.deepStrictEqual(list[0].collapsed, true);
        assert.deepStrictEqual(list[0].depth, 1);
        assert.deepStrictEqual(list[1].element, 1);
        assert.deepStrictEqual(list[1].collapsed, false);
        assert.deepStrictEqual(list[1].depth, 1);
        assert.deepStrictEqual(list[2].element, 2);
        assert.deepStrictEqual(list[2].collapsed, false);
        assert.deepStrictEqual(list[2].depth, 1);
        disposable.dispose();
    }));
    test('delete', () => withSmartSplice(options => {
        const list = [];
        const model = new IndexTreeModel('test', -1);
        const disposable = bindListToModel(list, model);
        model.splice([0], 0, [
            { element: 0 },
            { element: 1 },
            { element: 2 }
        ], options);
        assert.deepStrictEqual(list.length, 3);
        model.splice([1], 1, undefined, options);
        assert.deepStrictEqual(list.length, 2);
        assert.deepStrictEqual(list[0].element, 0);
        assert.deepStrictEqual(list[0].collapsed, false);
        assert.deepStrictEqual(list[0].depth, 1);
        assert.deepStrictEqual(list[1].element, 2);
        assert.deepStrictEqual(list[1].collapsed, false);
        assert.deepStrictEqual(list[1].depth, 1);
        model.splice([0], 2, undefined, options);
        assert.deepStrictEqual(list.length, 0);
        disposable.dispose();
    }));
    test('nested delete', () => withSmartSplice(options => {
        const list = [];
        const model = new IndexTreeModel('test', -1);
        const disposable = bindListToModel(list, model);
        model.splice([0], 0, [
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
        assert.deepStrictEqual(list.length, 6);
        model.splice([1], 2, undefined, options);
        assert.deepStrictEqual(list.length, 4);
        assert.deepStrictEqual(list[0].element, 0);
        assert.deepStrictEqual(list[0].collapsed, false);
        assert.deepStrictEqual(list[0].depth, 1);
        assert.deepStrictEqual(list[1].element, 10);
        assert.deepStrictEqual(list[1].collapsed, false);
        assert.deepStrictEqual(list[1].depth, 2);
        assert.deepStrictEqual(list[2].element, 11);
        assert.deepStrictEqual(list[2].collapsed, false);
        assert.deepStrictEqual(list[2].depth, 2);
        assert.deepStrictEqual(list[3].element, 12);
        assert.deepStrictEqual(list[3].collapsed, false);
        assert.deepStrictEqual(list[3].depth, 2);
        disposable.dispose();
    }));
    test('deep delete', () => withSmartSplice(options => {
        const list = [];
        const model = new IndexTreeModel('test', -1);
        const disposable = bindListToModel(list, model);
        model.splice([0], 0, [
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
        assert.deepStrictEqual(list.length, 6);
        model.splice([0], 1, undefined, options);
        assert.deepStrictEqual(list.length, 2);
        assert.deepStrictEqual(list[0].element, 1);
        assert.deepStrictEqual(list[0].collapsed, false);
        assert.deepStrictEqual(list[0].depth, 1);
        assert.deepStrictEqual(list[1].element, 2);
        assert.deepStrictEqual(list[1].collapsed, false);
        assert.deepStrictEqual(list[1].depth, 1);
        disposable.dispose();
    }));
    test('smart splice deep', () => {
        const list = [];
        const model = new IndexTreeModel('test', -1);
        const disposable = bindListToModel(list, model);
        model.splice([0], 0, [
            { element: 0 },
            { element: 1 },
            { element: 2 },
            { element: 3 },
        ], { diffIdentityProvider });
        assert.deepStrictEqual(list.filter(l => l.depth === 1).map(toElements), [
            0,
            1,
            2,
            3,
        ]);
        model.splice([0], 3, [
            { element: -0.5 },
            { element: 0, children: [{ element: 0.1 }] },
            { element: 1 },
            { element: 2, children: [{ element: 2.1 }, { element: 2.2, children: [{ element: 2.21 }] }] },
        ], { diffIdentityProvider, diffDepth: Infinity });
        assert.deepStrictEqual(list.filter(l => l.depth === 1).map(toElements), [
            -0.5,
            { e: 0, children: [0.1] },
            1,
            { e: 2, children: [2.1, { e: 2.2, children: [2.21] }] },
            3,
        ]);
        disposable.dispose();
    });
    test('hidden delete', () => withSmartSplice(options => {
        const list = [];
        const model = new IndexTreeModel('test', -1);
        const disposable = bindListToModel(list, model);
        model.splice([0], 0, [
            {
                element: 0, collapsed: true, children: [
                    { element: 10 },
                    { element: 11 },
                    { element: 12 },
                ]
            },
            { element: 1 },
            { element: 2 }
        ], options);
        assert.deepStrictEqual(list.length, 3);
        model.splice([0, 1], 1, undefined, options);
        assert.deepStrictEqual(list.length, 3);
        model.splice([0, 0], 2, undefined, options);
        assert.deepStrictEqual(list.length, 3);
        disposable.dispose();
    }));
    test('collapse', () => withSmartSplice(options => {
        const list = [];
        const model = new IndexTreeModel('test', -1);
        const disposable = bindListToModel(list, model);
        model.splice([0], 0, [
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
        assert.deepStrictEqual(list.length, 6);
        model.setCollapsed([0], true);
        assert.deepStrictEqual(list.length, 3);
        assert.deepStrictEqual(list[0].element, 0);
        assert.deepStrictEqual(list[0].collapsed, true);
        assert.deepStrictEqual(list[0].depth, 1);
        assert.deepStrictEqual(list[1].element, 1);
        assert.deepStrictEqual(list[1].collapsed, false);
        assert.deepStrictEqual(list[1].depth, 1);
        assert.deepStrictEqual(list[2].element, 2);
        assert.deepStrictEqual(list[2].collapsed, false);
        assert.deepStrictEqual(list[2].depth, 1);
        disposable.dispose();
    }));
    test('expand', () => withSmartSplice(options => {
        const list = [];
        const model = new IndexTreeModel('test', -1);
        const disposable = bindListToModel(list, model);
        model.splice([0], 0, [
            {
                element: 0, collapsed: true, children: [
                    { element: 10 },
                    { element: 11 },
                    { element: 12 },
                ]
            },
            { element: 1 },
            { element: 2 }
        ], options);
        assert.deepStrictEqual(list.length, 3);
        model.expandTo([0, 1]);
        assert.deepStrictEqual(list.length, 6);
        assert.deepStrictEqual(list[0].element, 0);
        assert.deepStrictEqual(list[0].collapsed, false);
        assert.deepStrictEqual(list[0].depth, 1);
        assert.deepStrictEqual(list[1].element, 10);
        assert.deepStrictEqual(list[1].collapsed, false);
        assert.deepStrictEqual(list[1].depth, 2);
        assert.deepStrictEqual(list[2].element, 11);
        assert.deepStrictEqual(list[2].collapsed, false);
        assert.deepStrictEqual(list[2].depth, 2);
        assert.deepStrictEqual(list[3].element, 12);
        assert.deepStrictEqual(list[3].collapsed, false);
        assert.deepStrictEqual(list[3].depth, 2);
        assert.deepStrictEqual(list[4].element, 1);
        assert.deepStrictEqual(list[4].collapsed, false);
        assert.deepStrictEqual(list[4].depth, 1);
        assert.deepStrictEqual(list[5].element, 2);
        assert.deepStrictEqual(list[5].collapsed, false);
        assert.deepStrictEqual(list[5].depth, 1);
        disposable.dispose();
    }));
    test('smart diff consistency', () => {
        const times = 500;
        const minEdits = 1;
        const maxEdits = 10;
        const maxInserts = 5;
        for (let i = 0; i < times; i++) {
            const list = [];
            const options = { diffIdentityProvider: { getId: (n) => String(n) } };
            const model = new IndexTreeModel('test', -1);
            const disposable = bindListToModel(list, model);
            const changes = [];
            const expected = [];
            let elementCounter = 0;
            for (let edits = Math.random() * (maxEdits - minEdits) + minEdits; edits > 0; edits--) {
                const spliceIndex = Math.floor(Math.random() * list.length);
                const deleteCount = Math.ceil(Math.random() * (list.length - spliceIndex));
                const insertCount = Math.floor(Math.random() * maxInserts + 1);
                const inserts = [];
                for (let i = 0; i < insertCount; i++) {
                    const element = elementCounter++;
                    inserts.push({ element, children: [] });
                }
                // move existing items
                if (Math.random() < 0.5) {
                    const elements = list.slice(spliceIndex, spliceIndex + Math.floor(deleteCount / 2));
                    inserts.push(...elements.map(({ element }) => ({ element, children: [] })));
                }
                model.splice([spliceIndex], deleteCount, inserts, options);
                expected.splice(spliceIndex, deleteCount, ...inserts.map(i => i.element));
                const listElements = list.map(l => l.element);
                changes.push(`splice(${spliceIndex}, ${deleteCount}, [${inserts.map(e => e.element).join(', ')}]) -> ${listElements.join(', ')}`);
                assert.deepStrictEqual(expected, listElements, `Expected ${listElements.join(', ')} to equal ${expected.join(', ')}. Steps:\n\n${changes.join('\n')}`);
            }
            disposable.dispose();
        }
    });
    test('collapse should recursively adjust visible count', () => {
        const list = [];
        const model = new IndexTreeModel('test', -1);
        const disposable = bindListToModel(list, model);
        model.splice([0], 0, [
            {
                element: 1, children: [
                    {
                        element: 11, children: [
                            { element: 111 }
                        ]
                    }
                ]
            },
            {
                element: 2, children: [
                    { element: 21 }
                ]
            }
        ]);
        assert.deepStrictEqual(list.length, 5);
        assert.deepStrictEqual(toArray(list), [1, 11, 111, 2, 21]);
        model.setCollapsed([0, 0], true);
        assert.deepStrictEqual(list.length, 4);
        assert.deepStrictEqual(toArray(list), [1, 11, 2, 21]);
        model.setCollapsed([1], true);
        assert.deepStrictEqual(list.length, 3);
        assert.deepStrictEqual(toArray(list), [1, 11, 2]);
        disposable.dispose();
    });
    test('setCollapsible', () => {
        const list = [];
        const model = new IndexTreeModel('test', -1);
        const disposable = bindListToModel(list, model);
        model.splice([0], 0, [
            {
                element: 0, children: [
                    { element: 10 }
                ]
            }
        ]);
        assert.deepStrictEqual(list.length, 2);
        model.setCollapsible([0], false);
        assert.deepStrictEqual(list.length, 2);
        assert.deepStrictEqual(list[0].element, 0);
        assert.deepStrictEqual(list[0].collapsible, false);
        assert.deepStrictEqual(list[0].collapsed, false);
        assert.deepStrictEqual(list[1].element, 10);
        assert.deepStrictEqual(list[1].collapsible, false);
        assert.deepStrictEqual(list[1].collapsed, false);
        assert.deepStrictEqual(model.setCollapsed([0], true), false);
        assert.deepStrictEqual(list[0].element, 0);
        assert.deepStrictEqual(list[0].collapsible, false);
        assert.deepStrictEqual(list[0].collapsed, false);
        assert.deepStrictEqual(list[1].element, 10);
        assert.deepStrictEqual(list[1].collapsible, false);
        assert.deepStrictEqual(list[1].collapsed, false);
        assert.deepStrictEqual(model.setCollapsed([0], false), false);
        assert.deepStrictEqual(list[0].element, 0);
        assert.deepStrictEqual(list[0].collapsible, false);
        assert.deepStrictEqual(list[0].collapsed, false);
        assert.deepStrictEqual(list[1].element, 10);
        assert.deepStrictEqual(list[1].collapsible, false);
        assert.deepStrictEqual(list[1].collapsed, false);
        model.setCollapsible([0], true);
        assert.deepStrictEqual(list.length, 2);
        assert.deepStrictEqual(list[0].element, 0);
        assert.deepStrictEqual(list[0].collapsible, true);
        assert.deepStrictEqual(list[0].collapsed, false);
        assert.deepStrictEqual(list[1].element, 10);
        assert.deepStrictEqual(list[1].collapsible, false);
        assert.deepStrictEqual(list[1].collapsed, false);
        assert.deepStrictEqual(model.setCollapsed([0], true), true);
        assert.deepStrictEqual(list.length, 1);
        assert.deepStrictEqual(list[0].element, 0);
        assert.deepStrictEqual(list[0].collapsible, true);
        assert.deepStrictEqual(list[0].collapsed, true);
        assert.deepStrictEqual(model.setCollapsed([0], false), true);
        assert.deepStrictEqual(list[0].element, 0);
        assert.deepStrictEqual(list[0].collapsible, true);
        assert.deepStrictEqual(list[0].collapsed, false);
        assert.deepStrictEqual(list[1].element, 10);
        assert.deepStrictEqual(list[1].collapsible, false);
        assert.deepStrictEqual(list[1].collapsed, false);
        disposable.dispose();
    });
    test('simple filter', () => {
        const list = [];
        const filter = new class {
            filter(element) {
                return element % 2 === 0 ? 1 /* TreeVisibility.Visible */ : 0 /* TreeVisibility.Hidden */;
            }
        };
        const model = new IndexTreeModel('test', -1, { filter });
        const disposable = bindListToModel(list, model);
        model.splice([0], 0, [
            {
                element: 0, children: [
                    { element: 1 },
                    { element: 2 },
                    { element: 3 },
                    { element: 4 },
                    { element: 5 },
                    { element: 6 },
                    { element: 7 }
                ]
            }
        ]);
        assert.deepStrictEqual(list.length, 4);
        assert.deepStrictEqual(toArray(list), [0, 2, 4, 6]);
        model.setCollapsed([0], true);
        assert.deepStrictEqual(toArray(list), [0]);
        model.setCollapsed([0], false);
        assert.deepStrictEqual(toArray(list), [0, 2, 4, 6]);
        disposable.dispose();
    });
    test('recursive filter on initial model', () => {
        const list = [];
        const filter = new class {
            filter(element) {
                return element === 0 ? 2 /* TreeVisibility.Recurse */ : 0 /* TreeVisibility.Hidden */;
            }
        };
        const model = new IndexTreeModel('test', -1, { filter });
        const disposable = bindListToModel(list, model);
        model.splice([0], 0, [
            {
                element: 0, children: [
                    { element: 1 },
                    { element: 2 }
                ]
            }
        ]);
        assert.deepStrictEqual(toArray(list), []);
        disposable.dispose();
    });
    test('refilter', () => {
        const list = [];
        let shouldFilter = false;
        const filter = new class {
            filter(element) {
                return (!shouldFilter || element % 2 === 0) ? 1 /* TreeVisibility.Visible */ : 0 /* TreeVisibility.Hidden */;
            }
        };
        const model = new IndexTreeModel('test', -1, { filter });
        const disposable = bindListToModel(list, model);
        model.splice([0], 0, [
            {
                element: 0, children: [
                    { element: 1 },
                    { element: 2 },
                    { element: 3 },
                    { element: 4 },
                    { element: 5 },
                    { element: 6 },
                    { element: 7 }
                ]
            },
        ]);
        assert.deepStrictEqual(toArray(list), [0, 1, 2, 3, 4, 5, 6, 7]);
        model.refilter();
        assert.deepStrictEqual(toArray(list), [0, 1, 2, 3, 4, 5, 6, 7]);
        shouldFilter = true;
        model.refilter();
        assert.deepStrictEqual(toArray(list), [0, 2, 4, 6]);
        shouldFilter = false;
        model.refilter();
        assert.deepStrictEqual(toArray(list), [0, 1, 2, 3, 4, 5, 6, 7]);
        disposable.dispose();
    });
    test('recursive filter', () => {
        const list = [];
        let query = new RegExp('');
        const filter = new class {
            filter(element) {
                return query.test(element) ? 1 /* TreeVisibility.Visible */ : 2 /* TreeVisibility.Recurse */;
            }
        };
        const model = new IndexTreeModel('test', 'root', { filter });
        const disposable = bindListToModel(list, model);
        model.splice([0], 0, [
            {
                element: 'vscode', children: [
                    { element: '.build' },
                    { element: 'git' },
                    {
                        element: 'github', children: [
                            { element: 'calendar.yml' },
                            { element: 'endgame' },
                            { element: 'build.js' },
                        ]
                    },
                    {
                        element: 'build', children: [
                            { element: 'lib' },
                            { element: 'gulpfile.js' }
                        ]
                    }
                ]
            },
        ]);
        assert.deepStrictEqual(list.length, 10);
        query = /build/;
        model.refilter();
        assert.deepStrictEqual(toArray(list), ['vscode', '.build', 'github', 'build.js', 'build']);
        model.setCollapsed([0], true);
        assert.deepStrictEqual(toArray(list), ['vscode']);
        model.setCollapsed([0], false);
        assert.deepStrictEqual(toArray(list), ['vscode', '.build', 'github', 'build.js', 'build']);
        disposable.dispose();
    });
    test('recursive filter updates when children change (#133272)', async () => {
        const list = [];
        let query = '';
        const filter = new class {
            filter(element) {
                return element.includes(query) ? 1 /* TreeVisibility.Visible */ : 2 /* TreeVisibility.Recurse */;
            }
        };
        const model = new IndexTreeModel('test', 'root', { filter });
        const disposable = bindListToModel(list, model);
        model.splice([0], 0, [
            {
                element: 'a',
                children: [
                    { element: 'b' },
                ],
            },
        ]);
        assert.deepStrictEqual(toArray(list), ['a', 'b']);
        query = 'visible';
        model.refilter();
        assert.deepStrictEqual(toArray(list), []);
        model.splice([0, 0, 0], 0, [
            {
                element: 'visible', children: []
            },
        ]);
        await timeout(0); // wait for refilter microtask
        assert.deepStrictEqual(toArray(list), ['a', 'b', 'visible']);
        disposable.dispose();
    });
    test('recursive filter with collapse', () => {
        const list = [];
        let query = new RegExp('');
        const filter = new class {
            filter(element) {
                return query.test(element) ? 1 /* TreeVisibility.Visible */ : 2 /* TreeVisibility.Recurse */;
            }
        };
        const model = new IndexTreeModel('test', 'root', { filter });
        const disposable = bindListToModel(list, model);
        model.splice([0], 0, [
            {
                element: 'vscode', children: [
                    { element: '.build' },
                    { element: 'git' },
                    {
                        element: 'github', children: [
                            { element: 'calendar.yml' },
                            { element: 'endgame' },
                            { element: 'build.js' },
                        ]
                    },
                    {
                        element: 'build', children: [
                            { element: 'lib' },
                            { element: 'gulpfile.js' }
                        ]
                    }
                ]
            },
        ]);
        assert.deepStrictEqual(list.length, 10);
        query = /gulp/;
        model.refilter();
        assert.deepStrictEqual(toArray(list), ['vscode', 'build', 'gulpfile.js']);
        model.setCollapsed([0, 3], true);
        assert.deepStrictEqual(toArray(list), ['vscode', 'build']);
        model.setCollapsed([0], true);
        assert.deepStrictEqual(toArray(list), ['vscode']);
        disposable.dispose();
    });
    test('recursive filter while collapsed', () => {
        const list = [];
        let query = new RegExp('');
        const filter = new class {
            filter(element) {
                return query.test(element) ? 1 /* TreeVisibility.Visible */ : 2 /* TreeVisibility.Recurse */;
            }
        };
        const model = new IndexTreeModel('test', 'root', { filter });
        const disposable = bindListToModel(list, model);
        model.splice([0], 0, [
            {
                element: 'vscode', collapsed: true, children: [
                    { element: '.build' },
                    { element: 'git' },
                    {
                        element: 'github', children: [
                            { element: 'calendar.yml' },
                            { element: 'endgame' },
                            { element: 'build.js' },
                        ]
                    },
                    {
                        element: 'build', children: [
                            { element: 'lib' },
                            { element: 'gulpfile.js' }
                        ]
                    }
                ]
            },
        ]);
        assert.deepStrictEqual(toArray(list), ['vscode']);
        query = /gulp/;
        model.refilter();
        assert.deepStrictEqual(toArray(list), ['vscode']);
        model.setCollapsed([0], false);
        assert.deepStrictEqual(toArray(list), ['vscode', 'build', 'gulpfile.js']);
        model.setCollapsed([0], true);
        assert.deepStrictEqual(toArray(list), ['vscode']);
        query = new RegExp('');
        model.refilter();
        assert.deepStrictEqual(toArray(list), ['vscode']);
        model.setCollapsed([0], false);
        assert.deepStrictEqual(list.length, 10);
        disposable.dispose();
    });
    suite('getNodeLocation', () => {
        test('simple', () => {
            const list = [];
            const model = new IndexTreeModel('test', -1);
            const disposable = bindListToModel(list, model);
            model.splice([0], 0, [
                {
                    element: 0, children: [
                        { element: 10 },
                        { element: 11 },
                        { element: 12 },
                    ]
                },
                { element: 1 },
                { element: 2 }
            ]);
            assert.deepStrictEqual(model.getNodeLocation(list[0]), [0]);
            assert.deepStrictEqual(model.getNodeLocation(list[1]), [0, 0]);
            assert.deepStrictEqual(model.getNodeLocation(list[2]), [0, 1]);
            assert.deepStrictEqual(model.getNodeLocation(list[3]), [0, 2]);
            assert.deepStrictEqual(model.getNodeLocation(list[4]), [1]);
            assert.deepStrictEqual(model.getNodeLocation(list[5]), [2]);
            disposable.dispose();
        });
        test('with filter', () => {
            const list = [];
            const filter = new class {
                filter(element) {
                    return element % 2 === 0 ? 1 /* TreeVisibility.Visible */ : 0 /* TreeVisibility.Hidden */;
                }
            };
            const model = new IndexTreeModel('test', -1, { filter });
            const disposable = bindListToModel(list, model);
            model.splice([0], 0, [
                {
                    element: 0, children: [
                        { element: 1 },
                        { element: 2 },
                        { element: 3 },
                        { element: 4 },
                        { element: 5 },
                        { element: 6 },
                        { element: 7 }
                    ]
                }
            ]);
            assert.deepStrictEqual(model.getNodeLocation(list[0]), [0]);
            assert.deepStrictEqual(model.getNodeLocation(list[1]), [0, 1]);
            assert.deepStrictEqual(model.getNodeLocation(list[2]), [0, 3]);
            assert.deepStrictEqual(model.getNodeLocation(list[3]), [0, 5]);
            disposable.dispose();
        });
    });
    test('refilter with filtered out nodes', () => {
        const list = [];
        let query = new RegExp('');
        const filter = new class {
            filter(element) {
                return query.test(element);
            }
        };
        const model = new IndexTreeModel('test', 'root', { filter });
        const disposable = bindListToModel(list, model);
        model.splice([0], 0, [
            { element: 'silver' },
            { element: 'gold' },
            { element: 'platinum' }
        ]);
        assert.deepStrictEqual(toArray(list), ['silver', 'gold', 'platinum']);
        query = /platinum/;
        model.refilter();
        assert.deepStrictEqual(toArray(list), ['platinum']);
        model.splice([0], Number.POSITIVE_INFINITY, [
            { element: 'silver' },
            { element: 'gold' },
            { element: 'platinum' }
        ]);
        assert.deepStrictEqual(toArray(list), ['platinum']);
        model.refilter();
        assert.deepStrictEqual(toArray(list), ['platinum']);
        disposable.dispose();
    });
    test('explicit hidden nodes should have renderNodeCount == 0, issue #83211', () => {
        const list = [];
        let query = new RegExp('');
        const filter = new class {
            filter(element) {
                return query.test(element);
            }
        };
        const model = new IndexTreeModel('test', 'root', { filter });
        const disposable = bindListToModel(list, model);
        model.splice([0], 0, [
            { element: 'a', children: [{ element: 'aa' }] },
            { element: 'b', children: [{ element: 'bb' }] }
        ]);
        assert.deepStrictEqual(toArray(list), ['a', 'aa', 'b', 'bb']);
        assert.deepStrictEqual(model.getListIndex([0]), 0);
        assert.deepStrictEqual(model.getListIndex([0, 0]), 1);
        assert.deepStrictEqual(model.getListIndex([1]), 2);
        assert.deepStrictEqual(model.getListIndex([1, 0]), 3);
        query = /b/;
        model.refilter();
        assert.deepStrictEqual(toArray(list), ['b', 'bb']);
        assert.deepStrictEqual(model.getListIndex([0]), -1);
        assert.deepStrictEqual(model.getListIndex([0, 0]), -1);
        assert.deepStrictEqual(model.getListIndex([1]), 0);
        assert.deepStrictEqual(model.getListIndex([1, 0]), 1);
        disposable.dispose();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXhUcmVlTW9kZWwudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvdGVzdC9icm93c2VyL3VpL3RyZWUvaW5kZXhUcmVlTW9kZWwudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFnRCxjQUFjLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUU3SCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdEQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDbkYsT0FBTyxFQUFFLGVBQWUsRUFBZSxNQUFNLGlDQUFpQyxDQUFDO0FBRS9FLFNBQVMsZUFBZSxDQUFJLElBQW9CLEVBQUUsS0FBd0I7SUFDekUsT0FBTyxLQUFLLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRTtRQUMxRSxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxXQUFXLEVBQUUsR0FBRyxRQUFRLENBQUMsQ0FBQztJQUM5QyxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRCxTQUFTLE9BQU8sQ0FBSSxJQUFvQjtJQUN2QyxPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDakMsQ0FBQztBQUdELFNBQVMsVUFBVSxDQUFJLElBQWtCO0lBQ3hDLE9BQU8sSUFBSSxDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7QUFDNUcsQ0FBQztBQUVELE1BQU0sb0JBQW9CLEdBQUcsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFTLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0FBRWpFOzs7R0FHRztBQUNILFNBQVMsZUFBZSxDQUFDLEVBQWdFO0lBQ3hGLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUNQLEVBQUUsQ0FBQyxFQUFFLG9CQUFvQixFQUFFLENBQUMsQ0FBQztBQUM5QixDQUFDO0FBRUQsS0FBSyxDQUFDLGdCQUFnQixFQUFFLEdBQUcsRUFBRTtJQUU1Qix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7SUFDMUMsUUFBUSxDQUFDLEdBQUcsRUFBRTtRQUNiLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUNyQixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBRyxFQUFFO1FBQ2pCLE1BQU0sSUFBSSxHQUF3QixFQUFFLENBQUM7UUFDckMsTUFBTSxLQUFLLEdBQUcsSUFBSSxjQUFjLENBQVMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckQsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2QsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ3BDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLFFBQVEsRUFBRSxHQUFHLEVBQUUsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLEVBQUU7UUFDOUMsTUFBTSxJQUFJLEdBQXdCLEVBQUUsQ0FBQztRQUNyQyxNQUFNLEtBQUssR0FBRyxJQUFJLGNBQWMsQ0FBUyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyRCxNQUFNLFVBQVUsR0FBRyxlQUFlLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRWhELEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUU7WUFDcEIsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFO1lBQ2QsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFO1lBQ2QsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFO1NBQ2QsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUVaLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN2QyxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2pELE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN6QyxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2pELE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN6QyxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2pELE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV6QyxVQUFVLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDdEIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVKLElBQUksQ0FBQyxhQUFhLEVBQUUsR0FBRyxFQUFFLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ25ELE1BQU0sSUFBSSxHQUF3QixFQUFFLENBQUM7UUFDckMsTUFBTSxLQUFLLEdBQUcsSUFBSSxjQUFjLENBQVMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckQsTUFBTSxVQUFVLEdBQUcsZUFBZSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVoRCxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFO1lBQ3BCO2dCQUNDLE9BQU8sRUFBRSxDQUFDLEVBQUUsUUFBUSxFQUFFO29CQUNyQixFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUU7b0JBQ2YsRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFO29CQUNmLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRTtpQkFDZjthQUNEO1lBQ0QsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFO1lBQ2QsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFO1NBQ2QsQ0FBQyxDQUFDO1FBRUgsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3ZDLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzQyxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDakQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQztRQUM1QyxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDakQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQztRQUM1QyxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDakQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQztRQUM1QyxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDakQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzQyxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDakQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sQ0FBQyxlQUFl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QUFLLENBQUMsQ0FBQztRQUVoRCxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFO1lBQ3BCLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRTtZQUNkLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRTtZQUNkLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRTtTQUNkLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFFWixNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFdkMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDekMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3ZDLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzQyxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDakQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzQyxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDakQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXpDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV2QyxVQUFVLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDdEIsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVKLElBQUksQ0FBQyxlQUFlLEVBQUUsR0FBRyxFQUFFLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQ3JELE1BQU0sSUFBSSxHQUF3QixFQUFFLENBQUM7UUFDckMsTUFBTSxLQUFLLEdBQUcsSUFBSSxjQUFjLENBQVMsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckQsTUFBTSxVQUFVLEdBQUcsZUFBZSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVoRCxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFO1lBQ3BCO2dCQUNDLE9BQU8sRUFBRSxDQUFDLEVBQUUsUUFBUSxFQUFFO29CQUNyQixFQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUU7b0JBQ2YsRUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFO29CQUNmLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRTtpQkFDZjthQUNEO1lBQ0QsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFO1lBQ2QsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFO1NBQ2QsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUVaLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUV2QyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUN6QyxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdkMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNqRCxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDekMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNqRCxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDekMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNqRCxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDekMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNqRCxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFekMsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ3RC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LENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNqRCxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDekMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNqRCxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDekMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNqRCxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDekMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNDLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNqRCxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFekMsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ3RCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFSixJQUFJLENBQUMsd0JBQXdCLEVBQUUs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RSxJQUFJLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM3RCxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25ELE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNqRCxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDNUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25ELE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVqRCxNQUFNLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM5RCxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0MsTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25ELE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNqRCxNQUFNLENBQUMsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDNUMsTUFBTSxD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