/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { asArray } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IMarkdownString, isEmptyMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { MarkdownRenderer } from 'vs/editor/browser/core/markdownRenderer';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IModelDecoration } from 'vs/editor/common/model';
import { HoverProviderRegistry } from 'vs/editor/common/modes';
import { IModeService } from 'vs/editor/common/services/modeService';
import { getHover } from 'vs/editor/contrib/hover/getHover';
import { HoverAnchor, HoverAnchorType, IEditorHover, IEditorHoverParticipant, IEditorHoverStatusBar, IHoverPart } from 'vs/editor/contrib/hover/hoverTypes';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IOpenerService } from 'vs/platform/opener/common/opener';

const $ = dom.$;

export class MarkdownHover implements IHoverPart {

	constructor(
		public readonly owner: IEditorHoverParticipant<MarkdownHover>,
		public readonly range: Range,
		public readonly contents: IMarkdownString[]
	) { }

	public isValidForHoverAnchor(anchor: HoverAnchor): boolean {
		return (
			anchor.type === HoverAnchorType.Range
			&& this.range.startColumn <= anchor.range.startColumn
			&& this.range.endColumn >= anchor.range.endColumn
		);
	}
}

export class MarkdownHoverParticipant implements IEditorHoverParticipant<MarkdownHover> {

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _hover: IEditorHover,
		@IModeService private readonly _modeService: IModeService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) { }

	public createLoadingMessage(anchor: HoverAnchor): MarkdownHover | null {
		return new MarkdownHover(this, anchor.range, [new MarkdownString().appendText(nls.localize('modesContentHover.loading', "Loading..."))]);
	}

	public computeSync(anchor: HoverAnchor, lineDecorations: IModelDecoration[]): MarkdownHover[] {
		if (!this._editor.hasModel() || anchor.type !== HoverAnchorType.Range) {
			return [];
		}

		const model = this._editor.getModel();
		const lineNumber = anchor.range.startLineNumber;
		const maxColumn = model.getLineMaxColumn(lineNumber);
		const result: MarkdownHover[] = [];
		for (const d of lineDecorations) {
			const startColumn = (d.range.startLineNumber === lineNumber) ? d.range.startColumn : 1;
			const endColumn = (d.range.endLineNumber === lineNumber) ? d.range.endColumn : maxColumn;

			const hoverMessage = d.options.hoverMessage;
			if (!hoverMessage || isEmptyMarkdownString(hoverMessage)) {
				continue;
			}

			const range = new Range(anchor.range.startLineNumber, startColumn, anchor.range.startLineNumber, endColumn);
			result.push(new MarkdownHover(this, range, asArray(hoverMessage)));
		}

		const lineLength = this._editor.getModel().getLineLength(lineNumber);
		const maxTokenizationLineLength = this._configurationService.getValue('editor.maxTokenizationLineLength');
		if (typeof maxTokenizationLineLength === 'number' && lineLength >= maxTokenizationLineLength) {
			result.push(new MarkdownHover(this, new Range(lineNumber, 1, lineNumber, lineLength + 1), [{
				value: nls.localize('too many characters', "Tokenization is skipped for long lines for performance reasons. This can be configured via `editor.maxTokenizationLineLength`.")
			}]));
		}

		return result;
	}

	public async computeAsync(anchor: HoverAnchor, lineDecorations: IModelDecoration[], token: CancellationToken): Promise<MarkdownHover[]> {
		if (!this._editor.hasModel() || anchor.type !== HoverAnchorType.Range) {
			return Promise.resolve([]);
		}

		const model = this._editor.getModel();

		if (!HoverProviderRegistry.has(model)) {
			return Promise.resolve([]);
		}

		const hovers = await getHover(model, new Position(
			anchor.range.startLineNumber,
			anchor.range.startColumn
		), token);

		const result: MarkdownHover[] = [];
		for (const hover of hovers) {
			if (isEmptyMarkdownString(hover.contents)) {
				continue;
			}
			const rng = hover.range ? Range.lift(hover.range) : anchor.range;
			result.push(new MarkdownHover(this, rng, hover.contents));
		}
		return result;
	}

	public renderHoverParts(hoverParts: MarkdownHover[], fragment: DocumentFragment, statusBar: IEditorHoverStatusBar): IDisposable {
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
