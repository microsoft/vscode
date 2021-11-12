/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/45407

	export interface TerminalOptions {
		location?: TerminalLocation | TerminalEditorLocationOptions | TerminalSplitLocationOptions;
	}

	export interface ExtensionTerminalOptions {
		location?: TerminalLocation | TerminalEditorLocationOptions | TerminalSplitLocationOptions;
	}

	export enum TerminalLocation {
		Panel = 1,
		Editor = 2,
	}

	export interface TerminalEditorLocationOptions {
		/**
		 * A view column in which the {@link Terminal terminal} should be shown in the editor area.
		 * Use {@link ViewColumn.Active active} to open in the active editor group, other values are
		 * adjusted to be `Min(column, columnCount + 1)`, the
		 * {@link ViewColumn.Active active}-column is not adjusted. Use
		 * {@linkcode ViewColumn.Beside} to open the editor to the side of the currently active one.
		 */
		viewColumn: ViewColumn;
		/**
		 * An optional flag that when `true` will stop the {@link Terminal} from taking focus.
		 */
		preserveFocus?: boolean;
	}

	export interface TerminalSplitLocationOptions {
		/**
		 * The parent terminal to split this terminal beside. This works whether the parent terminal
		 * is in the panel or the editor area.
		 */
		parentTerminal: Terminal;
	}
}
