/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export enum LogLevel {
		Trace = 0,
		Debug = 1,
		Info = 2,
		Warning = 3,
		Error = 4,
		Critical = 5,
		Off = 6,
	}

	export interface ExtensionContext {

		log(level: LogLevel, message: string, ...args: any[]): void;
		log(level: LogLevel.Error | LogLevel.Critical, e: Error, ...args: any[]): void;

	}
}
