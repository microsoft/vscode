/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface Hash {
	update(data: string): Hash;
	digest(encoding: 'base64'): string;
}

export interface Host {
	createHash(algorithm: string): Hash;
	isDebugging(): boolean;
}