/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'spdlog' {

	export const version: string;

	export class RotatingLogger {
		constructor(name: string, filename: string, filesize: number, filecount: number);

		trace(message: string);
		debug(message: string);
		info(message: string);
		warn(message: string);
		error(message: string);
		critical(message: string);
		flush(): void;
	}
}