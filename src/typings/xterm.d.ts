/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'xterm' {
	function init(options?: any): TermJsTerminal;

	// There seems to be no way to export this so it can be referenced outside of this file when a
	// module is a function.
	interface TermJsTerminal {
		on(event: string, callback: (data: any) => void): void;
		resize(columns: number, rows: number): void;
	}

	export = init;
}