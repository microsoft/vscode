/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { asArray, compareBy, numberComparator } from 'vs/base/common/arrays';
import { AsyncIterableObject } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IMarkdownString, isEmptyMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
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
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ClickAction, KeyDownAction } from 'vs/base/browser/ui/hover/hoverWidget';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IHoverService } from 'vs/platform/hover/browser/hover';

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

export class MarkdownHoverParticipant implements IEditorHoverParticipant<MarkdownHover> {

	public readonly hoverOrdinal: number = 3;

	private _renderedHoverData: RenderedHoverData | undefined;

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

		const position = anchor.range.getStartPosition();
		return getHover(hoverProviderRegistry, model, position, token)
			.filter(item => !isEmptyMarkdownString(item.hover.contents))
			.map(item => {
				const range = item.hover.range ? Range.lift(item.hover.range) : anchor.range;
				return new VerboseMarkdownHover(item.hover, item.provider, item.ordinal, position, range, this);
			});
	}

	public renderHoverParts(context: IEditorHoverRenderContext, hoverParts: (MarkdownHover | VerboseMarkdownHover)[]): IDisposable {
		this._renderedHoverData = new RenderedHoverData(hoverParts, context.fragment, this._editor, this._languageService, this._openerService, this._keybindingService, this._hoverService, context.onContentsChanged);
		return this._renderedHoverData;
	}

	public updateFocusedMarkdownHoverVerbosityLevel(action: HoverVerbosityAction) {
		this._renderedHoverData?.updateFocusedMarkdownHoverVerbosityLevel(action);
	}
}

interface FocusedHoverInfo {
	hoverDataIndex: number;
	// TODO@aiday-mar is this needed?
	focusRemains: boolean;
}

type RenderedGenericHoverPart = {
	renderedMarkdown: HTMLElement;
	disposables: DisposableStore;
};

type RenderedNonVerboseHoverPart = {
	isVerbose: false;
} & RenderedGenericHoverPart;

type RenderedVerboseHoverPart = {
	isVerbose: true;
	hoverInformation: HoverInformation;
} & RenderedGenericHoverPart;

type RenderedHoverPart = RenderedNonVerboseHoverPart | RenderedVerboseHoverPart;

interface HoverInformation {
	readonly hover: Hover;
	readonly hoverPosition: Position;
	readonly hoverProvider: HoverProvider;
}

class RenderedHoverData extends Disposable {

	private _renderedHoverParts: Map<number, RenderedHoverPart>;
	private _focusInfo: FocusedHoverInfo = { hoverDataIndex: -1, focusRemains: false };

	constructor(
		hoverParts: (MarkdownHover | VerboseMarkdownHover)[],
		container: DocumentFragment,
		private readonly _editor: ICodeEditor,
		private readonly _languageService: ILanguageService,
		private readonly _openerService: IOpenerService,
		private readonly _keybindingService: IKeybindingService,
		private readonly _hoverService: IHoverService,
		private readonly _onFinishedRendering: () => void,
	) {
		super();
		this._renderedHoverParts = this._renderHoverParts(hoverParts, container, this._onFinishedRendering);
		this._register(toDisposable(() => {
			this._renderedHoverParts.forEach(renderedHoverPart => {
				renderedHoverPart.disposables.dispose();
			});
		}));
	}

	private _renderHoverParts(
		hoverParts: (MarkdownHover | VerboseMarkdownHover)[],
		container: DocumentFragment,
		onFinishedRendering: () => void,
	): Map<number, RenderedHoverPart> {
		hoverParts.sort(compareBy(hover => hover.ordinal, numberComparator));
		const _renderedHoverParts = new Map<number, RenderedHoverPart>();
		for (const [hoverIndex, hoverPart] of hoverParts.entries()) {
			const shouldRenderVerboseHover = hoverPart instanceof VerboseMarkdownHover
				&& (hoverPart.hover.canIncreaseVerbosity || hoverPart.hover.canDecreaseVerbosity);
			let renderedHoverPart: RenderedHoverPart;
			if (shouldRenderVerboseHover) {
				renderedHoverPart = this._renderVerboseHoverPart(
					hoverIndex,
					hoverPart,
					onFinishedRendering
				);
			} else {
				renderedHoverPart = this._renderNonVerboseHoverPart(
					hoverPart.contents,
					onFinishedRendering
				);
			}
			container.appendChild(renderedHoverPart.renderedMarkdown);
			_renderedHoverParts.set(hoverIndex, renderedHoverPart);
		}
		return _renderedHoverParts;
	}

	private _renderNonVerboseHoverPart(
		markdownContent: IMarkdownString[],
		onFinishedRendering: () => void
	): RenderedNonVerboseHoverPart {
		const { renderedMarkdown, disposables } = this._renderMarkdownContent(markdownContent, onFinishedRendering);
		return { isVerbose: false, renderedMarkdown, disposables };
	}

	private _renderMarkdownContent(
		markdownContent: IMarkdownString[],
		onFinishedRendering: () => void
	): RenderedGenericHoverPart {
		const renderedMarkdown = $('div.hover-row');
		renderedMarkdown.tabIndex = 0;
		const contents = $('div.hover-row-contents');
		renderedMarkdown.appendChild(contents);
		const disposables = new DisposableStore();
		disposables.add(renderMarkdownInContainer(
			this._editor,
			contents,
			markdownContent,
			this._languageService,
			this._openerService,
			onFinishedRendering,
		));
		return { renderedMarkdown, disposables };
	}

