/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter, Event } from 'vs/base/common/event';
import { ISettableObservable, autorun, derived, ITransaction, observableFromEvent, observableValue, transaction, keepObserved } from 'vs/base/common/observable';
import { BaseObservable, IObservable, IObserver } from 'vs/base/common/observableInternal/base';

suite('observables', () => {
	/**
	 * Reads these tests to understand how to use observables.
	 */
	suite('tutorial', () => {
		test('observable + autorun', () => {
			const log = new Log();
			const myObservable = observableValue('myObservable', 0);

			autorun(reader => {
				/** @description myAutorun */
				log.log(`myAutorun.run(myObservable: ${myObservable.read(reader)})`);
			});
			// The autorun runs immediately
			assert.deepStrictEqual(log.getAndClearEntries(), ['myAutorun.run(myObservable: 0)']);

			myObservable.set(1, undefined);
			// The autorun runs again when any read observable changed
			assert.deepStrictEqual(log.getAndClearEntries(), ['myAutorun.run(myObservable: 1)']);

			myObservable.set(1, undefined);
			// But only if the value changed
			assert.deepStrictEqual(log.getAndClearEntries(), []);

			// Transactions batch autorun runs
			transaction((tx) => {
				myObservable.set(2, tx);
				// No auto-run ran yet, even though the value changed
				assert.deepStrictEqual(log.getAndClearEntries(), []);

				myObservable.set(3, tx);
				assert.deepStrictEqual(log.getAndClearEntries(), []);
			});
			// Only at the end of the transaction the autorun re-runs
			assert.deepStrictEqual(log.getAndClearEntries(), ['myAutorun.run(myObservable: 3)']);
		});

		test('computed + autorun', () => {
			const log = new Log();
			const observable1 = observableValue('myObservable1', 0);
			const observable2 = observableValue('myObservable2', 0);

			const myDerived = derived(reader => {
				/** @description myDerived */
				const value1 = observable1.read(reader);
				const value2 = observable2.read(reader);
				const sum = value1 + value2;
				log.log(`myDerived.recompute: ${value1} + ${value2} = ${sum}`);
				return sum;
			});

			autorun(reader => {
				/** @description myAutorun */
				log.log(`myAutorun(myDerived: ${myDerived.read(reader)})`);
			});
			// autorun runs immediately
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myDerived.recompute: 0 + 0 = 0",
				"myAutorun(myDerived: 0)",
			]);

			observable1.set(1, undefined);
			// and on changes...
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myDerived.recompute: 1 + 0 = 1",
				"myAutorun(myDerived: 1)",
			]);

			observable2.set(1, undefined);
			// ... of any dependency.
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myDerived.recompute: 1 + 1 = 2",
				"myAutorun(myDerived: 2)",
			]);

			transaction((tx) => {
				observable1.set(5, tx);
				assert.deepStrictEqual(log.getAndClearEntries(), []);

				observable2.set(5, tx);
				assert.deepStrictEqual(log.getAndClearEntries(), []);
			});
			// When changing multiple observables in a transaction,
			// deriveds are only recomputed on demand.
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myDerived.recompute: 5 + 5 = 10",
				"myAutorun(myDerived: 10)",
			]);

			transaction((tx) => {
				observable1.set(6, tx);
				assert.deepStrictEqual(log.getAndClearEntries(), []);

				observable2.set(4, tx);
				assert.deepStrictEqual(log.getAndClearEntries(), []);
			});
			// Now the autorun didn't run again, because its dependency changed from 10 to 10 (= no change).
			assert.deepStrictEqual(log.getAndClearEntries(), (["myDerived.recompute: 6 + 4 = 10"]));
		});

		test('read during transaction', () => {
			const log = new Log();
			const observable1 = observableValue('myObservable1', 0);
			const observable2 = observableValue('myObservable2', 0);

			const myDerived = derived((reader) => {
				/** @description myDerived */
				const value1 = observable1.read(reader);
				const value2 = observable2.read(reader);
				const sum = value1 + value2;
				log.log(`myDerived.recompute: ${value1} + ${value2} = ${sum}`);
				return sum;
			});

			autorun(reader => {
				/** @description myAutorun */
				log.log(`myAutorun(myDerived: ${myDerived.read(reader)})`);
			});
			// autorun runs immediately
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myDerived.recompute: 0 + 0 = 0",
				"myAutorun(myDerived: 0)",
			]);

			transaction((tx) => {
				observable1.set(-10, tx);
				assert.deepStrictEqual(log.getAndClearEntries(), []);

				myDerived.get(); // This forces a (sync) recomputation of the current value
				assert.deepStrictEqual(log.getAndClearEntries(), (["myDerived.recompute: -10 + 0 = -10"]));

				observable2.set(10, tx);
				assert.deepStrictEqual(log.getAndClearEntries(), []);
			});
			// This autorun runs again, because its dependency changed from 0 to -10 and then back to 0.
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myDerived.recompute: -10 + 10 = 0",
				"myAutorun(myDerived: 0)",
			]);
		});

		test('get without observers', () => {
			const log = new Log();
			const observable1 = observableValue('myObservableValue1', 0);
			const computed1 = derived((reader) => {
				/** @description computed */
				const value1 = observable1.read(reader);
				const result = value1 % 3;
				log.log(`recompute1: ${value1} % 3 = ${result}`);
				return result;
			});
			const computed2 = derived((reader) => {
				/** @description computed */
				const value1 = computed1.read(reader);
				const result = value1 * 2;
				log.log(`recompute2: ${value1} * 2 = ${result}`);
				return result;
			});
			const computed3 = derived((reader) => {
				/** @description computed */
				const value1 = computed1.read(reader);
				const result = value1 * 3;
				log.log(`recompute3: ${value1} * 3 = ${result}`);
				return result;
			});
			const computedSum = derived((reader) => {
				/** @description computed */
				const value1 = computed2.read(reader);
				const value2 = computed3.read(reader);
				const result = value1 + value2;
				log.log(`recompute4: ${value1} + ${value2} = ${result}`);
				return result;
			});
			assert.deepStrictEqual(log.getAndClearEntries(), []);

			observable1.set(1, undefined);
			assert.deepStrictEqual(log.getAndClearEntries(), []);

			log.log(`value: ${computedSum.get()}`);
			assert.deepStrictEqual(log.getAndClearEntries(), [
				'recompute1: 1 % 3 = 1',
				'recompute2: 1 * 2 = 2',
				'recompute3: 1 * 3 = 3',
				'recompute4: 2 + 3 = 5',
				'value: 5',
			]);

			log.log(`value: ${computedSum.get()}`);
			// Because there are no observers, the derived values are not cached, but computed from scratch.
			assert.deepStrictEqual(log.getAndClearEntries(), [
				'recompute1: 1 % 3 = 1',
				'recompute2: 1 * 2 = 2',
				'recompute3: 1 * 3 = 3',
				'recompute4: 2 + 3 = 5',
				'value: 5',
			]);

			const disposable = keepObserved(computedSum); // Use keepAlive to keep the cache
			log.log(`value: ${computedSum.get()}`);
			assert.deepStrictEqual(log.getAndClearEntries(), [
				'recompute1: 1 % 3 = 1',
				'recompute2: 1 * 2 = 2',
				'recompute3: 1 * 3 = 3',
				'recompute4: 2 + 3 = 5',
				'value: 5',
			]);

			log.log(`value: ${computedSum.get()}`);
			assert.deepStrictEqual(log.getAndClearEntries(), [
				'value: 5',
			]);

			observable1.set(2, undefined);
			// The keep alive does not force deriveds to be recomputed
			assert.deepStrictEqual(log.getAndClearEntries(), ([]));

			log.log(`value: ${computedSum.get()}`);
			// Those deriveds are recomputed on demand
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"recompute1: 2 % 3 = 2",
				"recompute2: 2 * 2 = 4",
				"recompute3: 2 * 3 = 6",
				"recompute4: 4 + 6 = 10",
				"value: 10",
			]);
			log.log(`value: ${computedSum.get()}`);
			// ... and then cached again
			assert.deepStrictEqual(log.getAndClearEntries(), (["value: 10"]));

			disposable.dispose(); // Don't forget to dispose the keepAlive to prevent memory leaks

			log.log(`value: ${computedSum.get()}`);
			// Which disables the cache again
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"recompute1: 2 % 3 = 2",
				"recompute2: 2 * 2 = 4",
				"recompute3: 2 * 3 = 6",
				"recompute4: 4 + 6 = 10",
				"value: 10",
			]);

			log.log(`value: ${computedSum.get()}`);
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"recompute1: 2 % 3 = 2",
				"recompute2: 2 * 2 = 4",
				"recompute3: 2 * 3 = 6",
				"recompute4: 4 + 6 = 10",
				"value: 10",
			]);
		});
	});

	test('topological order', () => {
		const log = new Log();
		const myObservable1 = observableValue('myObservable1', 0);
		const myObservable2 = observableValue('myObservable2', 0);

		const myComputed1 = derived(reader => {
			/** @description myComputed1 */
			const value1 = myObservable1.read(reader);
			const value2 = myObservable2.read(reader);
			const sum = value1 + value2;
			log.log(`myComputed1.recompute(myObservable1: ${value1} + myObservable2: ${value2} = ${sum})`);
			return sum;
		});

		const myComputed2 = derived(reader => {
			/** @description myComputed2 */
			const value1 = myComputed1.read(reader);
			const value2 = myObservable1.read(reader);
			const value3 = myObservable2.read(reader);
			const sum = value1 + value2 + value3;
			log.log(`myComputed2.recompute(myComputed1: ${value1} + myObservable1: ${value2} + myObservable2: ${value3} = ${sum})`);
			return sum;
		});

		const myComputed3 = derived(reader => {
			/** @description myComputed3 */
			const value1 = myComputed2.read(reader);
			const value2 = myObservable1.read(reader);
			const value3 = myObservable2.read(reader);
			const sum = value1 + value2 + value3;
			log.log(`myComputed3.recompute(myComputed2: ${value1} + myObservable1: ${value2} + myObservable2: ${value3} = ${sum})`);
			return sum;
		});

		autorun(reader => {
			/** @description myAutorun */
			log.log(`myAutorun.run(myComputed3: ${myComputed3.read(reader)})`);
		});
		assert.deepStrictEqual(log.getAndClearEntries(), [
			"myComputed1.recompute(myObservable1: 0 + myObservable2: 0 = 0)",
			"myComputed2.recompute(myComputed1: 0 + myObservable1: 0 + myObservable2: 0 = 0)",
			"myComputed3.recompute(myComputed2: 0 + myObservable1: 0 + myObservable2: 0 = 0)",
			"myAutorun.run(myComputed3: 0)",
		]);

		myObservable1.set(1, undefined);
		assert.deepStrictEqual(log.getAndClearEntries(), [
			"myComputed1.recompute(myObservable1: 1 + myObservable2: 0 = 1)",
			"myComputed2.recompute(myComputed1: 1 + myObservable1: 1 + myObservable2: 0 = 2)",
			"myComputed3.recompute(myComputed2: 2 + myObservable1: 1 + myObservable2: 0 = 3)",
			"myAutorun.run(myComputed3: 3)",
		]);

		transaction((tx) => {
			myObservable1.set(2, tx);
			myComputed2.get();
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myComputed1.recompute(myObservable1: 2 + myObservable2: 0 = 2)",
				"myComputed2.recompute(myComputed1: 2 + myObservable1: 2 + myObservable2: 0 = 4)",
			]);

			myObservable1.set(3, tx);
			myComputed2.get();
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myComputed1.recompute(myObservable1: 3 + myObservable2: 0 = 3)",
				"myComputed2.recompute(myComputed1: 3 + myObservable1: 3 + myObservable2: 0 = 6)",
			]);
		});
		assert.deepStrictEqual(log.getAndClearEntries(), [
			"myComputed3.recompute(myComputed2: 6 + myObservable1: 3 + myObservable2: 0 = 9)",
			"myAutorun.run(myComputed3: 9)",
		]);
	});

	suite('from event', () => {

		function init(): { log: Log; setValue: (value: number | undefined) => void; observable: IObservable<number | undefined> } {
			const log = new Log();

			let value: number | undefined = 0;
			const eventEmitter = new Emitter<void>();

			let id = 0;
			const observable = observableFromEvent(
				(handler) => {
					const curId = id++;
					log.log(`subscribed handler ${curId}`);
					const disposable = eventEmitter.event(handler);

					return {
						dispose: () => {
							log.log(`unsubscribed handler ${curId}`);
							disposable.dispose();
						},
					};
				},
				() => {
					log.log(`compute value ${value}`);
					return value;
				}
			);

			return {
				log,
				setValue: (newValue) => {
					value = newValue;
					eventEmitter.fire();
				},
				observable,
			};
		}

		test('Handle undefined', () => {
			const { log, setValue, observable } = init();

			setValue(undefined);

			const autorunDisposable = autorun(reader => {
				/** @description MyAutorun */
				observable.read(reader);
				log.log(
					`autorun, value: ${observable.read(reader)}`
				);
			});

			assert.deepStrictEqual(log.getAndClearEntries(), [
				"subscribed handler 0",
				"compute value undefined",
				"autorun, value: undefined",
			]);

			setValue(1);

			assert.deepStrictEqual(log.getAndClearEntries(), [
				"compute value 1",
				"autorun, value: 1"
			]);

			autorunDisposable.dispose();

			assert.deepStrictEqual(log.getAndClearEntries(), [
				"unsubscribed handler 0"
			]);
		});

		test('basic', () => {
			const { log, setValue, observable } = init();

			const shouldReadObservable = observableValue('shouldReadObservable', true);

			const autorunDisposable = autorun(reader => {
				/** @description MyAutorun */
				if (shouldReadObservable.read(reader)) {
					observable.read(reader);
					log.log(
						`autorun, should read: true, value: ${observable.read(reader)}`
					);
				} else {
					log.log(`autorun, should read: false`);
				}
			});
			assert.deepStrictEqual(log.getAndClearEntries(), [
				'subscribed handler 0',
				'compute value 0',
				'autorun, should read: true, value: 0',
			]);

			// Cached get
			log.log(`get value: ${observable.get()}`);
			assert.deepStrictEqual(log.getAndClearEntries(), ['get value: 0']);

			setValue(1);
			// Trigger autorun, no unsub/sub
			assert.deepStrictEqual(log.getAndClearEntries(), [
				'compute value 1',
				'autorun, should read: true, value: 1',
			]);

			// Unsubscribe when not read
			shouldReadObservable.set(false, undefined);
			assert.deepStrictEqual(log.getAndClearEntries(), [
				'autorun, should read: false',
				'unsubscribed handler 0',
			]);

			shouldReadObservable.set(true, undefined);
			assert.deepStrictEqual(log.getAndClearEntries(), [
				'subscribed handler 1',
				'compute value 1',
				'autorun, should read: true, value: 1',
			]);

			autorunDisposable.dispose();
			assert.deepStrictEqual(log.getAndClearEntries(), [
				'unsubscribed handler 1',
			]);
		});

		test('get without observers', () => {
			const { log, observable } = init();
			assert.deepStrictEqual(log.getAndClearEntries(), []);

			log.log(`get value: ${observable.get()}`);
			// Not cached or subscribed
			assert.deepStrictEqual(log.getAndClearEntries(), [
				'compute value 0',
				'get value: 0',
			]);

			log.log(`get value: ${observable.get()}`);
			// Still not cached or subscribed
			assert.deepStrictEqual(log.getAndClearEntries(), [
				'compute value 0',
				'get value: 0',
			]);
		});
	});

	test('reading derived in transaction unsubscribes unnecessary observables', () => {
		const log = new Log();

		const shouldReadObservable = observableValue('shouldReadMyObs1', true);
		const myObs1 = new LoggingObservableValue('myObs1', 0, log);
		const myComputed = derived(reader => {
			/** @description myComputed */
			log.log('myComputed.recompute');
			if (shouldReadObservable.read(reader)) {
				return myObs1.read(reader);
			}
			return 1;
		});
		autorun(reader => {
			/** @description myAutorun */
			const value = myComputed.read(reader);
			log.log(`myAutorun: ${value}`);
		});
		assert.deepStrictEqual(log.getAndClearEntries(), [
			"myComputed.recompute",
			"myObs1.firstObserverAdded",
			"myObs1.get",
			"myAutorun: 0",
		]);

		transaction(tx => {
			myObs1.set(1, tx);
			assert.deepStrictEqual(log.getAndClearEntries(), (["myObs1.set (value 1)"]));

			shouldReadObservable.set(false, tx);
			assert.deepStrictEqual(log.getAndClearEntries(), ([]));

			myComputed.get();
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myComputed.recompute",
				"myObs1.lastObserverRemoved",
			]);
		});
		assert.deepStrictEqual(log.getAndClearEntries(), (["myAutorun: 1"]));
	});

	test('avoid recomputation of deriveds that are no longer read', () => {
		const log = new Log();

		const myObsShouldRead = new LoggingObservableValue('myObsShouldRead', true, log);
		const myObs1 = new LoggingObservableValue('myObs1', 0, log);

		const myComputed1 = derived(reader => {
			/** @description myComputed1 */
			const myObs1Val = myObs1.read(reader);
			const result = myObs1Val % 10;
			log.log(`myComputed1(myObs1: ${myObs1Val}): Computed ${result}`);
			return myObs1Val;
		});

		autorun(reader => {
			/** @description myAutorun */
			const shouldRead = myObsShouldRead.read(reader);
			if (shouldRead) {
				const v = myComputed1.read(reader);
				log.log(`myAutorun(shouldRead: true, myComputed1: ${v}): run`);
			} else {
				log.log(`myAutorun(shouldRead: false): run`);
			}
		});
		assert.deepStrictEqual(log.getAndClearEntries(), [
			"myObsShouldRead.firstObserverAdded",
			"myObsShouldRead.get",
			"myObs1.firstObserverAdded",
			"myObs1.get",
			"myComputed1(myObs1: 0): Computed 0",
			"myAutorun(shouldRead: true, myComputed1: 0): run",
		]);

		transaction(tx => {
			myObsShouldRead.set(false, tx);
			myObs1.set(1, tx);
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myObsShouldRead.set (value false)",
				"myObs1.set (value 1)",
			]);
		});
		// myComputed1 should not be recomputed here, even though its dependency myObs1 changed!
		assert.deepStrictEqual(log.getAndClearEntries(), [
			"myObsShouldRead.get",
			"myAutorun(shouldRead: false): run",
			"myObs1.lastObserverRemoved",
		]);

		transaction(tx => {
			myObsShouldRead.set(true, tx);
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myObsShouldRead.set (value true)",
			]);
		});
		assert.deepStrictEqual(log.getAndClearEntries(), [
			"myObsShouldRead.get",
			"myObs1.firstObserverAdded",
			"myObs1.get",
			"myComputed1(myObs1: 1): Computed 1",
			"myAutorun(shouldRead: true, myComputed1: 1): run",
		]);
	});

	suite('autorun rerun on neutral change', () => {
		test('autorun reruns on neutral observable double change', () => {
			const log = new Log();
			const myObservable = observableValue('myObservable', 0);

			autorun(reader => {
				/** @description myAutorun */
				log.log(`myAutorun.run(myObservable: ${myObservable.read(reader)})`);
			});
			assert.deepStrictEqual(log.getAndClearEntries(), ['myAutorun.run(myObservable: 0)']);


			transaction((tx) => {
				myObservable.set(2, tx);
				assert.deepStrictEqual(log.getAndClearEntries(), []);

				myObservable.set(0, tx);
				assert.deepStrictEqual(log.getAndClearEntries(), []);
			});
			assert.deepStrictEqual(log.getAndClearEntries(), ['myAutorun.run(myObservable: 0)']);
		});

		test('autorun does not rerun on indirect neutral observable double change', () => {
			const log = new Log();
			const myObservable = observableValue('myObservable', 0);
			const myDerived = derived(reader => {
				/** @description myDerived */
				const val = myObservable.read(reader);
				log.log(`myDerived.read(myObservable: ${val})`);
				return val;
			});

			autorun(reader => {
				/** @description myAutorun */
				log.log(`myAutorun.run(myDerived: ${myDerived.read(reader)})`);
			});
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myDerived.read(myObservable: 0)",
				"myAutorun.run(myDerived: 0)"
			]);

			transaction((tx) => {
				myObservable.set(2, tx);
				assert.deepStrictEqual(log.getAndClearEntries(), []);

				myObservable.set(0, tx);
				assert.deepStrictEqual(log.getAndClearEntries(), []);
			});
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myDerived.read(myObservable: 0)"
			]);
		});

		test('autorun reruns on indirect neutral observable double change when changes propagate', () => {
			const log = new Log();
			const myObservable = observableValue('myObservable', 0);
			const myDerived = derived(reader => {
				/** @description myDerived */
				const val = myObservable.read(reader);
				log.log(`myDerived.read(myObservable: ${val})`);
				return val;
			});

			autorun(reader => {
				/** @description myAutorun */
				log.log(`myAutorun.run(myDerived: ${myDerived.read(reader)})`);
			});
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myDerived.read(myObservable: 0)",
				"myAutorun.run(myDerived: 0)"
			]);

			transaction((tx) => {
				myObservable.set(2, tx);
				assert.deepStrictEqual(log.getAndClearEntries(), []);

				myDerived.get(); // This marks the auto-run as changed
				assert.deepStrictEqual(log.getAndClearEntries(), [
					"myDerived.read(myObservable: 2)"
				]);

				myObservable.set(0, tx);
				assert.deepStrictEqual(log.getAndClearEntries(), []);
			});
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myDerived.read(myObservable: 0)",
				"myAutorun.run(myDerived: 0)"
			]);
		});
	});

	test('self-disposing autorun', () => {
		const log = new Log();

		const observable1 = new LoggingObservableValue('myObservable1', 0, log);
		const myObservable2 = new LoggingObservableValue('myObservable2', 0, log);
		const myObservable3 = new LoggingObservableValue('myObservable3', 0, log);

		const d = autorun(reader => {
			/** @description autorun */
			if (observable1.read(reader) >= 2) {
				assert.deepStrictEqual(log.getAndClearEntries(), [
					"myObservable1.set (value 2)",
					"myObservable1.get",
				]);

				myObservable2.read(reader);
				// First time this observable is read
				assert.deepStrictEqual(log.getAndClearEntries(), [
					"myObservable2.firstObserverAdded",
					"myObservable2.get",
				]);

				d.dispose();
				// Disposing removes all observers
				assert.deepStrictEqual(log.getAndClearEntries(), [
					"myObservable1.lastObserverRemoved",
					"myObservable2.lastObserverRemoved",
				]);

				myObservable3.read(reader);
				// This does not subscribe the observable, because the autorun is disposed
				assert.deepStrictEqual(log.getAndClearEntries(), [
					"myObservable3.get",
				]);
			}
		});
		assert.deepStrictEqual(log.getAndClearEntries(), [
			'myObservable1.firstObserverAdded',
			'myObservable1.get',
		]);

		observable1.set(1, undefined);
		assert.deepStrictEqual(log.getAndClearEntries(), [
			'myObservable1.set (value 1)',
			'myObservable1.get',
		]);

		observable1.set(2, undefined);
		// See asserts in the autorun
		assert.deepStrictEqual(log.getAndClearEntries(), ([]));
	});

	test('changing observables in endUpdate', () => {
		const log = new Log();

		const myObservable1 = new LoggingObservableValue('myObservable1', 0, log);
		const myObservable2 = new LoggingObservableValue('myObservable2', 0, log);

		const myDerived1 = derived(reader => {
			/** @description myDerived1 */
			const val = myObservable1.read(reader);
			log.log(`myDerived1.read(myObservable: ${val})`);
			return val;
		});

		const myDerived2 = derived(reader => {
			/** @description myDerived2 */
			const val = myObservable2.read(reader);
			if (val === 1) {
				myDerived1.read(reader);
			}
			log.log(`myDerived2.read(myObservable: ${val})`);
			return val;
		});

		autorun(reader => {
			/** @description myAutorun */
			const myDerived1Val = myDerived1.read(reader);
			const myDerived2Val = myDerived2.read(reader);
			log.log(`myAutorun.run(myDerived1: ${myDerived1Val}, myDerived2: ${myDerived2Val})`);
		});

		transaction(tx => {
			myObservable2.set(1, tx);
			// end update of this observable will trigger endUpdate of myDerived1 and
			// the autorun and the autorun will add myDerived2 as observer to myDerived1
			myObservable1.set(1, tx);
		});
	});

	test('set dependency in derived', () => {
		const log = new Log();

		const myObservable = new LoggingObservableValue('myObservable', 0, log);
		const myComputed = derived(reader => {
			/** @description myComputed */
			let value = myObservable.read(reader);
			const origValue = value;
			log.log(`myComputed(myObservable: ${origValue}): start computing`);
			if (value % 3 !== 0) {
				value++;
				myObservable.set(value, undefined);
			}
			log.log(`myComputed(myObservable: ${origValue}): finished computing`);
			return value;
		});

		autorun(reader => {
			/** @description myAutorun */
			const value = myComputed.read(reader);
			log.log(`myAutorun(myComputed: ${value})`);
		});
		assert.deepStrictEqual(log.getAndClearEntries(), [
			"myObservable.firstObserverAdded",
			"myObservable.get",
			"myComputed(myObservable: 0): start computing",
			"myComputed(myObservable: 0): finished computing",
			"myAutorun(myComputed: 0)"
		]);

		myObservable.set(1, undefined);
		assert.deepStrictEqual(log.getAndClearEntries(), [
			"myObservable.set (value 1)",
			"myObservable.get",
			"myComputed(myObservable: 1): start computing",
			"myObservable.set (value 2)",
			"myComputed(myObservable: 1): finished computing",
			"myObservable.get",
			"myComputed(myObservable: 2): start computing",
			"myObservable.set (value 3)",
			"myComputed(myObservable: 2): finished computing",
			"myObservable.get",
			"myComputed(myObservable: 3): start computing",
			"myComputed(myObservable: 3): finished computing",
			"myAutorun(myComputed: 3)",
		]);
	});

	test('set dependency in autorun', () => {
		const log = new Log();
		const myObservable = new LoggingObservableValue('myObservable', 0, log);

		autorun(reader => {
			/** @description myAutorun */
			const value = myObservable.read(reader);
			log.log(`myAutorun(myObservable: ${value}): start`);
			if (value !== 0 && value < 4) {
				myObservable.set(value + 1, undefined);
			}
			log.log(`myAutorun(myObservable: ${value}): end`);
		});
		assert.deepStrictEqual(log.getAndClearEntries(), [
			"myObservable.firstObserverAdded",
			"myObservable.get",
			"myAutorun(myObservable: 0): start",
			"myAutorun(myObservable: 0): end",
		]);

		myObservable.set(1, undefined);
		assert.deepStrictEqual(log.getAndClearEntries(), [
			"myObservable.set (value 1)",
			"myObservable.get",
			"myAutorun(myObservable: 1): start",
			"myObservable.set (value 2)",
			"myAutorun(myObservable: 1): end",
			"myObservable.get",
			"myAutorun(myObservable: 2): start",
			"myObservable.set (value 3)",
			"myAutorun(myObservable: 2): end",
			"myObservable.get",
			"myAutorun(myObservable: 3): start",
			"myObservable.set (value 4)",
			"myAutorun(myObservable: 3): end",
			"myObservable.get",
			"myAutorun(myObservable: 4): start",
			"myAutorun(myObservable: 4): end",
		]);
	});

	test('get in transaction between sets', () => {
		const log = new Log();
		const myObservable = new LoggingObservableValue('myObservable', 0, log);

		const myDerived1 = derived(reader => {
			/** @description myDerived1 */
			const value = myObservable.read(reader);
			log.log(`myDerived1(myObservable: ${value}): start computing`);
			return value;
		});

		const myDerived2 = derived(reader => {
			/** @description myDerived2 */
			const value = myDerived1.read(reader);
			log.log(`myDerived2(myDerived1: ${value}): start computing`);
			return value;
		});

		autorun(reader => {
			/** @description myAutorun */
			const value = myDerived2.read(reader);
			log.log(`myAutorun(myDerived2: ${value})`);
		});
		assert.deepStrictEqual(log.getAndClearEntries(), [
			"myObservable.firstObserverAdded",
			"myObservable.get",
			"myDerived1(myObservable: 0): start computing",
			"myDerived2(myDerived1: 0): start computing",
			"myAutorun(myDerived2: 0)",
		]);

		transaction(tx => {
			myObservable.set(1, tx);
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myObservable.set (value 1)",
			]);

			myDerived2.get();
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myObservable.get",
				"myDerived1(myObservable: 1): start computing",
				"myDerived2(myDerived1: 1): start computing",
			]);

			myObservable.set(2, tx);
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myObservable.set (value 2)",
			]);
		});
		assert.deepStrictEqual(log.getAndClearEntries(), [
			"myObservable.get",
			"myDerived1(myObservable: 2): start computing",
			"myDerived2(myDerived1: 2): start computing",
			"myAutorun(myDerived2: 2)",
		]);
	});

	test('bug: Dont reset states', () => {
		const log = new Log();
		const myObservable1 = new LoggingObservableValue('myObservable1', 0, log);

		const myObservable2 = new LoggingObservableValue('myObservable2', 0, log);
		const myDerived2 = derived(reader => {
			/** @description myDerived2 */
			const val = myObservable2.read(reader);
			log.log(`myDerived2.computed(myObservable2: ${val})`);
			return val % 10;
		});

		const myDerived3 = derived(reader => {
			/** @description myDerived3 */
			const val1 = myObservable1.read(reader);
			const val2 = myDerived2.read(reader);
			log.log(`myDerived3.computed(myDerived1: ${val1}, myDerived2: ${val2})`);
			return `${val1} + ${val2}`;
		});

		autorun(reader => {
			/** @description myAutorun */
			const val = myDerived3.read(reader);
			log.log(`myAutorun(myDerived3: ${val})`);
		});
		assert.deepStrictEqual(log.getAndClearEntries(), [
			"myObservable1.firstObserverAdded",
			"myObservable1.get",
			"myObservable2.firstObserverAdded",
			"myObservable2.get",
			"myDerived2.computed(myObservable2: 0)",
			"myDerived3.computed(myDerived1: 0, myDerived2: 0)",
			"myAutorun(myDerived3: 0 + 0)",
		]);

		transaction(tx => {
			myObservable1.set(1, tx); // Mark myDerived 3 as stale
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myObservable1.set (value 1)",
			]);

			myObservable2.set(10, tx); // This is a non-change. myDerived3 should not be marked as possibly-depedency-changed!
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myObservable2.set (value 10)",
			]);
		});
		assert.deepStrictEqual(log.getAndClearEntries(), [
			"myObservable1.get",
			"myObservable2.get",
			"myDerived2.computed(myObservable2: 10)",
			'myDerived3.computed(myDerived1: 1, myDerived2: 0)',
			'myAutorun(myDerived3: 1 + 0)',
		]);
	});

	test('bug: Add observable in endUpdate', () => {
		const myObservable1 = observableValue('myObservable1', 0);
		const myObservable2 = observableValue('myObservable2', 0);

		const myDerived1 = derived(reader => {
			/** @description myDerived1 */
			return myObservable1.read(reader);
		});

		const myDerived2 = derived(reader => {
			/** @description myDerived2 */
			return myObservable2.read(reader);
		});

		const myDerivedA1 = derived(reader => /** @description myDerivedA1 */ {
			const d1 = myDerived1.read(reader);
			if (d1 === 1) {
				// This adds an observer while myDerived is still in update mode.
				// When myDerived exits update mode, the observer shouldn't receive
				// more endUpdate than beginUpdate calls.
				myDerived2.read(reader);
			}
		});

		autorun(reader => {
			/** @description myAutorun1 */
			myDerivedA1.read(reader);
		});

		autorun(reader => {
			/** @description myAutorun2 */
			myDerived2.read(reader);
		});

		transaction(tx => {
			myObservable1.set(1, tx);
			myObservable2.set(1, tx);
		});
	});

	test('bug: fromObservableLight doesnt subscribe', () => {
		const log = new Log();
		const myObservable = new LoggingObservableValue('myObservable', 0, log);

		const myDerived = derived(reader => /** @description myDerived */ {
			const val = myObservable.read(reader);
			log.log(`myDerived.computed(myObservable2: ${val})`);
			return val % 10;
		});

		const e = Event.fromObservableLight(myDerived);
		log.log('event created');
		e(() => {
			log.log('event fired');
		});

		myObservable.set(1, undefined);

		assert.deepStrictEqual(log.getAndClearEntries(), [
			'event created',
			'myObservable.firstObserverAdded',
			'myObservable.get',
			'myDerived.computed(myObservable2: 0)',
			'myObservable.set (value 1)',
			'myObservable.get',
			'myDerived.computed(myObservable2: 1)',
			'event fired',
		]);
	});

	test('dont run autorun after dispose', () => {
		const log = new Log();
		const myObservable = new LoggingObservableValue('myObservable', 0, log);

		const d = autorun(reader => {
			/** @description update */
			const v = myObservable.read(reader);
			log.log('autorun, myObservable:' + v);
		});

		transaction(tx => {
			myObservable.set(1, tx);
			d.dispose();
		});

		assert.deepStrictEqual(log.getAndClearEntries(), [
			'myObservable.firstObserverAdded',
			'myObservable.get',
			'autorun, myObservable:0',
			'myObservable.set (value 1)',
			'myObservable.lastObserverRemoved',
		]);
	});
});

