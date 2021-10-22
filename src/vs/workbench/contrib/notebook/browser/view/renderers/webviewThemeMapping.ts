/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebviewStyles } from 'vs/workbench/contrib/webview/browser/webview';

const mapping: ReadonlyMap<string, string> = new Map([
	['theme-font-family', 'vscode-font-family'],
	['theme-font-weight', 'vscode-font-weight'],
	['theme-font-size', 'vscode-font-size'],
	['theme-code-font-family', 'vscode-editor-font-family'],
	['theme-code-font-weight', 'vscode-editor-font-weight'],
	['theme-code-font-size', 'vscode-editor-font-size'],
	['theme-scrollbar-background', 'vscode-scrollbarSlider-background'],
	['theme-scrollbar-hover-background', 'vscode-scrollbarSlider-hoverBackground'],
	['theme-scrollbar-active-background', 'vscode-scrollbarSlider-activeBackground'],
	['theme-quote-background', 'vscode-textBlockQuote-background'],
	['theme-quote-border', 'vscode-textBlockQuote-border'],
	['theme-code-foreground', 'vscode-textPreformat-foreground'],
	// Editor
	['theme-background', 'vscode-editor-background'],
	['theme-foreground', 'vscode-editor-foreground'],
	['theme-ui-foreground', 'vscode-foreground'],
	['theme-link', 'vscode-textLink-foreground'],
	['theme-link-active', 'vscode-textLink-activeForeground'],
	// Buttons
	['theme-button-background', 'vscode-button-background'],
	['theme-button-hover-background', 'vscode-button-hoverBackground'],
	['theme-button-foreground', 'vscode-button-foreground'],
	['theme-button-secondary-background', 'vscode-button-secondaryBackground'],
	['theme-button-secondary-hover-background', 'vscode-button-secondaryHoverBackground'],
	['theme-button-secondary-foreground', 'vscode-button-secondaryForeground'],
	['theme-button-hover-foreground', 'vscode-button-foreground'],
	['theme-button-focus-foreground', 'vscode-button-foreground'],
	['theme-button-secondary-hover-foreground', 'vscode-button-secondaryForeground'],
	['theme-button-secondary-focus-foreground', 'vscode-button-secondaryForeground'],
	// Inputs
	['theme-input-background', 'vscode-input-background'],
	['theme-input-foreground', 'vscode-input-foreground'],
	['theme-input-placeholder-foreground', 'vscode-input-placeholderForeground'],
	['theme-input-focus-border-color', 'vscode-focusBorder'],
	// Menus
	['theme-menu-background', 'vscode-menu-background'],
	['theme-menu-foreground', 'vscode-menu-foreground'],
	['theme-menu-hover-background', 'vscode-menu-selectionBackground'],
	['theme-menu-focus-background', 'vscode-menu-selectionBackground'],
	['theme-menu-hover-foreground', 'vscode-menu-selectionForeground'],
	['theme-menu-focus-foreground', 'vscode-menu-selectionForeground'],
	// Errors
	['theme-error-background', 'vscode-inputValidation-errorBackground'],
	['theme-error-foreground', 'vscode-foreground'],
	['theme-warning-background', 'vscode-inputValidation-warningBackground'],
	['theme-warning-foreground', 'vscode-foreground'],
	['theme-info-background', 'vscode-inputValidation-infoBackground'],
	['theme-info-foreground', 'vscode-foreground'],
	// Notebook:
	['theme-notebook-output-background', 'vscode-notebook-outputContainerBackgroundColor'],
	['theme-notebook-output-border', 'vscode-notebook-outputContainerBorderColor'],
	['theme-notebook-cell-selected-background', 'vscode-notebook-selectedCellBackground'],
	['theme-notebook-symbol-highlight-background', 'vscode-notebook-symbolHighlightBackground'],
	['theme-notebook-diff-removed-background', 'vscode-diffEditor-removedTextBackground'],
	['theme-notebook-diff-inserted-background', 'vscode-diffEditor-insertedTextBackground'],
]);

const constants: Readonly<WebviewStyles> = {
	'theme-input-border-width': '1px',
	'theme-button-primary-hover-shadow': 'none',
	'theme-button-secondary-hover-shadow': 'none',
	'theme-input-border-color': 'transparent',
};

/**
 * Transforms base vscode theme variables into generic variables for notebook
 * renderers.
 * @see https://github.com/microsoft/vscode/issues/107985 for context
 * @deprecated
 */
export const transformWebviewThemeVars = (s: Readonly<WebviewStyles>): WebviewStyles => {
	const result = { ...s, ...constants };
	for (const [target, src] of mapping) {
		result[target] = s[src];
	}

	return result;
};
