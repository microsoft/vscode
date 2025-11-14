/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { asArray, compareBy, numberComparator } from '../../../../base/common/arrays.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { IMarkdownString, isEmptyMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { IMarkdownRendererService } from '../../../../platform/markdown/browser/markdownRenderer.js';
import { DECREASE_HOVER_VERBOSITY_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_ID } from './hoverActionIds.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { IModelDecoration, ITextModel } from '../../../common/model.js';
import { HoverAnchor, HoverAnchorType, HoverRangeAnchor, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart, IRenderedHoverPart, IRenderedHoverParts, RenderedHoverParts } from './hoverTypes.js';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { Hover, HoverContext, HoverProvider, HoverVerbosityAction } from '../../../common/languages.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ClickAction, HoverPosition, KeyDownAction } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { IHoverService, WorkbenchHoverDelegate } from '../../../../platform/hover/browser/hover.js';
import { AsyncIterableProducer } from '../../../../base/common/async.js';
import { LanguageFeatureRegistry } from '../../../common/languageFeatureRegistry.js';
import { getHoverProviderResultsAsAsyncIterable } from './getHover.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { HoverStartSource } from './hoverOperation.js';
import { ScrollEvent } from '../../../../base/common/scrollable.js';

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
		@IMarkdownRendererService private readonly _markdownRendererService: IMarkdownRendererService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILanguageFeaturesService protected readonly _languageFeaturesService: ILanguageFeaturesService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IHoverService private readonly _hoverService: IHoverService,
		@ICommandService private readonly _commandService: ICommandService,
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

	public computeAsync(anchor: HoverAnchor, lineDecorations: IModelDecoration[], source: HoverStartSource, token: CancellationToken): AsyncIterable<MarkdownHover> {
		if (!this._editor.hasModel() || anchor.type !== HoverAnchorType.Range) {
			return AsyncIterableProducer.EMPTY;
		}

		const model = this._editor.getModel();

		const hoverProviderRegistry = this._languageFeaturesService.hoverProvider;
		if (!hoverProviderRegistry.has(model)) {
			return AsyncIterableProducer.EMPTY;
		}
		return this._getMarkdownHovers(hoverProviderRegistry, model, anchor, token);
	}

	private async *_getMarkdownHovers(hoverProviderRegistry: LanguageFeatureRegistry<HoverProvider>, model: ITextModel, anchor: HoverRangeAnchor, token: CancellationToken): AsyncIterable<MarkdownHover> {
		const position = anchor.range.getStartPosition();
		const hoverProviderResults = getHoverProviderResultsAsAsyncIterable(hoverProviderRegistry, model, position, token);

		for await (const item of hoverProviderResults) {
			if (!isEmptyMarkdownString(item.hover.contents)) {
				const range = item.hover.range ? Range.lift(item.hover.range) : anchor.range;
				const hoverSource = new HoverSource(item.hover, item.provider, position);
				yield new MarkdownHover(this, range, item.hover.contents, false, item.ordinal, hoverSource);
			}
		}
	}

	public renderHoverParts(context: IEditorHoverRenderContext, hoverParts: MarkdownHover[]): IRenderedHoverParts<MarkdownHover> {
		this._renderedHoverParts = new MarkdownRenderedHoverParts(
			hoverParts,
			context.fragment,
			this,
			this._editor,
			this._commandService,
			this._keybindingService,
			this._hoverService,
			this._configurationService,
			this._markdownRendererService,
			context.onContentsChanged
		);
		return this._renderedHoverParts;
	}

	public handleScroll(e: ScrollEvent): void {
		this._renderedHoverParts?.handleScroll(e);
	}

	public getAccessibleContent(hoverPart: MarkdownHover): string {
		return this._renderedHoverParts?.getAccessibleContent(hoverPart) ?? '';
	}

	public doesMarkdownHoverAtIndexSupportVerbosityAction(index: number, action: HoverVerbosityAction): boolean {
		return this._renderedHoverParts?.doesMarkdownHoverAtIndexSupportVerbosityAction(index, action) ?? false;
	}

	public updateMarkdownHoverVerbosityLevel(action: HoverVerbosityAction, index: number): Promise<{ hoverPart: MarkdownHover; hoverElement: HTMLElement } | undefined> {
		return Promise.resolve(this._renderedHoverParts?.updateMarkdownHoverPartVerbosityLevel(action, index));
	}
}

