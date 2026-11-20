/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'duplexer' {
	export default function duplexer(input: NodeJS.WritableStream, output: NodeJS.ReadableStream): NodeJS.ReadWriteStream;
}
