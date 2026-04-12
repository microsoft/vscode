/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as DOM from '../../../../../../base/browser/dom.js';
import { createTrustedTypesPolicy } from '../../../../../../base/browser/trustedTypes.js';
import { Color } from '../../../../../../base/common/color.js';
import * as platform from '../../../../../../base/common/platform.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import * as languages from '../../../../../../editor/common/languages.js';
import { tokenizeLineToHTML } from '../../../../../../editor/common/languages/textToHtmlTokenizer.js';
class EditorTextRenderer {
    static { this._ttPolicy = createTrustedTypesPolicy('cellRendererEditorText', {
        createHTML(input) { return input; }
    }); }
    getRichText(editor, modelRange) {
        const model = editor.getModel();
        if (!model) {
            return null;
        }
        const colorMap = this.getDefaultColorMap();
        const fontInfo = editor.getOptions().get(59 /* EditorOption.fontInfo */);
        const fontFamilyVar = '--notebook-editor-font-family';
        const fontSizeVar = '--notebook-editor-font-size';
        const fontWeightVar = '--notebook-editor-font-weight';
        const style = ``
            + `color: ${colorMap[1 /* ColorId.DefaultForeground */]};`
            + `background-color: ${colorMap[2 /* ColorId.DefaultBackground */]};`
            + `font-family: var(${fontFamilyVar});`
            + `font-weight: var(${fontWeightVar});`
            + `font-size: var(${fontSizeVar});`
            + `line-height: ${fontInfo.lineHeight}px;`
            + `white-space: pre;`;
        const element = DOM.$('div', { style });
        const fontSize = fontInfo.fontSize;
        const fontWeight = fontInfo.fontWeight;
        element.style.setProperty(fontFamilyVar, fontInfo.fontFamily);
        element.style.setProperty(fontSizeVar, `${fontSize}px`);
        element.style.setProperty(fontWeightVar, fontWeight);
        const linesHtml = this.getRichTextLinesAsHtml(model, modelRange, colorMap);
        element.innerHTML = linesHtml;
        return element;
    }
    getRichTextLinesAsHtml(model, modelRange, colorMap) {
        const startLineNumber = modelRange.startLineNumber;
        const startColumn = modelRange.startColumn;
        const endLineNumber = modelRange.endLineNumber;
        const endColumn = modelRange.endColumn;
        const tabSize = model.getOptions().tabSize;
        let result = '';
        for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
            const lineTokens = model.tokenization.getLineTokens(lineNumber);
            const lineContent = lineTokens.getLineContent();
            const startOffset = (lineNumber === startLineNumber ? startColumn - 1 : 0);
            const endOffset = (lineNumber === endLineNumber ? endColumn - 1 : lineContent.length);
            if (lineContent === '') {
                result += '<br>';
            }
            else {
                result += tokenizeLineToHTML(lineContent, lineTokens.inflate(), colorMap, startOffset, endOffset, tabSize, platform.isWindows);
            }
        }
        return EditorTextRenderer._ttPolicy?.createHTML(result) ?? result;
    }
    getDefaultColorMap() {
        const colorMap = languages.TokenizationRegistry.getColorMap();
        const result = ['#000000'];
        if (colorMap) {
            for (let i = 1, len = colorMap.length; i < len; i++) {
                result[i] = Color.Format.CSS.formatHex(colorMap[i]);
            }
        }
        return result;
    }
}
export class CodeCellDragImageRenderer {
    getDragImage(templateData, editor, type) {
        let dragImage = this.getDragImageImpl(templateData, editor, type);
        if (!dragImage) {
            // TODO@roblourens I don't think this can happen
            dragImage = document.createElement('div');
            dragImage.textContent = '1 cell';
        }
        return dragImage;
    }
    getDragImageImpl(templateData, editor, type) {
        const dragImageContainer = templateData.container.cloneNode(true);
        dragImageContainer.classList.forEach(c => dragImageContainer.classList.remove(c));
        dragImageContainer.classList.add('cell-drag-image', 'monaco-list-row', 'focused', `${type}-cell-row`);
        // eslint-disable-next-line no-restricted-syntax
        const editorContainer = dragImageContainer.querySelector('.cell-editor-container');
        if (!editorContainer) {
            return null;
        }
        const richEditorText = new EditorTextRenderer().getRichText(editor, new Range(1, 1, 1, 1000));
        if (!richEditorText) {
            return null;
        }
        DOM.reset(editorContainer, richEditorText);
        return dragImageContainer;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2VsbERyYWdSZW5kZXJlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvdmlldy9jZWxsUGFydHMvY2VsbERyYWdSZW5kZXJlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLHVDQUF1QyxDQUFDO0FBQzdELE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUMvRCxPQUFPLEtBQUssUUFBUSxNQUFNLDJDQUEyQyxDQUFDO0FBR3RFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUV0RSxPQUFPLEtBQUssU0FBUyxNQUFNLDhDQUE4QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBSXRHLE1BQU0sa0JBQWtCO2FBRVIsY0FBUyxHQUFHLHdCQUF3QixDQUFDLHdCQUF3QixFQUFFO1FBQzdFLFVBQVUsQ0FBQyxLQUFLLElBQUksT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0tBQ25DLENBQUMsQ0FBQztJQUVILFdBQVcsQ0FBQyxNQUFtQixFQUFFLFVBQWlCO1FBQ2pELE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNoQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWixPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFFRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUMzQyxNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsVUFBVSxFQUFFLENBQUMsR0FBRyxnQ0FBdUIsQ0FBQztRQUNoRSxNQUFNLGFBQWEs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