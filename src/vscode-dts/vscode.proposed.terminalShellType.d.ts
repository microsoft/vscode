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
		Bash,
		Fish,
		Csh,
		Ksh,
		Zsh,
		CommandPrompt,
		GitBash,
		PowerShell,
		Python,
		Julia,
		NuShell
	}

	// NOTE: State since this the shellType can change multiple times and this comes with an event.
	export interface TerminalState {
		/**
		 * The current detected shell type of the terminal. New shell types may be added in the
		 * future in which case they will be returned as a number that is not part of
		 * {@link TerminalShellType}.
		 * TODO: number is to prevent the breaking change when new enum members are added?
		 */
		readonly shellType?: TerminalShellType | number | undefined;
	}

}