export class LoggingObserver implements IObserver {
	private count = 0;

	constructor(public readonly debugName: string, private readonly log: Log) {
	}

	beginUpdate<T>(observable: IObservable<T, void>): void {
		this.count++;
		this.log.log(`${this.debugName}.beginUpdate (count ${this.count})`);
	}
	endUpdate<T>(observable: IObservable<T, void>): void {
		this.log.log(`${this.debugName}.endUpdate (count ${this.count})`);
		this.count--;
	}
	handleChange<T, TChange>(observable: IObservable<T, TChange>, change: TChange): void {
		this.log.log(`${this.debugName}.handleChange (count ${this.count})`);
	}
	handlePossibleChange<T>(observable: IObservable<T, unknown>): void {
		this.log.log(`${this.debugName}.handlePossibleChange`);
	}
}

export class LoggingObservableValue<T, TChange = void>
	extends BaseObservable<T, TChange>
	implements ISettableObservable<T, TChange>
{
	private value: T;

	constructor(public readonly debugName: string, initialValue: T, private readonly log: Log) {
		super();
		this.value = initialValue;
	}

	protected override onFirstObserverAdded(): void {
		this.log.log(`${this.debugName}.firstObserverAdded`);
	}

	protected override onLastObserverRemoved(): void {
		this.log.log(`${this.debugName}.lastObserverRemoved`);
	}

	public get(): T {
		this.log.log(`${this.debugName}.get`);
		return this.value;
	}

	public set(value: T, tx: ITransaction | undefined, change: TChange): void {
		if (this.value === value) {
			return;
		}

		if (!tx) {
			transaction((tx) => {
				this.set(value, tx, change);
			}, () => `Setting ${this.debugName}`);
			return;
		}

		this.log.log(`${this.debugName}.set (value ${value})`);

		this.value = value;

		for (const observer of this.observers) {
			tx.updateObserver(observer, this);
			observer.handleChange(this, change);
		}
	}

	override toString(): string {
		return `${this.debugName}: ${this.value}`;
	}
}

class Log {
	private readonly entries: string[] = [];
	public log(message: string): void {
		this.entries.push(message);
	}

	public getAndClearEntries(): string[] {
		const entries = [...this.entries];
		this.entries.length = 0;
		return entries;
	}
}
