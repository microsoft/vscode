/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { EditorOption, RenderLineNumbersType } from 'vs/editor/common/config/editorOptions';
import { StickyScrollWidget, StickyScrollWidgetState } from './stickyScrollWidget';
import { IStickyLineCandidateProvider, StickyLineCandidateProvider, StickyRange } from './stickyScrollProvider';
import { IModelTokensChangedEvent } from 'vs/editor/common/textModelEvents';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ClickLinkGesture } from 'vs/editor/contrib/gotoSymbol/browser/link/clickLinkGesture';
import { IRange, Range } from 'vs/editor/common/core/range';
import { getDefinitionsAtPosition } from 'vs/editor/contrib/gotoSymbol/browser/goToSymbol';
import { goToDefinitionWithLocation } from 'vs/editor/contrib/inlayHints/browser/inlayHintsLocations';
import { Position } from 'vs/editor/common/core/position';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import * as dom from 'vs/base/browser/dom';

interface CustomMouseEvent {
	detail: string;
	element: HTMLElement;
}

export interface IStickyScrollController {
	get stickyScrollCandidateProvider(): IStickyLineCandidateProvider;
	get stickyScrollWidgetState(): StickyScrollWidgetState;
	focus(): void;
	focusNext(): void;
	focusPrevious(): void;
	goToFocused(): void;
	findScrollWidgetState(): StickyScrollWidgetState;
	dispose(): void;
}

export class StickyScrollController extends Disposable implements IEditorContribution, IStickyScrollController {

	static readonly ID = 'store.contrib.stickyScrollController';

	private readonly _stickyScrollWidget: StickyScrollWidget;
	private readonly _stickyLineCandidateProvider: IStickyLineCandidateProvider;
	private readonly _sessionStore: DisposableStore = new DisposableStore();

	private _widgetState: StickyScrollWidgetState;
	private _maxStickyLines: number = Number.MAX_SAFE_INTEGER;

	private _stickyRangeProjectedOnEditor: IRange | undefined;
	private _candidateDefinitionsLength: number = -1;

	private _stickyScrollFocusedContextKey: IContextKey<boolean>;
	private _stickyScrollVisibleContextKey: IContextKey<boolean>;

	private _stickyElements: HTMLCollection | undefined;
	private _focusDisposableStore: DisposableStore | undefined;
	private _focusedStickyElementIndex: number = -1;
	private _focused = false;

