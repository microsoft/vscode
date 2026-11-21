/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Maps the Git decoration colors to built-in colors of a similar hue, because the Git extension contributes them.
 */
export function setGitDecorationColors(container: HTMLElement): void {
	container.style.setProperty('--vscode-gitDecoration-modifiedResourceForeground', 'var(--vscode-editorWarning-foreground)');
	container.style.setProperty('--vscode-gitDecoration-addedResourceForeground', 'var(--vscode-charts-green)');
	container.style.setProperty('--vscode-gitDecoration-untrackedResourceForeground', 'var(--vscode-charts-green)');
	container.style.setProperty('--vscode-gitDecoration-deletedResourceForeground', 'var(--vscode-editorError-foreground)');
	container.style.setProperty('--vscode-gitDecoration-renamedResourceForeground', 'var(--vscode-charts-yellow)');
}
