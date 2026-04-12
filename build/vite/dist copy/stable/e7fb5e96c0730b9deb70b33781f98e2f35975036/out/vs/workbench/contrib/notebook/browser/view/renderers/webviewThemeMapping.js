/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const mapping = new Map([
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
    ['theme-code-background', 'vscode-textPreformat-background'],
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
const constants = {
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
export const transformWebviewThemeVars = (s) => {
    const result = { ...s, ...constants };
    for (const [target, src] of mapping) {
        result[target] = s[src];
    }
    return result;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Vidmlld1RoZW1lTWFwcGluZy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvdmlldy9yZW5kZXJlcnMvd2Vidmlld1RoZW1lTWFwcGluZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxNQUFNLE9BQU8sR0FBZ0MsSUFBSSxHQUFHLENBQUM7SUFDcEQsQ0FBQyxtQkFBbUIsRUFBRSxvQkFBb0IsQ0FBQztJQUMzQyxDQUFDLG1CQUFtQixFQUFFLG9CQUFvQixDQUFDO0lBQzNDLENBQUMsaUJBQWlCLEVBQUUsa0JBQWtCLENBQUM7SUFDdkMsQ0FBQyx3QkFBd0IsRUFBRSwyQkFBMkIsQ0FBQztJQUN2RCxDQUFDLHdCQUF3QixFQUFFLDJCQUEyQixDQUFDO0lBQ3ZELENBQUMsc0JBQXNCLEVBQUUseUJBQXlCLENBQUM7SUFDbkQsQ0FBQyw0QkFBNEIsRUFBRSxtQ0FBbUMsQ0FBQztJQUNuRSxDQUFDLGtDQUFrQyxFQUFFLHdDQUF3QyxDQUFDO0lBQzlFLENBQUMsbUNBQW1DLEVBQUUseUNBQXlDLENBQUM7SUFDaEYsQ0FBQyx3QkFBd0IsRUFBRSxrQ0FBa0MsQ0FBQztJQUM5RCxDQUFDLG9CQUFvQixFQUFFLDhCQUE4QixDQUFDO0lBQ3RELENBQUMsdUJBQXVCLEVBQUUsaUNBQWlDLENBQUM7SUFDNUQsQ0FBQyx1QkFBdUIsRUFBRSxpQ0FBaUMsQ0FBQztJQUM1RCxTQUFTO0lBQ1QsQ0FBQyxrQkFBa0IsRUFBRSwwQkFBMEIsQ0FBQztJQUNoRCxDQUFDLGtCQUFrQixFQUFFLDBCQUEwQixDQUFDO0lBQ2hELENBQUMscUJBQXFCLEVBQUUsbUJBQW1CLENBQUM7SUFDNUMsQ0FBQyxZQUFZLEVBQUUsNEJBQTRCLENBQUM7SUFDNUMsQ0FBQyxtQkFBbUIsRUFBRSxrQ0FBa0MsQ0FB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