	constructor(
		private readonly _editor: ICodeEditor,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
	) {
		super();
		this._stickyScrollWidget = new StickyScrollWidget(this._editor);
		this._stickyLineCandidateProvider = new StickyLineCandidateProvider(this._editor, this._languageFeaturesService);
		this._register(this._stickyScrollWidget);
		this._register(this._stickyLineCandidateProvider);

		// The line numbers to stick
		this._widgetState = new StickyScrollWidgetState([], 0);

		// Read the initial configuration to check if sticky scroll is enabled
		this._readConfiguration();
		// If the editor option for sticky scroll has changed, read the configuration again
		this._register(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.stickyScroll)) {
				this._readConfiguration();
			}
		}));

		this._register(dom.addDisposableListener(this._stickyScrollWidget.getDomNode(), dom.EventType.CONTEXT_MENU, async (event: MouseEvent) => {
			this._onContextMenu(event);
		}));

		// Context key which indicates if the sticky scroll is focused or not
		this._stickyScrollFocusedContextKey = EditorContextKeys.stickyScrollFocused.bindTo(this._contextKeyService);
		this._stickyScrollVisibleContextKey = EditorContextKeys.stickyScrollVisible.bindTo(this._contextKeyService);

		// Create a focus tracker to track the focus on the sticky scroll widget
		const focusTracker = this._register(dom.trackFocus(this._stickyScrollWidget.getDomNode()));
		// Focus placed elsewhere in the window
		this._register(focusTracker.onDidBlur(_ => {
			this._disposeFocusStickyScrollStore();
		}));
		// Focusing for example through tabbing in the window
		this._register(focusTracker.onDidFocus(_ => {
			this.focus();
		}));

		// Register the click link gesture to allow the user to click on the sticky scroll widget to go to the definition
		this._register(this._createClickLinkGesture());
	}

	get stickyScrollCandidateProvider(): IStickyLineCandidateProvider {
		return this._stickyLineCandidateProvider;
	}

	get stickyScrollWidgetState(): StickyScrollWidgetState {
		return this._widgetState;
	}

	// Get function to allow actions to use the sticky scroll controller
	public static get(editor: ICodeEditor): IStickyScrollController | null {
		return editor.getContribution<StickyScrollController>(StickyScrollController.ID);
	}

	private _disposeFocusStickyScrollStore() {
		this._stickyScrollFocusedContextKey.set(false);
		this._focusDisposableStore!.dispose();
		this._focused = false;
	}

	public focus(): void {
		const focusState = this._stickyScrollFocusedContextKey.get();
		if (focusState === true) {
			// If already focused or no line to focus on, return
			return;
		}
		this._focused = true;
		this._focusDisposableStore = new DisposableStore();
		this._stickyScrollFocusedContextKey.set(true);

		// The first line focused is the bottom most line
		const rootNode = this._stickyScrollWidget.getDomNode();
		(rootNode.lastElementChild! as HTMLDivElement).focus();
		this._stickyElements = rootNode.children;
		this._focusedStickyElementIndex = this._stickyScrollWidget.lineNumbers.length - 1;
	}

	public focusNext(): void {
		if (this._focusedStickyElementIndex < this._stickyElements!.length - 1) {
			this._focusNav(true);
		}
	}

	public focusPrevious(): void {
		if (this._focusedStickyElementIndex > 0) {
			this._focusNav(false);
		}
	}

	// True is next, false is previous
	private _focusNav(direction: boolean): void {
		this._focusedStickyElementIndex = direction ? this._focusedStickyElementIndex + 1 : this._focusedStickyElementIndex - 1;
		(this._stickyElements!.item(this._focusedStickyElementIndex) as HTMLDivElement).focus();
	}

	public goToFocused(): void {
		const lineNumbers = this._stickyScrollWidget.lineNumbers;
		this._disposeFocusStickyScrollStore();
		this._editor.revealPosition({ lineNumber: lineNumbers[this._focusedStickyElementIndex], column: 1 });
	}

	private _createClickLinkGesture(): IDisposable {

		const linkGestureStore = new DisposableStore();
		const sessionStore = new DisposableStore();
		linkGestureStore.add(sessionStore);
		const gesture = new ClickLinkGesture(this._editor, true);
		linkGestureStore.add(gesture);

		linkGestureStore.add(gesture.onMouseMoveOrRelevantKeyDown(([mouseEvent, _keyboardEvent]) => {
			if (!this._editor.hasModel() || !mouseEvent.hasTriggerModifier) {
				sessionStore.clear();
				return;
			}
			const targetMouseEvent = mouseEvent.target as unknown as CustomMouseEvent;
			if (targetMouseEvent.detail === this._stickyScrollWidget.getId()
				&& targetMouseEvent.element.innerText === targetMouseEvent.element.innerHTML) {

				const text = targetMouseEvent.element.innerText;
				if (this._stickyScrollWidget.hoverOnColumn === -1) {
					return;
				}
				const lineNumber = this._stickyScrollWidget.hoverOnLine;
				const column = this._stickyScrollWidget.hoverOnColumn;

				const stickyPositionProjectedOnEditor = new Range(lineNumber, column, lineNumber, column + text.length);
				if (!stickyPositionProjectedOnEditor.equalsRange(this._stickyRangeProjectedOnEditor)) {
					this._stickyRangeProjectedOnEditor = stickyPositionProjectedOnEditor;
					sessionStore.clear();
				} else if (targetMouseEvent.element.style.textDecoration === 'underline') {
					return;
				}

				const cancellationToken = new CancellationTokenSource();
				sessionStore.add(toDisposable(() => cancellationToken.dispose(true)));

				let currentHTMLChild: HTMLElement;

				getDefinitionsAtPosition(this._languageFeaturesService.definitionProvider, this._editor.getModel(), new Position(lineNumber, column + 1), cancellationToken.token).then((candidateDefinitions => {
					if (cancellationToken.token.isCancellationRequested) {
						return;
					}
					if (candidateDefinitions.length !== 0) {
						this._candidateDefinitionsLength = candidateDefinitions.length;
						const childHTML: HTMLElement = targetMouseEvent.element;
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
			} else {
				sessionStore.clear();
			}
		}));
		linkGestureStore.add(gesture.onCancel(() => {
			sessionStore.clear();
		}));
		linkGestureStore.add(gesture.onExecute(async e => {
			if ((e.target as unknown as CustomMouseEvent).detail !== this._stickyScrollWidget.getId()) {
				return;
			}
			if (e.hasTriggerModifier) {
				// Control click
				if (this._candidateDefinitionsLength > 1) {
					if (this._focused) {
						this._disposeFocusStickyScrollStore();
					}
					this._editor.revealPosition({ lineNumber: this._stickyScrollWidget.hoverOnLine, column: 1 });
				}
				this._instaService.invokeFunction(goToDefinitionWithLocation, e, this._editor as IActiveCodeEditor, { uri: this._editor.getModel()!.uri, range: this._stickyRangeProjectedOnEditor! });

			} else if (!e.isRightClick) {
				// Normal click
				const position = { lineNumber: this._stickyScrollWidget.hoverOnLine, column: this._stickyScrollWidget.hoverOnColumn };
				if (this._focused) {
					this._disposeFocusStickyScrollStore();
				}
				this._editor.revealPosition(position);
				this._editor.setSelection(Range.fromPositions(position));
			}
		}));
		return linkGestureStore;
	}

	private _onContextMenu(event: MouseEvent) {
		this._contextMenuService.showContextMenu({
			menuId: MenuId.StickyScrollContext,
			getAnchor: () => event,
		});
	}

	private _readConfiguration() {
		const options = this._editor.getOption(EditorOption.stickyScroll);

		if (options.enabled === false) {
			this._editor.removeOverlayWidget(this._stickyScrollWidget);
			this._sessionStore.clear();
			return;
		} else {
			this._editor.addOverlayWidget(this._stickyScrollWidget);
			this._sessionStore.add(this._editor.onDidScrollChange(() => this._renderStickyScroll()));
			this._sessionStore.add(this._editor.onDidLayoutChange(() => this._onDidResize()));
			this._sessionStore.add(this._editor.onDidChangeModelTokens((e) => this._onTokensChange(e)));
			this._sessionStore.add(this._stickyLineCandidateProvider.onDidChangeStickyScroll(() => this._renderStickyScroll()));
			const lineNumberOption = this._editor.getOption(EditorOption.lineNumbers);
			if (lineNumberOption.renderType === RenderLineNumbersType.Relative) {
				this._sessionStore.add(this._editor.onDidChangeCursorPosition(() => this._renderStickyScroll()));
			}
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
			this._renderStickyScroll();
		}
	}

	private _onDidResize() {
		const layoutInfo = this._editor.getLayoutInfo();
		const width = layoutInfo.width - layoutInfo.minimap.minimapCanvasOuterWidth - layoutInfo.verticalScrollbarWidth;
		this._stickyScrollWidget.getDomNode().style.width = `${width}px`;
		// make sure sticky scroll doesn't take up more than 25% of the editor
		const theoreticalLines = layoutInfo.height / this._editor.getOption(EditorOption.lineHeight);
		this._maxStickyLines = Math.round(theoreticalLines * .25);
	}

	private _renderStickyScroll() {
		if (!(this._editor.hasModel())) {
			return;
		}
		const model = this._editor.getModel();
		const stickyLineVersion = this._stickyLineCandidateProvider.getVersionId();
		if (stickyLineVersion === undefined || stickyLineVersion === model.getVersionId()) {
			this._widgetState = this.findScrollWidgetState();
			this._stickyScrollVisibleContextKey.set(!(this._widgetState.lineNumbers.length === 0));

			// If the sticky scroll widget is focused then rerender the focus
			if (!this._focused) {
				this._stickyScrollWidget.setState(this._widgetState);
			} else {
				this._stickyElements = this._stickyScrollWidget.getDomNode().children;
				// When there are no more sticky line, lose focus
				if (this._stickyElements.length === 0) {
					this._disposeFocusStickyScrollStore();
					this._stickyScrollWidget.setState(this._widgetState);
				} else {
					// Finding the focused line number before rendering
					const focusedStickyElementLineNumber = this._stickyScrollWidget.lineNumbers[this._focusedStickyElementIndex];
					// Rendering
					this._stickyScrollWidget.setState(this._widgetState);
					// Checking if after rendering the line number is still in the sticky scroll widget
					const previousFocusedLineNumberExists = this._stickyScrollWidget.lineNumbers.includes(focusedStickyElementLineNumber);
					// If the line number is still there, do not change anything
					// If the line number is not there, set the new focused line to be the last line
					if (!previousFocusedLineNumberExists) {
						this._focusedStickyElementIndex = this._stickyElements.length - 1;
					}
					// Focus the line
					(this._stickyElements.item(this._focusedStickyElementIndex) as HTMLDivElement).focus();
				}
			}
		}
	}

	findScrollWidgetState(): StickyScrollWidgetState {
		const lineHeight: number = this._editor.getOption(EditorOption.lineHeight);
		const maxNumberStickyLines = Math.min(this._maxStickyLines, this._editor.getOption(EditorOption.stickyScroll).maxLineCount);
		const scrollTop: number = this._editor.getScrollTop();
		let lastLineRelativePosition: number = 0;
		const lineNumbers: number[] = [];
		const arrayVisibleRanges = this._editor.getVisibleRanges();
		if (arrayVisibleRanges.length !== 0) {
			const fullVisibleRange = new StickyRange(arrayVisibleRanges[0].startLineNumber, arrayVisibleRanges[arrayVisibleRanges.length - 1].endLineNumber);
			const candidateRanges = this._stickyLineCandidateProvider.getCandidateStickyLinesIntersecting(fullVisibleRange);
			for (const range of candidateRanges) {
				const start = range.startLineNumber;
				const end = range.endLineNumber;
				const depth = range.nestingDepth;
				if (end - start > 0) {
					const topOfElementAtDepth = (depth - 1) * lineHeight;
					const bottomOfElementAtDepth = depth * lineHeight;

					const bottomOfBeginningLine = this._editor.getBottomForLineNumber(start) - scrollTop;
					const topOfEndLine = this._editor.getTopForLineNumber(end) - scrollTop;
					const bottomOfEndLine = this._editor.getBottomForLineNumber(end) - scrollTop;

					if (topOfElementAtDepth > topOfEndLine && topOfElementAtDepth <= bottomOfEndLine) {
						lineNumbers.push(start);
						lastLineRelativePosition = bottomOfEndLine - bottomOfElementAtDepth;
						break;
					}
					else if (bottomOfElementAtDepth > bottomOfBeginningLine && bottomOfElementAtDepth <= bottomOfEndLine) {
						lineNumbers.push(start);
					}
					if (lineNumbers.length === maxNumberStickyLines) {
						break;
					}
				}
			}
		}
		return new StickyScrollWidgetState(lineNumbers, lastLineRelativePosition);
	}

	override dispose(): void {
		super.dispose();
		this._sessionStore.dispose();
	}
}