class RenderedMarkdownHoverPart implements IRenderedHoverPart<MarkdownHover> {

	constructor(
		public readonly hoverPart: MarkdownHover,
		public readonly hoverElement: HTMLElement,
		public readonly disposables: DisposableStore,
		public readonly actionsContainer?: HTMLElement
	) { }

	get hoverAccessibleContent(): string {
		return this.hoverElement.innerText.trim();
	}

	dispose(): void {
		this.disposables.dispose();
	}
}

class MarkdownRenderedHoverParts implements IRenderedHoverParts<MarkdownHover> {

	public renderedHoverParts: RenderedMarkdownHoverPart[];

	private _ongoingHoverOperations: Map<HoverProvider, { verbosityDelta: number; tokenSource: CancellationTokenSource }> = new Map();

	private readonly _disposables = new DisposableStore();

	constructor(
		hoverParts: MarkdownHover[],
		hoverPartsContainer: DocumentFragment,
		private readonly _hoverParticipant: MarkdownHoverParticipant,
		private readonly _editor: ICodeEditor,
		private readonly _commandService: ICommandService,
		private readonly _keybindingService: IKeybindingService,
		private readonly _hoverService: IHoverService,
		private readonly _configurationService: IConfigurationService,
		private readonly _markdownRendererService: IMarkdownRendererService,
		private readonly _onFinishedRendering: () => void,
	) {
		this.renderedHoverParts = this._renderHoverParts(hoverParts, hoverPartsContainer, this._onFinishedRendering);
		this._disposables.add(toDisposable(() => {
			this.renderedHoverParts.forEach(renderedHoverPart => {
				renderedHoverPart.dispose();
			});
			this._ongoingHoverOperations.forEach(operation => {
				operation.tokenSource.dispose(true);
			});
		}));
	}

	private _renderHoverParts(
		hoverParts: MarkdownHover[],
		hoverPartsContainer: DocumentFragment,
		onFinishedRendering: () => void,
	): RenderedMarkdownHoverPart[] {
		hoverParts.sort(compareBy(hover => hover.ordinal, numberComparator));
		return hoverParts.map(hoverPart => {
			const renderedHoverPart = this._renderHoverPart(hoverPart, onFinishedRendering);
			hoverPartsContainer.appendChild(renderedHoverPart.hoverElement);
			return renderedHoverPart;
		});
	}

	private _renderHoverPart(
		hoverPart: MarkdownHover,
		onFinishedRendering: () => void
	): RenderedMarkdownHoverPart {

		const renderedMarkdownPart = this._renderMarkdownHover(hoverPart, onFinishedRendering);
		const renderedMarkdownElement = renderedMarkdownPart.hoverElement;
		const hoverSource = hoverPart.source;
		const disposables = new DisposableStore();
		disposables.add(renderedMarkdownPart);

		if (!hoverSource) {
			return new RenderedMarkdownHoverPart(hoverPart, renderedMarkdownElement, disposables);
		}

		const canIncreaseVerbosity = hoverSource.supportsVerbosityAction(HoverVerbosityAction.Increase);
		const canDecreaseVerbosity = hoverSource.supportsVerbosityAction(HoverVerbosityAction.Decrease);

		if (!canIncreaseVerbosity && !canDecreaseVerbosity) {
			return new RenderedMarkdownHoverPart(hoverPart, renderedMarkdownElement, disposables);
		}

		const actionsContainer = $('div.verbosity-actions');
		renderedMarkdownElement.prepend(actionsContainer);
		const actionsContainerInner = $('div.verbosity-actions-inner');
		actionsContainer.append(actionsContainerInner);
		disposables.add(this._renderHoverExpansionAction(actionsContainerInner, HoverVerbosityAction.Increase, canIncreaseVerbosity));
		disposables.add(this._renderHoverExpansionAction(actionsContainerInner, HoverVerbosityAction.Decrease, canDecreaseVerbosity));
		return new RenderedMarkdownHoverPart(hoverPart, renderedMarkdownElement, disposables, actionsContainerInner);
	}

