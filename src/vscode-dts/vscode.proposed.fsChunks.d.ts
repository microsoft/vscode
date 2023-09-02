/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/84515

	export interface FileSystemProvider {
		open?(resource: Uri, options: { create: boolean }): number | PromiseLike<number>;
		close?(fd: number): void | PromiseLike<void>;
		read?(fd: number, pos: number, data: Uint8Array, offset: number, length: number): number | PromiseLike<number>;
		write?(fd: number, pos: number, data: Uint8Array, offset: number, length: number): number | PromiseLike<number>;
	}
}
