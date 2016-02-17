/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare namespace weak {
	interface WeakRef {
		// tagging
	}
}

declare const weak: WeakFunction;

interface WeakFunction {
	<T>(obj: T, callback?: () => any): T & weak.WeakRef;
	(obj: any, callback?: () => any): any & weak.WeakRef;

	get(ref: weak.WeakRef): any;
	get<T>(ref: weak.WeakRef): T;

	isDead(ref: weak.WeakRef): boolean;
	isNearDeath(ref: weak.WeakRef): boolean;
	isWeakRef(obj: any): boolean;
}

declare module 'weak' {
	export = weak;
}