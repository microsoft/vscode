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
import { mock, mockObject, MockObject } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import * as editorRange from '../../../../editor/common/core/range.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { MainThreadTestingShape } from '../../common/extHost.protocol.js';
import { ExtHostCommands } from '../../common/extHostCommands.js';
import { ExtHostDocumentsAndEditors } from '../../common/extHostDocumentsAndEditors.js';
import { IExtHostTelemetry } from '../../common/extHostTelemetry.js';
import { ExtHostTesting, TestRunCoordinator, TestRunDto, TestRunProfileImpl } from '../../common/extHostTesting.js';
import { ExtHostTestItemCollection, TestItemImpl } from '../../common/extHostTestItem.js';
import * as convert from '../../common/extHostTypeConverters.js';
import { Location, Position, Range, TestMessage, TestRunProfileKind, TestRunRequest as TestRunRequestImpl, TestTag } from '../../common/extHostTypes.js';
import { AnyCallRPCProtocol } from '../common/testRPCProtocol.js';
import { TestId } from '../../../contrib/testing/common/testId.js';
import { TestDiffOpType, TestItemExpandState, TestMessageType, TestsDiff } from '../../../contrib/testing/common/testTypes.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import type { TestController, TestItem, TestRunProfile, TestRunRequest } from 'vscode';

const simplify = (item: TestItem) => ({
	id: item.id,
	label: item.label,
	uri: item.uri,
	range: item.range,
});

