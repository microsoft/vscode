/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const cmdDelayedExpansionRegex = /![^!\r\n]+!/;

/**
 * Returns whether the text contains balanced CMD delayed environment-variable
 * expansion syntax, such as `!APPDATA!` or `!VAR:~0,1!`.
 */
// TODO: Consolidate with shared terminal command helpers when `runInTerminalHelpers` moves to platform. https://github.com/microsoft/vscode/issues/329028
export function containsCmdDelayedExpansion(value: string): boolean {
	return cmdDelayedExpansionRegex.test(value);
}
