/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface TerminalOptions {
		/**
		 * Opt-out of the default terminal persistence on restart and reload.
		 * This will only take effect when `terminal.integrated.enablePersistentSessions` is enabled.
		 */
		disablePersistence?: boolean;
	}
	export interface ExtensionTerminalOptions {
		/**
		 * Opt-out of the default terminal persistence on restart and reload.
		 * This will only take effect when `terminal.integrated.enablePersistentSessions` is enabled.
		 */
		disablePersistence?: boolean;
	}
}
