/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as sinon from 'sinon';
import { timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { URI } from '../../../../base/common/uri.js';
import { mock, mockObject } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import * as editorRange from '../../../../editor/common/core/range.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { ExtHostCommands } from '../../common/extHostCommands.js';
import { ExtHostDocumentsAndEditors } from '../../common/extHostDocumentsAndEditors.js';
import { ExtHostTesting, TestRunCoordinator, TestRunDto, TestRunProfileImpl } from '../../common/extHostTesting.js';
import { ExtHostTestItemCollection, TestItemImpl } from '../../common/extHostTestItem.js';
import * as convert from '../../common/extHostTypeConverters.js';
import { Location, Position, Range, TestMessage, TestRunProfileKind, TestRunRequest as TestRunRequestImpl, TestTag } from '../../common/extHostTypes.js';
import { AnyCallRPCProtocol } from '../common/testRPCProtocol.js';
import { TestId } from '../../../contrib/testing/common/testId.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
const simplify = (item) => ({
    id: item.id,
    label: item.label,
    uri: item.uri,
    range: item.range,
});
const assertTreesEqual = (a, b) => {
    if (!a) {
        throw new assert.AssertionError({ message: 'Expected a to be defined', actual: a });
    }
    if (!b) {
        throw new assert.AssertionError({ message: 'Expected b to be defined', actual: b });
    }
    assert.deepStrictEqual(simplify(a), simplify(b));
    const aChildren = [...a.children].map(([_, c]) => c.id).sort();
    const bChildren = [...b.children].map(([_, c]) => c.id).sort();
    assert.strictEqual(aChildren.length, bChildren.length, `expected ${a.label}.children.length == ${b.label}.children.length`);
    aChildren.forEach(key => assertTreesEqual(a.children.get(key), b.children.get(key)));
};
// const assertTreeListEqual = (a: ReadonlyArray<TestItem>, b: ReadonlyArray<TestItem>) => {
// 	assert.strictEqual(a.length, b.length, `expected a.length == n.length`);
// 	a.forEach((_, i) => assertTreesEqual(a[i], b[i]));
// };
// class TestMirroredCollection extends MirroredTestCollection {
// 	public changeEvent!: TestChangeEvent;
// 	constructor() {
// 		super();
// 		this.onDidChangeTests(evt => this.changeEvent = evt);
// 	}
// 	public get length() {
// 		return this.items.size;
// 	}
// }
suite('ExtHost Testing', () => {
    class TestExtHostTestItemCollection extends ExtHostTestItemCollection {
        setDiff(diff) {
            this.diff = diff;
        }
    }
    teardown(() => {
        sinon.restore();
    });
    const ds = ensureNoDisposablesAreLeakedInTestSuite();
    let single;
    let resolveCalls = [];
    setup(() => {
        resolveCalls = [];
        single = ds.add(new TestExtHostTestItemCollection('ctrlId', 'root', {
            getDocument: () => undefined,
        }));
        single.resolveHandler = item => {
            resolveCalls.push(item?.id);
            if (item === undefined) {
                const a = new TestItemImpl('ctrlId', 'id-a', 'a', URI.file('/'));
                a.canResolveChildren = true;
                const b = new TestItemImpl('ctrlId', 'id-b', 'b', URI.file('/'));
                single.root.children.add(a);
                single.root.children.add(b);
            }
            else if (item.id === 'id-a') {
                item.children.add(new TestItemImpl('ctrlId', 'id-aa', 'aa', URI.file('/')));
                item.children.add(new TestItemImpl('ctrlId', 'id-ab', 'ab', URI.file('/')));
            }
        };
        ds.add(single.onDidGenerateDiff(d => single.setDiff(d /* don't clear during testing */)));
    });
    suite('OwnedTestCollection', () => {
        test('adds a root recursively', async () => {
            await single.expand(single.root.id, Infinity);
            const a = single.root.children.get('id-a');
            const b = single.root.children.get('id-b');
            assert.deepStrictEqual(single.collectDiff(), [
                {
                    op: 0 /* TestDiffOpType.Add */,
                    item: { controllerId: 'ctrlId', expand: 2 /* TestItemExpandState.BusyExpanding */, item: { ...convert.TestItem.from(single.root) } }
                },
                {
                    op: 0 /* TestDiffOpType.Add */,
                    item: { controllerId: 'ctrlId', expand: 2 /* TestItemExpandState.BusyExpanding */, item: { ...convert.TestItem.from(a) } }
                },
                {
                    op: 0 /* TestDiffOpType.Add */,
                    item: { controllerId: 'ctrlId', expand: 0 /* TestItemExpandState.NotExpandable */, item: convert.TestItem.from(a.children.get('id-aa')) }
                },
                {
                    op: 0 /* TestDiffOpType.Add */,
                    item: { controllerId: 'ctrlId', expand: 0 /* TestItemExpandState.NotExpandable */, item: convert.TestItem.from(a.children.get('id-ab')) }
                },
                {
                    op: 1 /* TestDiffOpType.Update */,
                    item: { extId: new TestId(['ctrlId', 'id-a']).toString(), expand: 3 /* TestItemExpandState.Expanded */ }
                },
                {
                    op: 0 /* TestDiffOpType.Add */,
                    item: { controllerId: 'ctrlId', expand: 0 /* TestItemExpandState.NotExpandable */, item: convert.TestItem.from(b) }
                },
                {
                    op: 1 /* TestDiffOpType.Update */,
                    item: { extId: single.root.id, expand: 3 /* TestItemExpandState.Expanded */ }
                },
            ]);
        });
        test('parents are set correctly', () => {
            single.expand(single.root.id, Infinity);
            single.collectDiff();
            const a = single.root.children.get('id-a');
            const ab = a.children.get('id-ab');
            assert.strictEqual(a.parent, undefined);
            assert.strictEqual(ab.parent, a);
        });
        test('can add an item with same ID as root', () => {
            single.collectDiff();
            const child = new TestItemImpl('ctrlId', 'ctrlId', 'c', undefined);
            single.root.children.add(child);
            assert.deepStrictEqual(single.collectDiff(), [
                {
                    op: 0 /* TestDiffOpType.Add */,
                    item: { controllerId: 'ctrlId', expand: 0 /* TestItemExpandState.NotExpandable */, item: convert.TestItem.from(child) },
                }
            ]);
        });
        test('no-ops if items not changed', () => {
            single.collectDiff();
            assert.deepStrictEqual(single.collectDiff(), []);
        });
        test('watches property mutations', () => {
            single.expand(single.root.id, Infinity);
            single.collectDiff();
            single.root.children.get('id-a').description = 'Hello world'; /* item a */
            assert.deepStrictEqual(single.collectDiff(), [
                {
                    op: 1 /* TestDiffOpType.Update */,
                    item: { extId: new TestId(['ctrlId', 'id-a']).toString(), item: { description: 'Hello world' } },
                }
            ]);
        });
        test('removes children', () => {
            single.expand(single.root.id, Infinity);
            single.collectDiff();
            single.root.children.delete('id-a');
            assert.deepStrictEqual(single.collectDiff(), [
                { op: 3 /* TestDiffOpType.Remove */, itemId: new TestId(['ctrlId', 'id-a']).toString() },
            ]);
            assert.deepStrictEqual([...single.tree.keys()].sort(), [single.root.id, new TestId(['ctrlId', 'id-b']).toString()]);
            assert.strictEqual(single.tree.size, 2);
        });
        test('adds new children', () => {
            single.expand(single.root.id, Infinity);
            single.collectDiff();
            const child = new TestItemImpl('ctrlId', 'id-ac', 'c', undefined);
            single.root.children.get('id-a').children.add(child);
            assert.deepStrictEqual(single.collectDiff(), [
                {
                    op: 0 /* TestDiffOpType.Add */, item: {
                        controllerId: 'ctrlId',
                        expand: 0 /* TestItemExpandState.NotExpandable */,
                        item: convert.TestItem.from(child),
                    }
                },
            ]);
            assert.deepStrictEqual([...single.tree.values()].map(n => n.actual.id).sort(), [single.root.id, 'id-a', 'id-aa', 'id-ab', 'id-ac', 'id-b']);
            assert.strictEqual(single.tree.size, 6);
        });
        test('manages tags correctly', () => {
            single.expand(single.root.id, Infinity);
            single.collectDiff();
            const tag1 = new TestTag('tag1');
            const tag2 = new TestTag('tag2');
            const tag3 = new TestTag('tag3');
            const child = new TestItemImpl('ctrlId', 'id-ac', 'c', undefined);
            child.tags = [tag1, tag2];
            single.root.children.get('id-a').children.add(child);
            assert.deepStrictEqual(single.collectDiff(), [
                { op: 6 /* TestDiffOpType.AddTag */, tag: { id: 'ctrlId\0tag1' } },
                { op: 6 /* TestDiffOpType.AddTag */, tag: { id: 'ctrlId\0tag2' } },
                {
                    op: 0 /* TestDiffOpType.Add */, item: {
                        controllerId: 'ctrlId',
                        expand: 0 /* TestItemExpandState.NotExpandable */,
                        item: convert.TestItem.from(child),
                    }
                },
            ]);
            child.tags = [tag2, tag3];
            assert.deepStrictEqual(single.collectDiff(), [
                { op: 6 /* TestDiffOpType.AddTag */, tag: { id: 'ctrlId\0tag3' } },
                {
                    op: 1 /* TestDiffOpType.Update */, item: {
                        extId: new TestId(['ctrlId', 'id-a', 'id-ac']).toString(),
                        item: { tags: ['ctrlId\0tag2', 'ctrlId\0tag3'] }
                    }
                },
                { op: 7 /* TestDiffOpType.RemoveTag */, id: 'ctrlId\0tag1' },
            ]);
            const a = single.root.children.get('id-a');
            a.tags = [tag2];
            a.children.replace([]);
            assert.deepStrictEqual(single.collectDiff().filter(t => t.op === 7 /* TestDiffOpType.RemoveTag */), [
                { op: 7 /* TestDiffOpType.RemoveTag */, id: 'ctrlId\0tag3' },
            ]);
        });
        test('replaces on uri change', () => {
            single.expand(single.root.id, Infinity);
            single.collectDiff();
            const oldA = single.root.children.get('id-a');
            const uri = single.root.children.get('id-a').uri?.with({ path: '/different' });
            const newA = new TestItemImpl('ctrlId', 'id-a', 'Hello world', uri);
            newA.children.replace([...oldA.children].map(([_, item]) => item));
            single.root.children.replace([...single.root.children].map(([id, i]) => id === 'id-a' ? newA : i));
            assert.deepStrictEqual(single.collectDiff(), [
                { op: 3 /* TestDiffOpType.Remove */, itemId: new TestId(['ctrlId', 'id-a']).toString() },
                {
                    op: 0 /* TestDiffOpType.Add */,
                    item: { controllerId: 'ctrlId', expand: 0 /* TestItemExpandState.NotExpandable */, item: { ...convert.TestItem.from(newA) } }
                },
                {
                    op: 0 /* TestDiffOpType.Add */,
                    item: { controllerId: 'ctrlId', expand: 0 /* TestItemExpandState.NotExpandable */, item: convert.TestItem.from(newA.children.get('id-aa')) }
                },
                {
                    op: 0 /* TestDiffOpType.Add */,
                    item: { controllerId: 'ctrlId', expand: 0 /* TestItemExpandState.NotExpandable */, item: convert.TestItem.from(newA.children.get('id-ab')) }
                },
            ]);
        });
        test('treats in-place replacement as mutation', () => {
            single.expand(single.root.id, Infinity);
            single.collectDiff();
            const oldA = single.root.children.get('id-a');
            const uri = single.root.children.get('id-a').uri;
            const newA = new TestItemImpl('ctrlId', 'id-a', 'Hello world', uri);
            newA.children.replace([...oldA.children].map(([_, item]) => item));
            single.root.children.replace([
                newA,
                new TestItemImpl('ctrlId', 'id-b', single.root.children.get('id-b').label, uri),
            ]);
            assert.deepStrictEqual(single.collectDiff(), [
                {
                    op: 1 /* TestDiffOpType.Update */,
                    item: { extId: new TestId(['ctrlId', 'id-a']).toString(), item: { label: 'Hello world' } },
                },
                {
                    op: 2 /* TestDiffOpType.DocumentSynced */,
                    docv: undefined,
                    uri: uri
                }
            ]);
            newA.label = 'still connected';
            assert.deepStrictEqual(single.collectDiff(), [
                {
                    op: 1 /* TestDiffOpType.Update */,
                    item: { extId: new TestId(['ctrlId', 'id-a']).toString(), item: { label: 'still connected' } }
                },
            ]);
            oldA.label = 'no longer connected';
            assert.deepStrictEqual(single.collectDiff(), []);
        });
        suite('expandibility restoration', () => {
            const doReplace = async (canResolveChildren = true) => {
                const uri = single.root.children.get('id-a').uri;
                const newA = new TestItemImpl('ctrlId', 'id-a', 'Hello world', uri);
                newA.canResolveChildren = canResolveChildren;
                single.root.children.replace([
                    newA,
                    new TestItemImpl('ctrlId', 'id-b', single.root.children.get('id-b').label, uri),
                ]);
                await timeout(0); // drain microtasks
            };
            test('does not restore an unexpanded state', async () => {
                await single.expand(single.root.id, 0);
                assert.deepStrictEqual(resolveCalls, [undefined]);
                await doReplace();
                assert.deepStrictEqual(resolveCalls, [undefined]);
            });
            test('restores resolve state on replacement', async () => {
                await single.expand(single.root.id, Infinity);
                assert.deepStrictEqual(resolveCalls, [undefined, 'id-a']);
                await doReplace();
                assert.deepStrictEqual(resolveCalls, [undefined, 'id-a', 'id-a']);
            });
            test('does not expand if new child is not expandable', async () => {
                await single.expand(single.root.id, Infinity);
                assert.deepStrictEqual(resolveCalls, [undefined, 'id-a']);
                await doReplace(false);
                assert.deepStrictEqual(resolveCalls, [undefined, 'id-a']);
            });
        });
        test('treats in-place replacement as mutation deeply', () => {
            single.expand(single.root.id, Infinity);
            single.collectDiff();
            const oldA = single.root.children.get('id-a');
            const uri = oldA.uri;
            const newA = new TestItemImpl('ctrlId', 'id-a', single.root.children.get('id-a').label, uri);
            const oldAA = oldA.children.get('id-aa');
            const oldAB = oldA.children.get('id-ab');
            const newAB = new TestItemImpl('ctrlId', 'id-ab', 'Hello world', uri);
            newA.children.replace([oldAA, newAB]);
            single.root.children.replace([newA, single.root.children.get('id-b')]);
            assert.deepStrictEqual(single.collectDiff(), [
                {
                    op: 1 /* TestDiffOpType.Update */,
                    item: { extId: TestId.fromExtHostTestItem(oldAB, 'ctrlId').toString(), item: { label: 'Hello world' } },
                },
                {
                    op: 2 /* TestDiffOpType.DocumentSynced */,
                    docv: undefined,
                    uri: uri
                }
            ]);
            oldAA.label = 'still connected1';
            newAB.label = 'still connected2';
            oldAB.label = 'not connected3';
            assert.deepStrictEqual(single.collectDiff(), [
                {
                    op: 1 /* TestDiffOpType.Update */,
                    item: { extId: new TestId(['ctrlId', 'id-a', 'id-aa']).toString(), item: { label: 'still connected1' } }
                },
                {
                    op: 1 /* TestDiffOpType.Update */,
                    item: { extId: new TestId(['ctrlId', 'id-a', 'id-ab']).toString(), item: { label: 'still connected2' } }
                },
            ]);
            assert.strictEqual(newAB.parent, newA);
            assert.strictEqual(oldAA.parent, newA);
            assert.deepStrictEqual(newA.parent, undefined);
        });
        test('moves an item to be a new child', async () => {
            await single.expand(single.root.id, 0);
            single.collectDiff();
            const b = single.root.children.get('id-b');
            const a = single.root.children.get('id-a');
            a.children.add(b);
            assert.deepStrictEqual(single.collectDiff(), [
                {
                    op: 3 /* TestDiffOpType.Remove */,
                    itemId: new TestId(['ctrlId', 'id-b']).toString(),
                },
                {
                    op: 0 /* TestDiffOpType.Add */,
                    item: { controllerId: 'ctrlId', expand: 0 /* TestItemExpandState.NotExpandable */, item: convert.TestItem.from(b) }
                },
            ]);
            b.label = 'still connected';
            assert.deepStrictEqual(single.collectDiff(), [
                {
                    op: 1 /* TestDiffOpType.Update */,
                    item: { extId: new TestId(['ctrlId', 'id-a', 'id-b']).toString(), item: { label: 'still connected' } }
                },
            ]);
            assert.deepStrictEqual([...single.root.children].map(([_, item]) => item), [single.root.children.get('id-a')]);
            assert.deepStrictEqual(b.parent, a);
        });
        test('sends document sync events', async () => {
            await single.expand(single.root.id, 0);
            single.collectDiff();
            const a = single.root.children.get('id-a');
            a.range = new Range(new Position(0, 0), new Position(1, 0));
            assert.deepStrictEqual(single.collectDiff(), [
                {
                    op: 2 /* TestDiffOpType.DocumentSynced */,
                    docv: undefined,
                    uri: URI.file('/')
                },
                {
                    op: 1 /* TestDiffOpType.Update */,
                    item: {
                        extId: new TestId(['ctrlId', 'id-a']).toString(),
                        item: {
                            range: editorRange.Range.lift({
                                endColumn: 1,
                                endLineNumber: 2,
                                startColumn: 1,
                                startLineNumber: 1
                            })
                        }
                    },
                },
            ]);
            // sends on replace even if it's a no-op
            a.range = a.range;
            assert.deepStrictEqual(single.collectDiff(), [
                {
                    op: 2 /* TestDiffOpType.DocumentSynced */,
                    docv: undefined,
                    uri: URI.file('/')
                },
            ]);
            // sends on a child replacement
            const uri = URI.file('/');
            const a2 = new TestItemImpl('ctrlId', 'id-a', 'a', uri);
            a2.range = a.range;
            single.root.children.replace([a2, single.root.children.get('id-b')]);
            assert.deepStrictEqual(single.collectDiff(), [
                {
                    op: 2 /* TestDiffOpType.DocumentSynced */,
                    docv: undefined,
                    uri
                },
            ]);
        });
    });
    suite('MirroredTestCollection', () => {
        // todo@connor4312: re-renable when we figure out what observing looks like we async children
        // 	let m: TestMirroredCollection;
        // 	setup(() => m = new TestMirroredCollection());
        // 	test('mirrors creation of the root', () => {
        // 		const tests = testStubs.nested();
        // 		single.addRoot(tests, 'pid');
        // 		single.expand(single.root.id, Infinity);
        // 		m.apply(single.collectDiff());
        // 		assertTreesEqual(m.rootTestItems[0], owned.getTestById(single.root.id)![1].actual);
        // 		assert.strictEqual(m.length, single.itemToInternal.size);
        // 	});
        // 	test('mirrors node deletion', () => {
        // 		const tests = testStubs.nested();
        // 		single.addRoot(tests, 'pid');
        // 		m.apply(single.collectDiff());
        // 		single.expand(single.root.id, Infinity);
        // 		tests.children!.splice(0, 1);
        // 		single.onItemChange(tests, 'pid');
        // 		single.expand(single.root.id, Infinity);
        // 		m.apply(single.collectDiff());
        // 		assertTreesEqual(m.rootTestItems[0], owned.getTestById(single.root.id)![1].actual);
        // 		assert.strictEqual(m.length, single.itemToInternal.size);
        // 	});
        // 	test('mirrors node addition', () => {
        // 		const tests = testStubs.nested();
        // 		single.addRoot(tests, 'pid');
        // 		m.apply(single.collectDiff());
        // 		tests.children![0].children!.push(stubTest('ac'));
        // 		single.onItemChange(tests, 'pid');
        // 		m.apply(single.collectDiff());
        // 		assertTreesEqual(m.rootTestItems[0], owned.getTestById(single.root.id)![1].actual);
        // 		assert.strictEqual(m.length, single.itemToInternal.size);
        // 	});
        // 	test('mirrors node update', () => {
        // 		const tests = testStubs.nested();
        // 		single.addRoot(tests, 'pid');
        // 		m.apply(single.collectDiff());
        // 		tests.children![0].description = 'Hello world'; /* item a */
        // 		single.onItemChange(tests, 'pid');
        // 		m.apply(single.collectDiff());
        // 		assertTreesEqual(m.rootTestItems[0], owned.getTestById(single.root.id)![1].actual);
        // 	});
        // 	suite('MirroredChangeCollector', () => {
        // 		let tests = testStubs.nested();
        // 		setup(() => {
        // 			tests = testStubs.nested();
        // 			single.addRoot(tests, 'pid');
        // 			m.apply(single.collectDiff());
        // 		});
        // 		test('creates change for root', () => {
        // 			assertTreeListEqual(m.changeEvent.added, [
        // 				tests,
        // 				tests.children[0],
        // 				tests.children![0].children![0],
        // 				tests.children![0].children![1],
        // 				tests.children[1],
        // 			]);
        // 			assertTreeListEqual(m.changeEvent.removed, []);
        // 			assertTreeListEqual(m.changeEvent.updated, []);
        // 		});
        // 		test('creates change for delete', () => {
        // 			const rm = tests.children.shift()!;
        // 			single.onItemChange(tests, 'pid');
        // 			m.apply(single.collectDiff());
        // 			assertTreeListEqual(m.changeEvent.added, []);
        // 			assertTreeListEqual(m.changeEvent.removed, [
        // 				{ ...rm },
        // 				{ ...rm.children![0] },
        // 				{ ...rm.children![1] },
        // 			]);
        // 			assertTreeListEqual(m.changeEvent.updated, []);
        // 		});
        // 		test('creates change for update', () => {
        // 			tests.children[0].label = 'updated!';
        // 			single.onItemChange(tests, 'pid');
        // 			m.apply(single.collectDiff());
        // 			assertTreeListEqual(m.changeEvent.added, []);
        // 			assertTreeListEqual(m.changeEvent.removed, []);
        // 			assertTreeListEqual(m.changeEvent.updated, [tests.children[0]]);
        // 		});
        // 		test('is a no-op if a node is added and removed', () => {
        // 			const nested = testStubs.nested('id2-');
        // 			tests.children.push(nested);
        // 			single.onItemChange(tests, 'pid');
        // 			tests.children.pop();
        // 			single.onItemChange(tests, 'pid');
        // 			const previousEvent = m.changeEvent;
        // 			m.apply(single.collectDiff());
        // 			assert.strictEqual(m.changeEvent, previousEvent);
        // 		});
        // 		test('is a single-op if a node is added and changed', () => {
        // 			const child = stubTest('c');
        // 			tests.children.push(child);
        // 			single.onItemChange(tests, 'pid');
        // 			child.label = 'd';
        // 			single.onItemChange(tests, 'pid');
        // 			m.apply(single.collectDiff());
        // 			assertTreeListEqual(m.changeEvent.added, [child]);
        // 			assertTreeListEqual(m.changeEvent.removed, []);
        // 			assertTreeListEqual(m.changeEvent.updated, []);
        // 		});
        // 		test('gets the common ancestor (1)', () => {
        // 			tests.children![0].children![0].label = 'za';
        // 			tests.children![0].children![1].label = 'zb';
        // 			single.onItemChange(tests, 'pid');
        // 			m.apply(single.collectDiff());
        // 		});
        // 		test('gets the common ancestor (2)', () => {
        // 			tests.children![0].children![0].label = 'za';
        // 			tests.children![1].label = 'ab';
        // 			single.onItemChange(tests, 'pid');
        // 			m.apply(single.collectDiff());
        // 		});
        // 	});
    });
    suite('TestRunTracker', () => {
        let proxy;
        let c;
        let cts;
        let configuration;
        let req;
        let dto;
        // eslint-disable-next-line local/code-no-any-casts
        const ext = {};
        teardown(() => {
            for (const { id } of c.trackers) {
                c.disposeTestRun(id);
            }
        });
        setup(async () => {
            proxy = mockObject()();
            cts = new CancellationTokenSource();
            c = new TestRunCoordinator(proxy, new NullLogService());
            configuration = new TestRunProfileImpl(mockObject()(), new Map(), new Set(), Event.None, 'ctrlId', 42, 'Do Run', TestRunProfileKind.Run, () => { }, false);
            await single.expand(single.root.id, Infinity);
            single.collectDiff();
            req = {
                include: undefined,
                exclude: [single.root.children.get('id-b')],
                profile: configuration,
                preserveFocus: false,
            };
            dto = TestRunDto.fromInternal({
                controllerId: 'ctrl',
                profileId: configuration.profileId,
                excludeExtIds: ['id-b'],
                runId: 'run-id',
                testIds: [single.root.id],
            }, single);
        });
        test('tracks a run started from a main thread request', () => {
            const tracker = ds.add(c.prepareForMainThreadTestRun(ext, req, dto, configuration, cts.token));
            assert.strictEqual(tracker.hasRunningTasks, false);
            const task1 = c.createTestRun(ext, 'ctrl', single, req, 'run1', true);
            const task2 = c.createTestRun(ext, 'ctrl', single, req, 'run2', true);
            assert.strictEqual(proxy.$startedExtensionTestRun.called, false);
            assert.strictEqual(tracker.hasRunningTasks, true);
            task1.appendOutput('hello');
            const taskId = proxy.$appendOutputToRun.args[0]?.[1];
            assert.deepStrictEqual([['run-id', taskId, VSBuffer.fromString('hello'), undefined, undefined]], proxy.$appendOutputToRun.args);
            task1.end();
            assert.strictEqual(proxy.$finishedExtensionTestRun.called, false);
            assert.strictEqual(tracker.hasRunningTasks, true);
            task2.end();
            assert.strictEqual(proxy.$finishedExtensionTestRun.called, false);
            assert.strictEqual(tracker.hasRunningTasks, false);
        });
        test('run cancel force ends after a timeout', () => {
            const clock = sinon.useFakeTimers();
            try {
                const tracker = ds.add(c.prepareForMainThreadTestRun(ext, req, dto, configuration, cts.token));
                const task = c.createTestRun(ext, 'ctrl', single, req, 'run1', true);
                const onEnded = sinon.stub();
                ds.add(tracker.onEnd(onEnded));
                assert.strictEqual(task.token.isCancellationRequested, false);
                assert.strictEqual(tracker.hasRunningTasks, true);
                tracker.cancel();
                assert.strictEqual(task.token.isCancellationRequested, true);
                assert.strictEqual(tracker.hasRunningTasks, true);
                clock.tick(9999);
                assert.strictEqual(tracker.hasRunningTasks, true);
                assert.strictEqual(onEnded.called, false);
                clock.tick(1);
                assert.strictEqual(onEnded.called, true);
                assert.strictEqual(tracker.hasRunningTasks, false);
            }
            finally {
                clock.restore();
            }
        });
        test('run cancel force ends on second cancellation request', () => {
            const tracker = ds.add(c.prepareForMainThreadTestRun(ext, req, dto, configuration, cts.token));
            const task = c.createTestRun(ext, 'ctrl', single, req, 'run1', true);
            const onEnded = sinon.stub();
            ds.add(tracker.onEnd(onEnded));
            assert.strictEqual(task.token.isCancellationRequested, false);
            assert.strictEqual(tracker.hasRunningTasks, true);
            tracker.cancel();
            assert.strictEqual(task.token.isCancellationRequested, true);
            assert.strictEqual(tracker.hasRunningTasks, true);
            assert.strictEqual(onEnded.called, false);
            tracker.cancel();
            assert.strictEqual(tracker.hasRunningTasks, false);
            assert.strictEqual(onEnded.called, true);
        });
        test('tracks a run started from an extension request', () => {
            const task1 = c.createTestRun(ext, 'ctrl', single, req, 'hello world', false);
            const tracker = Iterable.first(c.trackers);
            assert.strictEqual(tracker.hasRunningTasks, true);
            assert.deepStrictEqual(proxy.$startedExtensionTestRun.args, [
                [{
                        profile: { group: 2, id: 42 },
                        controllerId: 'ctrl',
                        id: tracker.id,
                        include: [single.root.id],
                        exclude: [new TestId(['ctrlId', 'id-b']).toString()],
                        persist: false,
                        continuous: false,
                        preserveFocus: false,
                    }]
            ]);
            const task2 = c.createTestRun(ext, 'ctrl', single, req, 'run2', true);
            const task3Detached = c.createTestRun(ext, 'ctrl', single, { ...req }, 'task3Detached', true);
            task1.end();
            assert.strictEqual(proxy.$finishedExtensionTestRun.called, false);
            assert.strictEqual(tracker.hasRunningTasks, true);
            task2.end();
            assert.deepStrictEqual(proxy.$finishedExtensionTestRun.args, [[tracker.id]]);
            assert.strictEqual(tracker.hasRunningTasks, false);
            task3Detached.end();
        });
        test('adds tests to run smartly', () => {
            const task1 = c.createTestRun(ext, 'ctrlId', single, req, 'hello world', false);
            const tracker = Iterable.first(c.trackers);
            const expectedArgs = [];
            assert.deepStrictEqual(proxy.$addTestsToRun.args, expectedArgs);
            task1.passed(single.root.children.get('id-a').children.get('id-aa'));
            expectedArgs.push([
                'ctrlId',
                tracker.id,
                [
                    convert.TestItem.from(single.root),
                    convert.TestItem.from(single.root.children.get('id-a')),
                    convert.TestItem.from(single.root.children.get('id-a').children.get('id-aa')),
                ]
            ]);
            assert.deepStrictEqual(proxy.$addTestsToRun.args, expectedArgs);
            task1.enqueued(single.root.children.get('id-a').children.get('id-ab'));
            expectedArgs.push([
                'ctrlId',
                tracker.id,
                [
                    convert.TestItem.from(single.root.children.get('id-a')),
                    convert.TestItem.from(single.root.children.get('id-a').children.get('id-ab')),
                ],
            ]);
            assert.deepStrictEqual(proxy.$addTestsToRun.args, expectedArgs);
            task1.passed(single.root.children.get('id-a').children.get('id-ab'));
            assert.deepStrictEqual(proxy.$addTestsToRun.args, expectedArgs);
            task1.end();
        });
        test('adds test messages to run', () => {
            const test1 = new TestItemImpl('ctrlId', 'id-c', 'test c', URI.file('/testc.txt'));
            const test2 = new TestItemImpl('ctrlId', 'id-d', 'test d', URI.file('/testd.txt'));
            test1.range = test2.range = new Range(new Position(0, 0), new Position(1, 0));
            single.root.children.replace([test1, test2]);
            const task = c.createTestRun(ext, 'ctrlId', single, req, 'hello world', false);
            const message1 = new TestMessage('some message');
            message1.location = new Location(URI.file('/a.txt'), new Position(0, 0));
            task.failed(test1, message1);
            const args = proxy.$appendTestMessagesInRun.args[0];
            assert.deepStrictEqual(proxy.$appendTestMessagesInRun.args[0], [
                args[0],
                args[1],
                new TestId(['ctrlId', 'id-c']).toString(),
                [{
                        message: 'some message',
                        type: 0 /* TestMessageType.Error */,
                        expected: undefined,
                        contextValue: undefined,
                        actual: undefined,
                        location: convert.location.from(message1.location),
                        stackTrace: undefined,
                    }]
            ]);
            // should use test location as default
            task.failed(test2, new TestMessage('some message'));
            assert.deepStrictEqual(proxy.$appendTestMessagesInRun.args[1], [
                args[0],
                args[1],
                new TestId(['ctrlId', 'id-d']).toString(),
                [{
                        message: 'some message',
                        type: 0 /* TestMessageType.Error */,
                        contextValue: undefined,
                        expected: undefined,
                        actual: undefined,
                        location: convert.location.from({ uri: test2.uri, range: test2.range }),
                        stackTrace: undefined,
                    }]
            ]);
            task.end();
        });
        test('guards calls after runs are ended', () => {
            const task = c.createTestRun(ext, 'ctrl', single, req, 'hello world', false);
            task.end();
            task.failed(single.root, new TestMessage('some message'));
            task.appendOutput('output');
            assert.strictEqual(proxy.$addTestsToRun.called, false);
            assert.strictEqual(proxy.$appendOutputToRun.called, false);
            assert.strictEqual(proxy.$appendTestMessagesInRun.called, false);
        });
        test('sets state of test with identical local IDs (#131827)', () => {
            const testA = single.root.children.get('id-a');
            const testB = single.root.children.get('id-b');
            const childA = new TestItemImpl('ctrlId', 'id-child', 'child', undefined);
            testA.children.replace([childA]);
            const childB = new TestItemImpl('ctrlId', 'id-child', 'child', undefined);
            testB.children.replace([childB]);
            const task1 = c.createTestRun(ext, 'ctrl', single, new TestRunRequestImpl(), 'hello world', false);
            const tracker = Iterable.first(c.trackers);
            task1.passed(childA);
            task1.passed(childB);
            assert.deepStrictEqual(proxy.$addTestsToRun.args, [
                [
                    'ctrl',
                    tracker.id,
                    [single.root, testA, childA].map(t => convert.TestItem.from(t)),
                ],
                [
                    'ctrl',
                    tracker.id,
                    [single.root, testB, childB].map(t => convert.TestItem.from(t)),
                ],
            ]);
            task1.end();
        });
    });
    suite('service', () => {
        let ctrl;
        class TestExtHostTesting extends ExtHostTesting {
            getProfileInternalId(ctrl, profile) {
                for (const [id, p] of this.controllers.get(ctrl.id).profiles) {
                    if (profile === p) {
                        return id;
                    }
                }
                throw new Error('profile not found');
            }
        }
        setup(() => {
            const rpcProtocol = AnyCallRPCProtocol();
            ctrl = ds.add(new TestExtHostTesting(rpcProtocol, new NullLogService(), new ExtHostCommands(rpcProtocol, new NullLogService(), new class extends mock() {
                onExtensionError() {
                    return true;
                }
            }), new ExtHostDocumentsAndEditors(rpcProtocol, new NullLogService())));
        });
        test('exposes active profiles correctly', async () => {
            const extA = { ...nullExtensionDescription, identifier: new ExtensionIdentifier('ext.a'), enabledApiProposals: ['testingActiveProfile'] };
            const extB = { ...nullExtensionDescription, identifier: new ExtensionIdentifier('ext.b'), enabledApiProposals: ['testingActiveProfile'] };
            const ctrlA = ds.add(ctrl.createTestController(extA, 'a', 'ctrla'));
            const profAA = ds.add(ctrlA.createRunProfile('aa', TestRunProfileKind.Run, () => { }));
            const profAB = ds.add(ctrlA.createRunProfile('ab', TestRunProfileKind.Run, () => { }));
            const ctrlB = ds.add(ctrl.createTestController(extB, 'b', 'ctrlb'));
            const profBA = ds.add(ctrlB.createRunProfile('ba', TestRunProfileKind.Run, () => { }));
            const profBB = ds.add(ctrlB.createRunProfile('bb', TestRunProfileKind.Run, () => { }));
            const neverCalled = sinon.stub();
            // empty default state:
            assert.deepStrictEqual(profAA.isDefault, false);
            assert.deepStrictEqual(profBA.isDefault, false);
            assert.deepStrictEqual(profBB.isDefault, false);
            // fires a change event:
            const changeA = Event.toPromise(profAA.onDidChangeDefault);
            const changeBA = Event.toPromise(profBA.onDidChangeDefault);
            const changeBB = Event.toPromise(profBB.onDidChangeDefault);
            ds.add(profAB.onDidChangeDefault(neverCalled));
            assert.strictEqual(neverCalled.called, false);
            ctrl.$setDefaultRunProfiles({
                a: [ctrl.getProfileInternalId(ctrlA, profAA)],
                b: [ctrl.getProfileInternalId(ctrlB, profBA), ctrl.getProfileInternalId(ctrlB, profBB)]
            });
            assert.deepStrictEqual(await changeA, true);
            assert.deepStrictEqual(await changeBA, true);
            assert.deepStrictEqual(await changeBB, true);
            // updates internal state:
            assert.deepStrictEqual(profAA.isDefault, true);
            assert.deepStrictEqual(profBA.isDefault, true);
            assert.deepStrictEqual(profBB.isDefault, true);
            assert.deepStrictEqual(profAB.isDefault, false);
            // no-ops if equal
            ds.add(profAA.onDidChangeDefault(neverCalled));
            ctrl.$setDefaultRunProfiles({
                a: [ctrl.getProfileInternalId(ctrlA, profAA)],
            });
            assert.strictEqual(neverCalled.called, false);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFRlc3RpbmcudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3RUZXN0aW5nLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sS0FBSyxLQUFLLE1BQU0sT0FBTyxDQUFDO0FBQy9CLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDbEYsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLElBQUksRUFBRSxVQUFVLEVBQWMsTUFBTSxzQ0FBc0MsQ0FBQztBQUNwRixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEtBQUssV0FBVyxNQUFNLHlDQUF5QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxtQkFBbUIsRUFBeUIsTUFBTSxzREFBc0QsQ0FBQztBQUNsSCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFeEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRXhGLE9BQU8sRUFBRSxjQUFjLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLGtCQUFrQixF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