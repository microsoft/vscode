/*
 * lazy.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

export interface Lazy<T> {
	readonly value: T;
	readonly hasValue: boolean;
	map<R>(f: (x: T) => R): Lazy<R>;
}

class LazyValue<T> implements Lazy<T> {
	#hasValue = false;
	#value?: T;

	readonly #getValue: () => T;

	constructor(getValue: () => T) {
		this.#getValue = getValue;
	}

	get value(): T {
		if (!this.#hasValue) {
			this.#hasValue = true;
			this.#value = this.#getValue();
		}
		return this.#value!;
	}

	get hasValue(): boolean {
		return this.#hasValue;
	}

	public map<R>(f: (x: T) => R): Lazy<R> {
		return new LazyValue(() => f(this.value));
	}
}

export function lazy<T>(getValue: () => T): Lazy<T> {
	return new LazyValue<T>(getValue);
}