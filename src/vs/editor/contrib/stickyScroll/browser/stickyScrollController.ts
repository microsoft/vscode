/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IActiveCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorContribution, ScrollType } from 'vs/editor/common/editorCommon';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { EditorOption, RenderLineNumbersType } from 'vs/editor/common/config/editorOptions';
import { StickyScrollWidget, StickyScrollWidgetState } from './stickyScrollWidget';
import { IStickyLineCandidateProvider, StickyLineCandidateProvider } from './stickyScrollProvider';
import { IModelTokensChangedEvent } from 'vs/editor/common/textModelEvents';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IRange, Range } from 'vs/editor/common/core/range';
import { getDefinitionsAtPosition } from 'vs/editor/contrib/gotoSymbol/browser/goToSymbol';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { ILanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';
import * as dom from 'vs/base/browser/dom';
import { StickyRange } from 'vs/editor/contrib/stickyScroll/browser/stickyScrollElement';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { PeekContext } from 'vs/editor/contrib/peekView/browser/peekView';
import { DefinitionAction, SymbolNavigationAnchor } from 'vs/editor/contrib/gotoSymbol/browser/goToCommands';
import { Location } from 'vs/editor/common/languages';

export interface IStickyScrollController {
	get stickyScrollCandidateProvider(): IStickyLineCandidateProvider;
	get stickyScrollWidgetState(): StickyScrollWidgetState;
	focus(): void;
	focusNext(): void;
	focusPrevious(): void;
	goToFocused(): void;
	findScrollWidgetState(): StickyScrollWidgetState;
	dispose(): void;
	selectEditor(): void;
}

// TODO: take into account the case that when there is a mouse up and previously shift was held, render normally
// TODO: also when you move out of sticky scroll, and previously rendering with end of scope line, then this needs to be rendered normally
// TODO: make sure that the command hover also works correctly without the click link gesture

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
	private _enabled = false;
	private _focused = false;
	private _positionRevealed = false;
	private _onMouseDown = false;
	private _startLineNumbers: number[] = [];
	private _endLineNumbers: number[] = [];
	private _startHoverLine: number | undefined;

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

		this._widgetState = new StickyScrollWidgetState([], 0);
		this._readConfiguration();
		this._register(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.stickyScroll)) {
				this._readConfiguration();
			}
		}));
		this._register(dom.addDisposableListener(this._stickyScrollWidget.getDomNode(), dom.EventType.CONTEXT_MENU, async (event: MouseEvent) => {
			this._onContextMenu(event);
		}));
		this._stickyScrollFocusedContextKey = EditorContextKeys.stickyScrollFocused.bindTo(this._contextKeyService);
		this._stickyScrollVisibleContextKey = EditorContextKeys.stickyScrollVisible.bindTo(this._contextKeyService);
		const focusTracker = this._register(dom.trackFocus(this._stickyScrollWidget.getDomNode()));
		this._register(focusTracker.onDidBlur(_ => {
			const height = this._stickyScrollWidget.getDomNode().clientHeight;
			// Suppose that the blurring is caused by scrolling, then keep the focus on the sticky scroll
			// This is determined by the fact that the height of the widget has become zero and there has been no position revealing
			if (this._positionRevealed === false && height === 0) {
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
		this._register(this._navigationDisposables());
		// Suppose that mouse down on the sticky scroll, then do not focus on the sticky scroll because this will be followed by the revealing of a position
		this._register(dom.addDisposableListener(this._stickyScrollWidget.getDomNode(), dom.EventType.MOUSE_DOWN, (e) => {
			this._onMouseDown = true;
		}));
	}

	get stickyScrollCandidateProvider(): IStickyLineCandidateProvider {
		return this._stickyLineCandidateProvider;
	}

	get stickyScrollWidgetState(): StickyScrollWidgetState {
		return this._widgetState;
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

	public selectEditor(): void {
		this._editor.focus();
	}

	// True is next, false is previous
	private _focusNav(direction: boolean): void {
		this._focusedStickyElementIndex = direction ? this._focusedStickyElementIndex + 1 : this._focusedStickyElementIndex - 1;
		(this._stickyElements!.item(this._focusedStickyElementIndex) as HTMLDivElement).focus();
	}

	public goToFocused(): void {
		const lineNumbers = this._stickyScrollWidget.lineNumbers;
		this._disposeFocusStickyScrollStore();
		this._revealPosition({ lineNumber: lineNumbers[this._focusedStickyElementIndex], column: 1 });
	}

	private _revealPosition(position: IPosition): void {
		this._positionRevealed = true;
		this._editor.revealPosition(position);
		this._editor.setSelection(Range.fromPositions(position));
		this._editor.focus();
	}

	private _revealLineInCenterIfOutsideViewport(position: IPosition): void {
		this._positionRevealed = true;
		this._editor.revealLineInCenterIfOutsideViewport(position.lineNumber, ScrollType.Smooth);
		this._editor.setSelection(Range.fromPositions(position));
		this._editor.focus();
	}

	private _navigationDisposables(): IDisposable {

		let shiftPressed = false;
		const store = new DisposableStore();
		const sessionStore = new DisposableStore();
		store.add(sessionStore);
		store.add(dom.addDisposableListener(this._stickyScrollWidget.getDomNode(), dom.EventType.MOUSE_MOVE, (e) => {
			if (!this._editor.hasModel()) {
				sessionStore.clear();
				return;
			}
			const targetMouseEvent = e.target;
			if (e.metaKey && targetMouseEvent && targetMouseEvent instanceof HTMLElement && targetMouseEvent.innerText === targetMouseEvent.innerHTML) {
				const text = targetMouseEvent.innerText;
				if (this._stickyScrollWidget.hoverOnColumn === -1) {
					return;
				}
				const lineNumber = this._stickyScrollWidget.hoverOnLine;
				const column = this._stickyScrollWidget.hoverOnColumn;

				const stickyPositionProjectedOnEditor = new Range(lineNumber, column, lineNumber, column + text.length);
				if (!stickyPositionProjectedOnEditor.equalsRange(this._stickyRangeProjectedOnEditor)) {
					this._stickyRangeProjectedOnEditor = stickyPositionProjectedOnEditor;
					sessionStore.clear();
				} else if (targetMouseEvent.style.textDecoration === 'underline') {
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
						if (currentHTMLChild !== targetMouseEvent) {
							sessionStore.clear();
							currentHTMLChild = targetMouseEvent;
							currentHTMLChild.style.textDecoration = 'underline';
							sessionStore.add(toDisposable(() => {
								currentHTMLChild.style.textDecoration = 'none';
							}));
						} else if (!currentHTMLChild) {
							currentHTMLChild = targetMouseEvent;
							currentHTMLChild.style.textDecoration = 'underline';
							sessionStore.add(toDisposable(() => {
								currentHTMLChild.style.textDecoration = 'none';
							}));
						}
					} else {
						sessionStore.clear();
					}
				}));
				this._startHoverLine = undefined;
			} else if (e.shiftKey) {
				const indexHoverOnLine = this._endLineNumbers.indexOf(this._stickyScrollWidget.hoverOnLine);
				const startHoverOnLine = indexHoverOnLine > -1 ? this._startLineNumbers[indexHoverOnLine] : this._stickyScrollWidget.hoverOnLine;
				shiftPressed = true;
				if (this._startHoverLine === undefined || this._startHoverLine !== startHoverOnLine) {
					this._startHoverLine = startHoverOnLine;
					this._renderStickyScroll();
				}

			} else {
				this._startHoverLine = undefined;
				if (shiftPressed) {
					this._renderStickyScroll();
					shiftPressed = false;
				}
				sessionStore.clear();
			}
		}));
		store.add(dom.addDisposableListener(this._stickyScrollWidget.getDomNode(), dom.EventType.MOUSE_OVER, (e) => {
			this._stickyScrollWidget.getDomNode().style.cursor = 'pointer';
		}));
		store.add(dom.addDisposableListener(this._stickyScrollWidget.getDomNode(), dom.EventType.MOUSE_OUT, (e) => {

			const stickyScrollWidgetDom = this._stickyScrollWidget.getDomNode();
			const domRect = stickyScrollWidgetDom.getBoundingClientRect();
			const clientX = e.clientX;
			const clientY = e.clientY;

			if (clientX <= domRect.left || clientX >= domRect.right || clientY <= domRect.top || clientY >= domRect.bottom) {
				this._stickyScrollWidget.getDomNode().style.cursor = 'default';
				this._renderStickyScroll();
				this._startHoverLine = undefined;
			}
		}));
		store.add(dom.addDisposableListener(this._stickyScrollWidget.getDomNode(), dom.EventType.MOUSE_UP, (e) => {
			if (e.metaKey) {
				sessionStore.clear();
			}
			if (e.shiftKey) {
				this._renderStickyScroll();
			}
		}));
		store.add(dom.addDisposableListener(this._stickyScrollWidget.getDomNode(), dom.EventType.MOUSE_DOWN, (e) => {
			if (e.metaKey) {
				// Control click
				if (this._candidateDefinitionsLength > 1) {
					if (this._focused) {
						this._disposeFocusStickyScrollStore();
					}
					this._revealPosition({ lineNumber: this._stickyScrollWidget.hoverOnLine, column: 1 });
				}
				this._instaService.invokeFunction(goToDefinitionWithLocation, e, this._editor as IActiveCodeEditor, { uri: this._editor.getModel()!.uri, range: this._stickyRangeProjectedOnEditor! });

			} else if (e.shiftKey) {
				// Shift key
				if (this._focused) {
					this._disposeFocusStickyScrollStore();
				}
				const indexHoverOnLine = this._startLineNumbers.indexOf(this._stickyScrollWidget.hoverOnLine);
				const endHoverOnLine = indexHoverOnLine > -1 ? this._endLineNumbers[indexHoverOnLine] : this._stickyScrollWidget.hoverOnLine;
				this._revealLineInCenterIfOutsideViewport({ lineNumber: endHoverOnLine, column: 0 });
			} else {
				// Normal click
				if (this._focused) {
					this._disposeFocusStickyScrollStore();
				}
				this._revealPosition({ lineNumber: this._stickyScrollWidget.hoverOnLine, column: this._stickyScrollWidget.hoverOnColumn });
			}
		}));
		return store;
	}

	private _onContextMenu(e: MouseEvent) {
		const event = new StandardMouseEvent(e);

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
			this._enabled = false;
			return;
		} else if (options.enabled && !this._enabled) {
			// When sticky scroll was just enabled, add the listeners on the sticky scroll
			this._editor.addOverlayWidget(this._stickyScrollWidget);
			this._sessionStore.add(this._editor.onDidScrollChange(() => {
				console.log('on scroll change');
				this._renderStickyScroll();
			}));
			this._sessionStore.add(this._editor.onDidLayoutChange(() => this._onDidResize()));
			this._sessionStore.add(this._editor.onDidChangeModelTokens((e) => this._onTokensChange(e)));
			this._sessionStore.add(this._stickyLineCandidateProvider.onDidChangeStickyScroll(() => {
				console.log('on did change sticky scroll');
				this._renderStickyScroll();
			}));
			this._enabled = true;
		}

		const lineNumberOption = this._editor.getOption(EditorOption.lineNumbers);
		if (lineNumberOption.renderType === RenderLineNumbersType.Relative) {
			this._sessionStore.add(this._editor.onDidChangeCursorPosition(() => {
				console.log('on did change cursor position');
				this._renderStickyScroll();
			}));
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
			console.log('on tokens change');
			this._renderStickyScroll();
		}
	}

	private _onDidResize() {
		const layoutInfo = this._editor.getLayoutInfo();
		const width = layoutInfo.width - layoutInfo.minimap.minimapCanvasOuterWidth - layoutInfo.verticalScrollbarWidth;
		this._stickyScrollWidget.getDomNode().style.width = `${width}px`;
		// Make sure sticky scroll doesn't take up more than 25% of the editor
		const theoreticalLines = layoutInfo.height / this._editor.getOption(EditorOption.lineHeight);
		this._maxStickyLines = Math.round(theoreticalLines * .25);
	}

	private _renderStickyScroll() {
		console.log('inside of _renderStickScroll');
		console.log('this._startHoverLine : ', this._startHoverLine);
		if (!(this._editor.hasModel())) {
			return;
		}
		const model = this._editor.getModel();
		const stickyLineVersion = this._stickyLineCandidateProvider.getVersionId();
		if (stickyLineVersion === undefined || stickyLineVersion === model.getVersionId()) {
			this._widgetState = this.findScrollWidgetState();
			this._stickyScrollVisibleContextKey.set(!(this._widgetState.lineNumbers.length === 0));

			if (!this._focused) {
				this._stickyScrollWidget.setState(this._widgetState);
			} else {
				this._stickyElements = this._stickyScrollWidget.getDomNode().children;
				// Suppose that previously the sticky scroll widget had height 0, then if there are visible lines, set the last line as focused
				if (this._focusedStickyElementIndex === -1) {
					this._stickyScrollWidget.setState(this._widgetState);
					this._focusedStickyElementIndex = this._stickyElements.length - 1;
					if (this._focusedStickyElementIndex !== -1) {
						(this._stickyElements.item(this._focusedStickyElementIndex) as HTMLDivElement).focus();
					}
				} else {
					const focusedStickyElementLineNumber = this._stickyScrollWidget.lineNumbers[this._focusedStickyElementIndex];
					this._stickyScrollWidget.setState(this._widgetState);
					// Suppose that after setting the state, there are no sticky lines, set the focused index to -1
					if (this._stickyElements.length === 0) {
						this._focusedStickyElementIndex = -1;
					} else {
						const previousFocusedLineNumberExists = this._stickyScrollWidget.lineNumbers.includes(focusedStickyElementLineNumber);

						// If the line number is still there, do not change anything
						// If the line number is not there, set the new focused line to be the last line
						if (!previousFocusedLineNumberExists) {
							this._focusedStickyElementIndex = this._stickyElements.length - 1;
						}
						(this._stickyElements.item(this._focusedStickyElementIndex) as HTMLDivElement).focus();
					}
				}
			}
		}
	}

	findScrollWidgetState(): StickyScrollWidgetState {
		const lineHeight: number = this._editor.getOption(EditorOption.lineHeight);
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
				const depth = range.nestingDepth;
				if (end - start > 0) {
					const topOfElementAtDepth = (depth - 1) * lineHeight;
					const bottomOfElementAtDepth = depth * lineHeight;

					const bottomOfBeginningLine = this._editor.getBottomForLineNumber(start) - scrollTop;
					const topOfEndLine = this._editor.getTopForLineNumber(end) - scrollTop;
					const bottomOfEndLine = this._editor.getBottomForLineNumber(end) - scrollTop;

					if (topOfElementAtDepth > topOfEndLine && topOfElementAtDepth <= bottomOfEndLine) {
						startLineNumbers.push(start);
						endLineNumbers.push(end + 1);
						lastLineRelativePosition = bottomOfEndLine - bottomOfElementAtDepth;
						break;
					}
					else if (bottomOfElementAtDepth > bottomOfBeginningLine && bottomOfElementAtDepth <= bottomOfEndLine) {
						startLineNumbers.push(start);
						endLineNumbers.push(end + 1);
					}
					if (startLineNumbers.length === maxNumberStickyLines) {
						break;
					}
				}
			}
		}
		this._startLineNumbers = startLineNumbers;
		this._endLineNumbers = endLineNumbers;
		const widgetStateLines = [...startLineNumbers];
		if (this._startHoverLine) {
			const index = startLineNumbers.indexOf(this._startHoverLine);
			if (index !== -1) {
				widgetStateLines[index] = endLineNumbers[index];
			}
		}
		return new StickyScrollWidgetState(widgetStateLines, lastLineRelativePosition);
	}

	override dispose(): void {
		super.dispose();
		this._sessionStore.dispose();
	}
}

export async function goToDefinitionWithLocation(accessor: ServicesAccessor, event: MouseEvent, editor: IActiveCodeEditor, location: Location) {

	const resolverService = accessor.get(ITextModelService);
	const ref = await resolverService.createModelReference(location.uri);

	await editor.invokeWithinContext(async (accessor) => {

		const openToSide = event.ctrlKey;
		const contextKeyService = accessor.get(IContextKeyService);

		const isInPeek = PeekContext.inPeekEditor.getValue(contextKeyService);
		const canPeek = !openToSide && editor.getOption(EditorOption.definitionLinkOpensInPeek) && !isInPeek;

		const action = new DefinitionAction({ openToSide, openInPeek: canPeek, muteMessage: true }, { title: { value: '', original: '' }, id: '', precondition: undefined });
		return action.run(accessor, new SymbolNavigationAnchor(ref.object.textEditorModel, Range.getStartPosition(location.range)), Range.lift(location.range));
	});

	ref.dispose();
}
