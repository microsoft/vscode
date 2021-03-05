/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// from TypeScript: lib.es2015.proxy.d.ts

interface ProxyHandler<T extends object> {
	getPrototypeOf?(target: T): object | null;
	setPrototypeOf?(target: T, v: any): boolean;
	isExtensible?(target: T): boolean;
	preventExtensions?(target: T): boolean;
	getOwnPropertyDescriptor?(target: T, p: PropertyKey): PropertyDescriptor | undefined;
	has?(target: T, p: PropertyKey): boolean;
	get?(target: T, p: PropertyKey, receiver: any): any;
	set?(target: T, p: PropertyKey, value: any, receiver: any): boolean;
	deleteProperty?(target: T, p: PropertyKey): boolean;
	defineProperty?(target: T, p: PropertyKey, attributes: PropertyDescriptor): boolean;
	enumerate?(target: T): PropertyKey[];
	ownKeys?(target: T): PropertyKey[];
	apply?(target: T, thisArg: any, argArray?: any): any;
	construct?(target: T, argArray: any, newTarget?: any): object;
}

interface ProxyConstructor {
	revocable<T extends object>(target: T, handler: ProxyHandler<T>): { proxy: T; revoke: () => void; };
	new <T extends object>(target: T, handler: ProxyHandler<T>): T;
}
declare var Proxy: ProxyConstructor;
