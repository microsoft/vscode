/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TNotDisposed, TrackedDisposable, assertNotDisposed } from '../../../../../base/common/trackedDisposable.js';

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
 * TODO: @legomushroom - move
 * TODO: @legomushroom - add examples
 * TODO: @legomushroom - add unit tests
 *
 * ```typescript
 * ```
 */
export class ObjectCache<
	TValue extends TrackedDisposable,
	TKey extends NonNullable<unknown> = string,
> extends Disposable {
	private readonly cache: DisposableMap<TKey, TValue> =
		this._register(new DisposableMap());

	constructor(
		private readonly factory: (key: TKey, initService: IInstantiationService) => TNotDisposed<TValue>,
		@IInstantiationService private readonly initService: IInstantiationService,
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
	public get(key: TKey): TNotDisposed<TValue> {
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
		object = this.factory(key, this.initService);

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
