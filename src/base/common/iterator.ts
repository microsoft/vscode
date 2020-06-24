/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IteratorDefinedResult<T> {
	readonly done: false;
	readonly value: T;
}

export interface IteratorUndefinedResult {
	readonly done: true;
	readonly value: undefined;
}

export const FIN: IteratorUndefinedResult = { done: true, value: undefined };
export type IteratorResult<T> = IteratorDefinedResult<T> | IteratorUndefinedResult;

export interface Iterator<T> {
	next(): IteratorResult<T>;
}
