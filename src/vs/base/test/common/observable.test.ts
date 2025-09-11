/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { setUnexpectedErrorHandler } from '../../common/errors.js';
import { Emitter, Event } from '../../common/event.js';
import { DisposableStore, toDisposable } from '../../common/lifecycle.js';
import { IDerivedReader, IObservableWithChange, autorun, autorunHandleChanges, autorunWithStoreHandleChanges, derived, derivedDisposable, IObservable, IObserver, ISettableObservable, ITransaction, keepObserved, observableFromEvent, observableSignal, observableValue, recordChanges, transaction, waitForState, derivedHandleChanges, runOnChange, DebugLocation } from '../../common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
// eslint-disable-next-line local/code-no-deep-import-of-internal
import { observableReducer } from '../../common/observableInternal/experimental/reducer.js';
// eslint-disable-next-line local/code-no-deep-import-of-internal
import { BaseObservable } from '../../common/observableInternal/observables/baseObservable.js';

suite('observables', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Reads these tests to understand how to use observables.
	 */
	suite('tutorial', () => {
		test('observable + autorun', () => {
			const log = new Log();
			// This creates a variable that stores a value and whose value changes can be observed.
			// The name is only used for debugging purposes.
			// The second arg is the initial value.
			const myObservable = observableValue('myObservable', 0);

			// This creates an autorun: It runs immediately and then again whenever any of the
			// dependencies change. Dependencies are tracked by reading observables with the `reader` parameter.
			//
			// The @description is only used for debugging purposes.
			// The autorun has to be disposed! This is very important.
			ds.add(autorun(reader => {
				/** @description myAutorun */

				// This code is run immediately.

				// Use the `reader` to read observable values and track the dependency to them.
				// If you use `observable.get()` instead of `observable.read(reader)`, you will just
				// get the value and not subscribe to it.
				log.log(`myAutorun.run(myObservable: ${myObservable.read(reader)})`);

				// Now that all dependencies are tracked, the autorun is re-run whenever any of the
				// dependencies change.
			}));
			// The autorun runs immediately
			assert.deepStrictEqual(log.getAndClearEntries(), ['myAutorun.run(myObservable: 0)']);

			// We set the observable.
			myObservable.set(1, undefined);
			// -> The autorun runs again when any read observable changed
			assert.deepStrictEqual(log.getAndClearEntries(), ['myAutorun.run(myObservable: 1)']);

			// We set the observable again.
			myObservable.set(1, undefined);
			// -> The autorun does not run again, because the observable didn't change.
			assert.deepStrictEqual(log.getAndClearEntries(), []);

			// Transactions batch autorun runs
			transaction((tx) => {
				myObservable.set(2, tx);
				// No auto-run ran yet, even though the value changed!
				assert.deepStrictEqual(log.getAndClearEntries(), []);

				myObservable.set(3, tx);
				assert.deepStrictEqual(log.getAndClearEntries(), []);
			});
			// Only at the end of the transaction the autorun re-runs
			assert.deepStrictEqual(log.getAndClearEntries(), ['myAutorun.run(myObservable: 3)']);

			// Note that the autorun did not see the intermediate value `2`!
		});

		test('derived + autorun', () => {
			const log = new Log();
			const observable1 = observableValue('myObservable1', 0);
			const observable2 = observableValue('myObservable2', 0);

			// A derived value is an observable that is derived from other observables.
			const myDerived = derived(reader => {
				/** @description myDerived */
				const value1 = observable1.read(reader); // Use the reader to track dependencies.
				const value2 = observable2.read(reader);
				const sum = value1 + value2;
				log.log(`myDerived.recompute: ${value1} + ${value2} = ${sum}`);
				return sum;
			});

			// We create an autorun that reacts on changes to our derived value.
			ds.add(autorun(reader => {
				/** @description myAutorun */
				// Autoruns work with observable values and deriveds - in short, they work with any observable.
				log.log(`myAutorun(myDerived: ${myDerived.read(reader)})`);
			}));
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

			// Now we change multiple observables in a transaction to batch process the effects.
			transaction((tx) => {
				observable1.set(5, tx);
				assert.deepStrictEqual(log.getAndClearEntries(), []);

				observable2.set(5, tx);
				assert.deepStrictEqual(log.getAndClearEntries(), []);
			});
			// When changing multiple observables in a transaction,
			// deriveds are only recomputed on demand.
			// (Note that you cannot see the intermediate value when `obs1 == 5` and `obs2 == 1`)
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

			ds.add(autorun(reader => {
				/** @description myAutorun */
				log.log(`myAutorun(myDerived: ${myDerived.read(reader)})`);
			}));
			// autorun runs immediately
			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myDerived.recompute: 0 + 0 = 0",
				"myAutorun(myDerived: 0)",
			]);

			transaction((tx) => {
				observable1.set(-10, tx);
				assert.deepStrictEqual(log.getAndClearEntries(), []);

				myDerived.get(); // This forces a (sync) recomputation of the current value!
				assert.deepStrictEqual(log.getAndClearEntries(), (["myDerived.recompute: -10 + 0 = -10"]));
				// This means, that even in transactions you can assume that all values you can read with `get` and `read` are up-to-date.
				// Read these values just might cause additional (potentially unneeded) recomputations.

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

			// We set up some computeds.
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

			// And now read the computed that dependens on all the others.
			log.log(`value: ${computedSum.get()}`);
			assert.deepStrictEqual(log.getAndClearEntries(), [
				'recompute1: 1 % 3 = 1',
				'recompute2: 1 * 2 = 2',
				'recompute3: 1 * 3 = 3',
				'recompute4: 2 + 3 = 5',
				'value: 5',
			]);

			log.log(`value: ${computedSum.get()}`);
			// Because there are no observers, the derived values are not cached (!), but computed from scratch.
			assert.deepStrictEqual(log.getAndClearEntries(), [
				'recompute1: 1 % 3 = 1',
				'recompute2: 1 * 2 = 2',
				'recompute3: 1 * 3 = 3',
				'recompute4: 2 + 3 = 5',
				'value: 5',
			]);

			const disposable = keepObserved(computedSum); // Use keepObserved to keep the cache.
			// You can also use `computedSum.keepObserved(store)` for an inline experience.
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
			// Tada, no recomputations!

			observable1.set(2, undefined);
			// The keepObserved does not force deriveds to be recomputed! They are still lazy.
			assert.deepStrictEqual(log.getAndClearEntries(), ([]));

			log.log(`value: ${computedSum.get()}`);
			// Those deriveds are recomputed on demand, i.e. when someone reads them.
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

			disposable.dispose(); // Don't forget to dispose the keepAlive to prevent memory leaks!

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

			// Why don't we just always keep the cache alive?
			// This is because in order to keep the cache alive, we have to keep our subscriptions to our dependencies alive,
			// which could cause memory-leaks.
			// So instead, when the last observer of a derived is disposed, we dispose our subscriptions to our dependencies.
			// `keepObserved` just prevents this from happening.
		});

		test('autorun that receives deltas of signals', () => {
			const log = new Log();

			// A signal is an observable without a value.
			// However, it can ship change information when it is triggered.
			// Readers can process/aggregate this change information.
			const signal = observableSignal<{ msg: string }>('signal');

			const disposable = autorunHandleChanges({
				changeTracker: {
					// The change summary is used to collect the changes
					createChangeSummary: () => ({ msgs: [] as string[] }),
					handleChange(context, changeSummary) {
						if (context.didChange(signal)) {
							// We just push the changes into an array
							changeSummary.msgs.push(context.change.msg);
						}
						return true; // We want to handle the change
					},
				}
			}, (reader, changeSummary) => {
				// When handling the change, make sure to read the signal!
				signal.read(reader);
				log.log('msgs: ' + changeSummary.msgs.join(', '));
			});


			signal.trigger(undefined, { msg: 'foobar' });

			transaction(tx => {
				// You can batch triggering signals.
				// No delta information is lost!
				signal.trigger(tx, { msg: 'hello' });
				signal.trigger(tx, { msg: 'world' });
			});

			assert.deepStrictEqual(log.getAndClearEntries(), [
				'msgs: ',
				'msgs: foobar',
				'msgs: hello, world'
			]);

			disposable.dispose();
		});

		// That is the end of the tutorial.
		// There are lots of utilities you can explore now, like `observableFromEvent`, `Event.fromObservableLight`,
		// autorunWithStore, observableWithStore and so on.
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

		ds.add(autorun(reader => {
			/** @description myAutorun */
			log.log(`myAutorun.run(myComputed3: ${myComputed3.read(reader)})`);
		}));
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
		ds.add(autorun(reader => {
			/** @description myAutorun */
			const value = myComputed.read(reader);
			log.log(`myAutorun: ${value}`);
		}));
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

		ds.add(autorun(reader => {
			/** @description myAutorun */
			const shouldRead = myObsShouldRead.read(reader);
			if (shouldRead) {
				const v = myComputed1.read(reader);
				log.log(`myAutorun(shouldRead: true, myComputed1: ${v}): run`);
			} else {
				log.log(`myAutorun(shouldRead: false): run`);
			}
		}));
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

			ds.add(autorun(reader => {
				/** @description myAutorun */
				log.log(`myAutorun.run(myObservable: ${myObservable.read(reader)})`);
			}));
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

			ds.add(autorun(reader => {
				/** @description myAutorun */
				log.log(`myAutorun.run(myDerived: ${myDerived.read(reader)})`);
			}));
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

			ds.add(autorun(reader => {
				/** @description myAutorun */
				log.log(`myAutorun.run(myDerived: ${myDerived.read(reader)})`);
			}));
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

		ds.add(autorun(reader => {
			/** @description myAutorun */
			const myDerived1Val = myDerived1.read(reader);
			const myDerived2Val = myDerived2.read(reader);
			log.log(`myAutorun.run(myDerived1: ${myDerived1Val}, myDerived2: ${myDerived2Val})`);
		}));

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

		ds.add(autorun(reader => {
			/** @description myAutorun */
			const value = myComputed.read(reader);
			log.log(`myAutorun(myComputed: ${value})`);
		}));
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

		ds.add(autorun(reader => {
			/** @description myAutorun */
			const value = myObservable.read(reader);
			log.log(`myAutorun(myObservable: ${value}): start`);
			if (value !== 0 && value < 4) {
				myObservable.set(value + 1, undefined);
			}
			log.log(`myAutorun(myObservable: ${value}): end`);
		}));
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

		ds.add(autorun(reader => {
			/** @description myAutorun */
			const value = myDerived2.read(reader);
			log.log(`myAutorun(myDerived2: ${value})`);
		}));
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

		ds.add(autorun(reader => {
			/** @description myAutorun */
			const val = myDerived3.read(reader);
			log.log(`myAutorun(myDerived3: ${val})`);
		}));
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

		ds.add(autorun(reader => {
			/** @description myAutorun1 */
			myDerivedA1.read(reader);
		}));

		ds.add(autorun(reader => {
			/** @description myAutorun2 */
			myDerived2.read(reader);
		}));

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

	test('bug: Event.fromObservable always should get events', () => {
		const emitter = new Emitter();
		const log = new Log();
		let i = 0;
		const obs = observableFromEvent(emitter.event, () => i);

		i++;
		emitter.fire(1);

		const evt2 = Event.fromObservable(obs);
		const d = evt2(e => {
			log.log(`event fired ${e}`);
		});

		i++;
		emitter.fire(2);
		assert.deepStrictEqual(log.getAndClearEntries(), ["event fired 2"]);

		i++;
		emitter.fire(3);
		assert.deepStrictEqual(log.getAndClearEntries(), ["event fired 3"]);

		d.dispose();
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

	suite('waitForState', () => {
		test('resolve', async () => {
			const log = new Log();
			const myObservable = new LoggingObservableValue('myObservable', { state: 'initializing' as 'initializing' | 'ready' | 'error' }, log);

			const p = waitForState(myObservable, p => p.state === 'ready', p => p.state === 'error').then(r => {
				log.log(`resolved ${JSON.stringify(r)}`);
			}, (err) => {
				log.log(`rejected ${JSON.stringify(err)}`);
			});

			assert.deepStrictEqual(log.getAndClearEntries(), [
				'myObservable.firstObserverAdded',
				'myObservable.get',
			]);

			myObservable.set({ state: 'ready' }, undefined);

			assert.deepStrictEqual(log.getAndClearEntries(), [
				'myObservable.set (value [object Object])',
				'myObservable.get',
				'myObservable.lastObserverRemoved',
			]);

			await p;

			assert.deepStrictEqual(log.getAndClearEntries(), [
				'resolved {\"state\":\"ready\"}',
			]);
		});

		test('resolveImmediate', async () => {
			const log = new Log();
			const myObservable = new LoggingObservableValue('myObservable', { state: 'ready' as 'initializing' | 'ready' | 'error' }, log);

			const p = waitForState(myObservable, p => p.state === 'ready', p => p.state === 'error').then(r => {
				log.log(`resolved ${JSON.stringify(r)}`);
			}, (err) => {
				log.log(`rejected ${JSON.stringify(err)}`);
			});

			assert.deepStrictEqual(log.getAndClearEntries(), [
				'myObservable.firstObserverAdded',
				'myObservable.get',
				'myObservable.lastObserverRemoved',
			]);

			myObservable.set({ state: 'error' }, undefined);

			assert.deepStrictEqual(log.getAndClearEntries(), [
				'myObservable.set (value [object Object])',
			]);

			await p;

			assert.deepStrictEqual(log.getAndClearEntries(), [
				'resolved {\"state\":\"ready\"}',
			]);
		});

		test('reject', async () => {
			const log = new Log();
			const myObservable = new LoggingObservableValue('myObservable', { state: 'initializing' as 'initializing' | 'ready' | 'error' }, log);

			const p = waitForState(myObservable, p => p.state === 'ready', p => p.state === 'error').then(r => {
				log.log(`resolved ${JSON.stringify(r)}`);
			}, (err) => {
				log.log(`rejected ${JSON.stringify(err)}`);
			});

			assert.deepStrictEqual(log.getAndClearEntries(), [
				'myObservable.firstObserverAdded',
				'myObservable.get',
			]);

			myObservable.set({ state: 'error' }, undefined);

			assert.deepStrictEqual(log.getAndClearEntries(), [
				'myObservable.set (value [object Object])',
				'myObservable.get',
				'myObservable.lastObserverRemoved',
			]);

			await p;

			assert.deepStrictEqual(log.getAndClearEntries(), [
				'rejected {\"state\":\"error\"}'
			]);
		});

		test('derived as lazy', () => {
			const store = new DisposableStore();
			const log = new Log();
			let i = 0;
			const d = derivedDisposable(() => {
				const id = i++;
				log.log('myDerived ' + id);
				return {
					dispose: () => log.log(`disposed ${id}`)
				};
			});

			d.get();
			assert.deepStrictEqual(log.getAndClearEntries(), ['myDerived 0', 'disposed 0']);
			d.get();
			assert.deepStrictEqual(log.getAndClearEntries(), ['myDerived 1', 'disposed 1']);

			d.keepObserved(store);
			assert.deepStrictEqual(log.getAndClearEntries(), []);
			d.get();
			assert.deepStrictEqual(log.getAndClearEntries(), ['myDerived 2']);
			d.get();
			assert.deepStrictEqual(log.getAndClearEntries(), []);

			store.dispose();

			assert.deepStrictEqual(log.getAndClearEntries(), ['disposed 2']);
		});
	});

	test('observableValue', () => {
		const log = new Log();
		const myObservable1 = observableValue<number>('myObservable1', 0);
		const myObservable2 = observableValue<number, { message: string }>('myObservable2', 0);

		const d = autorun(reader => {
			/** @description update */
			const v1 = myObservable1.read(reader);
			const v2 = myObservable2.read(reader);
			log.log('autorun, myObservable1:' + v1 + ', myObservable2:' + v2);
		});

		assert.deepStrictEqual(log.getAndClearEntries(), [
			'autorun, myObservable1:0, myObservable2:0'
		]);

		// Doesn't trigger the autorun, because no delta was provided and the value did not change
		myObservable1.set(0, undefined);

		assert.deepStrictEqual(log.getAndClearEntries(), [
		]);

		// Triggers the autorun. The value did not change, but a delta value was provided
		myObservable2.set(0, undefined, { message: 'change1' });

		assert.deepStrictEqual(log.getAndClearEntries(), [
			'autorun, myObservable1:0, myObservable2:0'
		]);

		d.dispose();
	});

	suite('autorun error handling', () => {
		test('immediate throw', () => {
			const log = new Log();

			setUnexpectedErrorHandler(e => {
				log.log(`error: ${e.message}`);
			});

			const myObservable = new LoggingObservableValue('myObservable', 0, log);

			const d = autorun(reader => {
				myObservable.read(reader);
				throw new Error('foobar');
			});

			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myObservable.firstObserverAdded",
				"myObservable.get",
				"error: foobar"
			]);

			myObservable.set(1, undefined);

			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myObservable.set (value 1)",
				"myObservable.get",
				"error: foobar",
			]);

			d.dispose();
		});

		test('late throw', () => {
			const log = new Log();

			setUnexpectedErrorHandler(e => {
				log.log(`error: ${e.message}`);
			});

			const myObservable = new LoggingObservableValue('myObservable', 0, log);

			const d = autorun(reader => {
				const value = myObservable.read(reader);
				if (value >= 1) {
					throw new Error('foobar');
				}
			});

			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myObservable.firstObserverAdded",
				"myObservable.get",
			]);

			myObservable.set(1, undefined);

			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myObservable.set (value 1)",
				"myObservable.get",
				"error: foobar",
			]);

			myObservable.set(2, undefined);

			assert.deepStrictEqual(log.getAndClearEntries(), [
				"myObservable.set (value 2)",
				"myObservable.get",
				"error: foobar",
			]);

			d.dispose();
		});
	});

	test('recomputeInitiallyAndOnChange should work when a dependency sets an observable', () => {
		const store = new DisposableStore();
		const log = new Log();

		const myObservable = new LoggingObservableValue('myObservable', 0, log);

		let shouldUpdate = true;

		const myDerived = derived(reader => {
			/** @description myDerived */

			log.log('myDerived.computed start');

			const val = myObservable.read(reader);

			if (shouldUpdate) {
				shouldUpdate = false;
				myObservable.set(1, undefined);
			}

			log.log('myDerived.computed end');

			return val;
		});

		assert.deepStrictEqual(log.getAndClearEntries(), ([]));

		myDerived.recomputeInitiallyAndOnChange(store, val => {
			log.log(`recomputeInitiallyAndOnChange, myDerived: ${val}`);
		});

		assert.deepStrictEqual(log.getAndClearEntries(), [
			"myDerived.computed start",
			"myObservable.firstObserverAdded",
			"myObservable.get",
			"myObservable.set (value 1)",
			"myDerived.computed end",
			"myDerived.computed start",
			"myObservable.get",
			"myDerived.computed end",
			"recomputeInitiallyAndOnChange, myDerived: 1",
		]);

		myDerived.get();
		assert.deepStrictEqual(log.getAndClearEntries(), ([]));

		store.dispose();
	});

	suite('prevent invalid usage', () => {
		suite('reading outside of compute function', () => {
			test('derived', () => {
				let fn: () => void = () => { };

				const obs = observableValue('obs', 0);
				const d = derived(reader => {
					fn = () => { obs.read(reader); };
					return obs.read(reader);
				});

				const disp = autorun(reader => {
					d.read(reader);
				});

				assert.throws(() => {
					fn();
				});

				disp.dispose();
			});

			test('autorun', () => {
				let fn: () => void = () => { };

				const obs = observableValue('obs', 0);
				const disp = autorun(reader => {
					fn = () => { obs.read(reader); };
					obs.read(reader);
				});

				assert.throws(() => {
					fn();
				});

				disp.dispose();
			});
		});

		test.skip('catches cyclic dependencies', () => {
			const log = new Log();

			setUnexpectedErrorHandler((e) => {
				log.log(e.toString());
			});

			const obs = observableValue('obs', 0);
			const d1 = derived(reader => {
				log.log('d1.computed start');
				const x = obs.read(reader) + d2.read(reader);
				log.log('d1.computed end');
				return x;
			});
			const d2 = derived(reader => {
				log.log('d2.computed start');
				d1.read(reader);
				log.log('d2.computed end');
				return 0;
			});

			const disp = autorun(reader => {
				log.log('autorun start');
				d1.read(reader);
				log.log('autorun end');
				return 0;
			});

			assert.deepStrictEqual(log.getAndClearEntries(), ([
				"autorun start",
				"d1.computed start",
				"d2.computed start",
				"Error: Cyclic deriveds are not supported yet!",
				"d1.computed end",
				"autorun end"
			]));

			disp.dispose();
		});
	});

	suite('observableReducer', () => {
		test('main', () => {
			const store = new DisposableStore();
			const log = new Log();

			const myObservable1 = observableValue<number, number>('myObservable1', 5);
			const myObservable2 = observableValue<number, number>('myObservable2', 9);

			const sum = observableReducer(this, {
				initial: () => {
					log.log('createInitial');
					return myObservable1.get() + myObservable2.get();
				},
				disposeFinal: (values) => {
					log.log(`disposeFinal ${values}`);
				},
				changeTracker: recordChanges({ myObservable1, myObservable2 }),
				update: (reader: IDerivedReader<number>, previousValue, changes) => {
					log.log(`update ${JSON.stringify(changes)}`);
					let delta = 0;
					for (const change of changes.changes) {
						delta += change.change;
					}

					reader.reportChange(delta);
					const resultValue = previousValue + delta;
					log.log(`update -> ${resultValue}`);
					return resultValue;
				}
			});

			assert.deepStrictEqual(log.getAndClearEntries(), ([]));

			store.add(autorunWithStoreHandleChanges({
				changeTracker: recordChanges({ sum })
			}, (_reader, changes) => {
				log.log(`autorun ${JSON.stringify(changes)}`);
			}));

			assert.deepStrictEqual(log.getAndClearEntries(), [
				"createInitial",
				'update {"changes":[],"myObservable1":5,"myObservable2":9}',
				"update -> 14",
				'autorun {"changes":[],"sum":14}',
			]);

			transaction(tx => {
				myObservable1.set(myObservable1.get() + 1, tx, 1);
				myObservable2.set(myObservable2.get() + 3, tx, 3);
			});

			assert.deepStrictEqual(log.getAndClearEntries(), ([
				"update {\"changes\":[{\"key\":\"myObservable1\",\"change\":1},{\"key\":\"myObservable2\",\"change\":3}],\"myObservable1\":6,\"myObservable2\":12}",
				"update -> 18",
				"autorun {\"changes\":[{\"key\":\"sum\",\"change\":4}],\"sum\":18}"
			]));

			transaction(tx => {
				myObservable1.set(myObservable1.get() + 1, tx, 1);
				const s = sum.get();
				log.log(`sum.get() ${s}`);
				myObservable2.set(myObservable2.get() + 3, tx, 3);
			});

			assert.deepStrictEqual(log.getAndClearEntries(), ([
				"update {\"changes\":[{\"key\":\"myObservable1\",\"change\":1}],\"myObservable1\":7,\"myObservable2\":12}",
				"update -> 19",
				"sum.get() 19",
				"update {\"changes\":[{\"key\":\"myObservable2\",\"change\":3}],\"myObservable1\":7,\"myObservable2\":15}",
				"update -> 22",
				"autorun {\"changes\":[{\"key\":\"sum\",\"change\":1}],\"sum\":22}"
			]));

			store.dispose();

			assert.deepStrictEqual(log.getAndClearEntries(), ([
				"disposeFinal 22"
			]));
		});
	});

	suite('disposableStores', () => {
		test('derived with store', () => {
			const log = new Log();
			const observable1 = observableValue('myObservableValue1', 0);

			const computed1 = derived((reader) => {
				const value = observable1.read(reader);
				log.log(`computed ${value}`);
				reader.store.add(toDisposable(() => {
					log.log(`computed1: ${value} disposed`);
				}));
				return value;
			});

			const a = autorun(reader => {
				log.log(`a: ${computed1.read(reader)}`);
			});

			assert.deepStrictEqual(log.getAndClearEntries(), ([
				"computed 0",
				"a: 0"
			]));

			observable1.set(1, undefined);

			assert.deepStrictEqual(log.getAndClearEntries(), ([
				"computed1: 0 disposed",
				"computed 1",
				"a: 1"
			]));

			a.dispose();

			assert.deepStrictEqual(log.getAndClearEntries(), ([
				"computed1: 1 disposed"
			]));
		});

		test('derived with delayedStore', () => {
			const log = new Log();
			const observable1 = observableValue('myObservableValue1', 0);

			const computed1 = derived((reader) => {
				const value = observable1.read(reader);
				log.log(`computed ${value}`);
				reader.delayedStore.add(toDisposable(() => {
					log.log(`computed1: ${value} disposed`);
				}));
				return value;
			});

			const a = autorun(reader => {
				log.log(`a: ${computed1.read(reader)}`);
			});

			assert.deepStrictEqual(log.getAndClearEntries(), ([
				"computed 0",
				"a: 0"
			]));

			observable1.set(1, undefined);

			assert.deepStrictEqual(log.getAndClearEntries(), ([
				"computed 1",
				"computed1: 0 disposed",
				"a: 1"
			]));

			a.dispose();

			assert.deepStrictEqual(log.getAndClearEntries(), ([
				"computed1: 1 disposed"
			]));
		});
	});

	test('derivedHandleChanges with reportChanges', () => {
		const log = new Log();

		const signal1 = observableSignal<{ message: string }>('signal1');
		const signal2 = observableSignal<{ message: string }>('signal2');

		const signal2Derived = derivedHandleChanges(
			{ changeTracker: recordChanges({ signal2 }) },
			(reader: IDerivedReader<{ message: string }>, changeSummary) => {
				for (const c of changeSummary.changes) {
					reader.reportChange({ message: c.change.message + ' (derived)' });
				}
			}
		);

		const d = derivedHandleChanges({
			changeTracker: recordChanges({ signal1, signal2Derived }),
		}, (r: IDerivedReader<string>, changes) => {
			const log = changes.changes.map(c => `${c.key}: ${c.change.message}`).join(', ');
			r.reportChange(log);
		});

		const disp = runOnChange(d, (_val, _prev, changes) => {
			log.log(`runOnChange ${JSON.stringify(changes)}`);
		});

		assert.deepStrictEqual(log.getAndClearEntries(), ([]));

		transaction(tx => {
			signal1.trigger(tx, { message: 'foo' });
			signal2.trigger(tx, { message: 'bar' });
		});

		assert.deepStrictEqual(log.getAndClearEntries(), ([
			"runOnChange [\"signal1: foo, signal2Derived: bar (derived)\"]"
		]));


		transaction(tx => {
			signal2.trigger(tx, { message: 'baz' });
		});

		assert.deepStrictEqual(log.getAndClearEntries(), ([
			"runOnChange [\"signal2Derived: baz (derived)\"]"
		]));

		disp.dispose();
	});
});

