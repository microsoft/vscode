/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference types='node'/>

declare module 'iconv-lite' {
	export function decode(buffer: Buffer, encoding: string): string;

	export function encode(content: string | Buffer, encoding: string, options?: { addBOM?: boolean }): Buffer;

	export function encodingExists(encoding: string): boolean;

	export function decodeStream(encoding: string): NodeJS.ReadWriteStream;

	export function encodeStream(encoding: string, options?: { addBOM?: boolean }): NodeJS.ReadWriteStream;
}