	private _renderVerboseHoverPart(
		hoverIndex: number,
		hoverInformation: HoverInformation,
		onFinishedRendering: () => void
	): RenderedVerboseHoverPart {

		const { renderedMarkdown, disposables } = this._renderMarkdownContent(hoverInformation.hover.contents, onFinishedRendering);
		const actionsContainer = $('div.verbosity-actions');
		renderedMarkdown.prepend(actionsContainer);

		disposables.add(this._renderHoverExpansionAction(actionsContainer, HoverVerbosityAction.Increase, hoverInformation.hover.canIncreaseVerbosity ?? false));
		disposables.add(this._renderHoverExpansionAction(actionsContainer, HoverVerbosityAction.Decrease, hoverInformation.hover.canDecreaseVerbosity ?? false));

		const focusTracker = disposables.add(dom.trackFocus(renderedMarkdown));
		disposables.add(focusTracker.onDidFocus(() => {
			this._focusInfo = {
				hoverDataIndex: hoverIndex,
				focusRemains: true
			};
		}));
		disposables.add(focusTracker.onDidBlur(() => {
			if (this._focusInfo?.focusRemains) {
				this._focusInfo.focusRemains = false;
				return;
			}
		}));
		disposables.add(toDisposable(() => {
			hoverInformation.hover.dispose();
		}));
		return { isVerbose: true, renderedMarkdown, disposables, hoverInformation };
	}

	private _renderHoverExpansionAction(container: HTMLElement, action: HoverVerbosityAction, actionEnabled: boolean): DisposableStore {
		const store = new DisposableStore();
		const isActionIncrease = action === HoverVerbosityAction.Increase;
		const actionElement = dom.append(container, $(ThemeIcon.asCSSSelector(isActionIncrease ? increaseHoverVerbosityIcon : decreaseHoverVerbosityIcon)));
		actionElement.tabIndex = 0;
		if (isActionIncrease) {
			const kb = this._keybindingService.lookupKeybinding('editor.action.increaseHoverVerbosityLevel');
			store.add(this._hoverService.setupUpdatableHover(getDefaultHoverDelegate('mouse'), actionElement, kb ?
				nls.localize('increaseVerbosityWithKb', "Increase Verbosity ({0})", kb.getLabel()) :
				nls.localize('increaseVerbosity', "Increase Verbosity")));
		} else {
			const kb = this._keybindingService.lookupKeybinding('editor.action.decreaseHoverVerbosityLevel');
			store.add(this._hoverService.setupUpdatableHover(getDefaultHoverDelegate('mouse'), actionElement, kb ?
				nls.localize('decreaseVerbosityWithKb', "Decrease Verbosity ({0})", kb.getLabel()) :
				nls.localize('decreaseVerbosity', "Decrease Verbosity")));
		}
		if (!actionEnabled) {
			actionElement.classList.add('disabled');
			return store;
		}
		actionElement.classList.add('enabled');
		const actionFunction = () => this.updateFocusedMarkdownHoverVerbosityLevel(action);
		store.add(new ClickAction(actionElement, actionFunction));
		store.add(new KeyDownAction(actionElement, actionFunction, [KeyCode.Enter, KeyCode.Space]));
		return store;
	}

	public async updateFocusedMarkdownHoverVerbosityLevel(action: HoverVerbosityAction): Promise<void> {
		const model = this._editor.getModel();
		if (!model) {
			return;
		}
		const focusedIndex = this._focusInfo.hoverDataIndex;
		const currentHoverData = this._getRenderedHoverPartAtIndex(focusedIndex);
		if (!currentHoverData || !currentHoverData.isVerbose) {
			return;
		}
		const position = currentHoverData.hoverInformation.hoverPosition;
		const provider = currentHoverData.hoverInformation.hoverProvider;
		const previousHover = currentHoverData.hoverInformation.hover;
		const context: HoverContext = { action, previousHover };
		let newHover: Hover | null | undefined;
		try {
			newHover = await Promise.resolve(provider.provideHover(model, position, CancellationToken.None, context));
		} catch (e) {
			onUnexpectedExternalError(e);
		}
		if (!newHover) {
			return;
		}
		const hoverInformation: HoverInformation = {
			hover: newHover,
			hoverPosition: position,
			hoverProvider: provider
		};
		const renderedHoverPart = this._renderVerboseHoverPart(
			focusedIndex,
			hoverInformation,
			this._onFinishedRendering
		);
		this._replaceRenderedHoverPartAtIndex(focusedIndex, renderedHoverPart);
		this._focusOnHoverPartWithIndex(focusedIndex);
		this._focusInfo.focusRemains = true;
		this._onFinishedRendering();
	}

	private _replaceRenderedHoverPartAtIndex(index: number, renderedHoverPart: RenderedVerboseHoverPart): void {
		if (!this._renderedHoverParts.has(index)) {
			return;
		}
		const currentRenderedHoverPart = this._renderedHoverParts.get(index)!;
		currentRenderedHoverPart.disposables.dispose();
		if (!currentRenderedHoverPart.isVerbose) {
			return;
		}
		const renderedMarkdown = currentRenderedHoverPart.renderedMarkdown;
		renderedMarkdown.replaceWith(renderedHoverPart.renderedMarkdown);
		this._renderedHoverParts.set(index, renderedHoverPart);
	}

	private _focusOnHoverPartWithIndex(index: number): void {
		this._renderedHoverParts.get(index)?.renderedMarkdown.focus();
	}

	private _getRenderedHoverPartAtIndex(index: number): RenderedHoverPart | undefined {
		return this._renderedHoverParts.get(index);
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
