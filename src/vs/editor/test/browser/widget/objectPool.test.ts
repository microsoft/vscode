/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IObjectData, IPooledObject, ObjectPool } from '../../../browser/widget/multiDiffEditor/objectPool.js';

suite('MultiDiffEditorObjectPool', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('rebinds an unused object to new data', () => {
		let nextObjectId = 1;
		const pool = disposables.add(new ObjectPool<TestData, TestObject>(data => new TestObject(nextObjectId++, data)));
		const first = pool.getUnusedObj(new TestData('A'));
		const second = pool.getUnusedObj(new TestData('B'));
		const firstObject = first.object;
		first.dispose();

		const rebound = pool.getUnusedObj(new TestData('C'));

		assert.deepStrictEqual({
			reusedFirstObject: rebound.object === firstObject,
			objectId: rebound.object.id,
			dataId: rebound.object.data.id,
			setDataCalls: rebound.object.setDataCalls,
		}, {
			reusedFirstObject: true,
			objectId: 1,
			dataId: 'C',
			setDataCalls: 1,
		});

		second.dispose();
		rebound.dispose();
	});

	test('disposes objects beyond the unused cache limit', () => {
		const objects: TestObject[] = [];
		const pool = disposables.add(new ObjectPool<TestData, TestObject>(data => {
			const object = new TestObject(objects.length + 1, data);
			objects.push(object);
			return object;
		}));
		const references = Array.from({ length: 8 }, (_, index) => pool.getUnusedObj(new TestData(String(index))));

		for (const reference of references) {
			reference.dispose();
		}
		const disposedAfterRelease = objects.filter(object => object.disposed).length;
		pool.dispose();

		assert.deepStrictEqual({
			disposedAfterRelease,
			disposedAfterPoolDisposal: objects.filter(object => object.disposed).length,
		}, {
			disposedAfterRelease: 2,
			disposedAfterPoolDisposal: 8,
		});
	});
});

class TestData implements IObjectData {
	constructor(readonly id: string) { }

	getId(): unknown {
		return this.id;
	}
}

class TestObject extends Disposable implements IPooledObject<TestData> {
	setDataCalls = 0;
	disposed = false;

	constructor(
		readonly id: number,
		public data: TestData,
	) {
		super();
	}

	setData(data: TestData): void {
		this.data = data;
		this.setDataCalls++;
	}

	override dispose(): void {
		this.disposed = true;
		super.dispose();
	}
}
