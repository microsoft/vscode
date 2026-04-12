/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ContextMenuController } from '../../../../editor/contrib/contextmenu/browser/contextmenu.js';
import { SnippetController2 } from '../../../../editor/contrib/snippet/browser/snippetController2.js';
import { SuggestController } from '../../../../editor/contrib/suggest/browser/suggestController.js';
import { MenuPreventer } from './menuPreventer.js';
import { SelectionClipboardContributionID } from './selectionClipboard.js';
import { TabCompletionController } from '../../snippets/browser/tabCompletion.js';
import { EditorExtensionsRegistry } from '../../../../editor/browser/editorExtensions.js';
import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { selectionBackground, inputBackground, inputForeground, editorSelectionBackground } from '../../../../platform/theme/common/colorRegistry.js';
export function getSimpleEditorOptions(configurationService) {
    return {
        wordWrap: 'on',
        overviewRulerLanes: 0,
        glyphMargin: false,
        lineNumbers: 'off',
        folding: false,
        selectOnLineNumbers: false,
        hideCursorInOverviewRuler: true,
        selectionHighlight: false,
        scrollbar: {
            horizontal: 'hidden',
            alwaysConsumeMouseWheel: false
        },
        lineDecorationsWidth: 0,
        overviewRulerBorder: false,
        scrollBeyondLastLine: false,
        renderLineHighlight: 'none',
        fixedOverflowWidgets: true,
        acceptSuggestionOnEnter: 'smart',
        dragAndDrop: false,
        revealHorizontalRightPadding: 5,
        minimap: {
            enabled: false
        },
        guides: {
            indentation: false
        },
        wordSegmenterLocales: configurationService.getValue('editor.wordSegmenterLocales'),
        accessibilitySupport: configurationService.getValue('editor.accessibilitySupport'),
        cursorBlinking: configurationService.getValue('editor.cursorBlinking'),
        editContext: configurationService.getValue('editor.editContext'),
        defaultColorDecorators: 'never',
        allowVariableLineHeights: false,
        allowVariableFonts: false,
        allowVariableFontsInAccessibilityMode: false,
    };
}
export function getSimpleCodeEditorWidgetOptions() {
    return {
        isSimpleWidget: true,
        contributions: EditorExtensionsRegistry.getSomeEditorContributions([
            MenuPreventer.ID,
            SelectionClipboardContributionID,
            ContextMenuController.ID,
            SuggestController.ID,
            SnippetController2.ID,
            TabCompletionController.ID,
        ])
    };
}
/**
 * Should be called to set the styling on editors that are appearing as just input boxes
 * @param editorContainerSelector An element selector that will match the container of the editor
 */
export function setupSimpleEditorSelectionStyling(editorContainerSelector) {
    // Override styles in selections.ts
    return registerThemingParticipant((theme, collector) => {
        const selectionBackgroundColor = theme.getColor(selectionBackground);
        if (selectionBackgroundColor) {
            // Override inactive selection bg
            const inputBackgroundColor = theme.getColor(inputBackground);
            if (inputBackgroundColor) {
                collector.addRule(`${editorContainerSelector} .monaco-editor-background { background-color: ${inputBackgroundColor}; } `);
                collector.addRule(`${editorContainerSelector} .monaco-editor .selected-text { background-color: ${inputBackgroundColor.transparent(0.4)}; }`);
            }
            // Override selected fg
            const inputForegroundColor = theme.getColor(inputForeground);
            if (inputForegroundColor) {
                collector.addRule(`${editorContainerSelector} .monaco-editor .view-line span.inline-selected-text { color: ${inputForegroundColor}; }`);
            }
            collector.addRule(`${editorContainerSelector} .monaco-editor .focused .selected-text { background-color: ${selectionBackgroundColor}; }`);
        }
        else {
            // Use editor selection color if theme has not set a selection background color
            collector.addRule(`${editorContainerSelector} .monaco-editor .focused .selected-text { background-color: ${theme.getColor(editorSelectionBackground)}; }`);
        }
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2ltcGxlRWRpdG9yT3B0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NvZGVFZGl0b3IvYnJvd3Nlci9zaW1wbGVFZGl0b3JPcHRpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUNuRCxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUMzRSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNsRixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUUxRixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUUvRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsZUFBZSxFQUFFLGVBQWUsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBRXRKLE1BQU0sVUFBVSxzQkFBc0IsQ0FBQyxvQkFBMkM7SUFDakYsT0FBTztRQUNOLFFBQVEsRUFBRSxJQUFJO1FBQ2Qsa0JBQWtCLEVBQUUsQ0FBQztRQUNyQixXQUFXLEVBQUUsS0FBSztRQUNsQixXQUFXLEVBQUUsS0FBSztRQUNsQixPQUFPLEVBQUUsS0FBSztRQUNkLG1CQUFtQixFQUFFLEtBQUs7UUFDMUIseUJBQXlCLEVBQUUsSUFBSTtRQUMvQixrQkFBa0IsRUFBRSxLQUFLO1FBQ3pCLFNBQVMsRUFBRTtZQUNWLFVBQVUsRUFBRSxR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