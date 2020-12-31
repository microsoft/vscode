/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { IMarkdownString, MarkdownString, isEmptyMarkdownString, markedStringsEquals } from 'vs/base/common/htmlContent';
import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { MarkdownRenderer } from 'vs/editor/browser/core/markdownRenderer';
import { asArray } from 'vs/base/common/arrays';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IModelDecoration, ITextModel } from 'vs/editor/common/model';
import { IEditorHover, IEditorHoverParticipant, IHoverPart } from 'vs/editor/contrib/hover/modesContentHover';

const $ = dom.$;

export class MarkdownHover2 implements IHoverPart {

	constructor(
		public readonly range: Range,
		public readonly contents: IMarkdownString[]
	) { }

	public equals(other: IHoverPart): boolean {
		if (other instanceof MarkdownHover2) {
			return markedStringsEquals(this.contents, other.contents);
		}
		return false;
	}
}

export class MarkdownHoverParticipant implements IEditorHoverParticipant<MarkdownHover2> {

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _hover: IEditorHover,
		@IModeService private readonly _modeService: IModeService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) { }

	createLoadingMessage(range: Range): MarkdownHover2 {
		return new MarkdownHover2(range, [new MarkdownString().appendText(nls.localize('modesContentHover.loading', "Loading..."))]);
	}

	computeHoverPart(hoverRange: Range, model: ITextModel, decoration: IModelDecoration): MarkdownHover2 | null {
		const hoverMessage = decoration.options.hoverMessage;
		if (!hoverMessage || isEmptyMarkdownString(hoverMessage)) {
			return null;
		}
		const lineNumber = hoverRange.startLineNumber;
		const maxColumn = model.getLineMaxColumn(lineNumber);
		const startColumn = (decoration.range.startLineNumber === lineNumber) ? decoration.range.startColumn : 1;
		const endColumn = (decoration.range.endLineNumber === lineNumber) ? decoration.range.endColumn : maxColumn;
		const range = new Range(hoverRange.startLineNumber, startColumn, hoverRange.startLineNumber, endColumn);
		return new MarkdownHover2(range, asArray(hoverMessage));
	}

	renderHoverParts(hoverParts: MarkdownHover2[], fragment: DocumentFragment): IDisposable {
		const disposables = new DisposableStore();
		for (const hoverPart of hoverParts) {
			for (const contents of hoverPart.contents) {
				if (isEmptyMarkdownString(contents)) {
					continue;
				}
				const markdownHoverElement = $('div.hover-row.markdown-hover');
				const hoverContentsElement = dom.append(markdownHoverElement, $('div.hover-contents'));
				const renderer = disposables.add(new MarkdownRenderer({ editor: this._editor }, this._modeService, this._openerService));
				disposables.add(renderer.onDidRenderAsync(() => {
					hoverContentsElement.className = 'hover-contents code-hover-contents';
					this._hover.onContentsChanged();
				}));
				const renderedContents = disposables.add(renderer.render(contents));
				hoverContentsElement.appendChild(renderedContents.element);
				fragment.appendChild(markdownHoverElement);
			}
		}
		return disposables;
	}
}
