/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise, ValueCallback, ErrorCallback } from 'vs/base/common/winjs.base';

export class LazyPromise {

	private _onCancel: () => void;

	private _actual: TPromise<any>;
	private _actualOk: ValueCallback;
	private _actualErr: ErrorCallback;

	private _hasValue: boolean;
	private _value: any;

	private _hasErr: boolean;
	private _err: any;

	private _isCanceled: boolean;

	constructor(onCancel: () => void) {
		this._onCancel = onCancel;
		this._actual = null;
		this._actualOk = null;
		this._actualErr = null;
		this._hasValue = false;
		this._value = null;
		this._hasErr = false;
		this._err = null;
		this._isCanceled = false;
	}

	private _ensureActual(): TPromise<any> {
		if (!this._actual) {
			this._actual = new TPromise<any>((c, e) => {
				this._actualOk = c;
				this._actualErr = e;
			}, this._onCancel);

			if (this._hasValue) {
				this._actualOk(this._value);
			}

			if (this._hasErr) {
				this._actualErr(this._err);
			}
		}
		return this._actual;
	}

	public resolveOk(value: any): void {
		if (this._isCanceled || this._hasErr) {
			return;
		}

		this._hasValue = true;
		this._value = value;

		if (this._actual) {
			this._actualOk(value);
		}
	}

	public resolveErr(err: any): void {
		if (this._isCanceled || this._hasValue) {
			return;
		}

		this._hasErr = true;
		this._err = err;

		if (this._actual) {
			this._actualErr(err);
		}
	}

	public then(success: any, error: any): any {
		if (this._isCanceled) {
			return;
		}

		return this._ensureActual().then(success, error);
	}

	public done(success: any, error: any): void {
		if (this._isCanceled) {
			return;
		}

		this._ensureActual().done(success, error);
	}

	public cancel(): void {
		if (this._hasValue || this._hasErr) {
			return;
		}

		this._isCanceled = true;

		if (this._actual) {
			this._actual.cancel();
		} else {
			this._onCancel();
		}
	}
}