	private _renderMarkdownHover(
		markdownHover: MarkdownHover,
		onFinishedRendering: () => void
	): IRenderedHoverPart<MarkdownHover> {
		const renderedMarkdownHover = renderMarkdown(
			this._editor,
			markdownHover,
			this._markdownRendererService,
			onFinishedRendering,
		);
		return renderedMarkdownHover;
	}

	private _renderHoverExpansionAction(container: HTMLElement, action: HoverVerbosityAction, actionEnabled: boolean): DisposableStore {
		const store = new DisposableStore();
		const isActionIncrease = action === HoverVerbosityAction.Increase;
		const actionElement = dom.append(container, $(ThemeIcon.asCSSSelector(isActionIncrease ? increaseHoverVerbosityIcon : decreaseHoverVerbosityIcon)));
		actionElement.tabIndex = 0;
		const hoverDelegate = new WorkbenchHoverDelegate('mouse', undefined, { target: container, position: { hoverPosition: HoverPosition.LEFT } }, this._configurationService, this._hoverService);
		store.add(this._hoverService.setupManagedHover(hoverDelegate, actionElement, labelForHoverVerbosityAction(this._keybindingService, action)));
		if (!actionEnabled) {
			actionElement.classList.add('disabled');
			return store;
		}
		actionElement.classList.add('enabled');
		const actionFunction = () => this._commandService.executeCommand(action === HoverVerbosityAction.Increase ? INCREASE_HOVER_VERBOSITY_ACTION_ID : DECREASE_HOVER_VERBOSITY_ACTION_ID, { focus: true });
		store.add(new ClickAction(actionElement, actionFunction));
		store.add(new KeyDownAction(actionElement, actionFunction, [KeyCode.Enter, KeyCode.Space]));
		return store;
	}

	public handleScroll(e: ScrollEvent): void {
		this.renderedHoverParts.forEach(renderedHoverPart => {
			const actionsContainerInner = renderedHoverPart.actionsContainer;
			if (!actionsContainerInner) {
				return;
			}
			const hoverElement = renderedHoverPart.hoverElement;
			const topOfHoverScrollPosition = e.scrollTop;
			const bottomOfHoverScrollPosition = topOfHoverScrollPosition + e.height;
			const topOfRenderedPart = hoverElement.offsetTop;
			const hoverElementHeight = hoverElement.clientHeight;
			const bottomOfRenderedPart = topOfRenderedPart + hoverElementHeight;
			const iconsHeight = 22;
			let top: number;
			if (bottomOfRenderedPart <= bottomOfHoverScrollPosition || topOfRenderedPart >= bottomOfHoverScrollPosition) {
				top = hoverElementHeight - iconsHeight;
			} else {
				top = bottomOfHoverScrollPosition - topOfRenderedPart - iconsHeight;
			}
			actionsContainerInner.style.top = `${top}px`;
		});
	}

