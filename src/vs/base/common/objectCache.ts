/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../base/common/lifecycle.js';
import { ObservableDisposable, assertNotDisposed } from './observableDisposable.js';

/**
 * Generic cache for object instances. Guarantees to return only non-disposed
 * objects from the {@linkcode get} method. If a requested object is not yet
 * in the cache or is disposed already, the {@linkcode factory} callback is
 * called to create a new object.
 *
 * @throws if {@linkcode factory} callback returns a disposed object.
 *
 * ## Examples
 *
 * ```typescript
 * // a class that will be used as a cache key; the key can be of any
 * // non-nullable type, including primitives like `string` or `number`,
 * // but in this case we use an object pointer as a key
 * class KeyObject {}
 *
 * // a class for testing purposes
 * class TestObject extends ObservableDisposable {
 *   constructor(
 *     public readonly id: KeyObject,
 *   ) {}
 * };
 *
 * // create an object cache instance providing it a factory function that
 * // is responsible for creating new objects based on the provided key if
 * // the cache does not contain the requested object yet or an existing
 * // object is already disposed
 * const cache = new ObjectCache<TestObject, KeyObject>((key) => {
 *   // create a new test object based on the provided key
 *   return new TestObject(key);
 * });
 *
 * // create two keys
 * const key1 = new KeyObject();
 * const key2 = new KeyObject();
 *
 * // get an object from the cache by its key
 * const object1 = cache.get(key1); // returns a new test object
 *
 * // validate that the new object has the correct key
 * assert(
 *   object1.id === key1,
 *   'Object 1 must have correct ID.',
 * );
 *
 * // returns the same cached test object
 * const object2 = cache.get(key1);
 *
 * // validate that the same exact object is returned from the cache
 * assert(
 *   object1 === object2,
 *   'Object 2 the same cached object as object 1.',
 * );
 *
 * // returns a new test object
 * const object3 = cache.get(key2);
 *
 * // validate that the new object has the correct key
 * assert(
 *   object3.id === key2,
 *   'Object 3 must have correct ID.',
 * );
 *
 * assert(
 *   object3 !== object1,
 *   'Object 3 must be a new object.',
 * );
 * ```
 */
export class ObjectCache<
	TValue extends ObservableDisposable,
	TKey extends NonNullable<unknown> = string,
> extends Disposable {
	private readonly cache: DisposableMap<TKey, TValue> =
		this._register(new DisposableMap());

	constructor(
		private readonly factory: (key: TKey) => TValue & { disposed: false },
	) {
		super();
	}

	/**
	 * Get an existing object from the cache. If a requested object is not yet
	 * in the cache or is disposed already, the {@linkcode factory} callback is
	 * called to create a new object.
	 *
	 * @throws if {@linkcode factory} callback returns a disposed object.
	 * @param key - ID of the object in the cache
	 */
	public get(key: TKey): TValue & { disposed: false } {
		let object = this.cache.get(key);

		// if object is already disposed, remove it from the cache
		if (object?.disposed) {
			this.cache.deleteAndLeak(key);
			object = undefined;
		}

		// if object exists and is not disposed, return it
		if (object) {
			// must always hold true due to the check above
			assertNotDisposed(
				object,
				'Object must not be disposed.',
			);

			return object;
		}

		// create a new object by calling the factory
		object = this.factory(key);

		// newly created object must not be disposed
		assertNotDisposed(
			object,
			'Newly created object must not be disposed.',
		);

		// remove it from the cache automatically on dispose
		object.onDispose(() => {
			this.cache.deleteAndLeak(key);
		});
		this.cache.set(key, object);

		return object;
	}

	/**
	 * Remove an object from the cache by its key.
	 *
	 * @param key ID of the object to remove.
	 * @param dispose Whether the removed object must be disposed.
	 */
	public remove(key: TKey, dispose: boolean): this {
		if (dispose) {
			this.cache.deleteAndDispose(key);
			return this;
		}

		this.cache.deleteAndLeak(key);
		return this;
	}
}
