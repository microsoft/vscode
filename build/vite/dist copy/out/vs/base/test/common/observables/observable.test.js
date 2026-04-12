/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { setUnexpectedErrorHandler } from '../../../common/errors.js';
import { Emitter, Event } from '../../../common/event.js';
import { DisposableStore, toDisposable } from '../../../common/lifecycle.js';
import { autorun, autorunHandleChanges, autorunWithStoreHandleChanges, derived, derivedDisposable, keepObserved, observableFromEvent, observableSignal, observableValue, recordChanges, transaction, waitForState, derivedHandleChanges, runOnChange, DebugLocation } from '../../../common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../utils.js';
// eslint-disable-next-line local/code-no-deep-import-of-internal
import { observableReducer } from '../../../common/observableInternal/experimental/reducer.js';
// eslint-disable-next-line local/code-no-deep-import-of-internal
import { BaseObservable } from '../../../common/observableInternal/observables/baseObservable.js';
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
                'myDerived.recompute: 0 + 0 = 0',
                'myAutorun(myDerived: 0)',
            ]);
            observable1.set(1, undefined);
            // and on changes...
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'myDerived.recompute: 1 + 0 = 1',
                'myAutorun(myDerived: 1)',
            ]);
            observable2.set(1, undefined);
            // ... of any dependency.
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'myDerived.recompute: 1 + 1 = 2',
                'myAutorun(myDerived: 2)',
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
                'myDerived.recompute: 5 + 5 = 10',
                'myAutorun(myDerived: 10)',
            ]);
            transaction((tx) => {
                observable1.set(6, tx);
                assert.deepStrictEqual(log.getAndClearEntries(), []);
                observable2.set(4, tx);
                assert.deepStrictEqual(log.getAndClearEntries(), []);
            });
            // Now the autorun didn't run again, because its dependency changed from 10 to 10 (= no change).
            assert.deepStrictEqual(log.getAndClearEntries(), (['myDerived.recompute: 6 + 4 = 10']));
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
                'myDerived.recompute: 0 + 0 = 0',
                'myAutorun(myDerived: 0)',
            ]);
            transaction((tx) => {
                observable1.set(-10, tx);
                assert.deepStrictEqual(log.getAndClearEntries(), []);
                myDerived.get(); // This forces a (sync) recomputation of the current value!
                assert.deepStrictEqual(log.getAndClearEntries(), (['myDerived.recompute: -10 + 0 = -10']));
                // This means, that even in transactions you can assume that all values you can read with `get` and `read` are up-to-date.
                // Read these values just might cause additional (potentially unneeded) recomputations.
                observable2.set(10, tx);
                assert.deepStrictEqual(log.getAndClearEntries(), []);
            });
            // This autorun runs again, because its dependency changed from 0 to -10 and then back to 0.
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'myDerived.recompute: -10 + 10 = 0',
                'myAutorun(myDerived: 0)',
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
                'recompute1: 2 % 3 = 2',
                'recompute2: 2 * 2 = 4',
                'recompute3: 2 * 3 = 6',
                'recompute4: 4 + 6 = 10',
                'value: 10',
            ]);
            log.log(`value: ${computedSum.get()}`);
            // ... and then cached again
            assert.deepStrictEqual(log.getAndClearEntries(), (['value: 10']));
            disposable.dispose(); // Don't forget to dispose the keepAlive to prevent memory leaks!
            log.log(`value: ${computedSum.get()}`);
            // Which disables the cache again
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'recompute1: 2 % 3 = 2',
                'recompute2: 2 * 2 = 4',
                'recompute3: 2 * 3 = 6',
                'recompute4: 4 + 6 = 10',
                'value: 10',
            ]);
            log.log(`value: ${computedSum.get()}`);
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'recompute1: 2 % 3 = 2',
                'recompute2: 2 * 2 = 4',
                'recompute3: 2 * 3 = 6',
                'recompute4: 4 + 6 = 10',
                'value: 10',
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
            const signal = observableSignal('signal');
            const disposable = autorunHandleChanges({
                changeTracker: {
                    // The change summary is used to collect the changes
                    createChangeSummary: () => ({ msgs: [] }),
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
            'myComputed1.recompute(myObservable1: 0 + myObservable2: 0 = 0)',
            'myComputed2.recompute(myComputed1: 0 + myObservable1: 0 + myObservable2: 0 = 0)',
            'myComputed3.recompute(myComputed2: 0 + myObservable1: 0 + myObservable2: 0 = 0)',
            'myAutorun.run(myComputed3: 0)',
        ]);
        myObservable1.set(1, undefined);
        assert.deepStrictEqual(log.getAndClearEntries(), [
            'myComputed1.recompute(myObservable1: 1 + myObservable2: 0 = 1)',
            'myComputed2.recompute(myComputed1: 1 + myObservable1: 1 + myObservable2: 0 = 2)',
            'myComputed3.recompute(myComputed2: 2 + myObservable1: 1 + myObservable2: 0 = 3)',
            'myAutorun.run(myComputed3: 3)',
        ]);
        transaction((tx) => {
            myObservable1.set(2, tx);
            myComputed2.get();
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'myComputed1.recompute(myObservable1: 2 + myObservable2: 0 = 2)',
                'myComputed2.recompute(myComputed1: 2 + myObservable1: 2 + myObservable2: 0 = 4)',
            ]);
            myObservable1.set(3, tx);
            myComputed2.get();
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'myComputed1.recompute(myObservable1: 3 + myObservable2: 0 = 3)',
                'myComputed2.recompute(myComputed1: 3 + myObservable1: 3 + myObservable2: 0 = 6)',
            ]);
        });
        assert.deepStrictEqual(log.getAndClearEntries(), [
            'myComputed3.recompute(myComputed2: 6 + myObservable1: 3 + myObservable2: 0 = 9)',
            'myAutorun.run(myComputed3: 9)',
        ]);
    });
    suite('from event', () => {
        function init() {
            const log = new Log();
            let value = 0;
            const eventEmitter = new Emitter();
            let id = 0;
            const observable = observableFromEvent((handler) => {
                const curId = id++;
                log.log(`subscribed handler ${curId}`);
                const disposable = eventEmitter.event(handler);
                return {
                    dispose: () => {
                        log.log(`unsubscribed handler ${curId}`);
                        disposable.dispose();
                    },
                };
            }, () => {
                log.log(`compute value ${value}`);
                return value;
            });
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
                log.log(`autorun, value: ${observable.read(reader)}`);
            });
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'subscribed handler 0',
                'compute value undefined',
                'autorun, value: undefined',
            ]);
            setValue(1);
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'compute value 1',
                'autorun, value: 1'
            ]);
            autorunDisposable.dispose();
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'unsubscribed handler 0'
            ]);
        });
        test('basic', () => {
            const { log, setValue, observable } = init();
            const shouldReadObservable = observableValue('shouldReadObservable', true);
            const autorunDisposable = autorun(reader => {
                /** @description MyAutorun */
                if (shouldReadObservable.read(reader)) {
                    observable.read(reader);
                    log.log(`autorun, should read: true, value: ${observable.read(reader)}`);
                }
                else {
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
            'myComputed.recompute',
            'myObs1.firstObserverAdded',
            'myObs1.get',
            'myAutorun: 0',
        ]);
        transaction(tx => {
            myObs1.set(1, tx);
            assert.deepStrictEqual(log.getAndClearEntries(), (['myObs1.set (value 1)']));
            shouldReadObservable.set(false, tx);
            assert.deepStrictEqual(log.getAndClearEntries(), ([]));
            myComputed.get();
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'myComputed.recompute',
                'myObs1.lastObserverRemoved',
            ]);
        });
        assert.deepStrictEqual(log.getAndClearEntries(), (['myAutorun: 1']));
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
            }
            else {
                log.log(`myAutorun(shouldRead: false): run`);
            }
        }));
        assert.deepStrictEqual(log.getAndClearEntries(), [
            'myObsShouldRead.firstObserverAdded',
            'myObsShouldRead.get',
            'myObs1.firstObserverAdded',
            'myObs1.get',
            'myComputed1(myObs1: 0): Computed 0',
            'myAutorun(shouldRead: true, myComputed1: 0): run',
        ]);
        transaction(tx => {
            myObsShouldRead.set(false, tx);
            myObs1.set(1, tx);
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'myObsShouldRead.set (value false)',
                'myObs1.set (value 1)',
            ]);
        });
        // myComputed1 should not be recomputed here, even though its dependency myObs1 changed!
        assert.deepStrictEqual(log.getAndClearEntries(), [
            'myObsShouldRead.get',
            'myAutorun(shouldRead: false): run',
            'myObs1.lastObserverRemoved',
        ]);
        transaction(tx => {
            myObsShouldRead.set(true, tx);
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'myObsShouldRead.set (value true)',
            ]);
        });
        assert.deepStrictEqual(log.getAndClearEntries(), [
            'myObsShouldRead.get',
            'myObs1.firstObserverAdded',
            'myObs1.get',
            'myComputed1(myObs1: 1): Computed 1',
            'myAutorun(shouldRead: true, myComputed1: 1): run',
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
                'myDerived.read(myObservable: 0)',
                'myAutorun.run(myDerived: 0)'
            ]);
            transaction((tx) => {
                myObservable.set(2, tx);
                assert.deepStrictEqual(log.getAndClearEntries(), []);
                myObservable.set(0, tx);
                assert.deepStrictEqual(log.getAndClearEntries(), []);
            });
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'myDerived.read(myObservable: 0)'
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
                'myDerived.read(myObservable: 0)',
                'myAutorun.run(myDerived: 0)'
            ]);
            transaction((tx) => {
                myObservable.set(2, tx);
                assert.deepStrictEqual(log.getAndClearEntries(), []);
                myDerived.get(); // This marks the auto-run as changed
                assert.deepStrictEqual(log.getAndClearEntries(), [
                    'myDerived.read(myObservable: 2)'
                ]);
                myObservable.set(0, tx);
                assert.deepStrictEqual(log.getAndClearEntries(), []);
            });
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'myDerived.read(myObservable: 0)',
                'myAutorun.run(myDerived: 0)'
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
                    'myObservable1.set (value 2)',
                    'myObservable1.get',
                ]);
                myObservable2.read(reader);
                // First time this observable is read
                assert.deepStrictEqual(log.getAndClearEntries(), [
                    'myObservable2.firstObserverAdded',
                    'myObservable2.get',
                ]);
                d.dispose();
                // Disposing removes all observers
                assert.deepStrictEqual(log.getAndClearEntries(), [
                    'myObservable1.lastObserverRemoved',
                    'myObservable2.lastObserverRemoved',
                ]);
                myObservable3.read(reader);
                // This does not subscribe the observable, because the autorun is disposed
                assert.deepStrictEqual(log.getAndClearEntries(), [
                    'myObservable3.get',
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
            'myObservable.firstObserverAdded',
            'myObservable.get',
            'myComputed(myObservable: 0): start computing',
            'myComputed(myObservable: 0): finished computing',
            'myAutorun(myComputed: 0)'
        ]);
        myObservable.set(1, undefined);
        assert.deepStrictEqual(log.getAndClearEntries(), [
            'myObservable.set (value 1)',
            'myObservable.get',
            'myComputed(myObservable: 1): start computing',
            'myObservable.set (value 2)',
            'myComputed(myObservable: 1): finished computing',
            'myObservable.get',
            'myComputed(myObservable: 2): start computing',
            'myObservable.set (value 3)',
            'myComputed(myObservable: 2): finished computing',
            'myObservable.get',
            'myComputed(myObservable: 3): start computing',
            'myComputed(myObservable: 3): finished computing',
            'myAutorun(myComputed: 3)',
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
            'myObservable.firstObserverAdded',
            'myObservable.get',
            'myAutorun(myObservable: 0): start',
            'myAutorun(myObservable: 0): end',
        ]);
        myObservable.set(1, undefined);
        assert.deepStrictEqual(log.getAndClearEntries(), [
            'myObservable.set (value 1)',
            'myObservable.get',
            'myAutorun(myObservable: 1): start',
            'myObservable.set (value 2)',
            'myAutorun(myObservable: 1): end',
            'myObservable.get',
            'myAutorun(myObservable: 2): start',
            'myObservable.set (value 3)',
            'myAutorun(myObservable: 2): end',
            'myObservable.get',
            'myAutorun(myObservable: 3): start',
            'myObservable.set (value 4)',
            'myAutorun(myObservable: 3): end',
            'myObservable.get',
            'myAutorun(myObservable: 4): start',
            'myAutorun(myObservable: 4): end',
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
            'myObservable.firstObserverAdded',
            'myObservable.get',
            'myDerived1(myObservable: 0): start computing',
            'myDerived2(myDerived1: 0): start computing',
            'myAutorun(myDerived2: 0)',
        ]);
        transaction(tx => {
            myObservable.set(1, tx);
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'myObservable.set (value 1)',
            ]);
            myDerived2.get();
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'myObservable.get',
                'myDerived1(myObservable: 1): start computing',
                'myDerived2(myDerived1: 1): start computing',
            ]);
            myObservable.set(2, tx);
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'myObservable.set (value 2)',
            ]);
        });
        assert.deepStrictEqual(log.getAndClearEntries(), [
            'myObservable.get',
            'myDerived1(myObservable: 2): start computing',
            'myDerived2(myDerived1: 2): start computing',
            'myAutorun(myDerived2: 2)',
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
            'myObservable1.firstObserverAdded',
            'myObservable1.get',
            'myObservable2.firstObserverAdded',
            'myObservable2.get',
            'myDerived2.computed(myObservable2: 0)',
            'myDerived3.computed(myDerived1: 0, myDerived2: 0)',
            'myAutorun(myDerived3: 0 + 0)',
        ]);
        transaction(tx => {
            myObservable1.set(1, tx); // Mark myDerived 3 as stale
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'myObservable1.set (value 1)',
            ]);
            myObservable2.set(10, tx); // This is a non-change. myDerived3 should not be marked as possibly-depedency-changed!
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'myObservable2.set (value 10)',
            ]);
        });
        assert.deepStrictEqual(log.getAndClearEntries(), [
            'myObservable1.get',
            'myObservable2.get',
            'myDerived2.computed(myObservable2: 10)',
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
        assert.deepStrictEqual(log.getAndClearEntries(), ['event fired 2']);
        i++;
        emitter.fire(3);
        assert.deepStrictEqual(log.getAndClearEntries(), ['event fired 3']);
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
            const myObservable = new LoggingObservableValue('myObservable', { state: 'initializing' }, log);
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
            const myObservable = new LoggingObservableValue('myObservable', { state: 'ready' }, log);
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
            const myObservable = new LoggingObservableValue('myObservable', { state: 'initializing' }, log);
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
        const myObservable1 = observableValue('myObservable1', 0);
        const myObservable2 = observableValue('myObservable2', 0);
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
        assert.deepStrictEqual(log.getAndClearEntries(), []);
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
                'myObservable.firstObserverAdded',
                'myObservable.get',
                'error: foobar'
            ]);
            myObservable.set(1, undefined);
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'myObservable.set (value 1)',
                'myObservable.get',
                'error: foobar',
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
                'myObservable.firstObserverAdded',
                'myObservable.get',
            ]);
            myObservable.set(1, undefined);
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'myObservable.set (value 1)',
                'myObservable.get',
                'error: foobar',
            ]);
            myObservable.set(2, undefined);
            assert.deepStrictEqual(log.getAndClearEntries(), [
                'myObservable.set (value 2)',
                'myObservable.get',
                'error: foobar',
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
            'myDerived.computed start',
            'myObservable.firstObserverAdded',
            'myObservable.get',
            'myObservable.set (value 1)',
            'myDerived.computed end',
            'myDerived.computed start',
            'myObservable.get',
            'myDerived.computed end',
            'recomputeInitiallyAndOnChange, myDerived: 1',
        ]);
        myDerived.get();
        assert.deepStrictEqual(log.getAndClearEntries(), ([]));
        store.dispose();
    });
    suite('prevent invalid usage', () => {
        suite('reading outside of compute function', () => {
            test('derived', () => {
                let fn = () => { };
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
                let fn = () => { };
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
                'autorun start',
                'd1.computed start',
                'd2.computed start',
                'Error: Cyclic deriveds are not supported yet!',
                'd1.computed end',
                'autorun end'
            ]));
            disp.dispose();
        });
    });
    suite('observableReducer', () => {
        test('main', () => {
            const store = new DisposableStore();
            const log = new Log();
            const myObservable1 = observableValue('myObservable1', 5);
            const myObservable2 = observableValue('myObservable2', 9);
            const sum = observableReducer(this, {
                initial: () => {
                    log.log('createInitial');
                    return myObservable1.get() + myObservable2.get();
                },
                disposeFinal: (values) => {
                    log.log(`disposeFinal ${values}`);
                },
                changeTracker: recordChanges({ myObservable1, myObservable2 }),
                update: (reader, previousValue, changes) => {
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
                'createInitial',
                'update {"changes":[],"myObservable1":5,"myObservable2":9}',
                'update -> 14',
                'autorun {"changes":[],"sum":14}',
            ]);
            transaction(tx => {
                myObservable1.set(myObservable1.get() + 1, tx, 1);
                myObservable2.set(myObservable2.get() + 3, tx, 3);
            });
            assert.deepStrictEqual(log.getAndClearEntries(), ([
                'update {"changes":[{"key":"myObservable1","change":1},{"key":"myObservable2","change":3}],"myObservable1":6,"myObservable2":12}',
                'update -> 18',
                'autorun {"changes":[{"key":"sum","change":4}],"sum":18}'
            ]));
            transaction(tx => {
                myObservable1.set(myObservable1.get() + 1, tx, 1);
                const s = sum.get();
                log.log(`sum.get() ${s}`);
                myObservable2.set(myObservable2.get() + 3, tx, 3);
            });
            assert.deepStrictEqual(log.getAndClearEntries(), ([
                'update {"changes":[{"key":"myObservable1","change":1}],"myObservable1":7,"myObservable2":12}',
                'update -> 19',
                'sum.get() 19',
                'update {"changes":[{"key":"myObservable2","change":3}],"myObservable1":7,"myObservable2":15}',
                'update -> 22',
                'autorun {"changes":[{"key":"sum","change":1}],"sum":22}'
            ]));
            store.dispose();
            assert.deepStrictEqual(log.getAndClearEntries(), ([
                'disposeFinal 22'
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
                'computed 0',
                'a: 0'
            ]));
            observable1.set(1, undefined);
            assert.deepStrictEqual(log.getAndClearEntries(), ([
                'computed1: 0 disposed',
                'computed 1',
                'a: 1'
            ]));
            a.dispose();
            assert.deepStrictEqual(log.getAndClearEntries(), ([
                'computed1: 1 disposed'
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
                'computed 0',
                'a: 0'
            ]));
            observable1.set(1, undefined);
            assert.deepStrictEqual(log.getAndClearEntries(), ([
                'computed 1',
                'computed1: 0 disposed',
                'a: 1'
            ]));
            a.dispose();
            assert.deepStrictEqual(log.getAndClearEntries(), ([
                'computed1: 1 disposed'
            ]));
        });
    });
    test('derivedHandleChanges with reportChanges', () => {
        const log = new Log();
        const signal1 = observableSignal('signal1');
        const signal2 = observableSignal('signal2');
        const signal2Derived = derivedHandleChanges({ changeTracker: recordChanges({ signal2 }) }, (reader, changeSummary) => {
            for (const c of changeSummary.changes) {
                reader.reportChange({ message: c.change.message + ' (derived)' });
            }
        });
        const d = derivedHandleChanges({
            changeTracker: recordChanges({ signal1, signal2Derived }),
        }, (r, changes) => {
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
            'runOnChange ["signal1: foo, signal2Derived: bar (derived)"]'
        ]));
        transaction(tx => {
            signal2.trigger(tx, { message: 'baz' });
        });
        assert.deepStrictEqual(log.getAndClearEntries(), ([
            'runOnChange ["signal2Derived: baz (derived)"]'
        ]));
        disp.dispose();
    });
});
export class LoggingObserver {
    constructor(debugName, log) {
        this.debugName = debugName;
        this.log = log;
        this.count = 0;
    }
    beginUpdate(observable) {
        this.count++;
        this.log.log(`${this.debugName}.beginUpdate (count ${this.count})`);
    }
    endUpdate(observable) {
        this.log.log(`${this.debugName}.endUpdate (count ${this.count})`);
        this.count--;
    }
    handleChange(observable, change) {
        this.log.log(`${this.debugName}.handleChange (count ${this.count})`);
    }
    handlePossibleChange(observable) {
        this.log.log(`${this.debugName}.handlePossibleChange`);
    }
}
export class LoggingObservableValue extends BaseObservable {
    constructor(debugName, initialValue, logger) {
        super(DebugLocation.ofCaller());
        this.debugName = debugName;
        this.logger = logger;
        this.value = initialValue;
    }
    onFirstObserverAdded() {
        this.logger.log(`${this.debugName}.firstObserverAdded`);
    }
    onLastObserverRemoved() {
        this.logger.log(`${this.debugName}.lastObserverRemoved`);
    }
    get() {
        this.logger.log(`${this.debugName}.get`);
        return this.value;
    }
    set(value, tx, change) {
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
    toString() {
        return `${this.debugName}: ${this.value}`;
    }
}
class Log {
    constructor() {
        this.entries = [];
    }
    log(message) {
        this.entries.push(message);
    }
    getAndClearEntries() {
        const entries = [...this.entries];
        this.entries.length = 0;
        return entries;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib2JzZXJ2YWJsZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L2NvbW1vbi9vYnNlcnZhYmxlcy9vYnNlcnZhYmxlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3RFLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDMUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUM3RSxPQUFPLEVBQXlDLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSw2QkFBNkIsRUFBRSxPQUFPLEVBQUUsaUJBQWlCLEVBQTZELFlBQVksRUFBRSxtQkFBbUIsRUFBRSxnQkFBZ0IsRUFBRSxlQUFlLEVBQUUsYUFBYSxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUsb0JBQW9CLEVBQUUsV0FBVyxFQUFFLGFBQWEsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzdZLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUN0RSxpRUFBaUU7QUFDakUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDL0YsaUVBQWlFO0FBQ2pFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUVsRyxLQUFLLENBQUMsYUFBYSxFQUFFLEdBQUcsRUFBRTtJQUN6QixNQUFNLEVBQUUsR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRXJEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLFVBQVUsRUFBRSxHQUFHLEVBQUU7UUFDdEIsSUFBSSxDQUFDLHNCQUFzQixFQUFFLEdBQUcsRUFBRTtZQUNqQyxN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