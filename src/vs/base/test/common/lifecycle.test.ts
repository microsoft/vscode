/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../common/event.js';
import { DisposableStore, dispose, IDisposable, markAsSingleton, ReferenceCollection, thenIfNotDisposed, toDisposable } from '../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite, throwIfDisposablesAreLeaked } from './utils.js';

class Disposable implements IDisposable {
	isDisposed = false;
	dispose() { this.isDisposed = true; }
}

// Leaks are allowed here since we test lifecycle stuff:
// eslint-disable-next-line local/code-ensure-no-disposables-leak-in-test
suite('Lifecycle', () => {
	test('dispose single disposable', () => {
		const disposable = new Disposable();

		assert(!disposable.isDisposed);

		dispose(disposable);

		assert(disposable.isDisposed);
	});

	test('dispose disposable array', () => {
		const disposable = new Disposable();
		const disposable2 = new Disposable();

		assert(!disposable.isDisposed);
		assert(!disposable2.isDisposed);

		dispose([disposable, disposable2]);

		assert(disposable.isDisposed);
		assert(disposable2.isDisposed);
	});

	test('dispose disposables', () => {
		const disposable = new Disposable();
		const disposable2 = new Disposable();

		assert(!disposable.isDisposed);
		assert(!disposable2.isDisposed);

		dispose(disposable);
		dispose(disposable2);

		assert(disposable.isDisposed);
		assert(disposable2.isDisposed);
	});

	test('dispose array should dispose all if a child throws on dispose', () => {
		const disposedValues = new Set<number>();

		let thrownError: any;
		try {
			dispose([
				toDisposable(() => { disposedValues.add(1); }),
				toDisposable(() => { throw new Error('I am error'); }),
				toDisposable(() => { disposedValues.add(3); }),
			]);
		} catch (e) {
			thrownError = e;
		}

		assert.ok(disposedValues.has(1));
		assert.ok(disposedValues.has(3));
		assert.strictEqual(thrownError.message, 'I am error');
	});

	test('dispose array should rethrow composite error if multiple entries throw on dispose', () => {
		const disposedValues = new Set<number>();

		let thrownError: any;
		try {
			dispose([
				toDisposable(() => { disposedValues.add(1); }),
				toDisposable(() => { throw new Error('I am error 1'); }),
				toDisposable(() => { throw new Error('I am error 2'); }),
				toDisposable(() => { disposedValues.add(4); }),
			]);
		} catch (e) {
			thrownError = e;
		}

		assert.ok(disposedValues.has(1));
		assert.ok(disposedValues.has(4));
		assert.ok(thrownError instanceof AggregateError);
		assert.strictEqual((thrownError as AggregateError).errors.length, 2);
		assert.strictEqual((thrownError as AggregateError).errors[0].message, 'I am error 1');
		assert.strictEqual((thrownError as AggregateError).errors[1].message, 'I am error 2');
	});

	test('Action bar has broken accessibility #100273', function () {
		const array = [{ dispose() { } }, { dispose() { } }];
		const array2 = dispose(array);

		assert.strictEqual(array.length, 2);
		assert.strictEqual(array2.length, 0);
		assert.ok(array !== array2);

		const set = new Set<IDisposable>([{ dispose() { } }, { dispose() { } }]);
		const setValues = set.values();
		const setValues2 = dispose(setValues);
		assert.ok(setValues === setValues2);
	});
});

suite('DisposableStore', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('dispose should call all child disposes even if a child throws on dispose', () => {
		const disposedValues = new Set<number>();

		const store = new DisposableStore();
		store.add(toDisposable(() => { disposedValues.add(1); }));
		store.add(toDisposable(() => { throw new Error('I am error'); }));
		store.add(toDisposable(() => { disposedValues.add(3); }));

		let thrownError: any;
		try {
			store.dispose();
		} catch (e) {
			thrownError = e;
		}

		assert.ok(disposedValues.has(1));
		assert.ok(disposedValues.has(3));
		assert.strictEqual(thrownError.message, 'I am error');
	});

	test('dispose should throw composite error if multiple children throw on dispose', () => {
		const disposedValues = new Set<number>();

		const store = new DisposableStore();
		store.add(toDisposable(() => { disposedValues.add(1); }));
		store.add(toDisposable(() => { throw new Error('I am error 1'); }));
		store.add(toDisposable(() => { throw new Error('I am error 2'); }));
		store.add(toDisposable(() => { disposedValues.add(4); }));

		let thrownError: any;
		try {
			store.dispose();
		} catch (e) {
			thrownError = e;
		}

		assert.ok(disposedValues.has(1));
		assert.ok(disposedValues.has(4));
		assert.ok(thrownError instanceof AggregateError);
		assert.strictEqual((thrownError as AggregateError).errors.length, 2);
		assert.strictEqual((thrownError as AggregateError).errors[0].message, 'I am error 1');
		assert.strictEqual((thrownError as AggregateError).errors[1].message, 'I am error 2');
	});

	test('delete should evict and dispose of the disposables', () => {
		const disposedValues = new Set<number>();
		const disposables: IDisposable[] = [
			toDisposable(() => { disposedValues.add(1); }),
			toDisposable(() => { disposedValues.add(2); })
		];

		const store = new DisposableStore();
		store.add(disposables[0]);
		store.add(disposables[1]);

		store.delete(disposables[0]);

		assert.ok(disposedValues.has(1));
		assert.ok(!disposedValues.has(2));

		store.dispose();

		assert.ok(disposedValues.has(1));
		assert.ok(disposedValues.has(2));
	});

	test('deleteAndLeak should evict and not dispose of the disposables', () => {
		const disposedValues = new Set<number>();
		const disposables: IDisposable[] = [
			toDisposable(() => { disposedValues.add(1); }),
			toDisposable(() => { disposedValues.add(2); })
		];

		const store = new DisposableStore();
		store.add(disposables[0]);
		store.add(disposables[1]);

		store.deleteAndLeak(disposables[0]);

		assert.ok(!disposedValues.has(1));
		assert.ok(!disposedValues.has(2));

		store.dispose();

		assert.ok(!disposedValues.has(1));
		assert.ok(disposedValues.has(2));

		disposables[0].dispose();
	});
});

