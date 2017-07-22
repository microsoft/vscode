/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference path='./node.d.ts'/>

declare module 'iconv-lite' {
	export function decode(buffer: NodeBuffer, encoding: string, options?: any): string;

	export function encode(content: string, encoding: string, options?: any): NodeBuffer;

	export function encodingExists(encoding: string): boolean;

	export function decodeStream(encoding: string): NodeJS.ReadWriteStream;

	export function encodeStream(encoding: string): NodeJS.ReadWriteStream;
}