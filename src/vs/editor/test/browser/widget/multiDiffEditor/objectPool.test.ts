/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ObjectPool, IObjectData, IPooledObject } from '../../../../browser/widget/multiDiffEditor/objectPool.js';

suite('ObjectPool', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	class Data implements IObjectData {
		constructor(readonly id: string) { }
		getId() { return this.id; }
	}

	class Obj implements IPooledObject<Data> {
		data: Data | undefined;
		disposed = false;
		setData(data: Data): void { this.data = data; }
		dispose(): void { this.disposed = true; }
	}

	test('reuses pooled object and updates data', () => {
		let created = 0;
		const pool = new ObjectPool<Data, Obj>((data) => {
			created++;
			const obj = new Obj();
			obj.setData(data);
			return obj;
		});

		const a = pool.getUnusedObj(new Data('a'));
		assert.strictEqual(a.object.data?.id, 'a');
		a.dispose();

		const b = pool.getUnusedObj(new Data('b'));
		assert.strictEqual(created, 1, 'should reuse pooled instance');
		assert.strictEqual(b.object.data?.id, 'b');
		assert.strictEqual(b.object.disposed, false);
		b.dispose();
		pool.dispose();
	});

	test('prefers object that previously had the same id', () => {
		const pool = new ObjectPool<Data, Obj>((data) => {
			const obj = new Obj();
			obj.setData(data);
			return obj;
		});

		const a1 = pool.getUnusedObj(new Data('a'));
		const b1 = pool.getUnusedObj(new Data('b'));
		a1.dispose();
		b1.dispose();

		const a2 = pool.getUnusedObj(new Data('a'));
		assert.strictEqual(a2.object.data?.id, 'a');
		// Same physical instance that previously served 'a'
		assert.strictEqual(a2.object, a1.object);
		a2.dispose();
		pool.dispose();
	});

	test('disposes overflow objects and drops item data', () => {
		const pool = new ObjectPool<Data, Obj>((data) => {
			const obj = new Obj();
			obj.setData(data);
			return obj;
		});

		const refs = [];
		for (let i = 0; i < 8; i++) {
			refs.push(pool.getUnusedObj(new Data(String(i))));
		}
		for (const ref of refs) {
			ref.dispose();
		}

		// Pool keeps at most 5 unused; the rest are disposed
		const again = pool.getUnusedObj(new Data('x'));
		assert.strictEqual(again.object.disposed, false);
		assert.strictEqual(again.object.data?.id, 'x');
		again.dispose();
		pool.dispose();
	});
});
