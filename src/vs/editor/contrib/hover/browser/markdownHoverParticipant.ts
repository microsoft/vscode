/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { asArray, compareBy, numberComparator } from 'vs/base/common/arrays';
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
import { Hover, HoverContext, HoverProvider, HoverVerbosityAction } from 'vs/editor/common/languages';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { setupCustomHover } from 'vs/base/browser/ui/hover/updatableHoverWidget';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ClickAction, KeyDownAction } from 'vs/base/browser/ui/hover/hoverWidget';
import { KeyCode } from 'vs/base/common/keyCodes';

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
		public readonly hoverProvider: HoverProvider,
		public readonly hoverOrdinal: number,
		public readonly hoverPosition: Position,
		hoverRange: Range,
		hoverOwner: IEditorHoverParticipant<MarkdownHover>,
	) {
		super(hoverOwner, hoverRange, hover.contents, false, hoverOrdinal);
	}
}

interface FocusedHoverInfo {
	indexHoverData: number;
	// TODO@aiday-mar is this needed?
	focusRemains: boolean;
}

interface HoverData {
	hover: (MarkdownHover | VerboseMarkdownHover);
	element: HTMLElement;
}

export class MarkdownHoverParticipant implements IEditorHoverParticipant<MarkdownHover> {

	public readonly hoverOrdinal: number = 3;
	private _focusInfo: FocusedHoverInfo | undefined;
	private _renderedHoverData: RenderedHoverData | undefined;

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

		const hoverProviderRegistry = this._languageFeaturesService.hoverProvider;
		if (!hoverProviderRegistry.has(model)) {
			return AsyncIterableObject.EMPTY;
		}

		const position = anchor.range.getStartPosition();
		return getHover(hoverProviderRegistry, model, position, token)
			.filter(item => !isEmptyMarkdownString(item.hover.contents))
			.map(item => {
				const range = item.hover.range ? Range.lift(item.hover.range) : anchor.range;
				return new VerboseMarkdownHover(item.hover, item.provider, item.ordinal, position, range, this);
			});
	}

	public renderHoverParts(context: IEditorHoverRenderContext, hoverParts: (MarkdownHover | VerboseMarkdownHover)[]): IDisposable {
		hoverParts.sort(compareBy(hover => hover.ordinal, numberComparator));
		const hoverData = new Map<number, HoverData>();
		const store = new DisposableStore();
		for (const [hoverIndex, hoverPart] of hoverParts.entries()) {
			const isInstanceOfVerboseHover = hoverPart instanceof VerboseMarkdownHover;
			const canIncreaseVerbosity = isInstanceOfVerboseHover && hoverPart.hover.canIncreaseVerbosity;
			const canDecreaseVerbosity = isInstanceOfVerboseHover && hoverPart.hover.canDecreaseVerbosity;
			const { renderedMarkdown, disposables } = this._renderMarkdownHoversAndActions(
				hoverIndex,
				hoverPart.contents,
				canIncreaseVerbosity,
				canDecreaseVerbosity,
				context.onContentsChanged
			);
			context.fragment.appendChild(renderedMarkdown);
			hoverData.set(hoverIndex, { hover: hoverPart, element: renderedMarkdown });
			store.add(disposables);
		}
		this._renderedHoverData = new RenderedHoverData(context, hoverData);
		this._renderedHoverData.addDisposables(store);
		return this._renderedHoverData;
	}

	public async updateFocusedMarkdownHoverVerbosityLevel(action: HoverVerbosityAction): Promise<void> {
		const model = this._editor.getModel();
		if (!this._focusInfo || !this._renderedHoverData || !model) {
			return;
		}
		const focusedIndex = this._focusInfo.indexHoverData;
		const currentHoverData = this._renderedHoverData.getDataForIndex(focusedIndex)?.hover;
		if (!currentHoverData || !(currentHoverData instanceof VerboseMarkdownHover)) {
			return;
		}
		const provider = currentHoverData.hoverProvider;
		const previousHover = currentHoverData.hover;
		const context: HoverContext = { action, previousHover };
		let newHover: Hover | null | undefined;
		try {
			newHover = await Promise.resolve(provider.provideHover(model, currentHoverData.hoverPosition, CancellationToken.None, context));
		} catch (e) {
			onUnexpectedExternalError(e);
		}
		if (!newHover) {
			return;
		}
		const { renderedMarkdown, disposables } = this._renderMarkdownHoversAndActions(
			focusedIndex,
			newHover.contents,
			newHover.canIncreaseVerbosity,
			newHover.canDecreaseVerbosity,
			this._renderedHoverData.onContentsChanged.bind(this._renderedHoverData)
		);
		const newRange = newHover.range ? Range.lift(newHover.range) : currentHoverData.range;
		const newVerboseHover = new VerboseMarkdownHover(newHover, provider, currentHoverData.ordinal, currentHoverData.hoverPosition, newRange, this);
		this._focusInfo.focusRemains = true;
		this._renderedHoverData.replaceDataAtIndex(focusedIndex, newVerboseHover, renderedMarkdown);
		this._renderedHoverData.addDisposables(disposables);
		this._renderedHoverData.onContentsChanged();
		renderedMarkdown.focus();
	}

	private _renderMarkdownHoversAndActions(
		hoverIndex: number,
		hoverContents: IMarkdownString[],
		canIncreaseVerbosity: boolean | undefined,
		canDecreaseVerbosity: boolean | undefined,
		onContentsChanged: () => void
	): { renderedMarkdown: HTMLElement; disposables: DisposableStore } {
		const renderedMarkdown = $('div.hover-row');
		renderedMarkdown.tabIndex = 0;
		const contents = $('div.hover-row-contents');
		renderedMarkdown.appendChild(contents);
		const disposables = new DisposableStore();
		disposables.add(renderMarkdownInContainer(
			this._editor,
			contents,
			hoverContents,
			this._languageService,
			this._openerService,
			onContentsChanged,
		));
		if (!canIncreaseVerbosity && !canDecreaseVerbosity) {
			return { renderedMarkdown, disposables };
		}
		const actionsContainer = $('div.verbosity-actions');
		renderedMarkdown.prepend(actionsContainer);

		disposables.add(this._renderHoverExpansionAction(actionsContainer, HoverVerbosityAction.Increase, canIncreaseVerbosity ?? false));
		disposables.add(this._renderHoverExpansionAction(actionsContainer, HoverVerbosityAction.Decrease, canDecreaseVerbosity ?? false));

		const focusTracker = disposables.add(dom.trackFocus(renderedMarkdown));
		disposables.add(focusTracker.onDidFocus(() => {
			this._focusInfo = {
				indexHoverData: hoverIndex,
				focusRemains: true
			};
		}));
		disposables.add(focusTracker.onDidBlur(() => {
			if (this._focusInfo?.focusRemains) {
				this._focusInfo.focusRemains = false;
				return;
			}
			this._focusInfo = undefined;
		}));
		return { renderedMarkdown, disposables };
	}

	private _renderHoverExpansionAction(container: HTMLElement, action: HoverVerbosityAction, enabled: boolean): DisposableStore {
		const store = new DisposableStore();
		const isActionIncrease = action === HoverVerbosityAction.Increase;
		const element = dom.append(container, $(ThemeIcon.asCSSSelector(isActionIncrease ? increaseHoverVerbosityIcon : decreaseHoverVerbosityIcon)));
		element.tabIndex = 0;
		if (isActionIncrease) {
			const kb = this._keybindingService.lookupKeybinding('editor.action.increaseHoverVerbosityLevel');
			store.add(setupCustomHover(getDefaultHoverDelegate('mouse'), element, kb ?
				nls.localize('increaseVerbosityWithKb', "Increase Verbosity ({0})", kb.getLabel()) :
				nls.localize('increaseVerbosity', "Increase Verbosity")));
		} else {
			const kb = this._keybindingService.lookupKeybinding('editor.action.decreaseHoverVerbosityLevel');
			store.add(setupCustomHover(getDefaultHoverDelegate('mouse'), element, kb ?
				nls.localize('decreaseVerbosityWithKb', "Decrease Verbosity ({0})", kb.getLabel()) :
				nls.localize('decreaseVerbosity', "Decrease Verbosity")));
		}
		if (!enabled) {
			element.classList.add('disabled');
			return store;
		}
		element.classList.add('enabled');
		const actionFunction = () => this.updateFocusedMarkdownHoverVerbosityLevel(action);
		store.add(new ClickAction(element, actionFunction));
		store.add(new KeyDownAction(element, actionFunction, [KeyCode.Enter, KeyCode.Space]));
		return store;
	}
}