	public async updateMarkdownHoverPartVerbosityLevel(action: HoverVerbosityAction, index: number): Promise<{ hoverPart: MarkdownHover; hoverElement: HTMLElement } | undefined> {
		const model = this._editor.getModel();
		if (!model) {
			return undefined;
		}
		const hoverRenderedPart = this._getRenderedHoverPartAtIndex(index);
		const hoverSource = hoverRenderedPart?.hoverPart.source;
		if (!hoverRenderedPart || !hoverSource?.supportsVerbosityAction(action)) {
			return undefined;
		}
		const newHover = await this._fetchHover(hoverSource, model, action);
		if (!newHover) {
			return undefined;
		}
		const newHoverSource = new HoverSource(newHover, hoverSource.hoverProvider, hoverSource.hoverPosition);
		const initialHoverPart = hoverRenderedPart.hoverPart;
		const newHoverPart = new MarkdownHover(
			this._hoverParticipant,
			initialHoverPart.range,
			newHover.contents,
			initialHoverPart.isBeforeContent,
			initialHoverPart.ordinal,
			newHoverSource
		);
		const newHoverRenderedPart = this._updateRenderedHoverPart(index, newHoverPart);
		if (!newHoverRenderedPart) {
			return undefined;
		}
		return {
			hoverPart: newHoverPart,
			hoverElement: newHoverRenderedPart.hoverElement
		};
	}

	public getAccessibleContent(hoverPart: MarkdownHover): string | undefined {
		const renderedHoverPartIndex = this.renderedHoverParts.findIndex(renderedHoverPart => renderedHoverPart.hoverPart === hoverPart);
		if (renderedHoverPartIndex === -1) {
			return undefined;
		}
		const renderedHoverPart = this._getRenderedHoverPartAtIndex(renderedHoverPartIndex);
		if (!renderedHoverPart) {
			return undefined;
		}
		const hoverElementInnerText = renderedHoverPart.hoverElement.innerText;
		const accessibleContent = hoverElementInnerText.replace(/[^\S\n\r]+/gu, ' ');
		return accessibleContent;
	}

	public doesMarkdownHoverAtIndexSupportVerbosityAction(index: number, action: HoverVerbosityAction): boolean {
		const hoverRenderedPart = this._getRenderedHoverPartAtIndex(index);
		const hoverSource = hoverRenderedPart?.hoverPart.source;
		if (!hoverRenderedPart || !hoverSource?.supportsVerbosityAction(action)) {
			return false;
		}
		return true;
	}

	private async _fetchHover(hoverSource: HoverSource, model: ITextModel, action: HoverVerbosityAction): Promise<Hover | null | undefined> {
		let verbosityDelta = action === HoverVerbosityAction.Increase ? 1 : -1;
		const provider = hoverSource.hoverProvider;
		const ongoingHoverOperation = this._ongoingHoverOperations.get(provider);
		if (ongoingHoverOperation) {
			ongoingHoverOperation.tokenSource.cancel();
			verbosityDelta += ongoingHoverOperation.verbosityDelta;
		}
		const tokenSource = new CancellationTokenSource();
		this._ongoingHoverOperations.set(provider, { verbosityDelta, tokenSource });
		const context: HoverContext = { verbosityRequest: { verbosityDelta, previousHover: hoverSource.hover } };
		let hover: Hover | null | undefined;
		try {
			hover = await Promise.resolve(provider.provideHover(model, hoverSource.hoverPosition, tokenSource.token, context));
		} catch (e) {
			onUnexpectedExternalError(e);
		}
		tokenSource.dispose();
		this._ongoingHoverOperations.delete(provider);
		return hover;
	}

	private _updateRenderedHoverPart(index: number, hoverPart: MarkdownHover): RenderedMarkdownHoverPart | undefined {
		if (index >= this.renderedHoverParts.length || index < 0) {
			return undefined;
		}
		const renderedHoverPart = this._renderHoverPart(hoverPart, this._onFinishedRendering);
		const currentRenderedHoverPart = this.renderedHoverParts[index];
		const currentRenderedMarkdown = currentRenderedHoverPart.hoverElement;
		const renderedMarkdown = renderedHoverPart.hoverElement;
		const renderedChildrenElements = Array.from(renderedMarkdown.children);
		currentRenderedMarkdown.replaceChildren(...renderedChildrenElements);
		const newRenderedHoverPart = new RenderedMarkdownHoverPart(
			hoverPart,
			currentRenderedMarkdown,
			renderedHoverPart.disposables,
			renderedHoverPart.actionsContainer
		);
		currentRenderedHoverPart.dispose();
		this.renderedHoverParts[index] = newRenderedHoverPart;
		return newRenderedHoverPart;
	}

