/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ExtUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { TestId } from '../../common/testId.js';
import { MainThreadTestCollection } from '../../common/mainThreadTestCollection.js';
import { ITestService, simplifyTestsToExecute, testsInFile, waitForTestToBeIdle } from '../../common/testService.js';
import { TestDiffOpType, TestItemExpandState, TestsDiff } from '../../common/testTypes.js';
import { TestTestCollection, TestTestItem, getInitializedMainTestCollection, makeSimpleStubTree } from './testStubs.js';

suite('Workbench - Test Service', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	suite('simplifyTestsToExecute', () => {
		const tree1 = {
			a: {
				b1: {
					c1: {
						d: undefined
					},
					c2: {
						d: undefined
					},
				},
				b2: undefined,
			}
		} as const;

		test('noop on single item', async () => {
			const c = await getInitializedMainTestCollection(makeSimpleStubTree(tree1));

			const t = simplifyTestsToExecute(c, [
				c.getNodeById(new TestId(['ctrlId', 'a', 'b1']).toString())!
			]);

			assert.deepStrictEqual(t.map(t => t.item.extId.toString()), [
				new TestId(['ctrlId', 'a', 'b1']).toString()
			]);
		});

		test('goes to common root 1', async () => {
			const c = await getInitializedMainTestCollection(makeSimpleStubTree(tree1));

			const t = simplifyTestsToExecute(c, [
				c.getNodeById(new TestId(['ctrlId', 'a', 'b1', 'c1', 'd']).toString())!,
				c.getNodeById(new TestId(['ctrlId', 'a', 'b1', 'c2']).toString())!,
			]);

			assert.deepStrictEqual(t.map(t => t.item.extId.toString()), [
				new TestId(['ctrlId', 'a', 'b1']).toString()
			]);
		});

		test('goes to common root 2', async () => {
			const c = await getInitializedMainTestCollection(makeSimpleStubTree(tree1));

			const t = simplifyTestsToExecute(c, [
				c.getNodeById(new TestId(['ctrlId', 'a', 'b1', 'c1']).toString())!,
				c.getNodeById(new TestId(['ctrlId', 'a', 'b1']).toString())!,
			]);

			assert.deepStrictEqual(t.map(t => t.item.extId.toString()), [
				new TestId(['ctrlId', 'a', 'b1']).toString()
			]);
		});

		test('goes to common root 3', async () => {
			const c = await getInitializedMainTestCollection(makeSimpleStubTree(tree1));

			const t = simplifyTestsToExecute(c, [
				c.getNodeById(new TestId(['ctrlId', 'a', 'b1', 'c1', 'd']).toString())!,
				c.getNodeById(new TestId(['ctrlId', 'a', 'b1', 'c2']).toString())!,
			]);

			assert.deepStrictEqual(t.map(t => t.item.extId.toString()), [
				new TestId(['ctrlId', 'a', 'b1']).toString()
			]);
		});

		test('goes to common root 4', async () => {
			const c = await getInitializedMainTestCollection(makeSimpleStubTree(tree1));

			const t = simplifyTestsToExecute(c, [
				c.getNodeById(new TestId(['ctrlId', 'a', 'b2']).toString())!,
				c.getNodeById(new TestId(['ctrlId', 'a', 'b1']).toString())!,
			]);

			assert.deepStrictEqual(t.map(t => t.item.extId.toString()), [
				new TestId(['ctrlId']).toString()
			]);
		});

		test('no-op divergent trees', async () => {
			const c = await getInitializedMainTestCollection(makeSimpleStubTree(tree1));

			const t = simplifyTestsToExecute(c, [
				c.getNodeById(new TestId(['ctrlId', 'a', 'b1', 'c2']).toString())!,
				c.getNodeById(new TestId(['ctrlId', 'a', 'b2']).toString())!,
			]);

			assert.deepStrictEqual(t.map(t => t.item.extId.toString()), [
				new TestId(['ctrlId', 'a', 'b1', 'c2']).toString(),
				new TestId(['ctrlId', 'a', 'b2']).toString(),
			]);
		});
	});

	suite('testsInFile', () => {
		function createExpandableCollection(expand: () => Promise<void>) {
			const ident = upcastPartial<IUriIdentityService>({ asCanonicalUri: uri => uri, extUri: new ExtUri(() => false) });
			const collection = new MainThreadTestCollection(ident, expand);
			collection.apply([{
				op: TestDiffOpType.Add,
				item: {
					controllerId: 'ctrlId',
					expand: TestItemExpandState.Expandable,
					item: new TestTestItem(new TestId(['ctrlId']), 'root', URI.file('/workspace')).toTestItem(),
				},
			}]);
			const service = upcastPartial<ITestService>({ collection });
			return { ident, service, collection };
		}

		test('propagates expansion errors instead of reporting completed empty discovery', async () => {
			const { ident, service } = createExpandableCollection(async () => { throw new Error('Discovery failed'); });
			await assert.rejects(async () => {
				for await (const _batch of testsInFile(service, ident, URI.file('/workspace/test.ts'))) {
					assert.fail('failed discovery must not yield tests');
				}
			}, /Discovery failed/);
		});

		test('cancels an in-flight expansion without waiting for the provider', async () => {
			const started = new DeferredPromise<void>();
			const { ident, service } = createExpandableCollection(async () => {
				void started.complete();
				await new Promise<void>(() => { });
			});
			const token = ds.add(new CancellationTokenSource());
			const iterator = testsInFile(service, ident, URI.file('/workspace/test.ts'), true, false, token.token)[Symbol.asyncIterator]();
			const pending = iterator.next();
			await started.p;
			token.cancel();
			await assert.rejects(pending, CancellationError);
		});

		test('does not start discovery with a pre-cancelled token', async () => {
			let expanded = false;
			const { ident, service } = createExpandableCollection(async () => { expanded = true; });
			const iterator = testsInFile(service, ident, URI.file('/workspace/test.ts'), true, false, CancellationToken.Cancelled)[Symbol.asyncIterator]();
			await assert.rejects(iterator.next(), CancellationError);
			assert.strictEqual(expanded, false);
		});

		test('canonicalizes URI before comparing with stored test URIs (#275268)', async () => {
			const canonicalUri = URI.from({ scheme: 'vscode-remote', authority: 'wsl+Ubuntu', path: '/home/user/test.py' });
			const rawUri = URI.file('/home/user/test.py');
			const extUri = new ExtUri(() => false);

			// Build a collection where test items are stored with the canonical URI.
			const collection = new TestTestCollection();
			collection.resolveHandler = item => {
				if (item === undefined) {
					collection.root.children.add(new TestTestItem(new TestId(['ctrlId', 'test1']), 'test1', canonicalUri));
				}
			};
			const mainCollection = await getInitializedMainTestCollection(collection);

			// Mock IUriIdentityService: asCanonicalUri maps rawUri to canonicalUri,
			// simulating a remote environment where URI.file() produces a non-canonical form.
			const ident = upcastPartial<IUriIdentityService>({
				asCanonicalUri: (u: URI) => extUri.isEqual(u, rawUri) ? canonicalUri : u,
				extUri,
			});

			const testService = upcastPartial<ITestService>({
				collection: mainCollection,
			});

			const found: string[] = [];
			for await (const batch of testsInFile(testService, ident, rawUri, false)) {
				for (const item of batch) {
					found.push(item.item.extId);
				}
			}

			assert.deepStrictEqual(found, [new TestId(['ctrlId', 'test1']).toString()]);
		});

		test('indexes live diff-added tests by canonical URI and still finds them from raw URI input', async () => {
			const canonicalUri = URI.from({ scheme: 'vscode-remote', authority: 'wsl+Ubuntu', path: '/home/user/test.py' });
			const rawUri = URI.file('/home/user/test.py');
			const extUri = new ExtUri(() => false);

			const collection = new MainThreadTestCollection({
				asCanonicalUri: (u: URI) => u.toString() === rawUri.toString() ? canonicalUri : u,
			}, async () => { });

			const testId = new TestId(['ctrlId', 'test1']).toString();
			collection.apply([
				{
					op: TestDiffOpType.Add,
					item: {
						controllerId: 'ctrlId',
						expand: TestItemExpandState.NotExpandable,
						item: {
							extId: new TestId(['ctrlId']).toString(),
							label: 'root',
							tags: [],
							busy: false,
							uri: undefined,
							range: null,
							description: null,
							error: null,
							sortText: null,
						},
					}
				},
				{
					op: TestDiffOpType.Add,
					item: {
						controllerId: 'ctrlId',
						expand: TestItemExpandState.NotExpandable,
						item: {
							extId: testId,
							label: 'test1',
							tags: [],
							busy: false,
							uri: rawUri,
							range: null,
							description: null,
							error: null,
							sortText: null,
						},
					}
				}
			]);

			const added = collection.getNodeById(testId)!;
			assert.ok(extUri.isEqual(added.item.uri, canonicalUri), 'added test URI should be canonicalized on apply');
			assert.deepStrictEqual([...collection.getNodeByUrl(canonicalUri)].map(t => t.item.extId), [testId]);
			assert.deepStrictEqual([...collection.getNodeByUrl(rawUri)].map(t => t.item.extId), []);

			const ident = upcastPartial<IUriIdentityService>({
				asCanonicalUri: (u: URI) => extUri.isEqual(u, rawUri) ? canonicalUri : u,
				extUri,
			});

			const testService = upcastPartial<ITestService>({
				collection,
			});

			const found: string[] = [];
			for await (const batch of testsInFile(testService, ident, rawUri, false)) {
				for (const item of batch) {
					found.push(item.item.extId);
				}
			}

			assert.deepStrictEqual(found, [testId]);
		});

		suite('waitForTestToBeIdle', () => {
			async function createBusyTest() {
				const collection = await getInitializedMainTestCollection(makeSimpleStubTree({ a: undefined }));
				const test = collection.getNodeById(new TestId(['ctrlId', 'a']).toString())!;
				collection.apply([{ op: TestDiffOpType.Update, item: { extId: test.item.extId, item: { busy: true } } }]);
				const diffs = ds.add(new Emitter<TestsDiff>());
				const service = upcastPartial<ITestService>({ collection, onDidProcessDiff: diffs.event });
				return { collection, test, diffs, service };
			}

			test('releases its diff listener on cancellation', async () => {
				const { test, diffs, service } = await createBusyTest();
				const token = ds.add(new CancellationTokenSource());
				const pending = waitForTestToBeIdle(service, test, token.token);
				token.cancel();
				await assert.rejects(pending!, CancellationError);
				assert.strictEqual(diffs.hasListeners(), false);
			});

			test('preserves the default wait-until-idle behavior and releases its listener', async () => {
				const { collection, test, diffs, service } = await createBusyTest();
				const pending = waitForTestToBeIdle(service, test);
				const diff: TestsDiff = [{ op: TestDiffOpType.Update, item: { extId: test.item.extId, item: { busy: false } } }];
				collection.apply(diff);
				diffs.fire(diff);
				await pending;
				assert.strictEqual(diffs.hasListeners(), false);
			});

			test('releases its listener when the busy test is removed', async () => {
				const { collection, test, diffs, service } = await createBusyTest();
				const pending = waitForTestToBeIdle(service, test);
				const diff: TestsDiff = [{ op: TestDiffOpType.Remove, itemId: test.item.extId }];
				collection.apply(diff);
				diffs.fire(diff);
				await pending;
				assert.strictEqual(diffs.hasListeners(), false);
			});
		});
	});
});