class RenderedHoverData implements IDisposable {

	private _store: DisposableStore = new DisposableStore();

	constructor(
		private readonly _context: IEditorHoverRenderContext,
		private readonly _hoverData: Map<number, HoverData>,
	) {
		this._store.add(toDisposable(() => this._hoverData.forEach(hoverData => {
			const hover = hoverData.hover;
			if (hover instanceof VerboseMarkdownHover) {
				hover.hover.dispose();
			}
		})));
	}

	replaceDataAtIndex(index: number, newHover: VerboseMarkdownHover, newElement: HTMLElement): void {
		if (!this._hoverData.has(index)) {
			return;
		}
		const currentHover = this._hoverData.get(index)!.hover;
		if (currentHover instanceof VerboseMarkdownHover) {
			currentHover.hover.dispose();
		}
		const currentElement = this._hoverData.get(index)!.element;
		currentElement.replaceWith(newElement);
		this._hoverData.set(index, { hover: newHover, element: newElement });
	}

	getDataForIndex(index: number): { hover: (MarkdownHover | VerboseMarkdownHover); element: HTMLElement } | undefined {
		return this._hoverData.get(index);
	}

	onContentsChanged(): void {
		this._context.onContentsChanged();
	}

	addDisposables<T extends IDisposable>(disposables: T): void {
		this._store.add(disposables);
	}

	dispose(): void {
		this._store.dispose();
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
	onContentsChanged: () => void,
) {
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
			onContentsChanged();
		}));
		const renderedContents = store.add(renderer.render(contents));
		hoverContentsElement.appendChild(renderedContents.element);
		container.appendChild(markdownHoverElement);
	}
	return store;
}
