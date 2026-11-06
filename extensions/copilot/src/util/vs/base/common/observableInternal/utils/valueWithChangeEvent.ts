//!!! DO NOT modify, this file was COPIED from 'microsoft/vscode'

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../base';
import { Event, IValueWithChangeEvent } from '../commonFacade/deps';
import { DebugOwner } from '../debugName';
import { observableFromEvent } from '../observables/observableFromEvent';

export class ValueWithChangeEventFromObservable<T> implements IValueWithChangeEvent<T> {
	constructor(public readonly observable: IObservable<T>) {
	}

	get onDidChange(): Event<void> {
		return Event.fromObservableLight(this.observable);
	}

	get value(): T {
		return this.observable.get();
	}
}

export function observableFromValueWithChangeEvent<T>(owner: DebugOwner, value: IValueWithChangeEvent<T>): IObservable<T> {
	if (value instanceof ValueWithChangeEventFromObservable) {
		return value.observable;
	}
	return observableFromEvent(owner, value.onDidChange, () => value.value);
}
