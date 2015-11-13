/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import CallbackList from 'vs/base/common/callbackList';
import { EventProvider } from 'vs/base/common/eventProvider';

export class EventSource<T extends Function> {

	private _value: CallbackList;

	public fire(...args: any[]): any[] {
		if(!this._value) {
			return;
		}
		return this._value.invoke.apply(this._value, args);
	}

	public get value(): EventProvider<T> {
		if(!this._value) {
			this._value = new CallbackList();
		}
		return {
			add: (callback, context?, bucket?) => {
				this._value.add(callback, context, bucket);
			},
			remove: this._value.remove.bind(this._value)
		};
	}
}
