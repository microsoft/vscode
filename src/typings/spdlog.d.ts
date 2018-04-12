/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'spdlog' {

	export const version: string;
	export function setAsyncMode(bufferSize: number, flushInterval: number);

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

		trace(message: string);
		debug(message: string);
		info(message: string);
		warn(message: string);
		error(message: string);
		critical(message: string);
		setLevel(level: number);
		clearFormatters();
		/**
		 * A synchronous operation to flush the contents into file
		*/
		flush(): void;
		drop(): void;
	}
}