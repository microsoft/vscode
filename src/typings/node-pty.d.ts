/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'node-pty' {
	export type ArgvOrCommandLine = string[] | string;

	export function spawn(file: string, args: ArgvOrCommandLine, options: any): Terminal;

	export interface Terminal {
		pid: number;

		/**
		 * The title of the active process.
 		 */
		process: string;

		on(event: string, callback: (data: any) => void): void;

		resize(columns: number, rows: number): void;

		write(data: string): void;

		kill(): void;
	}
}