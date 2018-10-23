/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from 'vs/base/common/errors';
import { ErrorCallback, TPromise, ValueCallback } from 'vs/base/common/winjs.base';

export class LazyPromise implements Thenable<any> {

	private _actual: TPromise<any> | null;
	private _actualOk: ValueCallback | null;
	private _actualErr: ErrorCallback | null;

	private _hasValue: boolean;
	private _value: any;

	private _hasErr: boolean;
	private _err: any;

	constructor() {
		this._actual = null;
		this._actualOk = null;
		this._actualErr = null;
		this._hasValue = false;
		this._value = null;
		this._hasErr = false;
		this._err = null;
	}

	private _ensureActual(): TPromise<any> {
		if (!this._actual) {
			this._actual = new TPromise<any>((c, e) => {
				this._actualOk = c;
				this._actualErr = e;

				if (this._hasValue) {
					this._actualOk(this._value);
				}

				if (this._hasErr) {
					this._actualErr(this._err);
				}
			});
		}
		return this._actual;
	}

	public resolveOk(value: any): void {
		if (this._hasValue || this._hasErr) {
			return;
		}

		this._hasValue = true;
		this._value = value;

		if (this._actual) {
			this._actualOk!(value);
		}
	}

	public resolveErr(err: any): void {
		if (this._hasValue || this._hasErr) {
			return;
		}

		this._hasErr = true;
		this._err = err;

		if (this._actual) {
			this._actualErr!(err);
		} else {
			// If nobody's listening at this point, it is safe to assume they never will,
			// since resolving this promise is always "async"
			onUnexpectedError(err);
		}
	}

	public then(success: any, error: any): any {
		return this._ensureActual().then(success, error);
	}
}
