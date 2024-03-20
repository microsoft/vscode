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
import { HoverProvider, Hover, HoverContext, HoverVerbosityAction } from 'vs/editor/common/languages';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { registerActionOnClickOrAcceptKeydown } from 'vs/base/browser/ui/hover/hoverWidget';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { setupCustomHover } from 'vs/base/browser/ui/hover/updatableHoverWidget';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

const $ = dom.$;
const increaseHoverVerbosityIcon = registerIcon('hover-increase-verbosity', Codicon.add, nls.localize('increaseHoverVerbosity', 'Icon for increaseing hover verbosity.'));
const decreaseHoverVerbosityIcon = registerIcon('hover-decrease-verbosity', Codicon.remove, nls.localize('decreaseHoverVerbosity', 'Icon for decreasing hover verbosity.'));

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
		public readonly hover: Hover,
		public readonly sourceProvider: HoverProvider,
		owner: IEditorHoverParticipant<MarkdownHover>,
		range: Range,
		isBeforeContent: boolean,
		ordinal: number,
	) {
		super(owner, range, hover.contents, isBeforeContent, ordinal);
	}
}

interface FocusedHoverInfo {
	index: number;
	element: HTMLElement;
	focusRemains: boolean;
}

export class MarkdownHoverParticipant implements IEditorHoverParticipant<MarkdownHover> {

	public readonly hoverOrdinal: number = 3;
	private _position: Position | undefined;
	private _context: IEditorHoverRenderContext | undefined;
	private _focusInfo: FocusedHoverInfo | undefined;

	private _hoverData: (MarkdownHover | VerboseMarkdownHover)[] = [];

	constructor(
		protected readonly _editor: ICodeEditor,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILanguageFeaturesService protected readonly _languageFeaturesService: ILanguageFeaturesService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) { }

	public createLoadingMessage(anchor: HoverAnchor): MarkdownHover | null {
		return new MarkdownHover(this, anchor.range, [new MarkdownString().appendText(nls.localize('modesContentHover.loading', "Loading..."))], false, 2000);
	}

	public computeSync(anchor: HoverAnchor, lineDecorations: IModelDecoration[]): MarkdownHover[] {
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
			result.push(new MarkdownHover(this, anchor.range, [{
				value: nls.localize('stopped rendering', "Rendering paused for long line for performance reasons. This can be configured via `editor.stopRenderingLineAfter`.")
			}], false, index++));
		}
		if (!stopRenderingMessage && typeof maxTokenizationLineLength === 'number' && lineLength >= maxTokenizationLineLength) {
			result.push(new MarkdownHover(this, anchor.range, [{
				value: nls.localize('too many characters', "Tokenization is skipped for long lines for performance reasons. This can be configured via `editor.maxTokenizationLineLength`.")
			}], false, index++));
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
			result.push(new MarkdownHover(this, range, asArray(hoverMessage), isBeforeContent, index++));
		}

