/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/230165

	/**
	 * Known terminal shell types.
	 */
	export enum TerminalShellType {
		Sh = 1,
		Bash = 2,
		Fish = 3,
		Csh = 4,
		Ksh = 5,
		Zsh = 6,
		CommandPrompt = 7,
		GitBash = 8,
		PowerShell = 9,
		Python = 10,
		Julia = 11,
		NuShell = 12,
		Node = 13
	}

	// Part of TerminalState since the shellType can change multiple times and this comes with an event.
	export interface TerminalState {
		/**
		 * The current detected shell type of the terminal. New shell types may be added in the
		 * future in which case they will be returned as a number that is not part of
		 * {@link TerminalShellType}.
		 * Includes number type to prevent the breaking change when new enum members are added?
		 */
		readonly shellType?: TerminalShellType | number | undefined;
	}

}
