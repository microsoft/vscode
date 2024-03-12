/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { asArray } from 'vs/base/common/arrays';
import { AsyncIterableObject } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IMarkdownString, isEmptyMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
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
import { HoverVerbosityMetadata, HoverProvider, Hover } from 'vs/editor/common/languages';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { registerActionOnClickOrAcceptKeydown } from 'vs/base/browser/ui/hover/hoverWidget';
import { onUnexpectedExternalError } from 'vs/base/common/errors';

const $ = dom.$;
const increaseHoverVerbosityIcon = registerIcon('hover-increase-verbosity', Codicon.chevronUp, nls.localize('increaseHoverVerbosity', 'Icon for increaseing hover verbosity.'));
const decreaseHoverVerbosityIcon = registerIcon('hover-decrease-verbosity', Codicon.chevronDown, nls.localize('decreaseHoverVerbosity', 'Icon for decreasing hover verbosity.'));

export class MarkdownHover implements IHoverPart {

	constructor(
		public readonly owner: IEditorHoverParticipant<MarkdownHover>,
		public readonly range: Range,
		public readonly contents: IMarkdownString[],
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

export class VerboseMarkdownHover extends MarkdownHover {

	constructor(
		owner: IEditorHoverParticipant<MarkdownHover>,
		range: Range,
		contents: IMarkdownString[],
		isBeforeContent: boolean,
		ordinal: number,
		public readonly provider: HoverProvider | undefined,
		public readonly verbosityMetadata: HoverVerbosityMetadata | undefined,
	) {
		super(owner, range, contents, isBeforeContent, ordinal);
	}
}

interface MarkdownFocusMetadata {
	index: number | undefined;
	element: HTMLElement | undefined;
	focusRemains: boolean;
}

export class MarkdownHoverParticipant implements IEditorHoverParticipant<MarkdownHover> {

	public readonly hoverOrdinal: number = 3;
	private _anchor: HoverAnchor | undefined;
	private _context: IEditorHoverRenderContext | undefined;

	private _providers: (HoverProvider | undefined)[] = [];
	private _focusMetadata: MarkdownFocusMetadata = {
		index: undefined,
		element: undefined,
		focusRemains: false
	};
	private _verbosityLevels: Map<number, number> = new Map();

	constructor(
		protected readonly _editor: ICodeEditor,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILanguageFeaturesService protected readonly _languageFeaturesService: ILanguageFeaturesService,
	) { }

	public createLoadingMessage(anchor: HoverAnchor): MarkdownHover | null {
		return new VerboseMarkdownHover(this, anchor.range, [new MarkdownString().appendText(nls.localize('modesContentHover.loading', "Loading..."))], false, 2000, undefined, undefined);
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
			result.push(new VerboseMarkdownHover(this, anchor.range, [{
				value: nls.localize('stopped rendering', "Rendering paused for long line for performance reasons. This can be configured via `editor.stopRenderingLineAfter`.")
			}], false, index++, undefined, undefined));
		}
		if (!stopRenderingMessage && typeof maxTokenizationLineLength === 'number' && lineLength >= maxTokenizationLineLength) {
			result.push(new VerboseMarkdownHover(this, anchor.range, [{
				value: nls.localize('too many characters', "Tokenization is skipped for long lines for performance reasons. This can be configured via `editor.maxTokenizationLineLength`.")
			}], false, index++, undefined, undefined));
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
			result.push(new VerboseMarkdownHover(this, range, asArray(hoverMessage), isBeforeContent, index++, undefined, undefined));
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
		return getHover(this._languageFeaturesService.hoverProvider, model, position, undefined, token)
			.filter(item => !isEmptyMarkdownString(item.hover.contents))
			.map(item => {
				const rng = item.hover.range ? Range.lift(item.hover.range) : anchor.range;
				return new VerboseMarkdownHover(this, rng, item.hover.contents, false, item.ordinal, item.provider, item.hover.verbosityMetadata);
			});
	}

	public renderHoverParts(context: IEditorHoverRenderContext, hoverParts: VerboseMarkdownHover[]): IDisposable {
		this._context = context;
		this._verbosityLevels.clear();
		this._providers = hoverParts.map(hoverPart => hoverPart.provider);
		hoverParts.sort((a, b) => a.ordinal - b.ordinal);
		const disposables = new DisposableStore();
		for (const [hoverIndex, hoverPart] of hoverParts.entries()) {
			const renderedMarkdown = this._renderMarkdownHoversAndActions(
				hoverPart.contents,
				hoverIndex,
				hoverPart.verbosityMetadata,
				disposables
			);
			this._verbosityLevels.set(hoverIndex, 0);
			context.fragment.appendChild(renderedMarkdown);
		}
		return disposables;
	}

	public async changeFocusedHoverVerbosityLevel(increaseVerbosity: boolean): Promise<void> {
		if (
			this._focusMetadata.index === undefined
			|| this._focusMetadata.element === undefined
			|| !this._anchor
			|| !this._context
			|| !this._context.disposables
			|| !this._verbosityLevels
		) {
			return;
		}
		const currentVerbosityLevel = this._verbosityLevels.get(this._focusMetadata.index);
		const provider = this._providers[this._focusMetadata.index];
		const model = this._editor.getModel();
		if (!provider || !model || currentVerbosityLevel === undefined) {
			return;
		}
		const verbosityLevel = currentVerbosityLevel + (increaseVerbosity ? 1 : -1);
		this._verbosityLevels.set(this._focusMetadata.index, verbosityLevel);
		const position = new Position(this._anchor.range.startLineNumber, this._anchor.range.startColumn);
		const context = { verbosityLevel };
		let hover: Hover | null | undefined;
		try {
			hover = await Promise.resolve(provider.provideHover(model, position, CancellationToken.None, context));
		} catch (e) {
			onUnexpectedExternalError(e);
		}
		if (!hover) {
			return;
		}
		const renderedMarkdown = this._renderMarkdownHoversAndActions(
			hover.contents,
			this._focusMetadata.index,
			hover.verbosityMetadata,
			this._context.disposables
		);
		this._focusMetadata.focusRemains = true;
		this._focusMetadata.element.replaceWith(renderedMarkdown);
		this._focusMetadata.element = renderedMarkdown;
		this._context.onContentsChanged();
		renderedMarkdown.focus();
	}

	private _renderMarkdownHoversAndActions(
		hoverContents: IMarkdownString[],
		hoverIndex: number,
		verbosityMetadata: HoverVerbosityMetadata | undefined,
		store: DisposableStore,
	): HTMLElement {

		const contentsWrapper = $('div.hover-row');
		contentsWrapper.tabIndex = 0;
		const contents = $('div.hover-row-contents');
		contentsWrapper.appendChild(contents);
		renderMarkdownInContainer(
			this._editor,
			this._context,
			contents,
			hoverContents,
			this._languageService,
			this._openerService,
			store
		);
		if (!verbosityMetadata || !this._context || !this._context.disposables || !this._verbosityLevels) {
			return contentsWrapper;
		}
		const actionsContainer = $('div.verbosity-actions');
		contentsWrapper.appendChild(actionsContainer);

		this._renderHoverExpansionAction(actionsContainer, { increase: true, activated: verbosityMetadata.canIncreaseVerbosity ?? false }, store);
		this._renderHoverExpansionAction(actionsContainer, { increase: false, activated: verbosityMetadata.canDecreaseVerbosity ?? false }, store);

		const focusTracker = this._context.disposables.add(dom.trackFocus(contentsWrapper));
		this._context.disposables.add(focusTracker.onDidFocus(() => {
			const focusRemains = this._focusMetadata.focusRemains;
			this._focusMetadata = {
				index: hoverIndex,
				element: contentsWrapper,
				focusRemains
			};
		}));
		this._context.disposables.add(focusTracker.onDidBlur(() => {
			if (this._focusMetadata.focusRemains) {
				this._focusMetadata.focusRemains = false;
				return;
			}
			this._focusMetadata = {
				index: undefined,
				element: undefined,
				focusRemains: false
			};
		}));
		return contentsWrapper;
	}

	private _renderHoverExpansionAction(container: HTMLElement, verbosityMetadata: { increase: boolean; activated: boolean }, store: DisposableStore): void {
		const element = dom.append(container, $(ThemeIcon.asCSSSelector(verbosityMetadata.increase ? increaseHoverVerbosityIcon : decreaseHoverVerbosityIcon)));
		element.tabIndex = 0;
		if (!verbosityMetadata.activated) {
			element.classList.add('disabled');
			return;
		}
		element.classList.add('enabled');
		registerActionOnClickOrAcceptKeydown(element, () => this.changeFocusedHoverVerbosityLevel(verbosityMetadata.increase), store);
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
		renderMarkdownInContainer(
			editor,
			context,
			context.fragment,
			hoverPart.contents,
			languageService,
			openerService,
			disposables
		);
	}
	return disposables;
}

function renderMarkdownInContainer(
	editor: ICodeEditor,
	context: IEditorHoverRenderContext | undefined,
	container: DocumentFragment | HTMLElement,
	markdownStrings: IMarkdownString[],
	languageService: ILanguageService,
	openerService: IOpenerService,
	disposableStore: DisposableStore
) {
	for (const contents of markdownStrings) {
		if (isEmptyMarkdownString(contents)) {
			continue;
		}
		const markdownHoverElement = $('div.markdown-hover');
		const hoverContentsElement = dom.append(markdownHoverElement, $('div.hover-contents'));
		const renderer = disposableStore.add(new MarkdownRenderer({ editor }, languageService, openerService));
		disposableStore.add(renderer.onDidRenderAsync(() => {
			hoverContentsElement.className = 'hover-contents code-hover-contents';
			context?.onContentsChanged();
		}));
		const renderedContents = disposableStore.add(renderer.render(contents));
		hoverContentsElement.appendChild(renderedContents.element);
		container.appendChild(markdownHoverElement);
	}
}
