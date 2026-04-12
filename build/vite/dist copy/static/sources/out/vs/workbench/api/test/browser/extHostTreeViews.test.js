/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as sinon from 'sinon';
import { Emitter } from '../../../../base/common/event.js';
import { ExtHostTreeViews } from '../../common/extHostTreeViews.js';
import { ExtHostCommands } from '../../common/extHostCommands.js';
import { MainContext } from '../../common/extHost.protocol.js';
import { TestRPCProtocol } from '../common/testRPCProtocol.js';
import { mock } from '../../../../base/test/common/mock.js';
import { TreeItemCollapsibleState } from '../../../common/views.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { nullExtensionDescription as extensionsDescription } from '../../../services/extensions/common/extensions.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
function unBatchChildren(result) {
    if (!result || result.length === 0) {
        return undefined;
    }
    if (result.length > 1) {
        throw new Error('Unexpected result length, all tests are unbatched.');
    }
    return result[0].slice(1);
}
suite('ExtHostTreeView', function () {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    class RecordingShape extends mock() {
        constructor() {
            super(...arguments);
            this.onRefresh = new Emitter();
        }
        async $registerTreeViewDataProvider(treeViewId) {
        }
        $refresh(viewId, itemsToRefresh) {
            return Promise.resolve(null).then(() => {
                this.onRefresh.fire(itemsToRefresh);
            });
        }
        $reveal(treeViewId, itemInfo, options) {
            return Promise.resolve();
        }
        $disposeTree(treeViewId) {
            return Promise.resolve();
        }
    }
    let testObject;
    let target;
    let onDidChangeTreeNode;
    let onDidChangeTreeNodeWithId;
    let tree;
    let labels;
    let nodes;
    setup(() => {
        tree = {
            'a': {
                'aa': {},
                'ab': {}
            },
            'b': {
                'ba': {},
                'bb': {}
            }
        };
        labels = {};
        nodes = {};
        const rpcProtocol = new TestRPCProtocol();
        rpcProtocol.set(MainContext.MainThreadCommands, new class extends mock() {
            $registerCommand() { }
        });
        target = new RecordingShape();
        testObject = store.add(new ExtHostTreeViews(target, new ExtHostCommands(rpcProtocol, new NullLogService(), new class extends mock() {
            onExtensionError() {
                return true;
            }
        }), new NullLogService()));
        onDidChangeTreeNode = new Emitter();
        onDidChangeTreeNodeWithId = new Emitter();
        testObject.createTreeView('testNodeTreeProvider', { treeDataProvider: aNodeTreeDataProvider() }, extensionsDescription);
        testObject.createTreeView('testNodeWithIdTreeProvider', { treeDataProvider: aNodeWithIdTreeDataProvider() }, extensionsDescription);
        testObject.createTreeView('testNodeWithHighlightsTreeProvider', { treeDataProvider: aNodeWithHighlightedLabelTreeDataProvider() }, extensionsDescription);
        return loadCompleteTree('testNodeTreeProvider');
    });
    test('construct node tree', () => {
        return testObject.$getChildren('testNodeTreeProvider')
            .then(elements => {
            const actuals = unBatchChildren(elements)?.map(e => e.handle);
            assert.deepStrictEqual(actuals, ['0/0:a', '0/0:b']);
            return Promise.all([
                testObject.$getChildren('testNodeTreeProvider', ['0/0:a'])
                    .then(children => {
                    const actuals = unBatchChildren(children)?.map(e => e.handle);
                    assert.deepStrictEqual(actuals, ['0/0:a/0:aa', '0/0:a/0:ab']);
                    return Promise.all([
                        testObject.$getChildren('testNodeTreeProvider', ['0/0:a/0:aa']).then(children => assert.strictEqual(unBatchChildren(children)?.length, 0)),
                        testObject.$getChildren('testNodeTreeProvider', ['0/0:a/0:ab']).then(children => assert.strictEqual(unBatchChildren(children)?.length, 0))
                    ]);
                }),
                testObject.$getChildren('testNodeTreeProvider', ['0/0:b'])
                    .then(children => {
                    const actuals = unBatchChildren(children)?.map(e => e.handle);
                    assert.deepStrictEqual(actuals, ['0/0:b/0:ba', '0/0:b/0:bb']);
                    return Promise.all([
                        testObject.$getChildren('testNodeTreeProvider', ['0/0:b/0:ba']).then(children => assert.strictEqual(unBatchChildren(children)?.length, 0)),
                        testObject.$getChildren('testNodeTreeProvider', ['0/0:b/0:bb']).then(children => assert.strictEqual(unBatchChildren(children)?.length, 0))
                    ]);
                })
            ]);
        });
    });
    test('construct id tree', () => {
        return testObject.$getChildren('testNodeWithIdTreeProvider')
            .then(elements => {
            const actuals = unBatchChildren(elements)?.map(e => e.handle);
            assert.deepStrictEqual(actuals, ['1/a', '1/b']);
            return Promise.all([
                testObject.$getChildren('testNodeWithIdTreeProvider', ['1/a'])
                    .then(children => {
                    const actuals = unBatchChildren(children)?.map(e => e.handle);
                    assert.deepStrictEqual(actuals, ['1/aa', '1/ab']);
                    return Promise.all([
                        testObject.$getChildren('testNodeWithIdTreeProvider', ['1/aa']).then(children => assert.strictEqual(unBatchChildren(children)?.length, 0)),
                        testObject.$getChildren('testNodeWithIdTreeProvider', ['1/ab']).then(children => assert.strictEqual(unBatchChildren(children)?.length, 0))
                    ]);
                }),
                testObject.$getChildren('testNodeWithIdTreeProvider', ['1/b'])
                    .then(children => {
                    const actuals = unBatchChildren(children)?.map(e => e.handle);
                    assert.deepStrictEqual(actuals, ['1/ba', '1/bb']);
                    return Promise.all([
                        testObject.$getChildren('testNodeWithIdTreeProvider', ['1/ba']).then(children => assert.strictEqual(unBatchChildren(children)?.length, 0)),
                        testObject.$getChildren('testNodeWithIdTreeProvider', ['1/bb']).then(children => assert.strictEqual(unBatchChildren(children)?.length, 0))
                    ]);
                })
            ]);
        });
    });
    test('construct highlights tree', () => {
        return testObject.$getChildren('testNodeWithHighlightsTreeProvider')
            .then(elements => {
            assert.deepStrictEqual(removeUnsetKeys(unBatchChildren(elements)), [{
                    handle: '1/a',
                    label: { label: 'a', highlights: [[0, 2], [3, 5]] },
                    collapsibleState: TreeItemCollapsibleState.Collapsed
                }, {
                    handle: '1/b',
                    label: { label: 'b', highlights: [[0, 2], [3, 5]] },
                    collapsibleState: TreeItemCollapsibleState.Collapsed
                }]);
            return Promise.all([
                testObject.$getChildren('testNodeWithHighlightsTreeProvider', ['1/a'])
                    .then(children => {
                    assert.deepStrictEqual(removeUnsetKeys(unBatchChildren(children)), [{
                            handle: '1/aa',
                            parentHandle: '1/a',
                            label: { label: 'aa', highlights: [[0, 2], [3, 5]] },
                            collapsibleState: TreeItemCollapsibleState.None
                        }, {
                            handle: '1/ab',
                            parentHandle: '1/a',
                            label: { label: 'ab', highlights: [[0, 2], [3, 5]] },
                            collapsibleState: TreeItemCollapsibleState.None
                        }]);
                }),
                testObject.$getChildren('testNodeWithHighlightsTreeProvider', ['1/b'])
                    .then(children => {
                    assert.deepStrictEqual(removeUnsetKeys(unBatchChildren(children)), [{
                            handle: '1/ba',
                            parentHandle: '1/b',
                            label: { label: 'ba', highlights: [[0, 2], [3, 5]] },
                            collapsibleState: TreeItemCollapsibleState.None
                        }, {
                            handle: '1/bb',
                            parentHandle: '1/b',
                            label: { label: 'bb', highlights: [[0, 2], [3, 5]] },
                            collapsibleState: TreeItemCollapsibleState.None
                        }]);
                })
            ]);
        });
    });
    test('duplicate id across siblings is handled gracefully', (done) => {
        tree['a'] = {
            'aa': {},
        };
        tree['b'] = {
            'aa': {},
            'ba': {}
        };
        store.add(target.onRefresh.event(() => {
            testObject.$getChildren('testNodeWithIdTreeProvider')
                .then(elements => {
                const actuals = unBatchChildren(elements)?.map(e => e.handle);
                assert.deepStrictEqual(actuals, ['1/a', '1/b']);
                return testObject.$getChildren('testNodeWithIdTreeProvider', ['1/a'])
                    .then(() => testObject.$getChildren('testNodeWithIdTreeProvider', ['1/b']))
                    .then(elements => {
                    // Children of 'b' should include both 'aa' and 'ba'
                    const children = unBatchChildren(elements)?.map(e => e.handle);
                    assert.deepStrictEqual(children, ['1/aa', '1/ba']);
                    done();
                });
            }).catch(done);
        }));
        onDidChangeTreeNode.fire(undefined);
    });
    test('different element instances with same id are replaced gracefully', async () => {
        // Simulates the race condition: two concurrent getChildren calls return
        // different element objects that map to the same tree item ID. The second
        // call should replace the first's registration without error.
        let callCount = 0;
        const element1 = { key: 'x' };
        const element2 = { key: 'x' };
        const treeView = testObject.createTreeView('testRaceProvider', {
            treeDataProvider: {
                getChildren: () => {
                    callCount++;
                    // Return a different object instance each time
                    return callCount === 1 ? [element1] : [element2];
                },
                getTreeItem: (element) => {
                    return { label: { label: element.key }, id: 'same-id', collapsibleState: TreeItemCollapsibleState.None };
                },
                onDidChangeTreeData: onDidChangeTreeNode.event,
            }
        }, extensionsDescription);
        store.add(treeView);
        // First fetch — registers element1 with id 'same-id'
        const first = await testObject.$getChildren('testRaceProvider');
        const firstChildren = unBatchChildren(first);
        assert.strictEqual(firstChildren?.length, 1);
        assert.strictEqual(firstChildren[0].handle, '1/same-id');
        // Second fetch — different element instance, same id. Should not throw.
        const second = await testObject.$getChildren('testRaceProvider');
        const secondChildren = unBatchChildren(second);
        assert.strictEqual(secondChildren?.length, 1);
        assert.strictEqual(secondChildren[0].handle, '1/same-id');
    });
    test('refresh root', function (done) {
        store.add(target.onRefresh.event(actuals => {
            assert.strictEqual(undefined, actuals);
            done();
        }));
        onDidChangeTreeNode.fire(undefined);
    });
    test('refresh a parent node', () => {
        return new Promise((c, e) => {
            store.add(target.onRefresh.event(actuals => {
                assert.deepStrictEqual(['0/0:b'], Object.keys(actuals));
                assert.deepStrictEqual(removeUnsetKeys(actuals['0/0:b']), {
                    handle: '0/0:b',
                    label: { label: 'b' },
                    collapsibleState: TreeItemCollapsibleState.Collapsed
                });
                c(undefined);
            }));
            onDidChangeTreeNode.fire(getNode('b'));
        });
    });
    test('refresh a leaf node', function (done) {
        store.add(target.onRefresh.event(actuals => {
            assert.deepStrictEqual(['0/0:b/0:bb'], Object.keys(actuals));
            assert.deepStrictEqual(removeUnsetKeys(actuals['0/0:b/0:bb']), {
                handle: '0/0:b/0:bb',
                parentHandle: '0/0:b',
                label: { label: 'bb' },
                collapsibleState: TreeItemCollapsibleState.None
            });
            done();
        }));
        onDidChangeTreeNode.fire(getNode('bb'));
    });
    async function runWithEventMerging(action) {
        await runWithFakedTimers({}, async () => {
            await new Promise((resolve) => {
                let subscription = undefined;
                subscription = target.onRefresh.event(() => {
                    subscription.dispose();
                    resolve();
                });
                onDidChangeTreeNode.fire(getNode('b'));
            });
            await new Promise(action);
        });
    }
    test('refresh parent and child node trigger refresh only on parent - scenario 1', async () => {
        return runWithEventMerging((resolve) => {
            store.add(target.onRefresh.event(actuals => {
                assert.deepStrictEqual(['0/0:b', '0/0:a/0:aa'], Object.keys(actuals));
                assert.deepStrictEqual(removeUnsetKeys(actuals['0/0:b']), {
                    handle: '0/0:b',
                    label: { label: 'b' },
                    collapsibleState: TreeItemCollapsibleState.Collapsed
                });
                assert.deepStrictEqual(removeUnsetKeys(actuals['0/0:a/0:aa']), {
                    handle: '0/0:a/0:aa',
                    parentHandle: '0/0:a',
                    label: { label: 'aa' },
                    collapsibleState: TreeItemCollapsibleState.None
                });
                resolve();
            }));
            onDidChangeTreeNode.fire(getNode('b'));
            onDidChangeTreeNode.fire(getNode('aa'));
            onDidChangeTreeNode.fire(getNode('bb'));
        });
    });
    test('refresh parent and child node trigger refresh only on parent - scenario 2', async () => {
        return runWithEventMerging((resolve) => {
            store.add(target.onRefresh.event(actuals => {
                assert.deepStrictEqual(['0/0:a/0:aa', '0/0:b'], Object.keys(actuals));
                assert.deepStrictEqual(removeUnsetKeys(actuals['0/0:b']), {
                    handle: '0/0:b',
                    label: { label: 'b' },
                    collapsibleState: TreeItemCollapsibleState.Collapsed
                });
                assert.deepStrictEqual(removeUnsetKeys(actuals['0/0:a/0:aa']), {
                    handle: '0/0:a/0:aa',
                    parentHandle: '0/0:a',
                    label: { label: 'aa' },
                    collapsibleState: TreeItemCollapsibleState.None
                });
                resolve();
            }));
            onDidChangeTreeNode.fire(getNode('bb'));
            onDidChangeTreeNode.fire(getNode('aa'));
            onDidChangeTreeNode.fire(getNode('b'));
        });
    });
    test('refresh an element for label change', function (done) {
        labels['a'] = 'aa';
        store.add(target.onRefresh.event(actuals => {
            assert.deepStrictEqual(['0/0:a'], Object.keys(actuals));
            assert.deepStrictEqual(removeUnsetKeys(actuals['0/0:a']), {
                handle: '0/0:aa',
                label: { label: 'aa' },
                collapsibleState: TreeItemCollapsibleState.Collapsed
            });
            done();
        }));
        onDidChangeTreeNode.fire(getNode('a'));
    });
    test('refresh calls are throttled on roots', () => {
        return runWithEventMerging((resolve) => {
            store.add(target.onRefresh.event(actuals => {
                assert.strictEqual(undefined, actuals);
                resolve();
            }));
            onDidChangeTreeNode.fire(undefined);
            onDidChangeTreeNode.fire(undefined);
            onDidChangeTreeNode.fire(undefined);
            onDidChangeTreeNode.fire(undefined);
        });
    });
    test('refresh calls are throttled on elements', () => {
        return runWithEventMerging((resolve) => {
            store.add(target.onRefresh.event(actuals => {
                assert.deepStrictEqual(['0/0:a', '0/0:b'], Object.keys(actuals));
                resolve();
            }));
            onDidChangeTreeNode.fire(getNode('a'));
            onDidChangeTreeNode.fire(getNode('b'));
            onDidChangeTreeNode.fire(getNode('b'));
            onDidChangeTreeNode.fire(getNode('a'));
        });
    });
    test('refresh calls are throttled on unknown elements', () => {
        return runWithEventMerging((resolve) => {
            store.add(target.onRefresh.event(actuals => {
                assert.deepStrictEqual(['0/0:a', '0/0:b'], Object.keys(actuals));
                resolve();
            }));
            onDidChangeTreeNode.fire(getNode('a'));
            onDidChangeTreeNode.fire(getNode('b'));
            onDidChangeTreeNode.fire(getNode('g'));
            onDidChangeTreeNode.fire(getNode('a'));
        });
    });
    test('refresh calls are throttled on unknown elements and root', () => {
        return runWithEventMerging((resolve) => {
            store.add(target.onRefresh.event(actuals => {
                assert.strictEqual(undefined, actuals);
                resolve();
            }));
            onDidChangeTreeNode.fire(getNode('a'));
            onDidChangeTreeNode.fire(getNode('b'));
            onDidChangeTreeNode.fire(getNode('g'));
            onDidChangeTreeNode.fire(undefined);
        });
    });
    test('refresh calls are throttled on elements and root', () => {
        return runWithEventMerging((resolve) => {
            store.add(target.onRefresh.event(actuals => {
                assert.strictEqual(undefined, actuals);
                resolve();
            }));
            onDidChangeTreeNode.fire(getNode('a'));
            onDidChangeTreeNode.fire(getNode('b'));
            onDidChangeTreeNode.fire(undefined);
            onDidChangeTreeNode.fire(getNode('a'));
        });
    });
    test('generate unique handles from labels by escaping them', (done) => {
        tree = {
            'a/0:b': {}
        };
        store.add(target.onRefresh.event(() => {
            testObject.$getChildren('testNodeTreeProvider')
                .then(elements => {
                assert.deepStrictEqual(unBatchChildren(elements)?.map(e => e.handle), ['0/0:a//0:b']);
                done();
            });
        }));
        onDidChangeTreeNode.fire(undefined);
    });
    test('tree with duplicate labels', (done) => {
        const dupItems = {
            'adup1': 'c',
            'adup2': 'g',
            'bdup1': 'e',
            'hdup1': 'i',
            'hdup2': 'l',
            'jdup1': 'k'
        };
        labels['c'] = 'a';
        labels['e'] = 'b';
        labels['g'] = 'a';
        labels['i'] = 'h';
        labels['l'] = 'h';
        labels['k'] = 'j';
        tree[dupItems['adup1']] = {};
        tree['d'] = {};
        const bdup1Tree = {};
        bdup1Tree['h'] = {};
        bdup1Tree[dupItems['hdup1']] = {};
        bdup1Tree['j'] = {};
        bdup1Tree[dupItems['jdup1']] = {};
        bdup1Tree[dupItems['hdup2']] = {};
        tree[dupItems['bdup1']] = bdup1Tree;
        tree['f'] = {};
        tree[dupItems['adup2']] = {};
        store.add(target.onRefresh.event(() => {
            testObject.$getChildren('testNodeTreeProvider')
                .then(elements => {
                const actuals = unBatchChildren(elements)?.map(e => e.handle);
                assert.deepStrictEqual(actuals, ['0/0:a', '0/0:b', '0/1:a', '0/0:d', '0/1:b', '0/0:f', '0/2:a']);
                return testObject.$getChildren('testNodeTreeProvider', ['0/1:b'])
                    .then(elements => {
                    const actuals = unBatchChildren(elements)?.map(e => e.handle);
                    assert.deepStrictEqual(actuals, ['0/1:b/0:h', '0/1:b/1:h', '0/1:b/0:j', '0/1:b/1:j', '0/1:b/2:h']);
                    done();
                });
            });
        }));
        onDidChangeTreeNode.fire(undefined);
    });
    test('getChildren is not returned from cache if refreshed', (done) => {
        tree = {
            'c': {}
        };
        store.add(target.onRefresh.event(() => {
            testObject.$getChildren('testNodeTreeProvider')
                .then(elements => {
                assert.deepStrictEqual(unBatchChildren(elements)?.map(e => e.handle), ['0/0:c']);
                done();
            });
        }));
        onDidChangeTreeNode.fire(undefined);
    });
    test('getChildren is returned from cache if not refreshed', () => {
        tree = {
            'c': {}
        };
        return testObject.$getChildren('testNodeTreeProvider')
            .then(elements => {
            assert.deepStrictEqual(unBatchChildren(elements)?.map(e => e.handle), ['0/0:a', '0/0:b']);
        });
    });
    test('dispose and re-register tree view', async () => {
        const disposeTreeSpy = sinon.spy(target, '$disposeTree');
        const registerSpy = sinon.spy(target, '$registerTreeViewDataProvider');
        // Create, dispose, and re-register a tree view with the same id
        const treeView1 = testObject.createTreeView('reRegisterTreeProvider', { treeDataProvider: aNodeTreeDataProvider() }, extensionsDescription);
        treeView1.dispose();
        const treeView2 = testObject.createTreeView('reRegisterTreeProvider', { treeDataProvider: aNodeTreeDataProvider() }, extensionsDescription);
        // Let all pending microtasks (the async dispose) settle
        await new Promise(r => setTimeout(r, 0));
        // The new view should work — $getChildren should return results, not reject
        const elements = await testObject.$getChildren('reRegisterTreeProvider');
        assert.deepStrictEqual(unBatchChildren(elements)?.map(e => e.handle), ['0/0:a', '0/0:b']);
        // $registerTreeViewDataProvider should have been called twice (once per createTreeView)
        assert.strictEqual(registerSpy.callCount, 2);
        // $disposeTree should NOT have been called — the old async dispose should detect it was replaced
        assert.strictEqual(disposeTreeSpy.callCount, 0);
        treeView2.dispose();
    });
    test('reveal will throw an error if getParent is not implemented', () => {
        const treeView = testObject.createTreeView('treeDataProvider', { treeDataProvider: aNodeTreeDataProvider() }, extensionsDescription);
        return treeView.reveal({ key: 'a' })
            .then(() => assert.fail('Reveal should throw an error as getParent is not implemented'), () => null);
    });
    test('reveal will return empty array for root element', () => {
        const revealTarget = sinon.spy(target, '$reveal');
        const treeView = testObject.createTreeView('treeDataProvider', { treeDataProvider: aCompleteNodeTreeDataProvider() }, extensionsDescription);
        const expected = {
            item: { handle: '0/0:a', label: { label: 'a' }, collapsibleState: TreeItemCollapsibleState.Collapsed },
            parentChain: []
        };
        return treeView.reveal({ key: 'a' })
            .then(() => {
            assert.ok(revealTarget.calledOnce);
            assert.deepStrictEqual('treeDataProvider', revealTarget.args[0][0]);
            assert.deepStrictEqual(expected, removeUnsetKeys(revealTarget.args[0][1]));
            assert.deepStrictEqual({ select: true, focus: false, expand: false }, revealTarget.args[0][2]);
        });
    });
    test('reveal will return parents array for an element when hierarchy is not loaded', () => {
        const revealTarget = sinon.spy(target, '$reveal');
        const treeView = testObject.createTreeView('treeDataProvider', { treeDataProvider: aCompleteNodeTreeDataProvider() }, extensionsDescription);
        const expected = {
            item: { handle: '0/0:a/0:aa', label: { label: 'aa' }, collapsibleState: TreeItemCollapsibleState.None, parentHandle: '0/0:a' },
            parentChain: [{ handle: '0/0:a', label: { label: 'a' }, collapsibleState: TreeItemCollapsibleState.Collapsed }]
        };
        return treeView.reveal({ key: 'aa' })
            .then(() => {
            assert.ok(revealTarget.calledOnce);
            assert.deepStrictEqual('treeDataProvider', revealTarget.args[0][0]);
            assert.deepStrictEqual(expected.item, removeUnsetKeys(revealTarget.args[0][1].item));
            assert.deepStrictEqual(expected.parentChain, (revealTarget.args[0][1].parentChain).map(arg => removeUnsetKeys(arg)));
            assert.deepStrictEqual({ select: true, focus: false, expand: false }, revealTarget.args[0][2]);
        });
    });
    test('reveal will return parents array for an element when hierarchy is loaded', () => {
        const revealTarget = sinon.spy(target, '$reveal');
        const treeView = testObject.createTreeView('treeDataProvider', { treeDataProvider: aCompleteNodeTreeDataProvider() }, extensionsDescription);
        const expected = {
            item: { handle: '0/0:a/0:aa', label: { label: 'aa' }, collapsibleState: TreeItemCollapsibleState.None, parentHandle: '0/0:a' },
            parentChain: [{ handle: '0/0:a', label: { label: 'a' }, collapsibleState: TreeItemCollapsibleState.Collapsed }]
        };
        return testObject.$getChildren('treeDataProvider')
            .then(() => testObject.$getChildren('treeDataProvider', ['0/0:a']))
            .then(() => treeView.reveal({ key: 'aa' })
            .then(() => {
            assert.ok(revealTarget.calledOnce);
            assert.deepStrictEqual('treeDataProvider', revealTarget.args[0][0]);
            assert.deepStrictEqual(expected.item, removeUnsetKeys(revealTarget.args[0][1].item));
            assert.deepStrictEqual(expected.parentChain, (revealTarget.args[0][1].parentChain).map(arg => removeUnsetKeys(arg)));
            assert.deepStrictEqual({ select: true, focus: false, expand: false }, revealTarget.args[0][2]);
        }));
    });
    test('reveal will return parents array for deeper element with no selection', () => {
        tree = {
            'b': {
                'ba': {
                    'bac': {}
                }
            }
        };
        const revealTarget = sinon.spy(target, '$reveal');
        const treeView = testObject.createTreeView('treeDataProvider', { treeDataProvider: aCompleteNodeTreeDataProvider() }, extensionsDescription);
        const expected = {
            item: { handle: '0/0:b/0:ba/0:bac', label: { label: 'bac' }, collapsibleState: TreeItemCollapsibleState.None, parentHandle: '0/0:b/0:ba' },
            parentChain: [
                { handle: '0/0:b', label: { label: 'b' }, collapsibleState: TreeItemCollapsibleState.Collapsed },
                { handle: '0/0:b/0:ba', label: { label: 'ba' }, collapsibleState: TreeItemCollapsibleState.Collapsed, parentHandle: '0/0:b' }
            ]
        };
        return treeView.reveal({ key: 'bac' }, { select: false, focus: false, expand: false })
            .then(() => {
            assert.ok(revealTarget.calledOnce);
            assert.deepStrictEqual('treeDataProvider', revealTarget.args[0][0]);
            assert.deepStrictEqual(expected.item, removeUnsetKeys(revealTarget.args[0][1].item));
            assert.deepStrictEqual(expected.parentChain, (revealTarget.args[0][1].parentChain).map(arg => removeUnsetKeys(arg)));
            assert.deepStrictEqual({ select: false, focus: false, expand: false }, revealTarget.args[0][2]);
        });
    });
    test('reveal after first udpate', () => {
        const revealTarget = sinon.spy(target, '$reveal');
        const treeView = testObject.createTreeView('treeDataProvider', { treeDataProvider: aCompleteNodeTreeDataProvider() }, extensionsDescription);
        const expected = {
            item: { handle: '0/0:a/0:ac', label: { label: 'ac' }, collapsibleState: TreeItemCollapsibleState.None, parentHandle: '0/0:a' },
            parentChain: [{ handle: '0/0:a', label: { label: 'a' }, collapsibleState: TreeItemCollapsibleState.Collapsed }]
        };
        return loadCompleteTree('treeDataProvider')
            .then(() => {
            tree = {
                'a': {
                    'aa': {},
                    'ac': {}
                },
                'b': {
                    'ba': {},
                    'bb': {}
                }
            };
            onDidChangeTreeNode.fire(getNode('a'));
            return treeView.reveal({ key: 'ac' })
                .then(() => {
                assert.ok(revealTarget.calledOnce);
                assert.deepStrictEqual('treeDataProvider', revealTarget.args[0][0]);
                assert.deepStrictEqual(expected.item, removeUnsetKeys(revealTarget.args[0][1].item));
                assert.deepStrictEqual(expected.parentChain, (revealTarget.args[0][1].parentChain).map(arg => removeUnsetKeys(arg)));
                assert.deepStrictEqual({ select: true, focus: false, expand: false }, revealTarget.args[0][2]);
            });
        });
    });
    test('reveal after second udpate', () => {
        const revealTarget = sinon.spy(target, '$reveal');
        const treeView = testObject.createTreeView('treeDataProvider', { treeDataProvider: aCompleteNodeTreeDataProvider() }, extensionsDescription);
        return loadCompleteTree('treeDataProvider')
            .then(() => {
            return runWithEventMerging((resolve) => {
                tree = {
                    'a': {
                        'aa': {},
                        'ac': {}
                    },
                    'b': {
                        'ba': {},
                        'bb': {}
                    }
                };
                onDidChangeTreeNode.fire(getNode('a'));
                tree = {
                    'a': {
                        'aa': {},
                        'ac': {}
                    },
                    'b': {
                        'ba': {},
                        'bc': {}
                    }
                };
                onDidChangeTreeNode.fire(getNode('b'));
                resolve();
            }).then(() => {
                return treeView.reveal({ key: 'bc' })
                    .then(() => {
                    assert.ok(revealTarget.calledOnce);
                    assert.deepStrictEqual('treeDataProvider', revealTarget.args[0][0]);
                    assert.deepStrictEqual({ handle: '0/0:b/0:bc', label: { label: 'bc' }, collapsibleState: TreeItemCollapsibleState.None, parentHandle: '0/0:b' }, removeUnsetKeys(revealTarget.args[0][1].item));
                    assert.deepStrictEqual([{ handle: '0/0:b', label: { label: 'b' }, collapsibleState: TreeItemCollapsibleState.Collapsed }], revealTarget.args[0][1].parentChain.map(arg => removeUnsetKeys(arg)));
                    assert.deepStrictEqual({ select: true, focus: false, expand: false }, revealTarget.args[0][2]);
                });
            });
        });
    });
    function loadCompleteTree(treeId, element) {
        return testObject.$getChildren(treeId, element ? [element] : undefined)
            .then(elements => {
            if (!elements || elements?.length === 0) {
                return null;
            }
            return elements[0].slice(1).map(e => loadCompleteTree(treeId, e.handle));
        })
            .then(() => null);
    }
    function removeUnsetKeys(obj) {
        if (Array.isArray(obj)) {
            return obj.map(o => removeUnsetKeys(o));
        }
        if (typeof obj === 'object') {
            const result = {};
            for (const key of Object.keys(obj)) {
                if (obj[key] !== undefined) {
                    result[key] = removeUnsetKeys(obj[key]);
                }
            }
            return result;
        }
        return obj;
    }
    function aNodeTreeDataProvider() {
        return {
            getChildren: (element) => {
                return getChildren(element ? element.key : undefined).map(key => getNode(key));
            },
            getTreeItem: (element) => {
                return getTreeItem(element.key);
            },
            onDidChangeTreeData: onDidChangeTreeNode.event
        };
    }
    function aCompleteNodeTreeDataProvider() {
        return {
            getChildren: (element) => {
                return getChildren(element ? element.key : undefined).map(key => getNode(key));
            },
            getTreeItem: (element) => {
                return getTreeItem(element.key);
            },
            getParent: ({ key }) => {
                const parentKey = key.substring(0, key.length - 1);
                return parentKey ? new Key(parentKey) : undefined;
            },
            onDidChangeTreeData: onDidChangeTreeNode.event
        };
    }
    function aNodeWithIdTreeDataProvider() {
        return {
            getChildren: (element) => {
                return getChildren(element ? element.key : undefined).map(key => getNode(key));
            },
            getTreeItem: (element) => {
                const treeItem = getTreeItem(element.key);
                treeItem.id = element.key;
                return treeItem;
            },
            onDidChangeTreeData: onDidChangeTreeNodeWithId.event
        };
    }
    function aNodeWithHighlightedLabelTreeDataProvider() {
        return {
            getChildren: (element) => {
                return getChildren(element ? element.key : undefined).map(key => getNode(key));
            },
            getTreeItem: (element) => {
                const treeItem = getTreeItem(element.key, [[0, 2], [3, 5]]);
                treeItem.id = element.key;
                return treeItem;
            },
            onDidChangeTreeData: onDidChangeTreeNodeWithId.event
        };
    }
    function getTreeElement(element) {
        let parent = tree;
        for (let i = 0; i < element.length; i++) {
            parent = parent[element.substring(0, i + 1)];
            if (!parent) {
                return null;
            }
        }
        return parent;
    }
    function getChildren(key) {
        if (!key) {
            return Object.keys(tree);
        }
        const treeElement = getTreeElement(key);
        if (treeElement) {
            return Object.keys(treeElement);
        }
        return [];
    }
    function getTreeItem(key, highlights) {
        const treeElement = getTreeElement(key);
        return {
            label: { label: labels[key] || key, highlights },
            collapsibleState: treeElement && Object.keys(treeElement).length ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None
        };
    }
    function getNode(key) {
        if (!nodes[key]) {
            nodes[key] = new Key(key);
        }
        return nodes[key];
    }
    class Key {
        constructor(key) {
            this.key = key;
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFRyZWVWaWV3cy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS90ZXN0L2Jyb3dzZXIvZXh0SG9zdFRyZWVWaWV3cy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEtBQUssS0FBSyxNQUFNLE9BQU8sQ0FBQztBQUMvQixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDcEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2xFLE9BQU8sRUFBNEIsV0FBVyxFQUEyQixNQUFNLGtDQUFrQyxDQUFDO0FBRWxILE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUMvRCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDNUQsT0FBTyxFQUFFLHdCQUF3QixFQUE2QixNQUFNLDBCQUEwQixDQUFDO0FBQy9GLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUV4RSxPQUFPLEVBQUUsd0JBQXdCLElBQUkscUJBQXFCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN0SCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUV6RixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVoRyxTQUFTLGVBQWUsQ0FBQyxNQUE0QztJQUNwRSxJQUFJLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDcEMsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUNELElB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