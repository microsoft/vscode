/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, ITransaction } from '../base.js';
import { subtransaction } from '../transaction.js';
import { EqualityComparer, Event, IDisposable, strictEquals } from '../commonFacade/deps.js';
import { DebugOwner, DebugNameData, IDebugNameData } from '../debugName.js';
import { getLogger } from '../logging/logging.js';
import { BaseObservable } from './baseObservable.js';
import { DebugLocation } from '../debugLocation.js';


export function observableFromEvent<T, TArgs = unknown>(
	owner: DebugOwner,
	event: Event<TArgs>,
	getValue: (args: TArgs | undefined) => T,
	debugLocation?: DebugLocation,
): IObservable<T>;
export function observableFromEvent<T, TArgs = unknown>(
	event: Event<TArgs>,
	getValue: (args: TArgs | undefined) => T,
): IObservable<T>;
export function observableFromEvent(...args:
	[owner: DebugOwner, event: Event<any>, getValue: (args: any | undefined) => any, debugLocation?: DebugLocation] |
	[event: Event<any>, getValue: (args: any | undefined) => any]
): IObservable<any> {
	let owner;
	let event;
	let getValue;
	let debugLocation;
	if (args.length === 2) {
		[event, getValue] = args;
	} else {
		[owner, event, getValue, debugLocation] = args;
	}
	return new FromEventObservable(
		new DebugNameData(owner, undefined, getValue),
		event,
		getValue,
		() => FromEventObservable.globalTransaction,
		strictEquals,
		debugLocation ?? DebugLocation.ofCaller()
	);
}

export function observableFromEventOpts<T, TArgs = unknown>(
	options: IDebugNameData & {
		equalsFn?: EqualityComparer<T>;
	},
	event: Event<TArgs>,
	getValue: (args: TArgs | undefined) => T,
	debugLocation = DebugLocation.ofCaller()
): IObservable<T> {
	return new FromEventObservable(
		new DebugNameData(options.owner, options.debugName, options.debugReferenceFn ?? getValue),
		event,
		getValue, () => FromEventObservable.globalTransaction, options.equalsFn ?? strictEquals, debugLocation
	);
}

export class FromEventObservable<TArgs, T> extends BaseObservable<T> {
	public static globalTransaction: ITransaction | undefined;

	private _value: T | undefined;
	private _hasValue = false;
	private _subscription: IDisposable | undefined;

	constructor(
		private readonly _debugNameData: DebugNameData,
		private readonly event: Event<TArgs>,
		public readonly _getValue: (args: TArgs | undefined) => T,
		private readonly _getTransaction: () => ITransaction | undefined,
		private readonly _equalityComparator: EqualityComparer<T>,
		debugLocation: DebugLocation
	) {
		super(debugLocation);
	}

	private getDebugName(): string | undefined {
		return this._debugNameData.getDebugName(this);
	}

	public get debugName(): string {
		const name = this.getDebugName();
		return 'From Event' + (name ? `: ${name}` : '');
	}

	protected override onFirstObserverAdded(): void {
		this._subscription = this.event(this.handleEvent);
	}

	private readonly handleEvent = (args: TArgs | undefined) => {
		const newValue = this._getValue(args);
		const oldValue = this._value;

		const didChange = !this._hasValue || !(this._equalityComparator(oldValue!, newValue));
		let didRunTransaction = false;

		if (didChange) {
			this._value = newValue;

			if (this._hasValue) {
				didRunTransaction = true;
				subtransaction(
					this._getTransaction(),
					(tx) => {
						getLogger()?.handleObservableUpdated(this, { oldValue, newValue, change: undefined, didChange, hadValue: this._hasValue });

						for (const o of this._observers) {
							tx.updateObserver(o, this);
							o.handleChange(this, undefined);
						}
					},
					() => {
						const name = this.getDebugName();
						return 'Event fired' + (name ? `: ${name}` : '');
					}
				);
			}
			this._hasValue = true;
		}

		if (!didRunTransaction) {
			getLogger()?.handleObservableUpdated(this, { oldValue, newValue, change: undefined, didChange, hadValue: this._hasValue });
		}
	};

	protected override onLastObserverRemoved(): void {
		this._subscription!.dispose();
		this._subscription = undefined;
		this._hasValue = false;
		this._value = undefined;
	}

	public get(): T {
		if (this._subscription) {
			if (!this._hasValue) {
				this.handleEvent(undefined);
			}
			return this._value!;
		} else {
			// no cache, as there are no subscribers to keep it updated
			const value = this._getValue(undefined);
			return value;
		}
	}

	public debugSetValue(value: unknown): void {
		// eslint-disable-next-line local/code-no-any-casts
		this._value = value as any;
	}

	public debugGetState() {
		return { value: this._value, hasValue: this._hasValue };
	}
}

export namespace observableFromEvent {
	export const Observer = FromEventObservable;

	export function batchEventsGlobally(tx: ITransaction, fn: () => void): void {
		let didSet = false;
		if (FromEventObservable.globalTransaction === undefined) {
			FromEventObservable.globalTransaction = tx;
			didSet = true;
		}
		try {
			fn();
		} finally {
			if (didSet) {
				FromEventObservable.globalTransaction = undefined;
			}
		}
	}
}
