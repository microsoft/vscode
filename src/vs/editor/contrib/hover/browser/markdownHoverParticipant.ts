/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { asArray, compareBy, numberComparator } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IMarkdownString, isEmptyMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { DECREASE_HOVER_VERBOSITY_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_ID } from 'vs/editor/contrib/hover/browser/hoverActionIds';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IModelDecoration, ITextModel } from 'vs/editor/common/model';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { HoverAnchor, HoverAnchorType, HoverRangeAnchor, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart } from 'vs/editor/contrib/hover/browser/hoverTypes';
import * as nls from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Hover, HoverContext, HoverProvider, HoverVerbosityAction } from 'vs/editor/common/languages';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ClickAction, HoverPosition, KeyDownAction } from 'vs/base/browser/ui/hover/hoverWidget';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IHoverService, WorkbenchHoverDelegate } from 'vs/platform/hover/browser/hover';
import { AsyncIterableObject } from 'vs/base/common/async';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { getHoverProviderResultsAsAsyncIterable } from 'vs/editor/contrib/hover/browser/getHover';

const $ = dom.$;
const increaseHoverVerbosityIcon = registerIcon('hover-increase-verbosity', Codicon.add, nls.localize('increaseHoverVerbosity', 'Icon for increaseing hover verbosity.'));
const decreaseHoverVerbosityIcon = registerIcon('hover-decrease-verbosity', Codicon.remove, nls.localize('decreaseHoverVerbosity', 'Icon for decreasing hover verbosity.'));

export class MarkdownHover implements IHoverPart {

	constructor(
		public readonly owner: IEditorHoverParticipant<MarkdownHover>,
		public readonly range: Range,
		public readonly contents: IMarkdownString[],
		public readonly isBeforeContent: boolean,
		public readonly ordinal: number,
		public readonly source: HoverSource | undefined = undefined,
	) { }

	public isValidForHoverAnchor(anchor: HoverAnchor): boolean {
		return (
			anchor.type === HoverAnchorType.Range
			&& this.range.startColumn <= anchor.range.startColumn
			&& this.range.endColumn >= anchor.range.endColumn
		);
	}
}

class HoverSource {

	constructor(
		readonly hover: Hover,
		readonly hoverProvider: HoverProvider,
		readonly hoverPosition: Position,
	) { }

	public supportsVerbosityAction(hoverVerbosityAction: HoverVerbosityAction): boolean {
		switch (hoverVerbosityAction) {
			case HoverVerbosityAction.Increase:
				return this.hover.canIncreaseVerbosity ?? false;
			case HoverVerbosityAction.Decrease:
				return this.hover.canDecreaseVerbosity ?? false;
		}
	}
}

export class MarkdownHoverParticipant implements IEditorHoverParticipant<MarkdownHover> {

	public readonly hoverOrdinal: number = 3;

	private _renderedHoverParts: MarkdownRenderedHoverParts | undefined;

	constructor(
		protected readonly _editor: ICodeEditor,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILanguageFeaturesService protected readonly _languageFeaturesService: ILanguageFeaturesService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IHoverService private readonly _hoverService: IHoverService,
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

		const hoverProviderRegistry = this._languageFeaturesService.hoverProvider;
		if (!hoverProviderRegistry.has(model)) {
			return AsyncIterableObject.EMPTY;
		}
		const markdownHovers = this._getMarkdownHovers(hoverProviderRegistry, model, anchor, token);
		return markdownHovers;
	}

	private _getMarkdownHovers(hoverProviderRegistry: LanguageFeatureRegistry<HoverProvider>, model: ITextModel, anchor: HoverRangeAnchor, token: CancellationToken): AsyncIterableObject<MarkdownHover> {
		const position = anchor.range.getStartPosition();
		const hoverProviderResults = getHoverProviderResultsAsAsyncIterable(hoverProviderRegistry, model, position, token);
		const markdownHovers = hoverProviderResults.filter(item => !isEmptyMarkdownString(item.hover.contents))
			.map(item => {
				const range = item.hover.range ? Range.lift(item.hover.range) : anchor.range;
				const hoverSource = new HoverSource(item.hover, item.provider, position);
				return new MarkdownHover(this, range, item.hover.contents, false, item.ordinal, hoverSource);
			});
		return markdownHovers;
	}

	public renderHoverParts(context: IEditorHoverRenderContext, hoverParts: MarkdownHover[]): IDisposable {
		this._renderedHoverParts = new MarkdownRenderedHoverParts(
			hoverParts,
			context.fragment,
			this._editor,
			this._languageService,
			this._openerService,
			this._keybindingService,
			this._hoverService,
			this._configurationService,
			context.onContentsChanged
		);
		return this._renderedHoverParts;
	}

	public updateFocusedMarkdownHoverPartVerbosityLevel(action: HoverVerbosityAction) {
		this._renderedHoverParts?.updateFocusedHoverPartVerbosityLevel(action);
	}
}

interface RenderedHoverPart {
	renderedMarkdown: HTMLElement;
	disposables: DisposableStore;
	hoverSource?: HoverSource;
}

