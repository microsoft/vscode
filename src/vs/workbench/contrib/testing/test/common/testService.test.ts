/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ExtUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { TestId } from '../../common/testId.js';
import { MainThreadTestCollection } from '../../common/mainThreadTestCollection.js';
import { ITestService, simplifyTestsToExecute, testsInFile } from '../../common/testService.js';
import { TestDiffOpType, TestItemExpandState } from '../../common/testTypes.js';
import { TestTestCollection, TestTestItem, getInitializedMainTestCollection, makeSimpleStubTree } from './testStubs.js';

suite('Workbench - Test Service', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

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
	});
});
