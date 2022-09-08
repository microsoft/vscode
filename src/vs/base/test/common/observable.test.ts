/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter } from 'vs/base/common/event';
import { ISettableObservable, autorun, derived, ITransaction, observableFromEvent, observableValue, transaction } from 'vs/base/common/observable';
import { BaseObservable, IObservable, IObserver } from 'vs/base/common/observableImpl/base';

suite('observable integration', () => {
	test('basic observable + autorun', () => {
		const log = new Log();
		const observable = observableValue('MyObservableValue', 0);

		autorun('MyAutorun', (reader) => {
			log.log(`value: ${observable.read(reader)}`);
		});
		assert.deepStrictEqual(log.getAndClearEntries(), ['value: 0']);

		observable.set(1, undefined);
		assert.deepStrictEqual(log.getAndClearEntries(), ['value: 1']);

		observable.set(1, undefined);
		assert.deepStrictEqual(log.getAndClearEntries(), []);

		transaction((tx) => {
			observable.set(2, tx);
			assert.deepStrictEqual(log.getAndClearEntries(), []);

			observable.set(3, tx);
			assert.deepStrictEqual(log.getAndClearEntries(), []);
		});

		assert.deepStrictEqual(log.getAndClearEntries(), ['value: 3']);
	});

	test('basic computed + autorun', () => {
		const log = new Log();
		const observable1 = observableValue('MyObservableValue1', 0);
		const observable2 = observableValue('MyObservableValue2', 0);

		const computed = derived('computed', (reader) => {
			const value1 = observable1.read(reader);
			const value2 = observable2.read(reader);
			const sum = value1 + value2;
			log.log(`recompute: ${value1} + ${value2} = ${sum}`);
			return sum;
		});

		autorun('MyAutorun', (reader) => {
			log.log(`value: ${computed.read(reader)}`);
		});
		assert.deepStrictEqual(log.getAndClearEntries(), [
			'recompute: 0 + 0 = 0',
			'value: 0',
		]);

		observable1.set(1, undefined);
		assert.deepStrictEqual(log.getAndClearEntries(), [
			'recompute: 1 + 0 = 1',
			'value: 1',
		]);

		observable2.set(1, undefined);
		assert.deepStrictEqual(log.getAndClearEntries(), [
			'recompute: 1 + 1 = 2',
			'value: 2',
		]);

		transaction((tx) => {
			observable1.set(5, tx);
			assert.deepStrictEqual(log.getAndClearEntries(), []);

			observable2.set(5, tx);
			assert.deepStrictEqual(log.getAndClearEntries(), []);
		});

		assert.deepStrictEqual(log.getAndClearEntries(), [
			'recompute: 5 + 5 = 10',
			'value: 10',
		]);

		transaction((tx) => {
			observable1.set(6, tx);
			assert.deepStrictEqual(log.getAndClearEntries(), []);

			observable2.set(4, tx);
			assert.deepStrictEqual(log.getAndClearEntries(), []);
		});

		assert.deepStrictEqual(log.getAndClearEntries(), ['recompute: 6 + 4 = 10']);
	});

	test('read during transaction', () => {
		const log = new Log();
		const observable1 = observableValue('MyObservableValue1', 0);
		const observable2 = observableValue('MyObservableValue2', 0);

		const computed = derived('computed', (reader) => {
			const value1 = observable1.read(reader);
			const value2 = observable2.read(reader);
			const sum = value1 + value2;
			log.log(`recompute: ${value1} + ${value2} = ${sum}`);
			return sum;
		});

		autorun('MyAutorun', (reader) => {
			log.log(`value: ${computed.read(reader)}`);
		});

		assert.deepStrictEqual(log.getAndClearEntries(), [
			'recompute: 0 + 0 = 0',
			'value: 0',
		]);

		log.log(`computed is ${computed.get()}`);
		assert.deepStrictEqual(log.getAndClearEntries(), ['computed is 0']);

		transaction((tx) => {
			observable1.set(-1, tx);
			log.log(`computed is ${computed.get()}`);
			assert.deepStrictEqual(log.getAndClearEntries(), [
				'recompute: -1 + 0 = -1',
				'computed is -1',
			]);

			log.log(`computed is ${computed.get()}`);
			assert.deepStrictEqual(log.getAndClearEntries(), ['computed is -1']);

			observable2.set(1, tx);
			assert.deepStrictEqual(log.getAndClearEntries(), []);
		});
		assert.deepStrictEqual(log.getAndClearEntries(), [
			'recompute: -1 + 1 = 0',
			'value: 0',
		]);
	});

	test('topological order', () => {
		const log = new Log();
		const observable1 = observableValue('MyObservableValue1', 0);
		const observable2 = observableValue('MyObservableValue2', 0);

		const computed1 = derived('computed1', (reader) => {
			const value1 = observable1.read(reader);
			const value2 = observable2.read(reader);
			const sum = value1 + value2;
			log.log(`recompute1: ${value1} + ${value2} = ${sum}`);
			return sum;
		});

		const computed2 = derived('computed2', (reader) => {
			const value1 = computed1.read(reader);
			const value2 = observable1.read(reader);
			const value3 = observable2.read(reader);
			const sum = value1 + value2 + value3;
			log.log(`recompute2: ${value1} + ${value2} + ${value3} = ${sum}`);
			return sum;
		});

		const computed3 = derived('computed3', (reader) => {
			const value1 = computed2.read(reader);
			const value2 = observable1.read(reader);
			const value3 = observable2.read(reader);
			const sum = value1 + value2 + value3;
			log.log(`recompute3: ${value1} + ${value2} + ${value3} = ${sum}`);
			return sum;
		});

		autorun('MyAutorun', (reader) => {
			log.log(`value: ${computed3.read(reader)}`);
		});
		assert.deepStrictEqual(log.getAndClearEntries(), [
			'recompute1: 0 + 0 = 0',
			'recompute2: 0 + 0 + 0 = 0',
			'recompute3: 0 + 0 + 0 = 0',
			'value: 0',
		]);

		observable1.set(1, undefined);
		assert.deepStrictEqual(log.getAndClearEntries(), [
			'recompute1: 1 + 0 = 1',
			'recompute2: 1 + 1 + 0 = 2',
			'recompute3: 2 + 1 + 0 = 3',
			'value: 3',
		]);

		transaction((tx) => {
			observable1.set(2, tx);
			log.log(`computed2: ${computed2.get()}`);
			assert.deepStrictEqual(log.getAndClearEntries(), [
				'recompute1: 2 + 0 = 2',
				'recompute2: 2 + 2 + 0 = 4',
				'computed2: 4',
			]);

			observable1.set(3, tx);
			log.log(`computed2: ${computed2.get()}`);
			assert.deepStrictEqual(log.getAndClearEntries(), [
				'recompute1: 3 + 0 = 3',
				'recompute2: 3 + 3 + 0 = 6',
				'computed2: 6',
			]);
		});
		assert.deepStrictEqual(log.getAndClearEntries(), [
			'recompute3: 6 + 3 + 0 = 9',
			'value: 9',
		]);
	});

	test('self-disposing autorun', () => {
		const log = new Log();

		const observable1 = new LoggingObservableValue('MyObservableValue1', 0, log);
		const observable2 = new LoggingObservableValue('MyObservableValue2', 0, log);
		const observable3 = new LoggingObservableValue('MyObservableValue3', 0, log);

		const d = autorun('autorun', (reader) => {
			if (observable1.read(reader) >= 2) {
				observable2.read(reader);
				d.dispose();
				observable3.read(reader);
			}
		});
		assert.deepStrictEqual(log.getAndClearEntries(), [
			'MyObservableValue1.firstObserverAdded',
			'MyObservableValue1.get',
		]);

		observable1.set(1, undefined);
		assert.deepStrictEqual(log.getAndClearEntries(), [
			'MyObservableValue1.set (value 1)',
			'MyObservableValue1.get',
		]);

		observable1.set(2, undefined);
		assert.deepStrictEqual(log.getAndClearEntries(), [
			'MyObservableValue1.set (value 2)',
			'MyObservableValue1.get',
			'MyObservableValue2.firstObserverAdded',
			'MyObservableValue2.get',
			'MyObservableValue1.lastObserverRemoved',
			'MyObservableValue2.lastObserverRemoved',
			'MyObservableValue3.get',
		]);
	});

	test('from event', () => {
		const log = new Log();

		let value = 0;
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
		assert.deepStrictEqual(log.getAndClearEntries(), []);

		log.log(`get value: ${observable.get()}`);
		assert.deepStrictEqual(log.getAndClearEntries(), [
			'compute value 0',
			'get value: 0',
		]);

		log.log(`get value: ${observable.get()}`);
		assert.deepStrictEqual(log.getAndClearEntries(), [
			'compute value 0',
			'get value: 0',
		]);

		const shouldReadObservable = observableValue('shouldReadObservable', true);

		const autorunDisposable = autorun('MyAutorun', (reader) => {
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

		log.log(`get value: ${observable.get()}`);
		assert.deepStrictEqual(log.getAndClearEntries(), ['get value: 0']);

		value = 1;
		eventEmitter.fire();
		assert.deepStrictEqual(log.getAndClearEntries(), [
			'compute value 1',
			'autorun, should read: true, value: 1',
		]);

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
		// Maybe this scenario should not be supported.

		const log = new Log();
		const observable1 = observableValue('MyObservableValue1', 0);
		const computed1 = derived('computed', (reader) => {
			const value1 = observable1.read(reader);
			const result = value1 % 3;
			log.log(`recompute1: ${value1} % 3 = ${result}`);
			return result;
		});
		const computed2 = derived('computed', (reader) => {
			const value1 = computed1.read(reader);

			const result = value1 * 2;
			log.log(`recompute2: ${value1} * 2 = ${result}`);
			return result;
		});
		const computed3 = derived('computed', (reader) => {
			const value1 = computed1.read(reader);

			const result = value1 * 3;
			log.log(`recompute3: ${value1} * 3 = ${result}`);
			return result;
		});
		const computedSum = derived('computed', (reader) => {
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
		assert.deepStrictEqual(log.getAndClearEntries(), [
			'recompute1: 1 % 3 = 1',
			'recompute2: 1 * 2 = 2',
			'recompute3: 1 * 3 = 3',
			'recompute4: 2 + 3 = 5',
			'value: 5',
		]);
	});
});

suite('observable details', () => {
	test('1', () => {
		const log = new Log();

		const shouldReadObservable = observableValue('shouldReadObservable', true);
		const observable = new LoggingObservableValue('observable', 0, log);
		const computed = derived('test', reader => {
			if (shouldReadObservable.read(reader)) {
				return observable.read(reader) * 2;
			}
			return 1;
		});
		autorun('test', reader => {
			const value = computed.read(reader);
			log.log(`autorun: ${value}`);
		});

		assert.deepStrictEqual(log.getAndClearEntries(), (["observable.firstObserverAdded", "observable.get", "autorun: 0"]));

		transaction(tx => {
			observable.set(1, tx);
			assert.deepStrictEqual(log.getAndClearEntries(), (["observable.set (value 1)"]));

			shouldReadObservable.set(false, tx);
			assert.deepStrictEqual(log.getAndClearEntries(), ([]));

			computed.get();
			assert.deepStrictEqual(log.getAndClearEntries(), (["observable.lastObserverRemoved"]));
		});
		assert.deepStrictEqual(log.getAndClearEntries(), (["autorun: 1"]));
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
	handleChange<T, TChange>(observable: IObservable<T, TChange>, change: TChange): void {
		this.log.log(`${this.debugName}.handleChange (count ${this.count})`);
	}
	endUpdate<T>(observable: IObservable<T, void>): void {
		this.log.log(`${this.debugName}.endUpdate (count ${this.count})`);
		this.count--;
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
