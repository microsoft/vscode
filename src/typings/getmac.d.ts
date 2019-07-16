/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module getmac {
	export function getMac(callback: (error: Error, macAddress: string) => void): void;
}

declare module 'getmac' {
	export = getmac;
}