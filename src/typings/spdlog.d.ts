/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'spdlog' {

	export const version: string;
	export function setAsyncMode(bufferSize: number, flushInterval: number): void;
	export function createRotatingLogger(name: string, filename: string, filesize: number, filecount: number): RotatingLogger;
	export function createRotatingLoggerAsync(name: string, filename: string, filesize: number, filecount: number): Promise<RotatingLogger>;

	export enum LogLevel {
		CRITICAL,
		ERROR,
		WARN,
		INFO,
		DEBUG,
		TRACE,
		OFF
	}

	export class RotatingLogger {
		constructor(name: string, filename: string, filesize: number, filecount: number);

		trace(message: string): void;
		debug(message: string): void;
		info(message: string): void;
		warn(message: string): void;
		error(message: string): void;
		critical(message: string): void;
		setLevel(level: number): void;
		clearFormatters(): void;
		/**
		 * A synchronous operation to flush the contents into file
		*/
		flush(): void;
		drop(): void;
	}
}