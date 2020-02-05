/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface ArrayConstructor {
	isArray<T>(arg: ReadonlyArray<T> | null | undefined): arg is ReadonlyArray<T>;
	isArray<T>(arg: Array<T> | null | undefined): arg is Array<T>;
	isArray(arg: any): arg is Array<any>;
	isArray<T>(arg: any): arg is Array<T>;
}