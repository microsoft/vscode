/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy } from 'sinon';
import { ObjectCache } from '../../common/objectCache.js';
import { wait } from '../../../base/test/common/testUtils.js';
import { ObservableDisposable } from '../../common/observableDisposable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';

/**
 * Test object class.
 */
class TestObject<TKey extends NonNullable<unknown> = string> extends ObservableDisposable {
	constructor(
		public readonly ID: TKey,
	) {
		super();
	}

	/**
	 * Check if this object is equal to another one.
	 */
	public equal(other: TestObject<NonNullable<unknown>>): boolean {
		return this.ID === other.ID;
	}
}

suite('ObjectCache', function () {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	suite('get', () => {
		/**
		 * Common test funtion to test core logic of the cache
		 * with provider test ID keys of some specific type.
		 *
		 * @param key1 Test key1.
		 * @param key2 Test key2.
		 */
		const testCoreLogic = async <TKey extends NonNullable<unknown>>(key1: TKey, key2: TKey) => {
			const factory = spy((
				key: TKey,
			) => {
				const result: TestObject<TKey> = new TestObject(key);

				result.assertNotDisposed(
					'Object must not be disposed.',
				);

				return result;
			});

			const cache = disposables.add(new ObjectCache(factory));

			/**
			 * Test the core logic of the cache using 2 objects.
			 */

			const obj1 = cache.get(key1);
			assert(
				factory.calledOnceWithExactly(key1),
				'[obj1] Must be called once with the correct arguments.',
			);

			assert(
				obj1.ID === key1,
				'[obj1] Returned object must have the correct ID.',
			);

			const obj2 = cache.get(key1);
			assert(
				factory.calledOnceWithExactly(key1),
				'[obj2] Must be called once with the correct arguments.',
			);

			assert(
				obj2.ID === key1,
				'[obj2] Returned object must have the correct ID.',
			);

			assert(
				obj1 === obj2 && obj1.equal(obj2),
				'[obj2] Returned object must be the same instance.',
			);

			factory.resetHistory();

			const obj3 = cache.get(key2);
			assert(
				factory.calledOnceWithExactly(key2),
				'[obj3] Must be called once with the correct arguments.',
			);

			assert(
				obj3.ID === key2,
				'[obj3] Returned object must have the correct ID.',
			);

			factory.resetHistory();

			const obj4 = cache.get(key1);
			assert(
				factory.notCalled,
				'[obj4] Factory must not be called.',
			);

			assert(
				obj4.ID === key1,
				'[obj4] Returned object must have the correct ID.',
			);

			assert(
				obj1 === obj4 && obj1.equal(obj4),
				'[obj4] Returned object must be the same instance.',
			);

			factory.resetHistory();

			/**
			 * Now test that the object is removed automatically from
			 * the cache when it is disposed.
			 */

			obj3.dispose();
			// the object is removed from the cache asynchronously
			// so add a small delay to ensure the object is removed
			await wait(5);

			const obj5 = cache.get(key1);
			assert(
				factory.notCalled,
				'[obj5] Factory must not be called.',
			);

			assert(
				obj5.ID === key1,
				'[obj5] Returned object must have the correct ID.',
			);

			assert(
				obj1 === obj5 && obj1.equal(obj5),
				'[obj5] Returned object must be the same instance.',
			);

			factory.resetHistory();

			/**
			 * Test that the previously disposed object is recreated
			 * on the new retrieval call.
			 */

			const obj6 = cache.get(key2);
			assert(
				factory.calledOnceWithExactly(key2),
				'[obj6] Must be called once with the correct arguments.',
			);

			assert(
				obj6.ID === key2,
				'[obj6] Returned object must have the correct ID.',
			);
		};

		test('strings as keys', async function () {
			await testCoreLogic('key1', 'key2');
		});

		test('numbers as keys', async function () {
			await testCoreLogic(10, 17065);
		});

		test('objects as keys', async function () {
			await testCoreLogic(
				disposables.add(new TestObject({})),
				disposables.add(new TestObject({})),
			);
		});
	});

	suite('remove', () => {
		/**
		 * Common test funtion to test remove logic of the cache
		 * with provider test ID keys of some specific type.
		 *
		 * @param key1 Test key1.
		 * @param key2 Test key2.
		 */
		const testRemoveLogic = async <TKey extends NonNullable<unknown>>(
			key1: TKey,
			key2: TKey,
			disposeOnRemove: boolean,
		) => {
			const factory = spy((
				key: TKey,
			) => {
				const result: TestObject<TKey> = new TestObject(key);

				result.assertNotDisposed(
					'Object must not be disposed.',
				);

				return result;
			});

			// ObjectCache<TestObject<TKey>, TKey>
			const cache = disposables.add(new ObjectCache(factory));

			/**
			 * Test the core logic of the cache.
			 */

			const obj1 = cache.get(key1);
			assert(
				factory.calledOnceWithExactly(key1),
				'[obj1] Must be called once with the correct arguments.',
			);

			assert(
				obj1.ID === key1,
				'[obj1] Returned object must have the correct ID.',
			);

			factory.resetHistory();

			const obj2 = cache.get(key2);
			assert(
				factory.calledOnceWithExactly(key2),
				'[obj2] Must be called once with the correct arguments.',
			);

			assert(
				obj2.ID === key2,
				'[obj2] Returned object must have the correct ID.',
			);

			cache.remove(key2, disposeOnRemove);

			const object2Disposed = obj2.disposed;

			// ensure we don't leak undisposed object in the tests
			if (!obj2.disposed) {
				obj2.dispose();
			}

			assert(
				object2Disposed === disposeOnRemove,
				`[obj2] Removed object must be disposed: ${disposeOnRemove}.`,
			);

			factory.resetHistory();

			/**
			 * Validate that another object is not disposed.
			 */

			assert(
				!obj1.disposed,
				'[obj1] Object must not be disposed.',
			);

			const obj3 = cache.get(key1);
			assert(
				factory.notCalled,
				'[obj3] Factory must not be called.',
			);

			assert(
				obj3.ID === key1,
				'[obj3] Returned object must have the correct ID.',
			);

			assert(
				obj1 === obj3 && obj1.equal(obj3),
				'[obj3] Returned object must be the same instance.',
			);

			factory.resetHistory();
		};

		test('strings as keys', async function () {
			await testRemoveLogic('key1', 'key2', false);
			await testRemoveLogic('some-key', 'another-key', true);
		});

		test('numbers as keys', async function () {
			await testRemoveLogic(7, 2400700, false);
			await testRemoveLogic(1090, 2654, true);
		});

		test('objects as keys', async function () {
			await testRemoveLogic(
				disposables.add(new TestObject(1)),
				disposables.add(new TestObject(1)),
				false,
			);

			await testRemoveLogic(
				disposables.add(new TestObject(2)),
				disposables.add(new TestObject(2)),
				true,
			);
		});
	});

	test('throws if factory returns a disposed object', async function () {
		const factory = (
			key: string,
		) => {
			const result = new TestObject(key);

			if (key === 'key2') {
				result.dispose();
			}

			// caution! explicit type casting below!
			return result as TestObject<string> & { disposed: false };
		};

		// ObjectCache<TestObject>
		const cache = disposables.add(new ObjectCache(factory));

		assert.doesNotThrow(() => {
			cache.get('key1');
		});

		assert.throws(() => {
			cache.get('key2');
		});
	});
});