	private _getRenderedHoverPartAtIndex(index: number): RenderedMarkdownHoverPart | undefined {
		return this.renderedHoverParts[index];
	}

	public dispose(): void {
		this._disposables.dispose();
	}
}

export function renderMarkdownHovers(
	context: IEditorHoverRenderContext,
	markdownHovers: MarkdownHover[],
	editor: ICodeEditor,
	markdownRendererService: IMarkdownRendererService,
): IRenderedHoverParts<MarkdownHover> {

	// Sort hover parts to keep them stable since they might come in async, out-of-order
	markdownHovers.sort(compareBy(hover => hover.ordinal, numberComparator));
	const renderedHoverParts: IRenderedHoverPart<MarkdownHover>[] = [];
	for (const markdownHover of markdownHovers) {
		const renderedHoverPart = renderMarkdown(
			editor,
			markdownHover,
			markdownRendererService,
			context.onContentsChanged,
		);
		context.fragment.appendChild(renderedHoverPart.hoverElement);
		renderedHoverParts.push(renderedHoverPart);
	}
	return new RenderedHoverParts(renderedHoverParts);
}

function renderMarkdown(
	editor: ICodeEditor,
	markdownHover: MarkdownHover,
	markdownRendererService: IMarkdownRendererService,
	onFinishedRendering: () => void,
): IRenderedHoverPart<MarkdownHover> {
	const disposables = new DisposableStore();
	const renderedMarkdown = $('div.hover-row');
	const renderedMarkdownContents = $('div.hover-row-contents');
	renderedMarkdown.appendChild(renderedMarkdownContents);
	const markdownStrings = markdownHover.contents;
	for (const markdownString of markdownStrings) {
		if (isEmptyMarkdownString(markdownString)) {
			continue;
		}
		const markdownHoverElement = $('div.markdown-hover');
		const hoverContentsElement = dom.append(markdownHoverElement, $('div.hover-contents'));

		const renderedContents = disposables.add(markdownRendererService.render(markdownString, {
			context: editor,
			asyncRenderCallback: () => {
				hoverContentsElement.className = 'hover-contents code-hover-contents';
				onFinishedRendering();
			}
		}));
		hoverContentsElement.appendChild(renderedContents.element);
		renderedMarkdownContents.appendChild(markdownHoverElement);
	}
	const renderedHoverPart: IRenderedHoverPart<MarkdownHover> = {
		hoverPart: markdownHover,
		hoverElement: renderedMarkdown,
		dispose() { disposables.dispose(); }
	};
	return renderedHoverPart;
}

export function labelForHoverVerbosityAction(keybindingService: IKeybindingService, action: HoverVerbosityAction): string {
	switch (action) {
		case HoverVerbosityAction.Increase: {
			const kb = keybindingService.lookupKeybinding(INCREASE_HOVER_VERBOSITY_ACTION_ID);
			return kb ?
				nls.localize('increaseVerbosityWithKb', "Increase Hover Verbosity ({0})", kb.getLabel()) :
				nls.localize('increaseVerbosity', "Increase Hover Verbosity");
		}
		case HoverVerbosityAction.Decrease: {
			const kb = keybindingService.lookupKeybinding(DECREASE_HOVER_VERBOSITY_ACTION_ID);
			return kb ?
				nls.localize('decreaseVerbosityWithKb', "Decrease Hover Verbosity ({0})", kb.getLabel()) :
				nls.localize('decreaseVerbosity', "Decrease Hover Verbosity");
		}
	}
}
