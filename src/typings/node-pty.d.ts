/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'node-pty' {
	export function fork(file: string, args: string[], options: any): Terminal;
	export function spawn(file: string, args: string[], options: any): Terminal;
	export function createTerminal(file: string, args: string[], options: any): Terminal;

	export interface Terminal {
		/**
		 * The title of the active process.
		 */
		process: string;

		on(event: string, callback: (data: any) => void): void;

		resize(columns: number, rows: number): void;

		write(data: string): void;
	}
}