/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export interface ISplice<T> {
	start: number;
	deleteCount: number;
	toInsert: T[];
}

export interface ISpliceable<T> {
	splice(start: number, deleteCount: number, toInsert: T[]): void;
}