interface FocusedHoverInfo {
	hoverPartIndex: number;
	// TODO@aiday-mar is this needed?
	focusRemains: boolean;
}

class MarkdownRenderedHoverParts extends Disposable {

	private _renderedHoverParts: RenderedHoverPart[];
	private _hoverFocusInfo: FocusedHoverInfo = { hoverPartIndex: -1, focusRemains: false };

	constructor(
		hoverParts: MarkdownHover[], // we own!
		hoverPartsContainer: DocumentFragment,
		private readonly _editor: ICodeEditor,
		private readonly _languageService: ILanguageService,
		private readonly _openerService: IOpenerService,
		private readonly _keybindingService: IKeybindingService,
		private readonly _hoverService: IHoverService,
		private readonly _configurationService: IConfigurationService,
		private readonly _onFinishedRendering: () => void,
	) {
		super();
		this._renderedHoverParts = this._renderHoverParts(hoverParts, hoverPartsContainer, this._onFinishedRendering);
		this._register(toDisposable(() => {
			this._renderedHoverParts.forEach(renderedHoverPart => {
				renderedHoverPart.disposables.dispose();
			});
		}));
	}

	private _renderHoverParts(
		hoverParts: MarkdownHover[],
		hoverPartsContainer: DocumentFragment,
		onFinishedRendering: () => void,
	): RenderedHoverPart[] {
		hoverParts.sort(compareBy(hover => hover.ordinal, numberComparator));
		return hoverParts.map((hoverPart, hoverIndex) => {
			const renderedHoverPart = this._renderHoverPart(
				hoverIndex,
				hoverPart.contents,
				hoverPart.source,
				onFinishedRendering
			);
			hoverPartsContainer.appendChild(renderedHoverPart.renderedMarkdown);
			return renderedHoverPart;
		});
	}

	private _renderHoverPart(
		hoverPartIndex: number,
		hoverContents: IMarkdownString[],
		hoverSource: HoverSource | undefined,
		onFinishedRendering: () => void
	): RenderedHoverPart {

		const { renderedMarkdown, disposables } = this._renderMarkdownContent(hoverContents, onFinishedRendering);

		if (!hoverSource) {
			return { renderedMarkdown, disposables };
		}

		const canIncreaseVerbosity = hoverSource.supportsVerbosityAction(HoverVerbosityAction.Increase);
		const canDecreaseVerbosity = hoverSource.supportsVerbosityAction(HoverVerbosityAction.Decrease);

		if (!canIncreaseVerbosity && !canDecreaseVerbosity) {
			return { renderedMarkdown, disposables, hoverSource };
		}

		const actionsContainer = $('div.verbosity-actions');
		renderedMarkdown.prepend(actionsContainer);

		disposables.add(this._renderHoverExpansionAction(actionsContainer, HoverVerbosityAction.Increase, canIncreaseVerbosity));
		disposables.add(this._renderHoverExpansionAction(actionsContainer, HoverVerbosityAction.Decrease, canDecreaseVerbosity));

		const focusTracker = disposables.add(dom.trackFocus(renderedMarkdown));
		disposables.add(focusTracker.onDidFocus(() => {
			this._hoverFocusInfo = {
				hoverPartIndex,
				focusRemains: true
			};
		}));
		disposables.add(focusTracker.onDidBlur(() => {
			if (this._hoverFocusInfo?.focusRemains) {
				this._hoverFocusInfo.focusRemains = false;
				return;
			}
		}));
		return { renderedMarkdown, disposables, hoverSource };
	}

	private _renderMarkdownContent(
		markdownContent: IMarkdownString[],
		onFinishedRendering: () => void
	): RenderedHoverPart {
		const renderedMarkdown = $('div.hover-row');
		renderedMarkdown.tabIndex = 0;
		const renderedMarkdownContents = $('div.hover-row-contents');
		renderedMarkdown.appendChild(renderedMarkdownContents);
		const disposables = new DisposableStore();
		disposables.add(renderMarkdownInContainer(
			this._editor,
			renderedMarkdownContents,
			markdownContent,
			this._languageService,
			this._openerService,
			onFinishedRendering,
		));
		return { renderedMarkdown, disposables };
	}

