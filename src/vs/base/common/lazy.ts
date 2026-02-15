/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

enum LazyValueState {
	Uninitialized,
	Running,
	Completed,
}

export class Lazy<T> {

	private _state = LazyValueState.Uninitialized;
	private _value?: T;
	private _error: Error | undefined;

	constructor(
		private readonly executor: () => T,
	) { }

	/**
	 * True if the lazy value has been resolved.
	 */
	get hasValue(): boolean { return this._state === LazyValueState.Completed; }

	/**
	 * Get the wrapped value.
	 *
	 * This will force evaluation of the lazy value if it has not been resolved yet. Lazy values are only
	 * resolved once. `getValue` will re-throw exceptions that are hit while resolving the value
	 */
	get value(): T {
		if (this._state === LazyValueState.Uninitialized) {
			this._state = LazyValueState.Running;
			try {
				this._value = this.executor();
			} catch (err) {
				this._error = err;
			} finally {
				this._state = LazyValueState.Completed;
			}
		} else if (this._state === LazyValueState.Running) {
			throw new Error('Cannot read the value of a lazy that is being initialized');
		}

		if (this._error) {
			throw this._error;
		}
		return this._value!;
	}

	/**
	 * Get the wrapped value without forcing evaluation.
	 */
	get rawValue(): T | undefined { return this._value; }
}
