/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Do not leave at 12, when at 12 and we have whitespace and only one line,
 * then there's not enough space for the button `Show Whitespace Differences`
 */
const fixedEditorPaddingSingleLineCells = {
    top: 24,
    bottom: 24
};
const fixedEditorPadding = {
    top: 12,
    bottom: 12
};
export function getEditorPadding(lineCount) {
    return lineCount === 1 ? fixedEditorPaddingSingleLineCells : fixedEditorPadding;
}
export const fixedEditorOptions = {
    padding: fixedEditorPadding,
    scrollBeyondLastLine: false,
    scrollbar: {
        verticalScrollbarSize: 14,
        horizontal: 'auto',
        vertical: 'auto',
        useShadows: true,
        verticalHasArrows: false,
        horizontalHasArrows: false,
        alwaysConsumeMouseWheel: false,
    },
    renderLineHighlightOnlyWhenFocus: true,
    overviewRulerLanes: 0,
    overviewRulerBorder: false,
    selectOnLineNumbers: false,
    wordWrap: 'off',
    lineNumbers: 'off',
    glyphMargin: true,
    fixedOverflowWidgets: true,
    minimap: { enabled: false },
    renderValidationDecorations: 'on',
    renderLineHighlight: 'none',
    readOnly: true
};
export const fixedDiffEditorOptions = {
    ...fixedEditorOptions,
    glyphMargin: true,
    enableSplitViewResizing: false,
    renderIndicators: true,
    renderMarginRevertIcon: false,
    readOnly: false,
    isInEmbeddedEditor: true,
    renderOverviewRuler: false,
    wordWrap: 'off',
    diffWordWrap: 'off',
    diffAlgorithm: 'advanced',
    renderSideBySide: true,
    useInlineViewWhenSpaceIsLimited: false
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlmZkNlbGxFZGl0b3JPcHRpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9kaWZmL2RpZmZDZWxsRWRpdG9yT3B0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUtoRzs7O0dBR0c7QUFDSCxNQUFNLGlDQUFpQyxHQUFHO0lBQ3pDLEdBQUcsRUFBRSxFQUFFO0lBQ1AsTUFBTSxFQUFFLEVBQUU7Q0FDVixDQUFDO0FBQ0YsTUFBTSxrQkFBa0IsR0FBRztJQUMxQixHQUFHLEVBQUUsRUFBRTtJQUNQLE1BQU0sRUFBRSxFQUFFO0NBQ1YsQ0FBQztBQUVGLE1BQU0sVUFBVSxnQkFBZ0IsQ0FBQyxTQUFpQjtJQUNqRCxPQUFPLFNBQVMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLGlDQUFpQyxDQUFDLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQztBQUNqRixDQUFDO0FBRUQsTUFBTSxDQUFDLE1BQU0sa0JBQWtCLEdBQW1CO0lBQ2pELE9BQU8sRUFBRSxrQkFBa0I7SUFDM0Isb0JBQW9CLEVBQUUsS0FBSztJQUMzQixTQUFTLEVBQUU7UUFDVixxQkFBcUIsRUFBRSxFQUFFO1FBQ3pCLFVBQVUsRUFBRSxNQUFNO1FBQ2xCLFFBQVEsRUFBRSxNQUFNO1FBQ2hCLFVBQVUsRUFBRSxJQUFJO1FBQ2hCLGlCQUFpQixFQUFFLEtBQUs7UUFDeEIsbUJBQW1CLEVBQUUsS0FBSztRQUMxQix1QkFBdUIsRUFBRSxLQUFLO0tBQzlCO0lBQ0QsZ0NBQWdDLEVBQUUsSUFBSTtJQUN0QyxrQkFBa0IsRUFBRSxDQUFDO0lBQ3JCLG1CQUFtQixFQUFFLEtBQUs7SUFDMUIsbUJBQW1CLEVBQUUsS0FBSztJQUMxQixRQUFRLEVBQUUsS0FBSztJQUNmLFdBQVcsRUFBRSxLQUFLO0lBQ2xCLFdBQVcsRUFBRSxJQUFJO0lBQ2pCLG9CQUFvQixFQUFFLElBQUk7SUFDMUIsT0FBTyxFQUFFLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRTtJQUMzQiwyQkFBMkIsRUFBRSxJQUFJO0lBQ2pDLG1CQUFtQixFQUFFLE1BQU07SUFDM0IsUUFBUSxFQUFFLElBQUk7Q0FDZCxDQUFDO0FBRUYsTUFBTSxDQUFDLE1BQU0sc0JBQXNCLEdBQW1DO0lBQ3JFLEdBQUcsa0JBQWtCO0lBQ3JCLFdBQVcsRUFBRSxJQUFJO0lBQ2pCLHVCQUF1QixFQUFFLEtBQUs7SUFDOUIsZ0JBQWdCLEVBQUUsSUFBSTtJQUN0QixzQkFBc0IsRUFBRSxLQUFLO0lBQzdCLFFBQVEsRUFBRSxLQUFLO0lBQ2Ysa0JBQWtCLEVBQUUsSUFBSTtJQUN4QixtQkFBbUIsRUFBRSxLQUFLO0lBQzFCLFFBQVEsRUFBRSxLQUFLO0lBQ2YsWUFBWSxFQUFFLEtBQUs7SUFDbkIsYUFBYSxFQUFFLFVBQVU7SUFDekIsZ0JBQWdCLEVBQUUsSUFBSTtJQUN0QiwrQkFBK0IsRUFBRSxLQUFLO0NBQ3RDLENBQUMifQ==