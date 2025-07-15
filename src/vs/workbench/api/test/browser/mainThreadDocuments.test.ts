/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { BoundModelReferenceCollection } from '../../browser/mainThreadDocuments.js';
import { timeout } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { extUri } from '../../../../base/common/resources.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('BoundModelReferenceCollection', function () {

	let col: BoundModelReferenceCollection;

	setup(function () {
		col = new BoundModelReferenceCollection(extUri, 15, 75);
	});

	teardown(function () {
		col.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('max age', async function () {

		let didDispose = false;

		col.add(
			URI.parse('test://farboo'),
			{
				object: {},
				dispose() {
					didDispose = true;
				}
			});

		await timeout(30);
		assert.strictEqual(didDispose, true);
	});

	test('max size', function () {

		const disposed: number[] = [];

		col.add(
			URI.parse('test://farboo'),
			{
				object: {},
				dispose() {
					disposed.push(0);
				}
			}, 6);

		col.add(
			URI.parse('test://boofar'),
			{
				object: {},
				dispose() {
					disposed.push(1);
				}
			}, 6);

		col.add(
			URI.parse('test://xxxxxxx'),
			{
				object: {},
				dispose() {
					disposed.push(2);
				}
			}, 70);

		assert.deepStrictEqual(disposed, [0, 1]);
	});

	test('max count', function () {
		col.dispose();
		col = new BoundModelReferenceCollection(extUri, 10000, 10000, 2);

		const disposed: number[] = [];

		col.add(
			URI.parse('test://xxxxxxx'),
			{
				object: {},
				dispose() {
					disposed.push(0);
				}
			}
		);
		col.add(
			URI.parse('test://xxxxxxx'),
			{
				object: {},
				dispose() {
					disposed.push(1);
				}
			}
		);
		col.add(
			URI.parse('test://xxxxxxx'),
			{
				object: {},
				dispose() {
					disposed.push(2);
				}
			}
		);

		assert.deepStrictEqual(disposed, [0]);
	});

	test('dispose uri', function () {

		let disposed: number[] = [];

		col.add(
			URI.parse('test:///farboo'),
			{
				object: {},
				dispose() {
					disposed.push(0);
				}
			});

		col.add(
			URI.parse('test:///boofar'),
			{
				object: {},
				dispose() {
					disposed.push(1);
				}
			});

		col.add(
			URI.parse('test:///boo/far1'),
			{
				object: {},
				dispose() {
					disposed.push(2);
				}
			});

		col.add(
			URI.parse('test:///boo/far2'),
			{
				object: {},
				dispose() {
					disposed.push(3);
				}
			});

		col.add(
			URI.parse('test:///boo1/far'),
			{
				object: {},
				dispose() {
					disposed.push(4);
				}
			});

		col.remove(URI.parse('test:///unknown'));
		assert.strictEqual(disposed.length, 0);

		col.remove(URI.parse('test:///farboo'));
		assert.deepStrictEqual(disposed, [0]);

		disposed = [];

		col.remove(URI.parse('test:///boo'));
		assert.deepStrictEqual(disposed, [2, 3]);
	});

});
