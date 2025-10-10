/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, IObserver, IObservableWithChange } from '../base.js';
import { ConvenientObservable } from './baseObservable.js';

/**
 * Represents an efficient observable whose value never changes.
 */

export function constObservable<T>(value: T): IObservable<T> {
	return new ConstObservable(value);
}
class ConstObservable<T> extends ConvenientObservable<T, void> {
	constructor(private readonly value: T) {
		super();
	}

	public override get debugName(): string {
		return this.toString();
	}

	public get(): T {
		return this.value;
	}
	public addObserver(observer: IObserver): void {
		// NO OP
	}
	public removeObserver(observer: IObserver): void {
		// NO OP
	}

	override log(): IObservableWithChange<T, void> {
		return this;
	}

	override toString(): string {
		return `Const: ${this.value}`;
	}
}