suite('Reference Collection', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	class Collection extends ReferenceCollection<number> {
		private _count = 0;
		get count() { return this._count; }
		protected createReferencedObject(key: string): number { this._count++; return key.length; }
		protected destroyReferencedObject(key: string, object: number): void { this._count--; }
	}

	test('simple', () => {
		const collection = new Collection();

		const ref1 = collection.acquire('test');
		assert(ref1);
		assert.strictEqual(ref1.object, 4);
		assert.strictEqual(collection.count, 1);
		ref1.dispose();
		assert.strictEqual(collection.count, 0);

		const ref2 = collection.acquire('test');
		const ref3 = collection.acquire('test');
		assert.strictEqual(ref2.object, ref3.object);
		assert.strictEqual(collection.count, 1);

		const ref4 = collection.acquire('monkey');
		assert.strictEqual(ref4.object, 6);
		assert.strictEqual(collection.count, 2);

		ref2.dispose();
		assert.strictEqual(collection.count, 2);

		ref3.dispose();
		assert.strictEqual(collection.count, 1);

		ref4.dispose();
		assert.strictEqual(collection.count, 0);
	});
});

function assertThrows(fn: () => void, test: (error: any) => void) {
	try {
		fn();
		assert.fail('Expected function to throw, but it did not.');
	} catch (e) {
		assert.ok(test(e));
	}
}

suite('No Leakage Utilities', () => {
	suite('throwIfDisposablesAreLeaked', () => {
		test('throws if an event subscription is not cleaned up', () => {
			const eventEmitter = new Emitter();

			assertThrows(() => {
				throwIfDisposablesAreLeaked(() => {
					eventEmitter.event(() => {
						// noop
					});
				}, false);
			}, e => e.message.indexOf('undisposed disposables') !== -1);
		});

		test('throws if a disposable is not disposed', () => {
			assertThrows(() => {
				throwIfDisposablesAreLeaked(() => {
					new DisposableStore();
				}, false);
			}, e => e.message.indexOf('undisposed disposables') !== -1);
		});

		test('does not throw if all event subscriptions are cleaned up', () => {
			const eventEmitter = new Emitter();
			throwIfDisposablesAreLeaked(() => {
				eventEmitter.event(() => {
					// noop
				}).dispose();
			});
		});

		test('does not throw if all disposables are disposed', () => {
			// This disposable is reported before the test and not tracked.
			toDisposable(() => { });

			throwIfDisposablesAreLeaked(() => {
				// This disposable is marked as singleton
				markAsSingleton(toDisposable(() => { }));

				// These disposables are also marked as singleton
				const disposableStore = new DisposableStore();
				disposableStore.add(toDisposable(() => { }));
				markAsSingleton(disposableStore);

				toDisposable(() => { }).dispose();
			});
		});
	});

	suite('ensureNoDisposablesAreLeakedInTest', () => {
		ensureNoDisposablesAreLeakedInTestSuite();

		test('Basic Test', () => {
			toDisposable(() => { }).dispose();
		});
	});

	suite('thenIfNotDisposed', () => {
		const store = ensureNoDisposablesAreLeakedInTestSuite();

		test('normal case', async () => {
			let called = false;
			store.add(thenIfNotDisposed(Promise.resolve(123), (result: number) => {
				assert.strictEqual(result, 123);
				called = true;
			}));

			await new Promise(resolve => setTimeout(resolve, 0));
			assert.strictEqual(called, true);
		});

		test('disposed before promise resolves', async () => {
			let called = false;
			const disposable = thenIfNotDisposed(Promise.resolve(123), () => {
				called = true;
			});

			disposable.dispose();
			await new Promise(resolve => setTimeout(resolve, 0));
			assert.strictEqual(called, false);
		});
	});
});
