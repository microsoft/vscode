/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/230165

	/**
	 * Standardize on shell binary with list of possibilities.
	 * For example, 'bash' for bash, 'pwsh' for powershell, 'zsh' for zsh, etc..
	 */
	export type TerminalShellKind = string;


	// Part of TerminalState since the shellKind can change multiple times and this comes with an event.
	// Should remain on state since it is one of those things about terminal that could change, like isinteracted with

	// Discuss reason why string would be better than enum with numbers:
	// 1. String is better for future asks, could never "remove a enum shell with number once added (breaking change)"
	// 2. Its more obvious on extension side (extensions wont have to decode what the enum numbers are equivalent to)
	// 3. Not as messy to maintenance (we already have huge list of enum shell types), for string we don't need to save anything? (But would we have to keep a list of all the possiblities with the binary?)
	export interface TerminalState {
		/**
		 * The current detected shell type of the terminal. New shell types may be added in the
		 * future in which case they will be returned as a number that is not part of
		 * {@link TerminalShellKind}.
		 * Includes number type to prevent the breaking change when new enum members are added?
		 */
		readonly shellKind?: TerminalShellKind | undefined;

		// TODO: update terminal suggest, python env ext.
	}

}
