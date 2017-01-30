/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IProgressService = createDecorator<IProgressService>('progressService');

export interface IProgressService {
	_serviceBrand: any;

	/**
	 * Show progress customized with the provided flags.
	 */
	show(infinite: boolean, delay?: number): IProgressRunner;
	show(total: number, delay?: number): IProgressRunner;

	/**
	 * Indicate progress for the duration of the provided promise. Progress will stop in
	 * any case of promise completion, error or cancellation.
	 */
	showWhile(promise: TPromise<any>, delay?: number): TPromise<void>;
}

export interface IProgressRunner {
	total(value: number): void;
	worked(value: number): void;
	done(): void;
}

export interface IProgress<T> {
	report(item: T): void;
}

export const emptyProgress: IProgress<any> = Object.freeze({ report() { } });

export class Progress<T> implements IProgress<T> {

	private _callback: () => void;
	private _value: T;

	constructor(callback: () => void) {
		this._callback = callback;
	}

	get value() {
		return this._value;
	}

	report(item: T) {
		this._value = item;
		this._callback();
	}
}

export const IProgressService2 = createDecorator<IProgressService2>('progressService2');

export interface IProgressService2 {

	_serviceBrand: any;

	withWindowProgress(title: string, task: (progress: IProgress<string>) => TPromise<any>): void;

	withViewletProgress(viewletId: string, task: (progress: IProgress<number>) => TPromise<any>): void;
}
