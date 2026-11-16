/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { errorHandler } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { URI } from '../../../../base/common/uri.js';
import { mock, mockObject, MockObject } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import * as editorRange from '../../../../editor/common/core/range.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { NullTelemetryService } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { SerializableObjectWithBuffers } from '../../../services/extensions/common/proxyIdentifier.js';
import { MainContext, MainThreadCommandsShape, MainThreadTestingShape, TestRunUpdate } from '../../common/extHost.protocol.js';
import { ExtHostCommands } from '../../common/extHostCommands.js';
import { ExtHostDocumentsAndEditors } from '../../common/extHostDocumentsAndEditors.js';
import { IExtHostTelemetry } from '../../common/extHostTelemetry.js';
import { BatchedTestRunRpc } from '../../common/extHostTestingBatchedRpc.js';
import { ExtHostTesting, TestRunCoordinator, TestRunDto, TestRunProfileImpl } from '../../common/extHostTesting.js';
import { ExtHostTestItemCollection, TestItemImpl } from '../../common/extHostTestItem.js';
import * as convert from '../../common/extHostTypeConverters.js';
import { FileCoverage, Location, MarkdownString, Position, Range, TestMessage, TestRunProfileKind, TestRunRequest as TestRunRequestImpl, TestTag } from '../../common/extHostTypes.js';
import { MainThreadTesting } from '../../browser/mainThreadTesting.js';
import { SingleProxyRPCProtocol, TestRPCProtocol } from '../common/testRPCProtocol.js';
import { TestId } from '../../../contrib/testing/common/testId.js';
import { LiveTestResult } from '../../../contrib/testing/common/testResult.js';
import { ITestItem, ITestMessage, ITestRunTask, TestDiffOpType, TestItemExpandState, TestMessageType, TestResultState, TestRunProfileBitset, TestsDiff, TestsDiffOp } from '../../../contrib/testing/common/testTypes.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import type { TestController, TestItem, TestRun, TestRunProfile, TestRunRequest } from 'vscode';

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

		suite('discovery errors', () => {
			let consoleError: sinon.SinonStub;

			setup(() => {
				consoleError = sinon.stub(console, 'error');
			});

			test('publishes synchronous failures without mutating the provider error', async () => {
				const error = new Error('Discovery failed');
				single.resolveHandler = () => { throw error; };
				single.collectDiff();

				await single.expand(single.root.id, 0);

				assert.deepStrictEqual({
					diff: single.collectDiff(),
					providerError: single.root.error,
					barrierOpen: single.tree.get(single.root.id)!.resolveBarrier!.isOpen(),
					log: consoleError.args,
				}, {
					diff: [{
						op: TestDiffOpType.Update,
						item: { extId: single.root.id, expand: TestItemExpandState.Expanded, item: { error: 'Discovery failed' } },
					}],
					providerError: undefined,
					barrierOpen: true,
					log: [['Unhandled error in resolveHandler of test controller "ctrlId"', error]],
				});
			});

			test('publishes asynchronous failures and completes expansion', async () => {
				const resolution = new DeferredPromise<void>();
				single.resolveHandler = () => resolution.p;
				single.collectDiff();

				const expansion = single.expand(single.root.id, 0);
				const pendingDiff = single.collectDiff();
				await resolution.error('Async discovery failed');
				await expansion;

				assert.deepStrictEqual({
					pendingDiff,
					diff: single.collectDiff(),
					barrierOpen: single.tree.get(single.root.id)!.resolveBarrier!.isOpen(),
					log: consoleError.args,
				}, {
					pendingDiff: [{
						op: TestDiffOpType.Update,
						item: { extId: single.root.id, expand: TestItemExpandState.BusyExpanding },
					}],
					diff: [{
						op: TestDiffOpType.Update,
						item: { extId: single.root.id, item: { error: 'Async discovery failed' }, expand: TestItemExpandState.Expanded },
					}],
					barrierOpen: true,
					log: [['Unhandled error in resolveHandler of test controller "ctrlId"', 'Async discovery failed']],
				});
			});

			test('waits for concurrent expansions of a resolving item', async () => {
				const resolution = new DeferredPromise<void>();
				const handler = sinon.stub().returns(resolution.p);
				single.resolveHandler = handler;

				const expansion = single.expand(single.root.id, 0);
				let concurrentFinished = false;
				const concurrentExpansion = Promise.resolve(single.expand(single.root.id, 0)).then(() => {
					concurrentFinished = true;
				});
				await Promise.resolve();
				const finishedBeforeResolution = concurrentFinished;

				await resolution.complete(undefined);
				await Promise.all([expansion, concurrentExpansion]);

				assert.deepStrictEqual({
					finishedBeforeResolution,
					concurrentFinished,
					handlerCalls: handler.callCount,
					expand: single.tree.get(single.root.id)!.expand,
				}, {
					finishedBeforeResolution: false,
					concurrentFinished: true,
					handlerCalls: 1,
					expand: TestItemExpandState.Expanded,
				});
			});

			test('keeps rediscovery pending when an obsolete handler rejects', async () => {
				const oldResolution = new DeferredPromise<void>();
				single.resolveHandler = () => oldResolution.p;
				const oldExpansion = single.expand(single.root.id, 0);

				const resolution = new DeferredPromise<void>();
				single.resolveHandler = () => resolution.p;
				let finished = false;
				const expansion = Promise.resolve(single.expand(single.root.id, 0)).then(() => {
					finished = true;
				});
				single.collectDiff();

				await oldResolution.error('Obsolete discovery failure');
				await oldExpansion;
				const afterOldCompletion = {
					finished,
					expand: single.tree.get(single.root.id)!.expand,
					barrierOpen: single.tree.get(single.root.id)!.resolveBarrier!.isOpen(),
					diff: single.collectDiff(),
				};

				await resolution.complete(undefined);
				await expansion;

				assert.deepStrictEqual({
					afterOldCompletion,
					finished,
					diff: single.collectDiff(),
					log: consoleError.args,
				}, {
					afterOldCompletion: {
						finished: false,
						expand: TestItemExpandState.BusyExpanding,
						barrierOpen: false,
						diff: [],
					},
					finished: true,
					diff: [{
						op: TestDiffOpType.Update,
						item: { extId: single.root.id, expand: TestItemExpandState.Expanded },
					}],
					log: [['Unhandled error in resolveHandler of test controller "ctrlId"', 'Obsolete discovery failure']],
				});
			});

			test('clears failures when resetting the handler and rediscovering successfully', async () => {
				let fail = true;
				const handler = () => {
					if (fail) {
						throw new Error('Discovery failed');
					}
				};
				single.resolveHandler = handler;
				await single.expand(single.root.id, 0);
				single.collectDiff();

				fail = false;
				single.resolveHandler = handler;
				await single.expand(single.root.id, 0);

				assert.deepStrictEqual(single.collectDiff(), [{
					op: TestDiffOpType.Update,
					item: { extId: single.root.id, item: { error: null }, expand: TestItemExpandState.Expanded },
				}]);
			});

			test('clears failures when removing the handler', async () => {
				single.resolveHandler = () => { throw new Error('Discovery failed'); };
				await single.expand(single.root.id, 0);
				single.collectDiff();

				single.resolveHandler = undefined;

				assert.deepStrictEqual(single.collectDiff(), [{
					op: TestDiffOpType.Update,
					item: { extId: single.root.id, item: { error: null }, expand: TestItemExpandState.NotExpandable },
				}]);
			});

			test('preserves provider errors on failure and successful rediscovery', async () => {
				const providerError = new MarkdownString('Provider error');
				single.root.error = providerError;
				single.resolveHandler = () => { throw new Error('Discovery failed'); };
				single.collectDiff();
				await single.expand(single.root.id, 0);
				const failedDiff = single.collectDiff();

				single.resolveHandler = async () => { };
				await single.expand(single.root.id, 0);

				assert.deepStrictEqual({
					failedDiff,
					recoveredDiff: single.collectDiff(),
					providerError: single.root.error,
				}, {
					failedDiff: [{
						op: TestDiffOpType.Update,
						item: { extId: single.root.id, expand: TestItemExpandState.Expanded },
					}],
					recoveredDiff: [{
						op: TestDiffOpType.Update,
						item: { extId: single.root.id, expand: TestItemExpandState.Expanded },
					}],
					providerError,
				});
			});

			test('uses provider errors in preference to a discovery failure', async () => {
				single.resolveHandler = () => { throw new Error('Discovery failed'); };
				await single.expand(single.root.id, 0);
				single.collectDiff();

				const root: TestItem = single.root;
				root.error = 'Provider error';
				const providerDiff = single.collectDiff();
				root.error = undefined;

				assert.deepStrictEqual({
					providerDiff,
					clearedProviderDiff: single.collectDiff(),
				}, {
					providerDiff: [{
						op: TestDiffOpType.Update,
						item: { extId: single.root.id, item: { error: 'Provider error' } },
					}],
					clearedProviderDiff: [{
						op: TestDiffOpType.Update,
						item: { extId: single.root.id, item: { error: 'Discovery failed' } },
					}],
				});
			});

			test('clears failures when replacing an item', async () => {
				await single.expand(single.root.id, 0);
				const item = single.root.children.get('id-a') as TestItemImpl;
				const id = TestId.fromExtHostTestItem(item, 'ctrlId').toString();
				single.resolveHandler = resolved => {
					if (resolved === item) {
						throw new Error('Discovery failed');
					}
				};
				await single.expand(id, 0);
				single.collectDiff();

				const replacement = new TestItemImpl('ctrlId', item.id, item.label, item.uri);
				replacement.canResolveChildren = true;
				single.root.children.add(replacement);
				await single.expand(id, 0);

				assert.deepStrictEqual(single.collectDiff(), [
					{
						op: TestDiffOpType.Update,
						item: { extId: id, item: { error: null }, expand: TestItemExpandState.Expanded },
					},
					{ op: TestDiffOpType.DocumentSynced, uri: item.uri, docv: undefined },
				]);
			});

			for (const change of ['remove', 'replace', 'dispose', 'reset'] as const) {
				test(`ignores obsolete asynchronous failures after ${change}`, async () => {
					await single.expand(single.root.id, 0);
					const item = single.root.children.get('id-a') as TestItemImpl;
					const id = TestId.fromExtHostTestItem(item, 'ctrlId').toString();
					const resolution = new DeferredPromise<void>();
					single.resolveHandler = () => resolution.p;
					const expansion = single.expand(id, 0);

					switch (change) {
						case 'remove':
							single.root.children.delete(item.id);
							break;
						case 'replace':
							single.root.children.add(new TestItemImpl('ctrlId', item.id, item.label, item.uri));
							break;
						case 'dispose':
							single.dispose();
							break;
						case 'reset':
							single.resolveHandler = () => { };
							break;
					}
					single.collectDiff();
					await resolution.error('Obsolete discovery failure');
					await expansion;

					assert.deepStrictEqual({
						diff: single.collectDiff(),
						log: consoleError.args,
					}, {
						diff: [],
						log: [['Unhandled error in resolveHandler of test controller "ctrlId"', 'Obsolete discovery failure']],
					});
				});
			}
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

	test('transfers ordered test updates and output through RPC', async () => {
		const calls: string[] = [];
		const receiver = new class extends mock<MainThreadTesting>() {
			override $addTestsToRun = sinon.stub().callsFake(() => calls.push('tests'));
			override $updateTestStateInRun = sinon.stub().callsFake(() => calls.push('state'));
			override $appendOutputToRun = sinon.stub().callsFake(() => calls.push('output'));
			override $appendTestMessagesInRun = sinon.stub().callsFake(() => calls.push('messages'));
			override $applyTestRunUpdates(controllerId: string, runId: string, updates: SerializableObjectWithBuffers<TestRunUpdate[]>) {
				MainThreadTesting.prototype.$applyTestRunUpdates.call(this, controllerId, runId, updates);
			}
		};
		const rpc = new TestRPCProtocol();
		rpc.set(MainContext.MainThreadTesting, receiver);
		await rpc.getProxy(MainContext.MainThreadTesting).$applyTestRunUpdates('ctrl', 'run', new SerializableObjectWithBuffers<TestRunUpdate[]>([
			{ type: 'tests', tests: [] },
			{ type: 'state', taskId: 'task', testId: 'test', state: TestResultState.Running },
			{ type: 'output', taskId: 'task', testId: 'test', output: 'hello \u2713' },
			{ type: 'output', taskId: 'task', testId: 'test', output: VSBuffer.wrap(new Uint8Array([0x00, 0xe2, 0x9c])) },
			{ type: 'output', taskId: 'task', testId: 'test', output: VSBuffer.wrap(new Uint8Array([0x93, 0xff])) },
			{ type: 'messages', taskId: 'task', testId: 'test', messages: [] },
			{ type: 'state', taskId: 'task', testId: 'test', state: TestResultState.Passed, duration: 2 },
		]));
		assert.deepStrictEqual(calls, ['tests', 'state', 'output', 'output', 'output', 'messages', 'state']);
		assert.deepStrictEqual(receiver.$appendOutputToRun.args, [
			['run', 'task', VSBuffer.fromString('hello \u2713'), undefined, 'test'],
			['run', 'task', VSBuffer.wrap(new Uint8Array([0x00, 0xe2, 0x9c])), undefined, 'test'],
			['run', 'task', VSBuffer.wrap(new Uint8Array([0x93, 0xff])), undefined, 'test'],
		]);
	});

	test('batched RPC owns byte output and flushes once on disposal', async () => {
		const batches: string[][] = [];
		const receiver = new class extends mock<MainThreadTesting>() {
			override $appendOutputToRun = sinon.stub();
			override $applyTestRunUpdates(controllerId: string, runId: string, updates: SerializableObjectWithBuffers<TestRunUpdate[]>) {
				batches.push(updates.value.map(update => update.type));
				MainThreadTesting.prototype.$applyTestRunUpdates.call(this, controllerId, runId, updates);
			}
		};
		const rpc = new TestRPCProtocol();
		rpc.set(MainContext.MainThreadTesting, receiver);
		const batchedRpc = ds.add(new BatchedTestRunRpc(rpc.getProxy(MainContext.MainThreadTesting)));
		const bytes = new Uint8Array([0x00, 0xff, 0xe2]);
		batchedRpc.add('ctrl', 'run', { type: 'output', taskId: 'task', output: VSBuffer.wrap(bytes.subarray(1)) });
		bytes.fill(0);
		batchedRpc.add('ctrl', 'run', { type: 'output', taskId: 'task', output: 'after' });
		batchedRpc.dispose();
		batchedRpc.add('ctrl', 'run', { type: 'output', taskId: 'task', output: 'ignored' });
		await rpc.sync();
		assert.deepStrictEqual({ batches, output: receiver.$appendOutputToRun.args }, {
			batches: [['output', 'output']],
			output: [
				['run', 'task', VSBuffer.wrap(new Uint8Array([0xff, 0xe2])), undefined, undefined],
				['run', 'task', VSBuffer.fromString('after'), undefined, undefined],
			],
		});
	});


	test('flushes controller boundaries in call order within a shared run', () => {
		const proxy = mockObject<MainThreadTestingShape>()();
		const rpc = ds.add(new BatchedTestRunRpc(proxy));
		rpc.add('first', 'run', { type: 'output', taskId: 'one', output: 'one' });
		rpc.add('second', 'run', { type: 'output', taskId: 'two', output: 'two' });
		rpc.add('first', 'run', { type: 'output', taskId: 'three', output: 'three' });
		rpc.flush();
		assert.deepStrictEqual(proxy.$applyTestRunUpdates.args.map(([controllerId, runId, updates]) => ({ controllerId, runId, taskIds: updates.value.map((update: TestRunUpdate) => update.type === 'tests' ? undefined : update.taskId) })), [
			{ controllerId: 'first', runId: 'run', taskIds: ['one'] },
			{ controllerId: 'second', runId: 'run', taskIds: ['two'] },
			{ controllerId: 'first', runId: 'run', taskIds: ['three'] },
		]);
	});

	test('continues applying a batch after an update handler throws', async () => {
		const calls: string[] = [];
		const error = new Error('Unknown task');
		const reportError = sinon.stub(errorHandler, 'onUnexpectedError');
		const receiver = new class extends mock<MainThreadTesting>() {
			override $updateTestStateInRun(_runId: string, taskId: string) {
				if (taskId === 'unknown') {
					throw error;
				}
				calls.push(taskId);
			}
			override $appendOutputToRun() { calls.push('output'); }
			override $applyTestRunUpdates(controllerId: string, runId: string, updates: SerializableObjectWithBuffers<TestRunUpdate[]>) {
				MainThreadTesting.prototype.$applyTestRunUpdates.call(this, controllerId, runId, updates);
			}
		};
		const rpc = new TestRPCProtocol();
		rpc.set(MainContext.MainThreadTesting, receiver);
		await rpc.getProxy(MainContext.MainThreadTesting).$applyTestRunUpdates('ctrl', 'run', new SerializableObjectWithBuffers<TestRunUpdate[]>([
			{ type: 'state', taskId: 'first', testId: 'test', state: TestResultState.Running },
			{ type: 'state', taskId: 'unknown', testId: 'test', state: TestResultState.Running },
			{ type: 'output', taskId: 'first', output: 'still delivered' },
			{ type: 'state', taskId: 'last', testId: 'test', state: TestResultState.Passed },
		]));
		assert.deepStrictEqual({ calls, errors: reportError.args }, { calls: ['first', 'output', 'last'], errors: [[error]] });
	});

	suite('TestRunTracker', () => {
		let proxy: MockObject<MainThreadTestingShape>;
		let c: TestRunCoordinator;
		let cts: CancellationTokenSource;
		let configuration: TestRunProfileImpl;

		let req: TestRunRequest;

		let dto: TestRunDto;
		let clock: sinon.SinonFakeTimers;
		// eslint-disable-next-line local/code-no-any-casts
		const ext: IExtensionDescription = {} as any;

		teardown(() => {
			for (const { id } of c.trackers) {
				c.disposeTestRun(id);
			}
			clock.restore();
		});

		setup(async () => {
			proxy = mockObject<MainThreadTestingShape>()();
			proxy.$applyTestRunUpdates.callsFake((controllerId: string, runId: string, updates: SerializableObjectWithBuffers<TestRunUpdate[]>) => {
				for (const update of updates.value) {
					switch (update.type) {
						case 'tests':
							proxy.$addTestsToRun(controllerId, runId, update.tests);
							break;
						case 'state':
							proxy.$updateTestStateInRun(runId, update.taskId, update.testId, update.state, update.duration);
							break;
						case 'messages':
							proxy.$appendTestMessagesInRun(runId, update.taskId, update.testId, update.messages);
							break;
						case 'output':
							proxy.$appendOutputToRun(runId, update.taskId, typeof update.output === 'string' ? VSBuffer.fromString(update.output) : update.output, update.location, update.testId);
							break;
					}
				}
			});
			cts = new CancellationTokenSource();
			c = ds.add(new TestRunCoordinator(proxy, new NullLogService()));

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
			clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		});

		test('batches ordered state, message, and output updates', () => {
			const task = c.createTestRun(ext, 'ctrlId', single, req, 'run', false);
			const test = single.root.children.get('id-a')!.children.get('id-aa')!;
			task.started(test);
			task.appendOutput('hello', undefined, test);
			task.failed(test, new TestMessage('failure'), 2);
			assert.strictEqual(proxy.$applyTestRunUpdates.callCount, 0);
			clock.tick(0);
			assert.deepStrictEqual(proxy.$applyTestRunUpdates.args.map(([, , updates]) => updates.value.map((update: TestRunUpdate) => update.type)), [['tests', 'state', 'output', 'messages', 'state']]);
			task.passed(test, 3);
			task.end();
			assert.strictEqual(proxy.$applyTestRunUpdates.callCount, 2);
			assert.ok(proxy.$finishedTestRunTask.calledAfter(proxy.$applyTestRunUpdates));
			clock.tick(0);
			assert.strictEqual(proxy.$applyTestRunUpdates.callCount, 2);
		});

		test('flushes earlier updates before starting another task', () => {
			const first = c.createTestRun(ext, 'ctrlId', single, req, 'first', false);
			first.appendOutput('hello');
			const second = c.createTestRun(ext, 'ctrlId', single, req, 'second', false);
			assert.ok(proxy.$startedTestRunTask.getCall(1).calledAfter(proxy.$applyTestRunUpdates.getCall(0)));
			assert.strictEqual(proxy.$applyTestRunUpdates.firstCall.args[2].value[0].taskId, proxy.$startedTestRunTask.firstCall.args[1].id);
			first.end();
			second.end();
		});

		test('sends included tests before publishing coverage', () => {
			const task = c.createTestRun(ext, 'ctrlId', single, req, 'run', false);
			const test = single.root.children.get('id-a')!.children.get('id-aa')!;
			task.addCoverage(new FileCoverage(URI.file('/coverage.ts'), { covered: 1, total: 1 }, undefined, undefined, [test]));
			assert.strictEqual(proxy.$addTestsToRun.callCount, 1);
			assert.ok(proxy.$appendCoverage.calledAfter(proxy.$applyTestRunUpdates));
			task.end();
		});

		test('bounds batches during a synchronous stream of updates', () => {
			const task = c.createTestRun(ext, 'ctrlId', single, req, 'run', false);
			const test = single.root.children.get('id-a')!.children.get('id-aa')!;
			for (let i = 0; i < 2048; i++) {
				task.started(test);
			}
			task.end();
			assert.deepStrictEqual(proxy.$applyTestRunUpdates.args.map(([, , updates]) => updates.value.length), [1024, 1024, 1]);
		});

		for (const kind of ['string', 'bytes'] as const) {
			test(`flushes large ${kind} output without waiting for a timer`, () => {
				const task = c.createTestRun(ext, 'ctrlId', single, req, 'run', false);
				task.appendOutput(kind === 'string' ? 'x'.repeat(64 * 1024) : new Uint8Array(64 * 1024));
				assert.deepStrictEqual(proxy.$appendOutputToRun.args.map(args => args[2].byteLength), [64 * 1024]);
				task.end();
				clock.tick(0);
				assert.strictEqual(proxy.$applyTestRunUpdates.callCount, 1);
			});
		}

		for (const kind of ['string', 'bytes'] as const) {
			test(`batches ${kind} output as buffers and bounds its cumulative byte payload`, () => {
				const task = c.createTestRun(ext, 'ctrlId', single, req, 'run', false);
				const output = kind === 'string' ? '\u2713'.repeat(14 * 1024) : new Uint8Array(42 * 1024).fill(0x61);
				task.appendOutput(output);
				assert.strictEqual(proxy.$applyTestRunUpdates.callCount, 0);
				task.appendOutput(output);
				assert.strictEqual(proxy.$applyTestRunUpdates.callCount, 1);
				task.end();
				assert.deepStrictEqual({
					batchLengths: proxy.$applyTestRunUpdates.args.map(([, , updates]) => updates.value.length),
					binaryOutput: proxy.$applyTestRunUpdates.args.every(([, , updates]) => updates.value.every((update: TestRunUpdate) => update.type === 'output' && update.output instanceof VSBuffer)),
					outputSizes: proxy.$appendOutputToRun.args.map(args => args[2].byteLength),
				}, { batchLengths: [1, 1], binaryOutput: true, outputSizes: [42 * 1024, 42 * 1024] });
			});
		}

		test('preserves split UTF-8 byte output and its order with batched updates', () => {
			const task = c.createTestRun(ext, 'ctrlId', single, req, 'run', false);
			const test = single.root.children.get('id-a')!;
			const firstChunk = new Uint8Array([0xe2, 0x9c]);
			task.started(test);
			task.appendOutput('before ');
			task.appendOutput(firstChunk, undefined, test);
			firstChunk.fill(0);
			task.appendOutput(new Uint8Array([0x93]), undefined, test);
			task.appendOutput(' after');
			assert.strictEqual(proxy.$applyTestRunUpdates.callCount, 0);
			task.end();

			assert.deepStrictEqual({
				output: VSBuffer.concat(proxy.$appendOutputToRun.args.map(args => args[2])).toString(),
				registeredBeforeOutput: proxy.$addTestsToRun.calledBefore(proxy.$appendOutputToRun),
				byteTestIds: proxy.$appendOutputToRun.args.slice(1, 3).map(args => args[4]),
				batches: proxy.$applyTestRunUpdates.callCount,
			}, { output: 'before \u2713 after', registeredBeforeOutput: true, byteTestIds: ['ctrlId\0id-a', 'ctrlId\0id-a'], batches: 1 });
		});

		test('ignores byte output after the tracker is disposed', () => {
			const task = c.createTestRun(ext, 'ctrlId', single, req, 'run', false);
			c.disposeTestRun(Iterable.first(c.trackers)!.id);
			task.appendOutput(new Uint8Array([0x61]));
			assert.strictEqual(proxy.$appendOutputToRun.called, false);
		});


		for (const outputLength of [100, 64 * 1024]) {
			test(`encodes ${outputLength} string bytes once while snapshotting extension bytes`, () => {
				const task = c.createTestRun(ext, 'ctrlId', single, req, 'run', false);
				const clone = sinon.spy(VSBuffer.prototype, 'clone');
				task.appendOutput('x'.repeat(outputLength));
				assert.strictEqual(clone.callCount, 0);
				const bytes = new Uint8Array([97, 98]);
				task.appendOutput(bytes);
				assert.strictEqual(clone.callCount, 1);
				bytes.fill(0);
				task.end();
				assert.deepStrictEqual(proxy.$appendOutputToRun.args.map(args => args[2].toString()), ['x'.repeat(outputLength), 'ab']);
			});
		}

		for (const target of ['message', 'registration'] as const) {
			test(`snapshots the Markdown trust object and command array for a ${target}`, () => {
				const task = c.createTestRun(ext, 'ctrlId', single, req, 'run', false);
				const item = single.root.children.get('id-a')!;
				const commands = ['original'];
				const trust = { enabledCommands: commands };
				const markdown = new MarkdownString('Original message');
				markdown.isTrusted = trust;
				if (target === 'message') {
					task.failed(item, new TestMessage(markdown));
				} else {
					item.error = markdown;
					task.started(item);
				}
				commands.push('later');
				trust.enabledCommands = ['replacement'];
				markdown.value = 'Changed message';
				clock.tick(0);
				const actual = target === 'message'
					? proxy.$appendTestMessagesInRun.firstCall.args[3][0].message
					: proxy.$addTestsToRun.firstCall.args[2].find((test: ITestItem.Serialized) => test.extId === 'ctrlId\0id-a')!.error;
				assert.ok(actual && typeof actual !== 'string');
				assert.strictEqual(actual.value, 'Original message');
				assert.deepStrictEqual(actual.isTrusted, { enabledCommands: ['original'] });
				assert.notStrictEqual(actual.isTrusted, trust);
				task.end();
			});
		}

		test('bounds cumulative failure snapshot payloads before the timer fires', () => {
			const task = c.createTestRun(ext, 'ctrlId', single, req, 'run', false);
			const test = single.root.children.get('id-a')!;
			const message = TestMessage.diff('failure', 'e'.repeat(20 * 1024), 'a'.repeat(20 * 1024));
			task.failed(test, message);
			assert.strictEqual(proxy.$applyTestRunUpdates.callCount, 0);
			task.failed(test, message);
			assert.strictEqual(proxy.$applyTestRunUpdates.callCount, 1);
			task.end();

			assert.deepStrictEqual(proxy.$applyTestRunUpdates.args.map(([, , updates]) => updates.value.map((update: TestRunUpdate) => update.type)), [
				['tests', 'messages', 'state'], ['messages', 'state'],
			]);
		});

		test('flushes oversized failure messages separately and resets the payload budget', () => {
			const task = c.createTestRun(ext, 'ctrlId', single, req, 'run', false);
			const test = single.root.children.get('id-a')!;
			task.failed(test, new TestMessage('x'.repeat(64 * 1024)));
			assert.deepStrictEqual(proxy.$applyTestRunUpdates.args.map(([, , updates]) => updates.value.map((update: TestRunUpdate) => update.type)), [['tests'], ['messages']]);
			task.appendOutput('small');
			assert.strictEqual(proxy.$applyTestRunUpdates.callCount, 2);
			task.end();
			assert.deepStrictEqual(proxy.$applyTestRunUpdates.lastCall.args[2].value.map((update: TestRunUpdate) => update.type), ['state', 'output']);
		});

		test('counts registration payloads toward the batch limit', () => {
			const task = c.createTestRun(ext, 'ctrlId', single, req, 'run', false);
			const test = single.root.children.get('id-a')!;
			test.label = 'x'.repeat(64 * 1024);
			task.started(test);
			assert.deepStrictEqual(proxy.$applyTestRunUpdates.args.map(([, , updates]) => updates.value.map((update: TestRunUpdate) => update.type)), [['tests']]);
			task.end();
		});

		test('flushes pending updates and cancels the timer when disposed', () => {
			const task = c.createTestRun(ext, 'ctrlId', single, req, 'run', false);
			const tracker = Iterable.first(c.trackers)!;
			task.appendOutput('hello');
			c.disposeTestRun(tracker.id);
			assert.strictEqual(proxy.$applyTestRunUpdates.callCount, 1);
			clock.tick(0);
			assert.strictEqual(proxy.$applyTestRunUpdates.callCount, 1);
		});

		test('tracks a run started from a main thread request', () => {
			const tracker = ds.add(c.prepareForMainThreadTestRun(ext, req, dto, configuration, cts.token));
			assert.strictEqual(tracker.hasRunningTasks, false);

			const task1 = c.createTestRun(ext, 'ctrl', single, req, 'run1', true);
			const task2 = c.createTestRun(ext, 'ctrl', single, req, 'run2', true);
			assert.strictEqual(proxy.$startedExtensionTestRun.called, false);
			assert.strictEqual(tracker.hasRunningTasks, true);

			task1.appendOutput('hello');
			clock.tick(0);
			const taskId = proxy.$appendOutputToRun.args[0]?.[1];
			assert.deepStrictEqual([['run-id', taskId, VSBuffer.fromString('hello'), undefined, undefined]], proxy.$appendOutputToRun.args);
			task1.end();

			assert.strictEqual(proxy.$finishedExtensionTestRun.called, false);
			assert.strictEqual(tracker.hasRunningTasks, true);

			task2.end();

			assert.strictEqual(proxy.$finishedExtensionTestRun.called, false);
			assert.strictEqual(tracker.hasRunningTasks, false);
		});


		for (const flush of ['timer', 'task end', 'result disposal'] as const) {
			test(`preserves interleaved independent run updates on ${flush}`, () => {
				const first = c.createTestRun(ext, 'ctrlId', single, req, 'first', true);
				const second = c.createTestRun(ext, 'ctrlId', single, { ...req }, 'second', true);
				const one = single.root.children.get('id-a')!.children.get('id-aa')!;
				const two = single.root.children.get('id-a')!.children.get('id-ab')!;
				const three = single.root.children.get('id-a')!;
				first.started(one);
				second.started(two);
				first.started(three);
				if (flush === 'timer') {
					clock.tick(0);
				} else if (flush === 'task end') {
					first.end();
				} else {
					c.disposeTestRun(proxy.$startedExtensionTestRun.firstCall.args[0].id);
				}
				assert.deepStrictEqual(proxy.$updateTestStateInRun.args.map(args => args[2]), [one, two, three].map(test => TestId.fromExtHostTestItem(test, 'ctrlId').toString()));
				second.passed(two, 1);
				clock.tick(0);
				assert.deepStrictEqual(proxy.$updateTestStateInRun.lastCall.args.slice(2), [TestId.fromExtHostTestItem(two, 'ctrlId').toString(), TestResultState.Passed, 1]);
				first.end();
				second.end();
			});
		}

		test('flushes pending updates without visiting historical trackers', () => {
			for (let i = 0; i < 256; i++) {
				c.createTestRun(ext, 'ctrlId', single, { ...req }, `previous ${i}`, true).end();
			}
			const historicalFlushes = [...c.trackers].map(tracker => sinon.spy(tracker, 'flushUpdates'));
			const active = c.createTestRun(ext, 'ctrlId', single, req, 'active', true);
			const test = single.root.children.get('id-a')!;
			active.started(test);
			c.flushUpdates();
			c.markTestRetired(undefined);
			clock.tick(0);
			assert.deepStrictEqual({
				historicalFlushes: historicalFlushes.reduce((sum, spy) => sum + spy.callCount, 0),
				updates: proxy.$updateTestStateInRun.args.map(args => args[2]),
				batches: proxy.$applyTestRunUpdates.callCount,
			}, { historicalFlushes: 0, updates: [TestId.fromExtHostTestItem(test, 'ctrlId').toString()], batches: 1 });
			active.end();
		});

		for (const flush of ['timer', 'task end', 'result disposal'] as const) {
			test(`preserves interleaved profile updates on ${flush}`, () => {
				const sharedDto = new TestRunDto('ctrlId', dto.id, true, single);
				const secondProfile = ds.add(new TestRunProfileImpl(proxy, new Map(), new Set(), Event.None, 'ctrlId', 43, 'Second', TestRunProfileKind.Run, () => { }, false));
				const secondRequest = { ...req, profile: secondProfile };
				c.prepareForMainThreadTestRun(ext, req, sharedDto, configuration, cts.token);
				c.prepareForMainThreadTestRun(ext, secondRequest, sharedDto, secondProfile, cts.token);
				const firstDisposed = sinon.stub();
				const secondDisposed = sinon.stub();
				const first = c.createTestRun(ext, 'ctrlId', single, req, 'first', true);
				const second = c.createTestRun(ext, 'ctrlId', single, secondRequest, 'second', true);
				ds.add(first.onDidDispose(firstDisposed));
				ds.add(second.onDidDispose(secondDisposed));
				const one = single.root.children.get('id-a')!.children.get('id-aa')!;
				const two = single.root.children.get('id-a')!.children.get('id-ab')!;
				const three = single.root.children.get('id-a')!;
				first.started(one);
				second.started(two);
				first.started(three);
				assert.strictEqual(proxy.$applyTestRunUpdates.callCount, 0);
				if (flush === 'timer') {
					clock.tick(0);
				} else if (flush === 'task end') {
					second.end();
					assert.ok(proxy.$finishedTestRunTask.calledAfter(proxy.$applyTestRunUpdates));
					first.passed(one);
					clock.tick(0);
				} else {
					c.disposeTestRun(sharedDto.id);
					assert.strictEqual(firstDisposed.callCount, 1);
					assert.strictEqual(secondDisposed.callCount, 1);
					first.started(one);
					second.appendOutput('ignored');
				}
				assert.deepStrictEqual(proxy.$updateTestStateInRun.args.slice(0, 3).map(args => args[2]), [one, two, three].map(item => TestId.fromExtHostTestItem(item, 'ctrlId').toString()));
				const count = proxy.$applyTestRunUpdates.callCount;
				clock.tick(0);
				assert.strictEqual(proxy.$applyTestRunUpdates.callCount, count);
				if (flush !== 'result disposal') {
					first.end();
					second.end();
				}
			});
		}

		for (const firstToEnd of ['first', 'second'] as const) {
			test(`preserves both profiles' results when the ${firstToEnd} profile ends first`, () => {
				const sharedDto = new TestRunDto('ctrlId', dto.id, true, single);
				const result = ds.add(new LiveTestResult(sharedDto.id, false, { group: TestRunProfileBitset.Run, targets: [] }, 0, NullTelemetryService));
				const uriIdentity = { asCanonicalUri: (uri: URI) => uri };
				proxy.$startedTestRunTask.callsFake((_runId: string, task: ITestRunTask) => result.addTask(task));
				proxy.$finishedTestRunTask.callsFake((_runId: string, taskId: string) => result.markTaskComplete(taskId));
				proxy.$addTestsToRun.callsFake((controllerId: string, _runId: string, tests: ITestItem.Serialized[]) => result.addTestChainToRun(controllerId, tests.map(test => ITestItem.deserialize(uriIdentity, test))));
				proxy.$updateTestStateInRun.callsFake((_runId: string, taskId: string, testId: string, state: TestResultState, duration?: number) => result.updateState(testId, taskId, state, duration));
				proxy.$appendTestMessagesInRun.callsFake((_runId: string, taskId: string, testId: string, messages: ITestMessage.Serialized[]) => {
					for (const message of messages) {
						result.appendMessage(testId, taskId, ITestMessage.deserialize(uriIdentity, message));
					}
				});

				const secondProfile = ds.add(new TestRunProfileImpl(proxy, new Map(), new Set(), Event.None, 'ctrlId', 43, 'Second', TestRunProfileKind.Run, () => { }, false));
				const secondRequest = { ...req, profile: secondProfile };
				ds.add(c.prepareForMainThreadTestRun(ext, req, sharedDto, configuration, cts.token));
				ds.add(c.prepareForMainThreadTestRun(ext, secondRequest, sharedDto, secondProfile, cts.token));
				const first = c.createTestRun(ext, 'ctrlId', single, req, 'first', true);
				const second = c.createTestRun(ext, 'ctrlId', single, secondRequest, 'second', true);
				const test = single.root.children.get('id-a')!.children.get('id-aa')!;
				const testId = TestId.fromExtHostTestItem(test, 'ctrlId').toString();
				first.started(test);
				second.started(test);
				first.failed(test, new TestMessage('first profile failure'), 2);
				second.passed(test, 3);
				assert.strictEqual(proxy.$applyTestRunUpdates.callCount, 0);

				const endingOrder = firstToEnd === 'first' ? [first, second] : [second, first];
				endingOrder[0].end();
				const registered = result.getStateById(testId)!;
				assert.deepStrictEqual(registered.tasks.map(task => task.state), [TestResultState.Failed, TestResultState.Passed]);
				endingOrder[1].end();
				clock.tick(0);
				const actual = result.getStateById(testId)!;
				assert.deepStrictEqual({
					sameItem: actual === registered,
					states: actual.tasks.map(task => task.state),
					durations: actual.tasks.map(task => task.duration),
					messages: actual.tasks.map(task => task.messages.map(message => message.type === TestMessageType.Error ? message.message : undefined)),
					computedState: actual.computedState,
					rootState: result.getStateById('ctrlId')!.computedState,
					counts: [result.counts[TestResultState.Unset], result.counts[TestResultState.Failed], result.counts[TestResultState.Passed]],
				}, {
					sameItem: true,
					states: [TestResultState.Failed, TestResultState.Passed],
					durations: [2, 3],
					messages: [['first profile failure'], []],
					computedState: TestResultState.Failed,
					rootState: TestResultState.Failed,
					counts: [2, 1, 0],
				});
			});
		}

		for (const invalidateAll of [false, true]) {
			test(`flushes every profile sharing a run ID before retiring ${invalidateAll ? 'all results' : 'a test'}`, () => {
				const secondProfile = ds.add(new TestRunProfileImpl(proxy, new Map(), new Set(), Event.None, 'ctrlId', 43, 'Second', TestRunProfileKind.Run, () => { }, false));
				const secondRequest = { ...req, profile: secondProfile };
				ds.add(c.prepareForMainThreadTestRun(ext, req, dto, configuration, cts.token));
				ds.add(c.prepareForMainThreadTestRun(ext, secondRequest, dto, secondProfile, cts.token));
				const first = c.createTestRun(ext, 'ctrlId', single, req, 'first', true);
				const second = c.createTestRun(ext, 'ctrlId', single, secondRequest, 'second', true);
				first.started(single.root.children.get('id-a')!);
				second.started(single.root.children.get('id-b')!);
				const calls: string[] = [];
				proxy.$applyTestRunUpdates.callsFake(() => calls.push('updates'));
				proxy.$markTestRetired.callsFake(() => calls.push('retire'));

				c.markTestRetired(invalidateAll ? undefined : ['ctrlId\0id-a']);

				assert.deepStrictEqual({ calls, runIds: proxy.$applyTestRunUpdates.args.map(args => args[1]) }, {
					calls: ['updates', 'retire'], runIds: ['run-id'],
				});
				clock.tick(0);
				assert.deepStrictEqual(calls, ['updates', 'retire']);
				first.end();
				second.end();
			});
		}

		test('run cancel force ends after a timeout', () => {
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
			clock.tick(0);
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
			clock.tick(0);
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
			clock.tick(0);
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
			clock.tick(0);

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
			clock.tick(0);
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
			assert.doesNotThrow(() => task.appendOutput(undefined!));

			clock.tick(0);
			assert.strictEqual(proxy.$applyTestRunUpdates.called, false);
			assert.strictEqual(proxy.$addTestsToRun.called, false);
			assert.strictEqual(proxy.$updateTestStateInRun.called, false);
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
			clock.tick(0);
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
		let proxy: MockObject<MainThreadTestingShape & MainThreadCommandsShape>;
		let commands: ExtHostCommands;

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
			proxy = mockObject<MainThreadTestingShape & MainThreadCommandsShape>()();
			const rpcProtocol = SingleProxyRPCProtocol(proxy);
			commands = new ExtHostCommands(rpcProtocol, new NullLogService(), new class extends mock<IExtHostTelemetry>() {
				override onExtensionError(): boolean {
					return true;
				}
			});
			ctrl = ds.add(new TestExtHostTesting(
				rpcProtocol,
				new NullLogService(),
				commands,
				new ExtHostDocumentsAndEditors(rpcProtocol, new NullLogService()),
			));
		});

		for (const command of ['vscode.peekTestError', 'testing.openOutputPeek']) {
			test(`publishes pending failures before executing ${command}`, async () => {
				const controller = ds.add(ctrl.createTestController(nullExtensionDescription, 'ctrl', 'tests'));
				const item = controller.createTestItem('test', 'test');
				controller.items.add(item);
				const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
				const run = controller.createTestRun(new TestRunRequestImpl());
				try {
					const calls: string[] = [];
					proxy.$applyTestRunUpdates.callsFake(() => calls.push('updates'));
					proxy.$executeCommand.callsFake(async id => { calls.push(id); return undefined; });
					run.failed(item, new TestMessage('failure'));
					await commands.executeCommand('unrelated.command');
					await commands.executeCommand(command, 'ctrl\0test');
					assert.deepStrictEqual({ calls, updates: proxy.$applyTestRunUpdates.args.flatMap(([, , updates]) => updates.value.map((update: TestRunUpdate) => update.type)) }, {
						calls: ['unrelated.command', 'updates', command], updates: ['tests', 'messages', 'state'],
					});
					clock.tick(0);
					assert.strictEqual(proxy.$applyTestRunUpdates.callCount, 1);
				} finally {
					run.end();
					await ctrl.$disposeRun(proxy.$startedExtensionTestRun.firstCall.args[0].id);
					clock.restore();
				}
			});
		}

		for (const rejects of [false, true]) {
			test(`publishes final updates before a cancelled profile ${rejects ? 'rejects' : 'returns'}`, async () => {
				const controller = ds.add(ctrl.createTestController(nullExtensionDescription, 'ctrl', 'tests'));
				const item = controller.createTestItem('test', 'test');
				controller.items.add(item);
				const started = new DeferredPromise<void>();
				const finish = new DeferredPromise<void>();
				let run: TestRun | undefined;
				const profile = ds.add(controller.createRunProfile('run', TestRunProfileKind.Run, async request => {
					run = controller.createTestRun(request);
					await started.complete();
					await finish.p;
					run.failed(item, new TestMessage('final failure'));
					run.appendOutput('final output', undefined, item);
					if (rejects) {
						throw new Error('handler failure');
					}
				}));
				const cts = ds.add(new CancellationTokenSource());
				const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
				try {
					const result = ctrl.$runControllerTests([{
						controllerId: 'ctrl', runId: 'run', profileId: ctrl.getProfileInternalId(controller, profile),
						testIds: ['ctrl\0test'], excludeExtIds: [],
					}], cts.token);
					await started.p;
					cts.cancel();
					await finish.complete();
					const response = await result;
					assert.deepStrictEqual({
						response,
						updates: proxy.$applyTestRunUpdates.args.map(([, , updates]) => updates.value.map((update: TestRunUpdate) => update.type)),
						ended: proxy.$finishedTestRunTask.called,
					}, { response: [rejects ? { error: 'Error: handler failure' } : {}], updates: [['tests', 'messages', 'state', 'output']], ended: false });
					clock.tick(0);
					assert.strictEqual(proxy.$applyTestRunUpdates.callCount, 1);
				} finally {
					await finish.complete();
					run?.end();
					await ctrl.$disposeRun('run');
					clock.restore();
				}
			});
		}

		for (const invalidateAll of [false, true]) {
			test(`sends pending run updates before retiring ${invalidateAll ? 'all results' : 'specified tests'}`, async () => {
				const controller = ds.add(ctrl.createTestController(nullExtensionDescription, 'ctrl', 'tests'));
				const item = controller.createTestItem('test', 'test');
				controller.items.add(item);
				const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
				const runs = [controller.createTestRun(new TestRunRequestImpl()), controller.createTestRun(new TestRunRequestImpl())];
				try {
					const calls: string[] = [];
					proxy.$applyTestRunUpdates.callsFake(() => calls.push('updates'));
					proxy.$markTestRetired.callsFake(() => calls.push('retire'));
					runs[0].started(item);
					runs[1].passed(item, 1);
					controller.invalidateTestResults(invalidateAll ? undefined : [item]);
					assert.deepStrictEqual({ calls, ids: proxy.$markTestRetired.firstCall.args }, {
						calls: ['updates', 'updates', 'retire'],
						ids: [invalidateAll ? undefined : ['ctrl\0test']],
					});
					clock.tick(0);
					assert.deepStrictEqual(calls, ['updates', 'updates', 'retire']);
				} finally {
					for (const run of runs) {
						run.end();
					}
					for (const [run] of proxy.$startedExtensionTestRun.args) {
						await ctrl.$disposeRun(run.id);
					}
					clock.restore();
				}
			});
		}

		test('disposing an observer stops its events while another observer remains live', async () => {
			const retired = ds.add(ctrl.createTestObserver());
			const live = ds.add(ctrl.createTestObserver());
			let retiredChanges = 0;
			let liveChanges = 0;
			ds.add(retired.onDidChangeTest(() => retiredChanges++));
			ds.add(live.onDidChangeTest(() => liveChanges++));
			retired.dispose();
			retired.dispose();

			await single.expand(single.root.id, Infinity);
			ctrl.$acceptDiff(single.collectDiff().map(TestsDiffOp.serialize));
			assert.deepStrictEqual({ retiredChanges, liveChanges, roots: live.tests.map(test => test.label) }, { retiredChanges: 0, liveChanges: 1, roots: ['root'] });
		});

		test('subscribing to a disposed observer does not reattach its events', async () => {
			const retired = ds.add(ctrl.createTestObserver());
			const live = ds.add(ctrl.createTestObserver());
			retired.dispose();
			let changes = 0;
			ds.add(retired.onDidChangeTest(() => changes++));
			await single.expand(single.root.id, Infinity);
			ctrl.$acceptDiff(single.collectDiff().map(TestsDiffOp.serialize));
			assert.deepStrictEqual({ changes, roots: live.tests.map(test => test.label) }, { changes: 0, roots: ['root'] });
		});

		test('observer listeners can unsubscribe and subscribe again', async () => {
			const observer = ds.add(ctrl.createTestObserver());
			let removedChanges = 0;
			const subscription = ds.add(observer.onDidChangeTest(() => removedChanges++));
			subscription.dispose();
			await single.expand(single.root.id, Infinity);
			ctrl.$acceptDiff(single.collectDiff().map(TestsDiffOp.serialize));
			let currentChanges = 0;
			ds.add(observer.onDidChangeTest(() => currentChanges++));
			single.root.label = 'Updated root';
			ctrl.$acceptDiff(single.collectDiff().map(TestsDiffOp.serialize));
			assert.deepStrictEqual({ removedChanges, currentChanges, roots: observer.tests.map(test => test.label) }, { removedChanges: 0, currentChanges: 1, roots: ['Updated root'] });
		});

		test('a new observer starts a fresh collection after the last observer closes', async () => {
			const retired = ds.add(ctrl.createTestObserver());
			await single.expand(single.root.id, Infinity);
			const initialDiff = single.collectDiff().map(TestsDiffOp.serialize);
			ctrl.$acceptDiff(initialDiff);
			retired.dispose();
			const replacement = ds.add(ctrl.createTestObserver());
			const initialRoots = [...replacement.tests];
			let changes = 0;
			ds.add(replacement.onDidChangeTest(() => changes++));
			ctrl.$acceptDiff(initialDiff);
			assert.deepStrictEqual({ initialRoots, changes, roots: replacement.tests.map(test => test.label) }, { initialRoots: [], changes: 1, roots: ['root'] });
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
