/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { asArray } from 'vs/base/common/arrays';
import { AsyncIterableObject } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IMarkdownString, isEmptyMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IModelDecoration } from 'vs/editor/common/model';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { getHover } from 'vs/editor/contrib/hover/browser/getHover';
import { HoverAnchor, HoverAnchorType, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart } from 'vs/editor/contrib/hover/browser/hoverTypes';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { HoverExtensionRequest, HoverProvider } from 'vs/editor/common/languages';
import { HoverAction } from 'vs/base/browser/ui/hover/hoverWidget';
import { ICommandService } from 'vs/platform/commands/common/commands';

const $ = dom.$;

export class MarkdownHover implements IHoverPart {

	constructor(
		public readonly owner: IEditorHoverParticipant<MarkdownHover>,
		public readonly provider: HoverProvider | undefined,
		public readonly range: Range,
		public readonly contents: IMarkdownString[],
		public readonly extensionMetadata: { canExtend?: boolean; canContract?: boolean } | undefined,
		public readonly isBeforeContent: boolean,
		public readonly ordinal: number
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

	public readonly hoverOrdinal: number = 3;
	private _providers: (HoverProvider | undefined)[] = [];
	private _currentFocusedMarkdownElement: HTMLElement | undefined;
	private _currentFocusedIndex: number | undefined;
	private _anchor: HoverAnchor | undefined;
	private _disposableStore = new DisposableStore();
	private _updatedFocused: boolean = false;

	constructor(
		protected readonly _editor: ICodeEditor,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILanguageFeaturesService protected readonly _languageFeaturesService: ILanguageFeaturesService,
		@ICommandService private readonly _commandService: ICommandService
	) { }

	public createLoadingMessage(anchor: HoverAnchor): MarkdownHover | null {
		return new MarkdownHover(this, undefined, anchor.range, [new MarkdownString().appendText(nls.localize('modesContentHover.loading', "Loading..."))], undefined, false, 2000);
	}

	public computeSync(anchor: HoverAnchor, lineDecorations: IModelDecoration[]): MarkdownHover[] {
		this._anchor = anchor;
		if (!this._editor.hasModel() || anchor.type !== HoverAnchorType.Range) {
			return [];
		}

		const model = this._editor.getModel();
		const lineNumber = anchor.range.startLineNumber;
		const maxColumn = model.getLineMaxColumn(lineNumber);
		const result: MarkdownHover[] = [];

		let index = 1000;

		const lineLength = model.getLineLength(lineNumber);
		const languageId = model.getLanguageIdAtPosition(anchor.range.startLineNumber, anchor.range.startColumn);
		const stopRenderingLineAfter = this._editor.getOption(EditorOption.stopRenderingLineAfter);
		const maxTokenizationLineLength = this._configurationService.getValue<number>('editor.maxTokenizationLineLength', {
			overrideIdentifier: languageId
		});
		let stopRenderingMessage = false;
		if (stopRenderingLineAfter >= 0 && lineLength > stopRenderingLineAfter && anchor.range.startColumn >= stopRenderingLineAfter) {
			stopRenderingMessage = true;
			result.push(new MarkdownHover(this, undefined, anchor.range, [{
				value: nls.localize('stopped rendering', "Rendering paused for long line for performance reasons. This can be configured via `editor.stopRenderingLineAfter`.")
			}], undefined, false, index++));
		}
		if (!stopRenderingMessage && typeof maxTokenizationLineLength === 'number' && lineLength >= maxTokenizationLineLength) {
			result.push(new MarkdownHover(this, undefined, anchor.range, [{
				value: nls.localize('too many characters', "Tokenization is skipped for long lines for performance reasons. This can be configured via `editor.maxTokenizationLineLength`.")
			}], undefined, false, index++));
		}

		let isBeforeContent = false;

		for (const d of lineDecorations) {
			const startColumn = (d.range.startLineNumber === lineNumber) ? d.range.startColumn : 1;
			const endColumn = (d.range.endLineNumber === lineNumber) ? d.range.endColumn : maxColumn;

			const hoverMessage = d.options.hoverMessage;
			if (!hoverMessage || isEmptyMarkdownString(hoverMessage)) {
				continue;
			}

			if (d.options.beforeContentClassName) {
				isBeforeContent = true;
			}

			const range = new Range(anchor.range.startLineNumber, startColumn, anchor.range.startLineNumber, endColumn);
			result.push(new MarkdownHover(this, undefined, range, asArray(hoverMessage), undefined, isBeforeContent, index++));
		}

		return result;
	}

	public computeAsync(anchor: HoverAnchor, lineDecorations: IModelDecoration[], token: CancellationToken): AsyncIterableObject<MarkdownHover> {
		this._anchor = anchor;
		if (!this._editor.hasModel() || anchor.type !== HoverAnchorType.Range) {
			return AsyncIterableObject.EMPTY;
		}

		const model = this._editor.getModel();

		if (!this._languageFeaturesService.hoverProvider.has(model)) {
			return AsyncIterableObject.EMPTY;
		}

		const position = new Position(anchor.range.startLineNumber, anchor.range.startColumn);
		return getHover(this._languageFeaturesService.hoverProvider, model, position, token)
			.filter(item => !isEmptyMarkdownString(item.hover.contents))
			.map(item => {
				const rng = item.hover.range ? Range.lift(item.hover.range) : anchor.range;
				return new MarkdownHover(this, item.provider, rng, item.hover.contents, item.hover.extensionMetadata, false, item.ordinal);
			});
	}

	public renderHoverParts(context: IEditorHoverRenderContext, hoverParts: MarkdownHover[]): IDisposable {
		this._providers = hoverParts.map(hoverPart => hoverPart.provider);
		hoverParts.sort((a, b) => a.ordinal - b.ordinal);
		const disposables = new DisposableStore();
		for (const [index, hoverPart] of hoverParts.entries()) {

			console.log('hoverPart : ', hoverPart);

			const fulldiv = $('div.hover-row.full-markdown-hover');
			fulldiv.tabIndex = 0;

			for (const contents of hoverPart.contents) {
				if (isEmptyMarkdownString(contents)) {
					continue;
				}
				const markdownHoverElement = $('div.hover-row.markdown-hover');
				const hoverContentsElement = dom.append(markdownHoverElement, $('div.hover-contents'));
				const renderer = disposables.add(new MarkdownRenderer({ editor: this._editor }, this._languageService, this._openerService));
				disposables.add(renderer.onDidRenderAsync(() => {
					hoverContentsElement.className = 'hover-contents code-hover-contents';
					context.onContentsChanged();
				}));
				const renderedContents = disposables.add(renderer.render(contents));
				hoverContentsElement.appendChild(renderedContents.element);
				fulldiv.appendChild(markdownHoverElement);

			}

			const actions = $('div.actions');
			actions.style.display = 'flex';
			fulldiv.appendChild(actions);

			this.renderExtendOrContractHoverAction(this._commandService, actions, hoverPart.extensionMetadata?.canContract === true ? false : undefined);
			this.renderExtendOrContractHoverAction(this._commandService, actions, hoverPart.extensionMetadata?.canExtend === true ? true : undefined);

			const focusTracker = this._disposableStore.add(dom.trackFocus(fulldiv));
			this._disposableStore.add(focusTracker.onDidFocus(() => {
				console.log('inside of focus of fulldiv : ', index);
				this._currentFocusedIndex = index;
				this._currentFocusedMarkdownElement = fulldiv;
				console.log('this._currentFocusedIndex : ', this._currentFocusedIndex);
			}));
			this._disposableStore.add(focusTracker.onDidBlur(() => {
				console.log('this._updatedFocused : ', this._updatedFocused);
				if (this._updatedFocused) {
					this._updatedFocused = false;
					return;
				}
				console.log('inside of blur of fulldiv : ', index);
				this._currentFocusedIndex = undefined;
				this._currentFocusedMarkdownElement = undefined;
				console.log('this._currentFocusedIndex : ', this._currentFocusedIndex);
			}));
			context.fragment.appendChild(fulldiv);
		}
		return disposables;
	}

	renderExtendOrContractHoverAction(commandService: ICommandService, container: HTMLElement, extend: boolean | undefined): void {
		console.log('renderExtendOrContractHoverAction : ', extend);
		if (extend === undefined) {
			return;
		}
		const hoverAction = HoverAction.render(container, {
			label: extend ? nls.localize('show more', "Show More...") : nls.localize('show less', "Show Less..."),
			commandId: extend ? 'editor.hover.showMore' : 'editor.hover.showLess',
			run: () => { this.extendOrContractFocusedMessage(extend); }
		}, null);
		hoverAction.actionContainer.style.paddingLeft = '5px';
		hoverAction.actionContainer.style.paddingRight = '5px';
	}

	async extendOrContractFocusedMessage(extend: boolean): Promise<void> {
		console.log('extendOrContractFocusedMessage : ', extend);
		console.log('this._currentFocusedIndex : ', this._currentFocusedIndex);
		const currentIndex = this._currentFocusedIndex;
		if (this._currentFocusedIndex === undefined) {
			console.log('early return 1');
			return;
		}
		const model = this._editor.getModel();
		if (!model || !this._anchor) {
			console.log('early return 2');
			return;
		}
		const position = new Position(this._anchor.range.startLineNumber, this._anchor.range.startColumn);
		const request: HoverExtensionRequest = { position, extend };
		const provider = this._providers[this._currentFocusedIndex];
		if (!provider) {
			console.log('early return 3');
			return;
		}
		const hover = await Promise.resolve(provider.provideHover(model, request, CancellationToken.None));

		if (!hover || !this._currentFocusedMarkdownElement) {
			console.log('early return 4');
			return;
		}

		// polish
		const markdownHoverElement = $('div.hover-row.markdown-hover');
		const hoverContentsElement = dom.append(markdownHoverElement, $('div.hover-contents'));
		const renderer = this._disposableStore.add(new MarkdownRenderer({ editor: this._editor }, this._languageService, this._openerService));
		this._disposableStore.add(renderer.onDidRenderAsync(() => {
			hoverContentsElement.className = 'hover-contents code-hover-contents';
		}));
		for (const mdstring of hover.contents) {
			const renderedContents = this._disposableStore.add(renderer.render(mdstring));
			hoverContentsElement.appendChild(renderedContents.element);
		}
		const actions = $('div.actions');
		actions.style.display = 'flex';
		markdownHoverElement.appendChild(actions);
		this.renderExtendOrContractHoverAction(this._commandService, actions, hover.extensionMetadata?.canContract === true ? false : undefined);
		this.renderExtendOrContractHoverAction(this._commandService, actions, hover.extensionMetadata?.canExtend === true ? true : undefined);
		markdownHoverElement.tabIndex = 0;

		const focusTracker = this._disposableStore.add(dom.trackFocus(markdownHoverElement));

		this._disposableStore.add(focusTracker.onDidFocus(() => {
			console.log('inside of focus of markdownHoverElement : ', currentIndex);
			this._currentFocusedIndex = currentIndex;
			this._currentFocusedMarkdownElement = markdownHoverElement;
			this._updatedFocused = true;
			console.log('this._currentFocusedIndex : ', this._currentFocusedIndex);
			console.log('this._updatedFocused : ', this._updatedFocused);
		}));
		this._disposableStore.add(focusTracker.onDidBlur(() => {
			console.log('inside of blur of markdownHoverElement : ', currentIndex);
			if (this._updatedFocused) {
				this._updatedFocused = false;
				return;
			}
			this._currentFocusedIndex = undefined;
			this._currentFocusedMarkdownElement = undefined;
			console.log('this._currentFocusedIndex : ', this._currentFocusedIndex);
		}));

		this._currentFocusedMarkdownElement.blur();
		console.log('after blur of current focused markdown element : ', this._currentFocusedMarkdownElement);
		this._currentFocusedMarkdownElement.replaceWith(markdownHoverElement);
		this._currentFocusedMarkdownElement = markdownHoverElement;
		this._currentFocusedIndex = currentIndex;
		markdownHoverElement.focus();
	}
}

export function renderMarkdownHovers(
	context: IEditorHoverRenderContext,
	hoverParts: MarkdownHover[],
	editor: ICodeEditor,
	languageService: ILanguageService,
	openerService: IOpenerService,
): IDisposable {

	// Sort hover parts to keep them stable since they might come in async, out-of-order
	hoverParts.sort((a, b) => a.ordinal - b.ordinal);

	const disposables = new DisposableStore();
	for (const hoverPart of hoverParts) {
		for (const contents of hoverPart.contents) {
			if (isEmptyMarkdownString(contents)) {
				continue;
			}
			const markdownHoverElement = $('div.hover-row.markdown-hover');
			const hoverContentsElement = dom.append(markdownHoverElement, $('div.hover-contents'));
			const renderer = disposables.add(new MarkdownRenderer({ editor }, languageService, openerService));
			disposables.add(renderer.onDidRenderAsync(() => {
				hoverContentsElement.className = 'hover-contents code-hover-contents';
				context.onContentsChanged();
			}));
			const renderedContents = disposables.add(renderer.render(contents));
			hoverContentsElement.appendChild(renderedContents.element);
			// const actions = $('div.actions');
			// actions.style.display = 'flex';
			// markdownHoverElement.appendChild(actions);
			// renderExtendOrContractHoverAction(commandService, actions, hoverPart.extensionMetadata?.canContract);
			// renderExtendOrContractHoverAction(commandService, actions, hoverPart.extensionMetadata?.canExtend);
			context.fragment.appendChild(markdownHoverElement);
		}
	}
	return disposables;
}

// export function renderExtendOrContractHoverAction(commandService: ICommandService, container: HTMLElement, extend: boolean | undefined): void {
// 	if (extend === undefined) {
// 		return;
// 	}
// 	const hoverAction = HoverAction.render(container, {
// 		label: extend ? nls.localize('show more', "Show More...") : nls.localize('show less', "Show Less..."),
// 		commandId: extend ? 'editor.hover.showMore' : 'editor.hover.showLess',
// 		run: () => {
// 			commandService.executeCommand(extend ?
// 				'editor.action.showMoreHoverInformation' : 'editor.action.showLessHoverInformation');
// 		}
// 	}, null);
// 	hoverAction.actionContainer.style.paddingLeft = '5px';
// 	hoverAction.actionContainer.style.paddingRight = '5px';
// }
