/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// Interfaces for WinJS

export type ErrorCallback = (error: any) => void;

export class Promise<T = any> {
	constructor(executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason: any) => void) => void);

	public then<TResult1 = T, TResult2 = never>(
		onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2>;


	public static as(value: null): Promise<null>;
	public static as(value: undefined): Promise<undefined>;
	public static as<T>(value: PromiseLike<T>): PromiseLike<T>;
	public static as<T, SomePromise extends PromiseLike<T>>(value: SomePromise): SomePromise;
	public static as<T>(value: T): Promise<T>;

	public static join<T1, T2>(promises: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>]): Promise<[T1, T2]>;
	public static join<T>(promises: (T | PromiseLike<T>)[]): Promise<T[]>;

	public static wrap<T>(value: T | PromiseLike<T>): Promise<T>;

	public static wrapError<T = never>(error: Error): Promise<T>;

	/**
	 * @internal
	 */
	public static addEventListener(event: 'error', promiseErrorHandler: (e: IPromiseError) => void): void;
}

export type TValueCallback<T = any> = (value: T | PromiseLike<T>) => void;

export {
	Promise as TPromise,
	TValueCallback as ValueCallback
};

export interface IPromiseErrorDetail {
	parent: Promise;
	error: any;
	id: number;
	handler: Function;
	exception: Error;
}

export interface IPromiseError {
	detail: IPromiseErrorDetail;
}
