/*---------------------------------------------------------------------------------------------
	*  Copyright (c) Microsoft Corporation. All rights reserved.
	*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { TPromise, PPromise, TValueCallback, TProgressCallback } from 'vs/base/common/winjs.base';
import errors = require('vs/base/common/errors');

export class DeferredTPromise<C> extends TPromise<C> {

	constructor(init:(complete: TValueCallback<C>, error:(err:any)=>void)=>void) {
		super((c, e) => setTimeout(() => init(c, e)));
	}

}

export class DeferredPPromise<C,P> extends PPromise<C, P> {

	private completeCallback:TValueCallback<C>;
	private errorCallback:(err:any)=>void;
	private progressCallback:TProgressCallback<P>;

	constructor(init:(complete: TValueCallback<C>, error:(err:any)=>void, progress: TProgressCallback<P>)=>void = (c, e, p) => {}, oncancel?: any) {
		super((c, e, p) => {this.completeCallback= c; this.errorCallback= e; this.progressCallback= p;}, oncancel ? oncancel : () => this.oncancel);
	}

	private oncancel(): void {
		this.errorCallback(errors.canceled());
	}

	public complete(c: C) {
		this.completeCallback(c);
	}

	public progress(p: P) {
		this.progressCallback(p);
	}

	public error(e: any) {
		this.errorCallback(e);
	}
}