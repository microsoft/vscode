/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vscode-uri';
import { FileStat, Disposable } from 'vscode';

/**
 * Type for any function.
 */
// its ok to disable any here because it is the only way to make
// the type work and the type does not really matter in this case
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TAnyFunction = (...args: any[]) => unknown;

/**
 * TODO: @legomushroom
 */
export interface IFileSystem {
	stat(uri: URI): Promise<FileStat>;
	readFile(uri: URI): Promise<Uint8Array>;
	writeFile(uri: URI, contents: Uint8Array): Promise<void>;
	delete(uri: URI, options?: { recursive?: boolean; useTrash?: boolean }): Promise<void>;
	onFileChange(uri: URI, callback: (event: FileChangeEvent) => void): Disposable;
}

/**
 * TODO: @legomushroom
 */
export enum FileChangeEvent {
	ADDED = 'added',
	UPDATED = 'updated',
	DELETED = 'deleted',
}
