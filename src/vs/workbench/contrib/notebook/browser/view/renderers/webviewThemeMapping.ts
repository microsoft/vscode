/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebviewStyles } from '../../../../webview/browser/webview.js';

const mapping: ReadonlyMap<string, string> = new Map([
	['theme-font-family', 'erdos-font-family'],
	['theme-font-weight', 'erdos-font-weight'],
	['theme-font-size', 'erdos-font-size'],
	['theme-code-font-family', 'erdos-editor-font-family'],
	['theme-code-font-weight', 'erdos-editor-font-weight'],
	['theme-code-font-size', 'erdos-editor-font-size'],
	['theme-scrollbar-background', 'erdos-scrollbarSlider-background'],
	['theme-scrollbar-hover-background', 'erdos-scrollbarSlider-hoverBackground'],
	['theme-scrollbar-active-background', 'erdos-scrollbarSlider-activeBackground'],
	['theme-quote-background', 'erdos-textBlockQuote-background'],
	['theme-quote-border', 'erdos-textBlockQuote-border'],
	['theme-code-foreground', 'erdos-textPreformat-foreground'],
	['theme-code-background', 'erdos-textPreformat-background'],
	// Editor
	['theme-background', 'erdos-editor-background'],
	['theme-foreground', 'erdos-editor-foreground'],
	['theme-ui-foreground', 'erdos-foreground'],
	['theme-link', 'erdos-textLink-foreground'],
	['theme-link-active', 'erdos-textLink-activeForeground'],
	// Buttons
	['theme-button-background', 'erdos-button-background'],
	['theme-button-hover-background', 'erdos-button-hoverBackground'],
	['theme-button-foreground', 'erdos-button-foreground'],
	['theme-button-secondary-background', 'erdos-button-secondaryBackground'],
	['theme-button-secondary-hover-background', 'erdos-button-secondaryHoverBackground'],
	['theme-button-secondary-foreground', 'erdos-button-secondaryForeground'],
	['theme-button-hover-foreground', 'erdos-button-foreground'],
	['theme-button-focus-foreground', 'erdos-button-foreground'],
	['theme-button-secondary-hover-foreground', 'erdos-button-secondaryForeground'],
	['theme-button-secondary-focus-foreground', 'erdos-button-secondaryForeground'],
	// Inputs
	['theme-input-background', 'erdos-input-background'],
	['theme-input-foreground', 'erdos-input-foreground'],
	['theme-input-placeholder-foreground', 'erdos-input-placeholderForeground'],
	['theme-input-focus-border-color', 'erdos-focusBorder'],
	// Menus
	['theme-menu-background', 'erdos-menu-background'],
	['theme-menu-foreground', 'erdos-menu-foreground'],
	['theme-menu-hover-background', 'erdos-menu-selectionBackground'],
	['theme-menu-focus-background', 'erdos-menu-selectionBackground'],
	['theme-menu-hover-foreground', 'erdos-menu-selectionForeground'],
	['theme-menu-focus-foreground', 'erdos-menu-selectionForeground'],
	// Errors
	['theme-error-background', 'erdos-inputValidation-errorBackground'],
	['theme-error-foreground', 'erdos-foreground'],
	['theme-warning-background', 'erdos-inputValidation-warningBackground'],
	['theme-warning-foreground', 'erdos-foreground'],
	['theme-info-background', 'erdos-inputValidation-infoBackground'],
	['theme-info-foreground', 'erdos-foreground'],
	// Notebook:
	['theme-notebook-output-background', 'erdos-notebook-outputContainerBackgroundColor'],
	['theme-notebook-output-border', 'erdos-notebook-outputContainerBorderColor'],
	['theme-notebook-cell-selected-background', 'erdos-notebook-selectedCellBackground'],
	['theme-notebook-symbol-highlight-background', 'erdos-notebook-symbolHighlightBackground'],
	['theme-notebook-diff-removed-background', 'erdos-diffEditor-removedTextBackground'],
	['theme-notebook-diff-inserted-background', 'erdos-diffEditor-insertedTextBackground'],
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
 * @see https://github.com/willnickols/erdos/issues/107985 for context
 * @deprecated
 */
export const transformWebviewThemeVars = (s: Readonly<WebviewStyles>): WebviewStyles => {
	const result = { ...s, ...constants };
	for (const [target, src] of mapping) {
		result[target] = s[src];
	}

	return result;
};