export class LoggingObserver implements IObserver {
	private count = 0;

	constructor(public readonly debugName: string, private readonly log: Log) {
	}

	beginUpdate<T>(observable: IObservable<T>): void {
		this.count++;
		this.log.log(`${this.debugName}.beginUpdate (count ${this.count})`);
	}
	endUpdate<T>(observable: IObservable<T>): void {
		this.log.log(`${this.debugName}.endUpdate (count ${this.count})`);
		this.count--;
	}
	handleChange<T, TChange>(observable: IObservableWithChange<T, TChange>, change: TChange): void {
		this.log.log(`${this.debugName}.handleChange (count ${this.count})`);
	}
	handlePossibleChange<T>(observable: IObservable<T>): void {
		this.log.log(`${this.debugName}.handlePossibleChange`);
	}
}

export class LoggingObservableValue<T, TChange = void>
	extends BaseObservable<T, TChange>
	implements ISettableObservable<T, TChange> {
	private value: T;

	constructor(
		public readonly debugName: string,
		initialValue: T,
		private readonly logger: Log
	) {
		super(DebugLocation.ofCaller());
		this.value = initialValue;
	}

	protected override onFirstObserverAdded(): void {
		this.logger.log(`${this.debugName}.firstObserverAdded`);
	}

	protected override onLastObserverRemoved(): void {
		this.logger.log(`${this.debugName}.lastObserverRemoved`);
	}

	public get(): T {
		this.logger.log(`${this.debugName}.get`);
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

		this.logger.log(`${this.debugName}.set (value ${value})`);

		this.value = value;

		for (const observer of this._observers) {
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