		return result;
	}

	public computeAsync(anchor: HoverAnchor, lineDecorations: IModelDecoration[], token: CancellationToken): AsyncIterableObject<MarkdownHover> {
		if (!this._editor.hasModel() || anchor.type !== HoverAnchorType.Range) {
			return AsyncIterableObject.EMPTY;
		}

		const model = this._editor.getModel();

		if (!this._languageFeaturesService.hoverProvider.has(model)) {
			return AsyncIterableObject.EMPTY;
		}

		this._position = anchor.range.getStartPosition();
		return getHover(this._languageFeaturesService.hoverProvider, model, this._position, undefined, token)
			.filter(item => !isEmptyMarkdownString(item.hover.contents))
			.map(item => {
				const rng = item.hover.range ? Range.lift(item.hover.range) : anchor.range;
				return new VerboseMarkdownHover(item.hover, item.provider, this, rng, false, item.ordinal);
			});
	}

	public renderHoverParts(context: IEditorHoverRenderContext, hoverParts: (MarkdownHover | VerboseMarkdownHover)[]): IDisposable | undefined {
		if (!context.disposables) {
			return;
		}
		hoverParts.sort((a, b) => a.ordinal - b.ordinal);
		this._hoverData = hoverParts;
		this._context = context;
		context.disposables.add(toDisposable(() => {
			this._hoverData.forEach(hoverData => {
				if (hoverData instanceof VerboseMarkdownHover) {
					hoverData.hover.dispose();
				}
			});
		}));
		for (const [hoverIndex, hoverPart] of hoverParts.entries()) {
			const isInstanceOfVerboseHover = hoverPart instanceof VerboseMarkdownHover;
			const canIncreaseVerbosity = isInstanceOfVerboseHover && hoverPart.hover.canIncreaseVerbosity;
			const canDecreaseVerbosity = isInstanceOfVerboseHover && hoverPart.hover.canDecreaseVerbosity;
			const renderedMarkdown = this._renderMarkdownHoversAndActions(
				hoverPart.contents,
				hoverIndex,
				canIncreaseVerbosity,
				canDecreaseVerbosity,
			);
			if (!renderedMarkdown) {
				continue;
			}
			context.fragment.appendChild(renderedMarkdown);
		}
		return context.disposables;
	}

	public async updateFocusedMarkdownHoverVerbosityLevel(action: HoverVerbosityAction): Promise<void> {
		const model = this._editor.getModel();
		if (
			!this._focusInfo
			|| !this._position
			|| !this._context
			|| !model
		) {
			return;
		}
		const focusedIndex = this._focusInfo.index;
		const currentHoverData = this._hoverData[focusedIndex];
		if (!(currentHoverData instanceof VerboseMarkdownHover)) {
			return;
		}
		const provider = currentHoverData.sourceProvider;
		const hover = currentHoverData.hover;
		const context: HoverContext = { action, hover };
		let newHover: Hover | null | undefined;
		try {
			newHover = await Promise.resolve(provider.provideHover(model, this._position, CancellationToken.None, context));
		} catch (e) {
			onUnexpectedExternalError(e);
		}
		if (!newHover) {
			return;
		}
		this._hoverData[focusedIndex] = new VerboseMarkdownHover(newHover, provider, this, currentHoverData.range, false, currentHoverData.ordinal);
		const renderedMarkdown = this._renderMarkdownHoversAndActions(
			newHover.contents,
			focusedIndex,
			newHover.canIncreaseVerbosity,
			newHover.canDecreaseVerbosity,
		);
		if (!renderedMarkdown) {
			return;
		}
		this._focusInfo.focusRemains = true;
		this._focusInfo.element.replaceWith(renderedMarkdown);
		this._focusInfo.element = renderedMarkdown;
		this._context.onContentsChanged();
		renderedMarkdown.focus();
	}

	private _renderMarkdownHoversAndActions(
		hoverContents: IMarkdownString[],
		hoverIndex: number,
		canIncreaseVerbosity: boolean | undefined,
		canDecreaseVerbosity: boolean | undefined,
	): HTMLElement | undefined {
		if (!this._context?.disposables) {
			return;
		}
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
			this._context.disposables
		);
		if (!canIncreaseVerbosity && !canDecreaseVerbosity) {
			return contentsWrapper;
		}
		const actionsContainer = $('div.verbosity-actions');
		contentsWrapper.prepend(actionsContainer);

		this._renderHoverExpansionAction(actionsContainer, HoverVerbosityAction.Increase, canIncreaseVerbosity ?? false);
		this._renderHoverExpansionAction(actionsContainer, HoverVerbosityAction.Decrease, canDecreaseVerbosity ?? false);

		const focusTracker = this._context.disposables.add(dom.trackFocus(contentsWrapper));
		this._context.disposables.add(focusTracker.onDidFocus(() => {
			this._focusInfo = {
				index: hoverIndex,
				element: contentsWrapper,
				focusRemains: true
			};
		}));
		this._context.disposables.add(focusTracker.onDidBlur(() => {
			if (this._focusInfo?.focusRemains) {
				this._focusInfo.focusRemains = false;
				return;
			}
			this._focusInfo = undefined;
		}));
		return contentsWrapper;
	}

	private _renderHoverExpansionAction(container: HTMLElement, action: HoverVerbosityAction, enabled: boolean): void {
		if (!this._context?.disposables) {
			return;
		}
		const isActionIncrease = action === HoverVerbosityAction.Increase;
		const element = dom.append(container, $(ThemeIcon.asCSSSelector(isActionIncrease ? increaseHoverVerbosityIcon : decreaseHoverVerbosityIcon)));
		element.tabIndex = 0;
		if (isActionIncrease) {
			const kb = this._keybindingService.lookupKeybinding('editor.action.increaseHoverVerbosityLevel');
			this._context.disposables.add(setupCustomHover(getDefaultHoverDelegate('mouse'), element, kb ?
				nls.localize('increaseVerbosityWithKb', "Increase Verbosity ({0})", kb.getLabel()) :
				nls.localize('increaseVerbosity', "Increase Verbosity")));
		} else {
			const kb = this._keybindingService.lookupKeybinding('editor.action.decreaseHoverVerbosityLevel');
			this._context.disposables.add(setupCustomHover(getDefaultHoverDelegate('mouse'), element, kb ?
				nls.localize('decreaseVerbosityWithKb', "Decrease Verbosity ({0})", kb.getLabel()) :
				nls.localize('decreaseVerbosity', "Decrease Verbosity")));
		}
		if (!enabled) {
			element.classList.add('disabled');
			return;
		}
		element.classList.add('enabled');
		registerActionOnClickOrAcceptKeydown(element, () => this.updateFocusedMarkdownHoverVerbosityLevel(action), this._context.disposables);
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
