/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vscode-uri';
import { Event } from 'vscode-jsonrpc';
import { LogLevel, FileStat, Disposable } from 'vscode';

/**
 * Type for any function.
 */
// its ok to disable any here because it is the only way to make
// the type work and the type does not really matter in this case
export type TAnyFunction = (...args: any[]) => unknown;

/**
 * File system service interface.
 */
export interface IFileSystemService {
	stat(uri: URI): Promise<FileStat>;
	readFile(uri: URI): Promise<Uint8Array>;
	writeFile(uri: URI, contents: Uint8Array): Promise<void>;
	createDirectory(uri: URI): Promise<void>;
	delete(uri: URI, options?: { recursive?: boolean; useTrash?: boolean }): Promise<void>;
	onFileChange(uri: URI, callback: (event: FileChangeEvent) => void): Disposable;
}

/**
 * File change event types.
 */
export enum FileChangeEvent {
	/**
	 * File was added.
	 */
	ADDED = 'added',

	/**
	 * File contents updated.
	 */
	UPDATED = 'updated',

	/**
	 * File was deleted.
	 */
	DELETED = 'deleted',
}

/**
 * Log service interface.
 */
export interface ILogService {
	onDidChangeLogLevel: Event<LogLevel>;

	trace(message: string, ...args: any[]): void;
	debug(message: string, ...args: any[]): void;
	info(message: string, ...args: any[]): void;
	warn(message: string, ...args: any[]): void;
	error(message: string | Error, ...args: any[]): void;

	getLevel(): LogLevel;

	// TODO: @lego
	// setLevel(level: LogLevel): void;
	// flush(): void;
}
