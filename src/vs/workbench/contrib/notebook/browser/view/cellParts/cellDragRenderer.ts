/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import { createTrustedTypesPolicy } from '../../../../../../base/browser/trustedTypes.js';
import { Color } from '../../../../../../base/common/color.js';
import * as platform from '../../../../../../base/common/platform.js';
import { ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { EditorOption } from '../../../../../../editor/common/config/editorOptions.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { ColorId } from '../../../../../../editor/common/encodedTokenAttributes.js';
import * as languages from '../../../../../../editor/common/languages.js';
import { tokenizeLineToHTML } from '../../../../../../editor/common/languages/textToHtmlTokenizer.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { BaseCellRenderTemplate } from '../notebookRenderingCommon.js';

class EditorTextRenderer {

	private static _ttPolicy = createTrustedTypesPolicy('cellRendererEditorText', {
		createHTML(input) { return input; }
	});

	getRichText(editor: ICodeEditor, modelRange: Range): HTMLElement | null {
		const model = editor.getModel();
		if (!model) {
			return null;
		}

		const colorMap = this.getDefaultColorMap();
		const fontInfo = editor.getOptions().get(EditorOption.fontInfo);
		const fontFamilyVar = '--notebook-editor-font-family';
		const fontSizeVar = '--notebook-editor-font-size';
		const fontWeightVar = '--notebook-editor-font-weight';

		const style = ``
			+ `color: ${colorMap[ColorId.DefaultForeground]};`
			+ `background-color: ${colorMap[ColorId.DefaultBackground]};`
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
		element.innerHTML = linesHtml as string;
		return element;
	}

	private getRichTextLinesAsHtml(model: ITextModel, modelRange: Range, colorMap: string[]): string | TrustedHTML {
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
			} else {
				result += tokenizeLineToHTML(lineContent, lineTokens.inflate(), colorMap, startOffset, endOffset, tabSize, platform.isWindows);
			}
		}

		return EditorTextRenderer._ttPolicy?.createHTML(result) ?? result;
	}

	private getDefaultColorMap(): string[] {
		const colorMap = languages.TokenizationRegistry.getColorMap();
		const result: string[] = ['#000000'];
		if (colorMap) {
			for (let i = 1, len = colorMap.length; i < len; i++) {
				result[i] = Color.Format.CSS.formatHex(colorMap[i]);
			}
		}
		return result;
	}
}

export class CodeCellDragImageRenderer {
	getDragImage(templateData: BaseCellRenderTemplate, editor: ICodeEditor, type: 'code' | 'markdown'): HTMLElement {
		let dragImage = this.getDragImageImpl(templateData, editor, type);
		if (!dragImage) {
			// TODO@roblourens I don't think this can happen
			dragImage = document.createElement('div');
			dragImage.textContent = '1 cell';
		}

		return dragImage;
	}

	private getDragImageImpl(templateData: BaseCellRenderTemplate, editor: ICodeEditor, type: 'code' | 'markdown'): HTMLElement | null {
		const dragImageContainer = templateData.container.cloneNode(true) as HTMLElement;
		dragImageContainer.classList.forEach(c => dragImageContainer.classList.remove(c));
		dragImageContainer.classList.add('cell-drag-image', 'monaco-list-row', 'focused', `${type}-cell-row`);

		const editorContainer: HTMLElement | null = dragImageContainer.querySelector('.cell-editor-container');
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
