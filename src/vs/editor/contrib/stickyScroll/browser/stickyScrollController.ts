/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { IActiveCodeEditor, ICodeEditor, MouseTargetType } from '../../../browser/editorBrowser.js';
import { IEditorContribution, ScrollType } from '../../../common/editorCommon.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { EditorOption, RenderLineNumbersType, ConfigurationChangedEvent } from '../../../common/config/editorOptions.js';
import { StickyScrollWidget, StickyScrollWidgetState } from './stickyScrollWidget.js';
import { IStickyLineCandidateProvider, StickyLineCandidateProvider } from './stickyScrollProvider.js';
import { IModelTokensChangedEvent } from '../../../common/textModelEvents.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { ClickLinkGesture, ClickLinkMouseEvent } from '../../gotoSymbol/browser/link/clickLinkGesture.js';
import { IRange, Range } from '../../../common/core/range.js';
import { getDefinitionsAtPosition } from '../../gotoSymbol/browser/goToSymbol.js';
import { goToDefinitionWithLocation } from '../../inlayHints/browser/inlayHintsLocations.js';
import { IPosition, Position } from '../../../common/core/position.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
import { ILanguageFeatureDebounceService } from '../../../common/services/languageFeatureDebounce.js';
import * as dom from '../../../../base/browser/dom.js';
import { StickyRange } from './stickyScrollElement.js';
import { IMouseEvent, StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { FoldingController } from '../../folding/browser/folding.js';
import { FoldingModel, toggleCollapseState } from '../../folding/browser/foldingModel.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { mainWindow } from '../../../../base/browser/window.js';

export interface IStickyScrollController {
	get stickyScrollCandidateProvider(): IStickyLineCandidateProvider;
	get stickyScrollWidgetState(): StickyScrollWidgetState;
	readonly stickyScrollWidgetHeight: number;
	isFocused(): boolean;
	focus(): void;
	focusNext(): void;
	focusPrevious(): void;
	goToFocused(): void;
	findScrollWidgetState(): StickyScrollWidgetState;
	dispose(): void;
	selectEditor(): void;
	onDidChangeStickyScrollHeight: Event<{ height: number }>;
}

export class StickyScrollController extends Disposable implements IEditorContribution, IStickyScrollController {

	static readonly ID = 'store.contrib.stickyScrollController';

	private readonly _stickyScrollWidget: StickyScrollWidget;
	private readonly _stickyLineCandidateProvider: IStickyLineCandidateProvider;
	private readonly _sessionStore: DisposableStore = new DisposableStore();

	private _widgetState: StickyScrollWidgetState;
	private _foldingModel: FoldingModel | undefined;
	private _maxStickyLines: number = Number.MAX_SAFE_INTEGER;

	private _stickyRangeProjectedOnEditor: IRange | undefined;
	private _candidateDefinitionsLength: number = -1;

	private _stickyScrollFocusedContextKey: IContextKey<boolean>;
	private _stickyScrollVisibleContextKey: IContextKey<boolean>;

	private _focusDisposableStore: DisposableStore | undefined;
	private _focusedStickyElementIndex: number = -1;
	private _enabled = false;
	private _focused = false;
	private _positionRevealed = false;
	private _onMouseDown = false;
	private _endLineNumbers: number[] = [];
	private _showEndForLine: number | undefined;
	private _minRebuildFromLine: number | undefined;
	private _mouseTarget: EventTarget | null = null;

	private readonly _onDidChangeStickyScrollHeight = this._register(new Emitter<{ height: number }>());
	public readonly onDidChangeStickyScrollHeight = this._onDidChangeStickyScrollHeight.event;

	constructor(
		private readonly _editor: ICodeEditor,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@ILanguageConfigurationService _languageConfigurationService: ILanguageConfigurationService,
		@ILanguageFeatureDebounceService _languageFeatureDebounceService: ILanguageFeatureDebounceService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService
	) {
		super();
		this._stickyScrollWidget = new StickyScrollWidget(this._editor);
		this._stickyLineCandidateProvider = new StickyLineCandidateProvider(this._editor, _languageFeaturesService, _languageConfigurationService);
		this._register(this._stickyScrollWidget);
		this._register(this._stickyLineCandidateProvider);

		this._widgetState = StickyScrollWidgetState.Empty;
		const stickyScrollDomNode = this._stickyScrollWidget.getDomNode();
		this._register(this._editor.onDidChangeConfiguration(e => {
			this._readConfigurationChange(e);
		}));
		this._register(dom.addDisposableListener(stickyScrollDomNode, dom.EventType.CONTEXT_MENU, async (event: MouseEvent) => {
			this._onContextMenu(dom.getWindow(stickyScrollDomNode), event);
		}));
		this._stickyScrollFocusedContextKey = EditorContextKeys.stickyScrollFocused.bindTo(this._contextKeyService);
		this._stickyScrollVisibleContextKey = EditorContextKeys.stickyScrollVisible.bindTo(this._contextKeyService);
		const focusTracker = this._register(dom.trackFocus(stickyScrollDomNode));
		this._register(focusTracker.onDidBlur(_ => {
			// Suppose that the blurring is caused by scrolling, then keep the focus on the sticky scroll
			// This is determined by the fact that the height of the widget has become zero and there has been no position revealing
			if (this._positionRevealed === false && stickyScrollDomNode.clientHeight === 0) {
				this._focusedStickyElementIndex = -1;
				this.focus();

			}
			// In all other casees, dispose the focus on the sticky scroll
			else {
				this._disposeFocusStickyScrollStore();
			}
		}));
		this._register(focusTracker.onDidFocus(_ => {
			this.focus();
		}));
		this._registerMouseListeners();
		// Suppose that mouse down on the sticky scroll, then do not focus on the sticky scroll because this will be followed by the revealing of a position
		this._register(dom.addDisposableListener(stickyScrollDomNode, dom.EventType.MOUSE_DOWN, (e) => {
			this._onMouseDown = true;
		}));
		this._register(this._stickyScrollWidget.onDidChangeStickyScrollHeight((e) => {
			this._onDidChangeStickyScrollHeight.fire(e);
		}));
		this._onDidResize();
		this._readConfiguration();
	}

	get stickyScrollCandidateProvider(): IStickyLineCandidateProvider {
		return this._stickyLineCandidateProvider;
	}

	get stickyScrollWidgetState(): StickyScrollWidgetState {
		return this._widgetState;
	}

	get stickyScrollWidgetHeight(): number {
		return this._stickyScrollWidget.height;
	}

	public static get(editor: ICodeEditor): IStickyScrollController | null {
		return editor.getContribution<StickyScrollController>(StickyScrollController.ID);
	}

	private _disposeFocusStickyScrollStore() {
		this._stickyScrollFocusedContextKey.set(false);
		this._focusDisposableStore?.dispose();
		this._focused = false;
		this._positionRevealed = false;
		this._onMouseDown = false;
	}

	public isFocused(): boolean {
		return this._focused;
	}

	public focus(): void {
		// If the mouse is down, do not focus on the sticky scroll
		if (this._onMouseDown) {
			this._onMouseDown = false;
			this._editor.focus();
			return;
		}
		const focusState = this._stickyScrollFocusedContextKey.get();
		if (focusState === true) {
			return;
		}
		this._focused = true;
		this._focusDisposableStore = new DisposableStore();
		this._stickyScrollFocusedContextKey.set(true);
		this._focusedStickyElementIndex = this._stickyScrollWidget.lineNumbers.length - 1;
		this._stickyScrollWidget.focusLineWithIndex(this._focusedStickyElementIndex);
	}

	public focusNext(): void {
		if (this._focusedStickyElementIndex < this._stickyScrollWidget.lineNumberCount - 1) {
			this._focusNav(true);
		}
	}

	public focusPrevious(): void {
		if (this._focusedStickyElementIndex > 0) {
			this._focusNav(false);
		}
	}

	public selectEditor(): void {
		this._editor.focus();
	}

	// True is next, false is previous
	private _focusNav(direction: boolean): void {
		this._focusedStickyElementIndex = direction ? this._focusedStickyElementIndex + 1 : this._focusedStickyElementIndex - 1;
		this._stickyScrollWidget.focusLineWithIndex(this._focusedStickyElementIndex);
	}

	public goToFocused(): void {
		const lineNumbers = this._stickyScrollWidget.lineNumbers;
		this._disposeFocusStickyScrollStore();
		this._revealPosition({ lineNumber: lineNumbers[this._focusedStickyElementIndex], column: 1 });
	}

	private _revealPosition(position: IPosition): void {
		this._reveaInEditor(position, () => this._editor.revealPosition(position));
	}

	private _revealLineInCenterIfOutsideViewport(position: IPosition): void {
		this._reveaInEditor(position, () => this._editor.revealLineInCenterIfOutsideViewport(position.lineNumber, ScrollType.Smooth));
	}

	private _reveaInEditor(position: IPosition, revealFunction: () => void): void {
		if (this._focused) {
			this._disposeFocusStickyScrollStore();
		}
		this._positionRevealed = true;
		revealFunction();
		this._editor.setSelection(Range.fromPositions(position));
		this._editor.focus();
	}

	private _registerMouseListeners(): void {

		const sessionStore = this._register(new DisposableStore());
		const gesture = this._register(new ClickLinkGesture(this._editor, {
			extractLineNumberFromMouseEvent: (e) => {
				const position = this._stickyScrollWidget.getEditorPositionFromNode(e.target.element);
				return position ? position.lineNumber : 0;
			}
		}));

		const getMouseEventTarget = (mouseEvent: ClickLinkMouseEvent): { range: Range; textElement: HTMLElement } | null => {
			if (!this._editor.hasModel()) {
				return null;
			}
			if (mouseEvent.target.type !== MouseTargetType.OVERLAY_WIDGET || mouseEvent.target.detail !== this._stickyScrollWidget.getId()) {
				// not hovering over our widget
				return null;
			}
			const mouseTargetElement = mouseEvent.target.element;
			if (!mouseTargetElement || mouseTargetElement.innerText !== mouseTargetElement.innerHTML) {
				// not on a span element rendering text
				return null;
			}
			const position = this._stickyScrollWidget.getEditorPositionFromNode(mouseTargetElement);
			if (!position) {
				// not hovering a sticky scroll line
				return null;
			}
			return {
				range: new Range(position.lineNumber, position.column, position.lineNumber, position.column + mouseTargetElement.innerText.length),
				textElement: mouseTargetElement
			};
		};

		const stickyScrollWidgetDomNode = this._stickyScrollWidget.getDomNode();
		this._register(dom.addStandardDisposableListener(stickyScrollWidgetDomNode, dom.EventType.CLICK, (mouseEvent: IMouseEvent) => {
			if (mouseEvent.ctrlKey || mouseEvent.altKey || mouseEvent.metaKey) {
				// modifier pressed
				return;
			}
			if (!mouseEvent.leftButton) {
				// not left click
				return;
			}
			if (mouseEvent.shiftKey) {
				// shift click
				const lineIndex = this._stickyScrollWidget.getLineIndexFromChildDomNode(mouseEvent.target);
				if (lineIndex === null) {
					return;
				}
				const position = new Position(this._endLineNumbers[lineIndex], 1);
				this._revealLineInCenterIfOutsideViewport(position);
				return;
			}
			const isInFoldingIconDomNode = this._stickyScrollWidget.isInFoldingIconDomNode(mouseEvent.target);
			if (isInFoldingIconDomNode) {
				// clicked on folding icon
				const lineNumber = this._stickyScrollWidget.getLineNumberFromChildDomNode(mouseEvent.target);
				this._toggleFoldingRegionForLine(lineNumber);
				return;
			}
			const isInStickyLine = this._stickyScrollWidget.isInStickyLine(mouseEvent.target);
			if (!isInStickyLine) {
				return;
			}
			// normal click
			let position = this._stickyScrollWidget.getEditorPositionFromNode(mouseEvent.target);
			if (!position) {
				const lineNumber = this._stickyScrollWidget.getLineNumberFromChildDomNode(mouseEvent.target);
				if (lineNumber === null) {
					// not hovering a sticky scroll line
					return;
				}
				position = new Position(lineNumber, 1);
			}
			this._revealPosition(position);
		}));
		const mouseMoveListener = (mouseEvent: MouseEvent) => {
			this._mouseTarget = mouseEvent.target;
			this._onMouseMoveOrKeyDown(mouseEvent);
		};
		const keyDownListener = (mouseEvent: KeyboardEvent) => {
			this._onMouseMoveOrKeyDown(mouseEvent);
		};
		const keyUpListener = (e: KeyboardEvent) => {
			if (this._showEndForLine !== undefined) {
				this._showEndForLine = undefined;
				this._renderStickyScroll();
			}
		};
		mainWindow.addEventListener(dom.EventType.MOUSE_MOVE, mouseMoveListener);
		mainWindow.addEventListener(dom.EventType.KEY_DOWN, keyDownListener);
		mainWindow.addEventListener(dom.EventType.KEY_UP, keyUpListener);
		this._register(toDisposable(() => {
			mainWindow.removeEventListener(dom.EventType.MOUSE_MOVE, mouseMoveListener);
			mainWindow.removeEventListener(dom.EventType.KEY_DOWN, keyDownListener);
			mainWindow.removeEventListener(dom.EventType.KEY_UP, keyUpListener);
		}));

		this._register(gesture.onMouseMoveOrRelevantKeyDown(([mouseEvent, _keyboardEvent]) => {
			const mouseTarget = getMouseEventTarget(mouseEvent);
			if (!mouseTarget || !mouseEvent.hasTriggerModifier || !this._editor.hasModel()) {
				sessionStore.clear();
				return;
			}
			const { range, textElement } = mouseTarget;

			if (!range.equalsRange(this._stickyRangeProjectedOnEditor)) {
				this._stickyRangeProjectedOnEditor = range;
				sessionStore.clear();
			} else if (textElement.style.textDecoration === 'underline') {
				return;
			}

			const cancellationToken = new CancellationTokenSource();
			sessionStore.add(toDisposable(() => cancellationToken.dispose(true)));

			let currentHTMLChild: HTMLElement;

			getDefinitionsAtPosition(this._languageFeaturesService.definitionProvider, this._editor.getModel(), new Position(range.startLineNumber, range.startColumn + 1), false, cancellationToken.token).then((candidateDefinitions => {
				if (cancellationToken.token.isCancellationRequested) {
					return;
				}
				if (candidateDefinitions.length !== 0) {
					this._candidateDefinitionsLength = candidateDefinitions.length;
					const childHTML: HTMLElement = textElement;
					if (currentHTMLChild !== childHTML) {
						sessionStore.clear();
						currentHTMLChild = childHTML;
						currentHTMLChild.style.textDecoration = 'underline';
						sessionStore.add(toDisposable(() => {
							currentHTMLChild.style.textDecoration = 'none';
						}));
					} else if (!currentHTMLChild) {
						currentHTMLChild = childHTML;
						currentHTMLChild.style.textDecoration = 'underline';
						sessionStore.add(toDisposable(() => {
							currentHTMLChild.style.textDecoration = 'none';
						}));
					}
				} else {
					sessionStore.clear();
				}
			}));
		}));
		this._register(gesture.onCancel(() => {
			sessionStore.clear();
		}));
		this._register(gesture.onExecute(async e => {
			if (e.target.type !== MouseTargetType.OVERLAY_WIDGET || e.target.detail !== this._stickyScrollWidget.getId()) {
				// not hovering over our widget
				return;
			}
			const position = this._stickyScrollWidget.getEditorPositionFromNode(e.target.element);
			if (!position) {
				// not hovering a sticky scroll line
				return;
			}
			if (!this._editor.hasModel() || !this._stickyRangeProjectedOnEditor) {
				return;
			}
			if (this._candidateDefinitionsLength > 1) {
				if (this._focused) {
					this._disposeFocusStickyScrollStore();
				}
				this._revealPosition({ lineNumber: position.lineNumber, column: 1 });
			}
			this._instaService.invokeFunction(goToDefinitionWithLocation, e, this._editor as IActiveCodeEditor, { uri: this._editor.getModel().uri, range: this._stickyRangeProjectedOnEditor });
		}));
	}

	private _onContextMenu(targetWindow: Window, e: MouseEvent) {
		const event = new StandardMouseEvent(targetWindow, e);

		this._contextMenuService.showContextMenu({
			menuId: MenuId.StickyScrollContext,
			getAnchor: () => event,
		});
	}

	private _onMouseMoveOrKeyDown(mouseEvent: KeyboardEvent | MouseEvent): void {
		if (!mouseEvent.shiftKey) {
			return;
		}
		if (!this._mouseTarget || !dom.isHTMLElement(this._mouseTarget)) {
			return;
		}
		const currentEndForLineIndex = this._stickyScrollWidget.getLineIndexFromChildDomNode(this._mouseTarget);
		if (currentEndForLineIndex === null || this._showEndForLine === currentEndForLineIndex) {
			return;
		}
		this._showEndForLine = currentEndForLineIndex;
		this._renderStickyScroll();
	}

	private _toggleFoldingRegionForLine(line: number | null) {
		if (!this._foldingModel || line === null) {
			return;
		}
		const stickyLine = this._stickyScrollWidget.getRenderedStickyLine(line);
		const foldingIcon = stickyLine?.foldingIcon;
		if (!foldingIcon) {
			return;
		}
		toggleCollapseState(this._foldingModel, 1, [line]);
		foldingIcon.isCollapsed = !foldingIcon.isCollapsed;
		const scrollTop = (foldingIcon.isCollapsed ?
			this._editor.getTopForLineNumber(foldingIcon.foldingEndLine)
			: this._editor.getTopForLineNumber(foldingIcon.foldingStartLine))
			- this._editor.getOption(EditorOption.lineHeight) * stickyLine.index + 1;
		this._editor.setScrollTop(scrollTop);
		this._renderStickyScroll(line);
	}

	private _readConfiguration() {
		const options = this._editor.getOption(EditorOption.stickyScroll);
		if (options.enabled === false) {
			this._editor.removeOverlayWidget(this._stickyScrollWidget);
			this._resetState();
			this._sessionStore.clear();
			this._enabled = false;
			return;
		} else if (options.enabled && !this._enabled) {
			// When sticky scroll was just enabled, add the listeners on the sticky scroll
			this._editor.addOverlayWidget(this._stickyScrollWidget);
			this._sessionStore.add(this._editor.onDidScrollChange((e) => {
				if (e.scrollTopChanged) {
					this._showEndForLine = undefined;
					this._renderStickyScroll();
				}
			}));
			this._sessionStore.add(this._editor.onDidLayoutChange(() => this._onDidResize()));
			this._sessionStore.add(this._editor.onDidChangeModelTokens((e) => this._onTokensChange(e)));
			this._sessionStore.add(this._stickyLineCandidateProvider.onDidChangeStickyScroll(() => {
				this._showEndForLine = undefined;
				this._renderStickyScroll();
			}));
			this._enabled = true;
		}

		const lineNumberOption = this._editor.getOption(EditorOption.lineNumbers);
		if (lineNumberOption.renderType === RenderLineNumbersType.Relative) {
			this._sessionStore.add(this._editor.onDidChangeCursorPosition(() => {
				this._showEndForLine = undefined;
				this._renderStickyScroll(0);
			}));
		}
	}

	private _readConfigurationChange(event: ConfigurationChangedEvent) {
		if (
			event.hasChanged(EditorOption.stickyScroll)
			|| event.hasChanged(EditorOption.minimap)
			|| event.hasChanged(EditorOption.lineHeight)
			|| event.hasChanged(EditorOption.showFoldingControls)
			|| event.hasChanged(EditorOption.lineNumbers)
		) {
			this._readConfiguration();
		}

		if (event.hasChanged(EditorOption.lineNumbers) || event.hasChanged(EditorOption.folding) || event.hasChanged(EditorOption.showFoldingControls)) {
			this._renderStickyScroll(0);
		}
	}

	private _needsUpdate(event: IModelTokensChangedEvent) {
		const stickyLineNumbers = this._stickyScrollWidget.getCurrentLines();
		for (const stickyLineNumber of stickyLineNumbers) {
			for (const range of event.ranges) {
				if (stickyLineNumber >= range.fromLineNumber && stickyLineNumber <= range.toLineNumber) {
					return true;
				}
			}
		}
		return false;
	}

	private _onTokensChange(event: IModelTokensChangedEvent) {
		if (this._needsUpdate(event)) {
			// Rebuilding the whole widget from line 0
			this._renderStickyScroll(0);
		}
	}

	private _onDidResize() {
		const layoutInfo = this._editor.getLayoutInfo();
		// Make sure sticky scroll doesn't take up more than 25% of the editor
		const theoreticalLines = layoutInfo.height / this._editor.getOption(EditorOption.lineHeight);
		this._maxStickyLines = Math.round(theoreticalLines * .25);
		this._renderStickyScroll(0);
	}

	private async _renderStickyScroll(rebuildFromLine?: number): Promise<void> {
		const model = this._editor.getModel();
		if (!model || model.isTooLargeForTokenization()) {
			this._resetState();
			return;
		}
		const nextRebuildFromLine = this._updateAndGetMinRebuildFromLine(rebuildFromLine);
		const stickyWidgetVersion = this._stickyLineCandidateProvider.getVersionId();
		const shouldUpdateState = stickyWidgetVersion === undefined || stickyWidgetVersion === model.getVersionId();
		if (shouldUpdateState) {
			if (!this._focused) {
				await this._updateState(nextRebuildFromLine);
			} else {
				// Suppose that previously the sticky scroll widget had height 0, then if there are visible lines, set the last line as focused
				if (this._focusedStickyElementIndex === -1) {
					await this._updateState(nextRebuildFromLine);
					this._focusedStickyElementIndex = this._stickyScrollWidget.lineNumberCount - 1;
					if (this._focusedStickyElementIndex !== -1) {
						this._stickyScrollWidget.focusLineWithIndex(this._focusedStickyElementIndex);
					}
				} else {
					const focusedStickyElementLineNumber = this._stickyScrollWidget.lineNumbers[this._focusedStickyElementIndex];
					await this._updateState(nextRebuildFromLine);
					// Suppose that after setting the state, there are no sticky lines, set the focused index to -1
					if (this._stickyScrollWidget.lineNumberCount === 0) {
						this._focusedStickyElementIndex = -1;
					} else {
						const previousFocusedLineNumberExists = this._stickyScrollWidget.lineNumbers.includes(focusedStickyElementLineNumber);

						// If the line number is still there, do not change anything
						// If the line number is not there, set the new focused line to be the last line
						if (!previousFocusedLineNumberExists) {
							this._focusedStickyElementIndex = this._stickyScrollWidget.lineNumberCount - 1;
						}
						this._stickyScrollWidget.focusLineWithIndex(this._focusedStickyElementIndex);
					}
				}
			}
		}
	}

	private _updateAndGetMinRebuildFromLine(rebuildFromLine: number | undefined): number | undefined {
		if (rebuildFromLine !== undefined) {
			const minRebuildFromLineOrInfinity = this._minRebuildFromLine !== undefined ? this._minRebuildFromLine : Infinity;
			this._minRebuildFromLine = Math.min(rebuildFromLine, minRebuildFromLineOrInfinity);
		}
		return this._minRebuildFromLine;
	}

	private async _updateState(rebuildFromLine?: number): Promise<void> {
		this._minRebuildFromLine = undefined;
		this._foldingModel = await FoldingController.get(this._editor)?.getFoldingModel() ?? undefined;
		this._widgetState = this.findScrollWidgetState();
		const stickyWidgetHasLines = this._widgetState.startLineNumbers.length > 0;
		this._stickyScrollVisibleContextKey.set(stickyWidgetHasLines);
		this._stickyScrollWidget.setState(this._widgetState, this._foldingModel, rebuildFromLine);
	}

	private async _resetState(): Promise<void> {
		this._minRebuildFromLine = undefined;
		this._foldingModel = undefined;
		this._widgetState = StickyScrollWidgetState.Empty;
		this._stickyScrollVisibleContextKey.set(false);
		this._stickyScrollWidget.setState(undefined, undefined);
	}

	findScrollWidgetState(): StickyScrollWidgetState {
		if (!this._editor.hasModel()) {
			return StickyScrollWidgetState.Empty;
		}
		const textModel = this._editor.getModel();
		const maxNumberStickyLines = Math.min(this._maxStickyLines, this._editor.getOption(EditorOption.stickyScroll).maxLineCount);
		const scrollTop: number = this._editor.getScrollTop();
		let lastLineRelativePosition: number = 0;
		const startLineNumbers: number[] = [];
		const endLineNumbers: number[] = [];
		const arrayVisibleRanges = this._editor.getVisibleRanges();
		if (arrayVisibleRanges.length !== 0) {
			const fullVisibleRange = new StickyRange(arrayVisibleRanges[0].startLineNumber, arrayVisibleRanges[arrayVisibleRanges.length - 1].endLineNumber);
			const candidateRanges = this._stickyLineCandidateProvider.getCandidateStickyLinesIntersecting(fullVisibleRange);
			for (const range of candidateRanges) {
				const start = range.startLineNumber;
				const end = range.endLineNumber;
				const isValidRange = textModel.isValidRange({ startLineNumber: start, endLineNumber: end, startColumn: 1, endColumn: 1 });
				if (isValidRange && end - start > 0) {
					const topOfElement = range.top;
					const bottomOfElement = topOfElement + range.height;
					const topOfBeginningLine = this._editor.getTopForLineNumber(start) - scrollTop;
					const bottomOfEndLine = this._editor.getBottomForLineNumber(end) - scrollTop;
					if (topOfElement > topOfBeginningLine && topOfElement <= bottomOfEndLine) {
						startLineNumbers.push(start);
						endLineNumbers.push(end + 1);
						if (bottomOfElement > bottomOfEndLine) {
							lastLineRelativePosition = bottomOfEndLine - bottomOfElement;
						}
					}
					if (startLineNumbers.length === maxNumberStickyLines) {
						break;
					}
				}
			}
		}
		this._endLineNumbers = endLineNumbers;
		return new StickyScrollWidgetState(startLineNumbers, endLineNumbers, lastLineRelativePosition, this._showEndForLine);
	}

	override dispose(): void {
		super.dispose();
		this._sessionStore.dispose();
	}
}
