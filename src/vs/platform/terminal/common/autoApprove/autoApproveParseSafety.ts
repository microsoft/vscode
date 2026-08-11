/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Returns whether a tree-sitter parse error should prevent auto-approval.
 * The command can still run after the user confirms it.
 */
// TODO: Consolidate fragmented terminal auto-approval parsing and policy helpers. https://github.com/microsoft/vscode/issues/329028
export function shouldRequireConfirmationForAutoApproveParse(language: 'bash' | 'powershell', hasError: boolean): boolean {
	return language === 'powershell' && hasError;
}
