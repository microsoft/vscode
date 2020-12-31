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
import { IModelDecoration } from 'vs/editor/common/model';
import { IEditorHover, IEditorHoverParticipant, IHoverPart } from 'vs/editor/contrib/hover/modesContentHover';
import { HoverProviderRegistry } from 'vs/editor/common/modes';
import { getHover } from 'vs/editor/contrib/hover/getHover';
import { Position } from 'vs/editor/common/core/position';
import { CancellationToken } from 'vs/base/common/cancellation';

const $ = dom.$;

export class MarkdownHover implements IHoverPart {

	constructor(
		public readonly range: Range,
		public readonly contents: IMarkdownString[]
	) { }

	public equals(other: IHoverPart): boolean {
		if (other instanceof MarkdownHover) {
			return markedStringsEquals(this.contents, other.contents);
		}
		return false;
	}
}

export class MarkdownHoverParticipant implements IEditorHoverParticipant<MarkdownHover> {

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _hover: IEditorHover,
		@IModeService private readonly _modeService: IModeService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) { }

	public createLoadingMessage(range: Range): MarkdownHover {
		return new MarkdownHover(range, [new MarkdownString().appendText(nls.localize('modesContentHover.loading', "Loading..."))]);
	}

	public computeSync(hoverRange: Range, lineDecorations: IModelDecoration[]): MarkdownHover[] {
		if (!this._editor.hasModel()) {
			return [];
		}

		const model = this._editor.getModel();
		const lineNumber = hoverRange.startLineNumber;
		const maxColumn = model.getLineMaxColumn(lineNumber);
		const result: MarkdownHover[] = [];
		for (const d of lineDecorations) {
			const startColumn = (d.range.startLineNumber === lineNumber) ? d.range.startColumn : 1;
			const endColumn = (d.range.endLineNumber === lineNumber) ? d.range.endColumn : maxColumn;

			const hoverMessage = d.options.hoverMessage;
			if (!hoverMessage || isEmptyMarkdownString(hoverMessage)) {
				continue;
			}

			const range = new Range(hoverRange.startLineNumber, startColumn, hoverRange.startLineNumber, endColumn);
			result.push(new MarkdownHover(range, asArray(hoverMessage)));
		}

		return result;
	}

	public async computeAsync(range: Range, token: CancellationToken): Promise<MarkdownHover[]> {
		if (!this._editor.hasModel() || !range) {
			return Promise.resolve([]);
		}

		const model = this._editor.getModel();

		if (!HoverProviderRegistry.has(model)) {
			return Promise.resolve([]);
		}

		const hovers = await getHover(model, new Position(
			range.startLineNumber,
			range.startColumn
		), token);

		const result: MarkdownHover[] = [];
		for (const hover of hovers) {
			if (isEmptyMarkdownString(hover.contents)) {
				continue;
			}
			const rng = hover.range ? Range.lift(hover.range) : range;
			result.push(new MarkdownHover(rng, hover.contents));
		}
		return result;
	}

	public renderHoverParts(hoverParts: MarkdownHover[], fragment: DocumentFragment): IDisposable {
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
