/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';

/**
 * A barrier that is initially closed and then becomes opened permanently.
 */
export class Barrier {

	private _isOpen: boolean;
	private _promise: TPromise<boolean>;
	private _completePromise: (v: boolean) => void;

	constructor() {
		this._isOpen = false;
		this._promise = new TPromise<boolean>((c, e, p) => {
			this._completePromise = c;
		}, () => {
			console.warn('You should really not try to cancel this ready promise!');
		});
	}

	public isOpen(): boolean {
		return this._isOpen;
	}

	public open(): void {
		this._isOpen = true;
		this._completePromise(true);
	}

	public wait(): TPromise<boolean> {
		return this._promise;
	}
}
