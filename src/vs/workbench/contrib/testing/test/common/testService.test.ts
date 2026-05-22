/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IExtUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { TestId } from '../../common/testId.js';
import { ITestService, simplifyTestsToExecute, testsInFile } from '../../common/testService.js';
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
				asCanonicalUri: (u: URI) => u.toString() === rawUri.toString() ? canonicalUri : u,
				extUri: upcastPartial<IExtUri>({
					isEqual: (a: URI, b: URI) => a.toString() === b.toString(),
					isEqualOrParent: (a: URI, b: URI) => a.toString() === b.toString(),
				}),
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
	});
});