const assertTreesEqual = (a: TestItemImpl | undefined, b: TestItemImpl | undefined) => {
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
	aChildren.forEach(key => assertTreesEqual(a.children.get(key) as TestItemImpl, b.children.get(key) as TestItemImpl));
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
		public setDiff(diff: TestsDiff) {
			this.diff = diff;
		}
	}

	teardown(() => {
		sinon.restore();
	});

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	let single: TestExtHostTestItemCollection;
	let resolveCalls: (string | undefined)[] = [];
	setup(() => {
		resolveCalls = [];
		single = ds.add(new TestExtHostTestItemCollection('ctrlId', 'root', {
			getDocument: () => undefined,
		} as Partial<ExtHostDocumentsAndEditors> as ExtHostDocumentsAndEditors));
		single.resolveHandler = item => {
			resolveCalls.push(item?.id);
			if (item === undefined) {
				const a = new TestItemImpl('ctrlId', 'id-a', 'a', URI.file('/'));
				a.canResolveChildren = true;
				const b = new TestItemImpl('ctrlId', 'id-b', 'b', URI.file('/'));
				single.root.children.add(a);
				single.root.children.add(b);
			} else if (item.id === 'id-a') {
				item.children.add(new TestItemImpl('ctrlId', 'id-aa', 'aa', URI.file('/')));
				item.children.add(new TestItemImpl('ctrlId', 'id-ab', 'ab', URI.file('/')));
			}
		};

		ds.add(single.onDidGenerateDiff(d => single.setDiff(d /* don't clear during testing */)));
	});

	suite('OwnedTestCollection', () => {
		test('adds a root recursively', async () => {
			await single.expand(single.root.id, Infinity);
			const a = single.root.children.get('id-a') as TestItemImpl;
			const b = single.root.children.get('id-b') as TestItemImpl;
			assert.deepStrictEqual(single.collectDiff(), [
				{
					op: TestDiffOpType.Add,
					item: { controllerId: 'ctrlId', expand: TestItemExpandState.BusyExpanding, item: { ...convert.TestItem.from(single.root) } }
				},
				{
					op: TestDiffOpType.Add,
					item: { controllerId: 'ctrlId', expand: TestItemExpandState.BusyExpanding, item: { ...convert.TestItem.from(a) } }
				},
				{
					op: TestDiffOpType.Add,
					item: { controllerId: 'ctrlId', expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(a.children.get('id-aa') as TestItemImpl) }
				},
				{
					op: TestDiffOpType.Add,
					item: { controllerId: 'ctrlId', expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(a.children.get('id-ab') as TestItemImpl) }
				},
				{
					op: TestDiffOpType.Update,
					item: { extId: new TestId(['ctrlId', 'id-a']).toString(), expand: TestItemExpandState.Expanded }
				},
				{
					op: TestDiffOpType.Add,
					item: { controllerId: 'ctrlId', expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(b) }
				},
				{
					op: TestDiffOpType.Update,
					item: { extId: single.root.id, expand: TestItemExpandState.Expanded }
				},
			]);
		});

		test('parents are set correctly', () => {
			single.expand(single.root.id, Infinity);
			single.collectDiff();

			const a = single.root.children.get('id-a')!;
			const ab = a.children.get('id-ab')!;
			assert.strictEqual(a.parent, undefined);
			assert.strictEqual(ab.parent, a);
		});

		test('can add an item with same ID as root', () => {
			single.collectDiff();

			const child = new TestItemImpl('ctrlId', 'ctrlId', 'c', undefined);
			single.root.children.add(child);
			assert.deepStrictEqual(single.collectDiff(), [
				{
					op: TestDiffOpType.Add,
					item: { controllerId: 'ctrlId', expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(child) },
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
			single.root.children.get('id-a')!.description = 'Hello world'; /* item a */

			assert.deepStrictEqual(single.collectDiff(), [
				{
					op: TestDiffOpType.Update,
					item: { extId: new TestId(['ctrlId', 'id-a']).toString(), item: { description: 'Hello world' } },
				}
			]);
		});

		test('removes children', () => {
			single.expand(single.root.id, Infinity);
			single.collectDiff();
			single.root.children.delete('id-a');

			assert.deepStrictEqual(single.collectDiff(), [
				{ op: TestDiffOpType.Remove, itemId: new TestId(['ctrlId', 'id-a']).toString() },
			]);
			assert.deepStrictEqual(
				[...single.tree.keys()].sort(),
				[single.root.id, new TestId(['ctrlId', 'id-b']).toString()],
			);
			assert.strictEqual(single.tree.size, 2);
		});

		test('adds new children', () => {
			single.expand(single.root.id, Infinity);
			single.collectDiff();
			const child = new TestItemImpl('ctrlId', 'id-ac', 'c', undefined);
			single.root.children.get('id-a')!.children.add(child);

			assert.deepStrictEqual(single.collectDiff(), [
				{
					op: TestDiffOpType.Add, item: {
						controllerId: 'ctrlId',
						expand: TestItemExpandState.NotExpandable,
						item: convert.TestItem.from(child),
					}
				},
			]);
			assert.deepStrictEqual(
				[...single.tree.values()].map(n => n.actual.id).sort(),
				[single.root.id, 'id-a', 'id-aa', 'id-ab', 'id-ac', 'id-b'],
			);
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
			single.root.children.get('id-a')!.children.add(child);

			assert.deepStrictEqual(single.collectDiff(), [
				{ op: TestDiffOpType.AddTag, tag: { id: 'ctrlId\0tag1' } },
				{ op: TestDiffOpType.AddTag, tag: { id: 'ctrlId\0tag2' } },
				{
					op: TestDiffOpType.Add, item: {
						controllerId: 'ctrlId',
						expand: TestItemExpandState.NotExpandable,
						item: convert.TestItem.from(child),
					}
				},
			]);

			child.tags = [tag2, tag3];
			assert.deepStrictEqual(single.collectDiff(), [
				{ op: TestDiffOpType.AddTag, tag: { id: 'ctrlId\0tag3' } },
				{
					op: TestDiffOpType.Update, item: {
						extId: new TestId(['ctrlId', 'id-a', 'id-ac']).toString(),
						item: { tags: ['ctrlId\0tag2', 'ctrlId\0tag3'] }
					}
				},
				{ op: TestDiffOpType.RemoveTag, id: 'ctrlId\0tag1' },
			]);

			const a = single.root.children.get('id-a')!;
			a.tags = [tag2];
			a.children.replace([]);
			assert.deepStrictEqual(single.collectDiff().filter(t => t.op === TestDiffOpType.RemoveTag), [
				{ op: TestDiffOpType.RemoveTag, id: 'ctrlId\0tag3' },
			]);
		});

		test('replaces on uri change', () => {
			single.expand(single.root.id, Infinity);
			single.collectDiff();

			const oldA = single.root.children.get('id-a') as TestItemImpl;
			const uri = single.root.children.get('id-a')!.uri?.with({ path: '/different' });
			const newA = new TestItemImpl('ctrlId', 'id-a', 'Hello world', uri);
			newA.children.replace([...oldA.children].map(([_, item]) => item));
			single.root.children.replace([...single.root.children].map(([id, i]) => id === 'id-a' ? newA : i));

			assert.deepStrictEqual(single.collectDiff(), [
				{ op: TestDiffOpType.Remove, itemId: new TestId(['ctrlId', 'id-a']).toString() },
				{
					op: TestDiffOpType.Add,
					item: { controllerId: 'ctrlId', expand: TestItemExpandState.NotExpandable, item: { ...convert.TestItem.from(newA) } }
				},
				{
					op: TestDiffOpType.Add,
					item: { controllerId: 'ctrlId', expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(newA.children.get('id-aa') as TestItemImpl) }
				},
				{
					op: TestDiffOpType.Add,
					item: { controllerId: 'ctrlId', expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(newA.children.get('id-ab') as TestItemImpl) }
				},
			]);
		});

		test('treats in-place replacement as mutation', () => {
			single.expand(single.root.id, Infinity);
			single.collectDiff();

			const oldA = single.root.children.get('id-a') as TestItemImpl;
			const uri = single.root.children.get('id-a')!.uri;
			const newA = new TestItemImpl('ctrlId', 'id-a', 'Hello world', uri);
			newA.children.replace([...oldA.children].map(([_, item]) => item));
			single.root.children.replace([
				newA,
				new TestItemImpl('ctrlId', 'id-b', single.root.children.get('id-b')!.label, uri),
			]);

			assert.deepStrictEqual(single.collectDiff(), [
				{
					op: TestDiffOpType.Update,
					item: { extId: new TestId(['ctrlId', 'id-a']).toString(), item: { label: 'Hello world' } },
				},
				{
					op: TestDiffOpType.DocumentSynced,
					docv: undefined,
					uri: uri
				}
			]);

			newA.label = 'still connected';
			assert.deepStrictEqual(single.collectDiff(), [
				{
					op: TestDiffOpType.Update,
					item: { extId: new TestId(['ctrlId', 'id-a']).toString(), item: { label: 'still connected' } }
				},
			]);

			oldA.label = 'no longer connected';
			assert.deepStrictEqual(single.collectDiff(), []);
		});

		suite('expandibility restoration', () => {
			const doReplace = async (canResolveChildren = true) => {
				const uri = single.root.children.get('id-a')!.uri;
				const newA = new TestItemImpl('ctrlId', 'id-a', 'Hello world', uri);
				newA.canResolveChildren = canResolveChildren;
				single.root.children.replace([
					newA,
					new TestItemImpl('ctrlId', 'id-b', single.root.children.get('id-b')!.label, uri),
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

			const oldA = single.root.children.get('id-a')!;
			const uri = oldA.uri;
			const newA = new TestItemImpl('ctrlId', 'id-a', single.root.children.get('id-a')!.label, uri);
			const oldAA = oldA.children.get('id-aa')!;
			const oldAB = oldA.children.get('id-ab')!;
			const newAB = new TestItemImpl('ctrlId', 'id-ab', 'Hello world', uri);
			newA.children.replace([oldAA, newAB]);
			single.root.children.replace([newA, single.root.children.get('id-b')!]);

			assert.deepStrictEqual(single.collectDiff(), [
				{
					op: TestDiffOpType.Update,
					item: { extId: TestId.fromExtHostTestItem(oldAB, 'ctrlId').toString(), item: { label: 'Hello world' } },
				},
				{
					op: TestDiffOpType.DocumentSynced,
					docv: undefined,
					uri: uri
				}
			]);

			oldAA.label = 'still connected1';
			newAB.label = 'still connected2';
			oldAB.label = 'not connected3';
			assert.deepStrictEqual(single.collectDiff(), [
				{
					op: TestDiffOpType.Update,
					item: { extId: new TestId(['ctrlId', 'id-a', 'id-aa']).toString(), item: { label: 'still connected1' } }
				},
				{
					op: TestDiffOpType.Update,
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
			const b = single.root.children.get('id-b') as TestItemImpl;
			const a = single.root.children.get('id-a') as TestItemImpl;
			a.children.add(b);
			assert.deepStrictEqual(single.collectDiff(), [
				{
					op: TestDiffOpType.Remove,
					itemId: new TestId(['ctrlId', 'id-b']).toString(),
				},
				{
					op: TestDiffOpType.Add,
					item: { controllerId: 'ctrlId', expand: TestItemExpandState.NotExpandable, item: convert.TestItem.from(b) }
				},
			]);

			b.label = 'still connected';
			assert.deepStrictEqual(single.collectDiff(), [
				{
					op: TestDiffOpType.Update,
					item: { extId: new TestId(['ctrlId', 'id-a', 'id-b']).toString(), item: { label: 'still connected' } }
				},
			]);

			assert.deepStrictEqual([...single.root.children].map(([_, item]) => item), [single.root.children.get('id-a')]);
			assert.deepStrictEqual(b.parent, a);
		});

		test('sends document sync events', async () => {
			await single.expand(single.root.id, 0);
			single.collectDiff();

			const a = single.root.children.get('id-a') as TestItemImpl;
			a.range = new Range(new Position(0, 0), new Position(1, 0));

			assert.deepStrictEqual(single.collectDiff(), [
				{
					op: TestDiffOpType.DocumentSynced,
					docv: undefined,
					uri: URI.file('/')
				},
				{
					op: TestDiffOpType.Update,
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
					op: TestDiffOpType.DocumentSynced,
					docv: undefined,
					uri: URI.file('/')
				},
			]);

			// sends on a child replacement
			const uri = URI.file('/');
			const a2 = new TestItemImpl('ctrlId', 'id-a', 'a', uri);
			a2.range = a.range;
			single.root.children.replace([a2, single.root.children.get('id-b')!]);
			assert.deepStrictEqual(single.collectDiff(), [
				{
					op: TestDiffOpType.DocumentSynced,
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
		let proxy: MockObject<MainThreadTestingShape>;
		let c: TestRunCoordinator;
		let cts: CancellationTokenSource;
		let configuration: TestRunProfileImpl;

		let req: TestRunRequest;

		let dto: TestRunDto;
		// eslint-disable-next-line local/code-no-any-casts
		const ext: IExtensionDescription = {} as any;

		teardown(() => {
			for (const { id } of c.trackers) {
				c.disposeTestRun(id);
			}
		});

		setup(async () => {
			proxy = mockObject<MainThreadTestingShape>()();
			cts = new CancellationTokenSource();
			c = new TestRunCoordinator(proxy, new NullLogService());

			configuration = new TestRunProfileImpl(mockObject<MainThreadTestingShape>()(), new Map(), new Set(), Event.None, 'ctrlId', 42, 'Do Run', TestRunProfileKind.Run, () => { }, false);

			await single.expand(single.root.id, Infinity);
			single.collectDiff();

			req = {
				include: undefined,
				exclude: [single.root.children.get('id-b')!],
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
			} finally {
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

			const tracker = Iterable.first(c.trackers)!;
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
			const tracker = Iterable.first(c.trackers)!;
			const expectedArgs: unknown[][] = [];
			assert.deepStrictEqual(proxy.$addTestsToRun.args, expectedArgs);

			task1.passed(single.root.children.get('id-a')!.children.get('id-aa')!);
			expectedArgs.push([
				'ctrlId',
				tracker.id,
				[
					convert.TestItem.from(single.root),
					convert.TestItem.from(single.root.children.get('id-a') as TestItemImpl),
					convert.TestItem.from(single.root.children.get('id-a')!.children.get('id-aa') as TestItemImpl),
				]
			]);
			assert.deepStrictEqual(proxy.$addTestsToRun.args, expectedArgs);

			task1.enqueued(single.root.children.get('id-a')!.children.get('id-ab')!);
			expectedArgs.push([
				'ctrlId',
				tracker.id,
				[
					convert.TestItem.from(single.root.children.get('id-a') as TestItemImpl),
					convert.TestItem.from(single.root.children.get('id-a')!.children.get('id-ab') as TestItemImpl),
				],
			]);
			assert.deepStrictEqual(proxy.$addTestsToRun.args, expectedArgs);

			task1.passed(single.root.children.get('id-a')!.children.get('id-ab')!);
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
					type: TestMessageType.Error,
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
					type: TestMessageType.Error,
					contextValue: undefined,
					expected: undefined,
					actual: undefined,
					location: convert.location.from({ uri: test2.uri!, range: test2.range }),
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
			testA!.children.replace([childA]);
			const childB = new TestItemImpl('ctrlId', 'id-child', 'child', undefined);
			testB!.children.replace([childB]);

			const task1 = c.createTestRun(ext, 'ctrl', single, new TestRunRequestImpl(), 'hello world', false);
			const tracker = Iterable.first(c.trackers)!;

			task1.passed(childA);
			task1.passed(childB);
			assert.deepStrictEqual(proxy.$addTestsToRun.args, [
				[
					'ctrl',
					tracker.id,
					[single.root, testA, childA].map(t => convert.TestItem.from(t as TestItemImpl)),
				],
				[
					'ctrl',
					tracker.id,
					[single.root, testB, childB].map(t => convert.TestItem.from(t as TestItemImpl)),
				],
			]);

			task1.end();
		});
	});

	suite('service', () => {
		let ctrl: TestExtHostTesting;

		class TestExtHostTesting extends ExtHostTesting {
			public getProfileInternalId(ctrl: TestController, profile: TestRunProfile) {
				for (const [id, p] of this.controllers.get(ctrl.id)!.profiles) {
					if (profile === p) {
						return id;
					}
				}

				throw new Error('profile not found');
			}
		}

		setup(() => {
			const rpcProtocol = AnyCallRPCProtocol();
			ctrl = ds.add(new TestExtHostTesting(
				rpcProtocol,
				new NullLogService(),
				new ExtHostCommands(rpcProtocol, new NullLogService(), new class extends mock<IExtHostTelemetry>() {
					override onExtensionError(): boolean {
						return true;
					}
				}),
				new ExtHostDocumentsAndEditors(rpcProtocol, new NullLogService()),
			));
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
			const changeA = Event.toPromise(profAA.onDidChangeDefault as Event<boolean>);
			const changeBA = Event.toPromise(profBA.onDidChangeDefault as Event<boolean>);
			const changeBB = Event.toPromise(profBB.onDidChangeDefault as Event<boolean>);

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
