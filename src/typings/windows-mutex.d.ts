/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'windows-mutex' {
	export class Mutex {
		constructor(name: string);
		isActive(): boolean;
		release(): void;
	}

	export function isActive(name: string): boolean;
}