	private _renderHoverExpansionAction(container: HTMLElement, action: HoverVerbosityAction, actionEnabled: boolean): DisposableStore {
		const store = new DisposableStore();
		const isActionIncrease = action === HoverVerbosityAction.Increase;
		const actionElement = dom.append(container, $(ThemeIcon.asCSSSelector(isActionIncrease ? increaseHoverVerbosityIcon : decreaseHoverVerbosityIcon)));
		actionElement.tabIndex = 0;
		const hoverDelegate = new WorkbenchHoverDelegate('mouse', false, { target: container, position: { hoverPosition: HoverPosition.LEFT } }, this._configurationService, this._hoverService);
		if (isActionIncrease) {
			const kb = this._keybindingService.lookupKeybinding(INCREASE_HOVER_VERBOSITY_ACTION_ID);
			store.add(this._hoverService.setupUpdatableHover(hoverDelegate, actionElement, kb ?
				nls.localize('increaseVerbosityWithKb', "Increase Verbosity ({0})", kb.getLabel()) :
				nls.localize('increaseVerbosity', "Increase Verbosity")));
		} else {
			const kb = this._keybindingService.lookupKeybinding(DECREASE_HOVER_VERBOSITY_ACTION_ID);
			store.add(this._hoverService.setupUpdatableHover(hoverDelegate, actionElement, kb ?
				nls.localize('decreaseVerbosityWithKb', "Decrease Verbosity ({0})", kb.getLabel()) :
				nls.localize('decreaseVerbosity', "Decrease Verbosity")));
		}
		if (!actionEnabled) {
			actionElement.classList.add('disabled');
			return store;
		}
		actionElement.classList.add('enabled');
		const actionFunction = () => this.updateFocusedHoverPartVerbosityLevel(action);
		store.add(new ClickAction(actionElement, actionFunction));
		store.add(new KeyDownAction(actionElement, actionFunction, [KeyCode.Enter, KeyCode.Space]));
		return store;
	}

	public async updateFocusedHoverPartVerbosityLevel(action: HoverVerbosityAction): Promise<void> {
		const model = this._editor.getModel();
		if (!model) {
			return;
		}
		const hoverFocusedPartIndex = this._hoverFocusInfo.hoverPartIndex;
		const hoverRenderedPart = this._getRenderedHoverPartAtIndex(hoverFocusedPartIndex);
		if (!hoverRenderedPart || !hoverRenderedPart.hoverSource?.supportsVerbosityAction(action)) {
			return;
		}
		const hoverPosition = hoverRenderedPart.hoverSource.hoverPosition;
		const hoverProvider = hoverRenderedPart.hoverSource.hoverProvider;
		const hover = hoverRenderedPart.hoverSource.hover;
		const hoverContext: HoverContext = { verbosityRequest: { action, previousHover: hover } };

		let newHover: Hover | null | undefined;
		try {
			newHover = await Promise.resolve(hoverProvider.provideHover(model, hoverPosition, CancellationToken.None, hoverContext));
		} catch (e) {
			onUnexpectedExternalError(e);
		}
		if (!newHover) {
			return;
		}

		const hoverSource = new HoverSource(newHover, hoverProvider, hoverPosition);
		const renderedHoverPart = this._renderHoverPart(
			hoverFocusedPartIndex,
			newHover.contents,
			hoverSource,
			this._onFinishedRendering
		);
		this._replaceRenderedHoverPartAtIndex(hoverFocusedPartIndex, renderedHoverPart);
		this._focusOnHoverPartWithIndex(hoverFocusedPartIndex);
		this._onFinishedRendering();
	}

	private _replaceRenderedHoverPartAtIndex(index: number, renderedHoverPart: RenderedHoverPart): void {
		if (index >= this._renderHoverParts.length || index < 0) {
			return;
		}
		const currentRenderedHoverPart = this._renderedHoverParts[index];
		const currentRenderedMarkdown = currentRenderedHoverPart.renderedMarkdown;
		currentRenderedMarkdown.replaceWith(renderedHoverPart.renderedMarkdown);
		currentRenderedHoverPart.disposables.dispose();
		this._renderedHoverParts[index] = renderedHoverPart;
	}

	private _focusOnHoverPartWithIndex(index: number): void {
		this._renderedHoverParts[index].renderedMarkdown.focus();
		this._hoverFocusInfo.focusRemains = true;
	}

	private _getRenderedHoverPartAtIndex(index: number): RenderedHoverPart | undefined {
		return this._renderedHoverParts[index];
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
	hoverParts.sort(compareBy(hover => hover.ordinal, numberComparator));

	const disposables = new DisposableStore();
	for (const hoverPart of hoverParts) {
		disposables.add(renderMarkdownInContainer(
			editor,
			context.fragment,
			hoverPart.contents,
			languageService,
			openerService,
			context.onContentsChanged,
		));
	}
	return disposables;
}

function renderMarkdownInContainer(
	editor: ICodeEditor,
	container: DocumentFragment | HTMLElement,
	markdownStrings: IMarkdownString[],
	languageService: ILanguageService,
	openerService: IOpenerService,
	onFinishedRendering: () => void,
): IDisposable {
	const store = new DisposableStore();
	for (const contents of markdownStrings) {
		if (isEmptyMarkdownString(contents)) {
			continue;
		}
		const markdownHoverElement = $('div.markdown-hover');
		const hoverContentsElement = dom.append(markdownHoverElement, $('div.hover-contents'));
		const renderer = store.add(new MarkdownRenderer({ editor }, languageService, openerService));
		store.add(renderer.onDidRenderAsync(() => {
			hoverContentsElement.className = 'hover-contents code-hover-contents';
			onFinishedRendering();
		}));
		const renderedContents = store.add(renderer.render(contents));
		hoverContentsElement.appendChild(renderedContents.element);
		container.appendChild(markdownHoverElement);
	}
	return store;
}
