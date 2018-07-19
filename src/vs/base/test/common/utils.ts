/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as paths from 'vs/base/common/paths';
import URI from 'vs/base/common/uri';
import { TPromise, TValueCallback } from 'vs/base/common/winjs.base';

export class DeferredTPromise<T> extends TPromise<T> {

	public canceled: boolean;

	private completeCallback: TValueCallback<T>;
	private errorCallback: (err: any) => void;

	constructor(oncancel?: any) {
		let captured: any;
		super((c, e) => {
			captured = { c, e };
		}, oncancel ? oncancel : () => this.oncancel);
		this.canceled = false;
		this.completeCallback = captured.c;
		this.errorCallback = captured.e;
	}

	public complete(value: T) {
		this.completeCallback(value);
	}

	public error(err: any) {
		this.errorCallback(err);
	}

	private oncancel(): void {
		this.canceled = true;
	}
}

export function toResource(this: any, path: string) {
	return URI.file(paths.join('C:\\', Buffer.from(this.test.fullTitle()).toString('base64'), path));
}

export function suiteRepeat(n: number, description: string, callback: (this: any) => void): void {
	for (let i = 0; i < n; i++) {
		suite(`${description} (iteration ${i})`, callback);
	}
}

export function testRepeat(n: number, description: string, callback: (this: any, done: MochaDone) => any): void {
	for (let i = 0; i < n; i++) {
		test(`${description} (iteration ${i})`, callback);
	}
}

export function testRepeatOnly(n: number, description: string, callback: (this: any, done: MochaDone) => any): void {
	suite.only('repeat', () => testRepeat(n, description, callback));
}
