/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/// Interfaces for WinJS

export type ErrorCallback = (error: any) => void;
export type ProgressCallback<TProgress = any> = (progress: TProgress) => void;

export declare class Promise<T = any, TProgress = any> {
	constructor(
		executor: (
			resolve: (value: T | PromiseLike<T>) => void,
			reject: (reason: any) => void,
			progress: (progress: TProgress) => void) => void,
			oncancel?: () => void);

	public then<TResult1 = T, TResult2 = never>(
		onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
		onprogress?: (progress: TProgress) => void): Promise<TResult1 | TResult2, TProgress>;

	public done(
		onfulfilled?: (value: T) => void,
		onrejected?: (reason: any) => void,
		onprogress?: (progress: TProgress) => void): void;

	public cancel(): void;

	public static as(value: null): Promise<null>;
	public static as(value: undefined): Promise<undefined>;
	public static as<T, TPromise extends PromiseLike<T>>(value: TPromise): TPromise;
	public static as<T>(value: T): Promise<T>;

	public static is(value: any): value is PromiseLike<any>;

	public static timeout(delay: number): Promise<void>;

	public static join<T1, T2>(promises: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>]): Promise<[T1, T2]>;
	public static join<T>(promises: (T | PromiseLike<T>)[]): Promise<T[]>;
	public static join<T>(promises: { [n: string]: T | PromiseLike<T> }): Promise<{ [n: string]: T }>;

	public static any<T>(promises: (T | PromiseLike<T>)[]): Promise<{ key: string; value: Promise<T>; }>;

	public static wrap<T>(value: T | PromiseLike<T>): Promise<T>;

	public static wrapError<T = never>(error: Error): Promise<T>;

	/**
	 * @internal
	 */
	public static addEventListener(event: 'error', promiseErrorHandler: (e: IPromiseError) => void);
}

export type TValueCallback<T = any> = (value: T | PromiseLike<T>) => void;

export {
	Promise as TPromise,
	Promise as PPromise,
	TValueCallback as ValueCallback,
	ProgressCallback as TProgressCallback
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
