/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as paths from 'vs/base/common/paths';
import { URI } from 'vs/base/common/uri';
import { TPromise, TValueCallback } from 'vs/base/common/winjs.base';
import { canceled } from 'vs/base/common/errors';

export class DeferredTPromise<T> extends TPromise<T> {

	private completeCallback: TValueCallback<T>;
	private errorCallback: (err: any) => void;

	constructor() {
		let captured: any;
		super((c, e) => {
			captured = { c, e };
		});
		this.completeCallback = captured.c;
		this.errorCallback = captured.e;
	}

	public complete(value: T) {
		this.completeCallback(value);
	}

	public error(err: any) {
		this.errorCallback(err);
	}

	public cancel() {
		this.errorCallback(canceled());
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
