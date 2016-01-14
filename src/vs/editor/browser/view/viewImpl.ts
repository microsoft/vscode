/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');

import Lifecycle = require('vs/base/common/lifecycle');
import DomUtils = require('vs/base/browser/dom');
import EventEmitter = require('vs/base/common/eventEmitter');
import Errors = require('vs/base/common/errors');
import Timer = require('vs/base/common/timer');

import {ViewEventHandler} from 'vs/editor/common/viewModel/viewEventHandler';
import {KeyboardHandler} from 'vs/editor/browser/controller/keyboardHandler';
import {PointerHandler} from 'vs/editor/browser/controller/pointerHandler';
import {LayoutProvider} from 'vs/editor/browser/viewLayout/layoutProvider';
import {Configuration} from 'vs/editor/browser/config/configuration';
import {ViewEventDispatcher} from 'vs/editor/browser/view/viewEventDispatcher';
import {ViewController} from 'vs/editor/browser/view/viewController';
import {ContentViewOverlays, MarginViewOverlays} from 'vs/editor/browser/view/viewOverlays';

// -- START VIEW PARTS
import {ViewZones} from 'vs/editor/browser/viewParts/viewZones/viewZones';
import {ViewLines} from 'vs/editor/browser/viewParts/lines/viewLines';
import {OverviewRuler} from 'vs/editor/browser/viewParts/overviewRuler/overviewRuler';
import {DecorationsOverviewRuler} from 'vs/editor/browser/viewParts/overviewRuler/decorationsOverviewRuler';
import {ViewCursors} from 'vs/editor/browser/viewParts/viewCursors/viewCursors';
import {ViewContentWidgets} from 'vs/editor/browser/viewParts/contentWidgets/contentWidgets';
import {ViewOverlayWidgets} from 'vs/editor/browser/viewParts/overlayWidgets/overlayWidgets';
import {CurrentLineHighlightOverlay} from 'vs/editor/browser/viewParts/currentLineHighlight/currentLineHighlight';
import {SelectionsOverlay} from 'vs/editor/browser/viewParts/selections/selections';
import {DecorationsOverlay} from 'vs/editor/browser/viewParts/decorations/decorations';
import {GlyphMarginOverlay} from 'vs/editor/browser/viewParts/glyphMargin/glyphMargin';
import {LinesDecorationsOverlay} from 'vs/editor/browser/viewParts/linesDecorations/linesDecorations';
import {LineNumbersOverlay} from 'vs/editor/browser/viewParts/lineNumbers/lineNumbers';
import {ScrollDecorationViewPart} from 'vs/editor/browser/viewParts/scrollDecoration/scrollDecoration';
// -- END VIEW PARTS

import Browser = require('vs/base/browser/browser');

import EditorCommon = require('vs/editor/common/editorCommon');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import {Range} from 'vs/editor/common/core/range';
import {IKeybindingService, IKeybindingContextKey} from 'vs/platform/keybinding/common/keybindingService';

export class View extends ViewEventHandler implements EditorBrowser.IView, Lifecycle.IDisposable {

	private eventDispatcher:ViewEventDispatcher;

	private listenersToRemove:EventEmitter.ListenerUnbind[];
	private listenersToDispose:Lifecycle.IDisposable[];

	private layoutProvider: LayoutProvider;
	public context: EditorBrowser.IViewContext;

	// The view lines
	private viewLines: ViewLines;

	// These are parts, but we must do some API related calls on them, so we keep a reference
	private viewZones: ViewZones;
	private contentWidgets: ViewContentWidgets;
	private overlayWidgets: ViewOverlayWidgets;
	private viewParts: EditorBrowser.IViewPart[];

	private keyboardHandler: KeyboardHandler;
	private pointerHandler: PointerHandler;

	private outgoingEventBus: EventEmitter.EventEmitter;

	// Dom nodes
	private linesContent: HTMLElement;
	public domNode: HTMLElement;
	public textArea: HTMLTextAreaElement;
	private textAreaCover: HTMLElement;
	private linesContentContainer: HTMLElement;
	private overflowGuardContainer: HTMLElement;

	// Actual mutable state
	private hasFocus:boolean;
	private _isDisposed: boolean;

	private handleAccumulatedModelEventsTimeout:number;
	private accumulatedModelEvents: EventEmitter.IEmitterEvent[];
	private _renderAnimationFrame: Lifecycle.IDisposable;

	private _editorId: number;
	private _keybindingService: IKeybindingService;
	private _editorTextFocusContextKey: IKeybindingContextKey<boolean>;

	constructor(editorId:number, configuration:Configuration, model:EditorCommon.IViewModel, keybindingService: IKeybindingService) {
		super();
		this._isDisposed = false;
		this._editorId = editorId;
		this._renderAnimationFrame = null;
		this.outgoingEventBus = new EventEmitter.EventEmitter();

		var viewController = new ViewController(model, configuration, this.outgoingEventBus);

		this.listenersToRemove = [];
		this.listenersToDispose = [];

		// The event dispatcher will always go through _renderOnce before dispatching any events
		this.eventDispatcher = new ViewEventDispatcher((callback:()=>void) => this._renderOnce(callback));

		// These two dom nodes must be constructed up front, since references are needed in the layout provider (scrolling & co.)
		this.linesContent = document.createElement('div');
		this.linesContent.className = EditorBrowser.ClassNames.LINES_CONTENT + ' monaco-editor-background';
		this.domNode = document.createElement('div');
		Configuration.applyEditorStyling(this.domNode, configuration.editor.stylingInfo);

		this.overflowGuardContainer = document.createElement('div');
		this.overflowGuardContainer.className = EditorBrowser.ClassNames.OVERFLOW_GUARD;

		// The layout provider has such responsibilities as:
		// - scrolling (i.e. viewport / full size) & co.
		// - whitespaces (a.k.a. view zones) management & co.
		// - line heights updating & co.
		this.layoutProvider = new LayoutProvider(configuration, model, this.eventDispatcher, this.linesContent, this.domNode, this.overflowGuardContainer);
		this.eventDispatcher.addEventHandler(this.layoutProvider);

		// The view context is passed on to most classes (basically to reduce param. counts in ctors)
		this.context = new ViewContext(
				editorId, configuration, model, this.eventDispatcher,
				(eventHandler:EditorBrowser.IViewEventHandler) => this.eventDispatcher.addEventHandler(eventHandler),
				(eventHandler:EditorBrowser.IViewEventHandler) => this.eventDispatcher.removeEventHandler(eventHandler)
		);

		this.createTextArea(keybindingService);
		this.createViewParts();

		// Keyboard handler
		this.keyboardHandler = new KeyboardHandler(this.context, viewController, this.createKeyboardHandlerHelper());

		// Pointer handler
		this.pointerHandler = new PointerHandler(this.context, viewController, this.createPointerHandlerHelper());

		this.hasFocus = false;
		this.codeEditorHelper = null;

		this.eventDispatcher.addEventHandler(this);

		// The view lines rendering calls model.getLineTokens() that might emit events that its tokens have changed.
		// This delayed processing of incoming model events acts as a guard against undesired/unexpected recursion.
		this.handleAccumulatedModelEventsTimeout = -1;
		this.accumulatedModelEvents = [];
		this.listenersToRemove.push(model.addBulkListener((events:EventEmitter.IEmitterEvent[]) => {
			this.accumulatedModelEvents = this.accumulatedModelEvents.concat(events);
			if (this.handleAccumulatedModelEventsTimeout === -1) {
				this.handleAccumulatedModelEventsTimeout = setTimeout(() => {
					this.handleAccumulatedModelEventsTimeout = -1;
					this._flushAnyAccumulatedEvents();
				});
			}
		}));
	}

	private _flushAnyAccumulatedEvents(): void {
		var toEmit = this.accumulatedModelEvents;
		this.accumulatedModelEvents = [];
		if (toEmit.length > 0) {
			this.eventDispatcher.emitMany(toEmit);
		}
	}

	private createTextArea(keybindingService: IKeybindingService): void {
		// Text Area (The focus will always be in the textarea when the cursor is blinking)
		this.textArea = <HTMLTextAreaElement>document.createElement('textarea');
		this._keybindingService = keybindingService.createScoped(this.textArea);
		this._editorTextFocusContextKey = this._keybindingService.createKey(EditorCommon.KEYBINDING_CONTEXT_EDITOR_TEXT_FOCUS, undefined);
		this.textArea.className = EditorBrowser.ClassNames.TEXTAREA;
		this.textArea.setAttribute('wrap', 'off');
		this.textArea.setAttribute('autocorrect', 'off');
		this.textArea.setAttribute('autocapitalize', 'off');
		this.textArea.setAttribute('spellcheck', 'false');
		this.textArea.setAttribute('aria-label', nls.localize('editorViewAccessibleLabel', "Editor content"));
		this.textArea.setAttribute('role', 'textbox');
		this.textArea.setAttribute('aria-multiline', 'true');
		DomUtils.StyleMutator.setTop(this.textArea, 0);
		DomUtils.StyleMutator.setLeft(this.textArea, 0);
		// Give textarea same font size & line height as editor, for the IME case (when the textarea is visible)
		DomUtils.StyleMutator.setFontSize(this.textArea, this.context.configuration.editor.fontSize);
		DomUtils.StyleMutator.setLineHeight(this.textArea, this.context.configuration.editor.lineHeight);

		this.listenersToDispose.push(DomUtils.addDisposableListener(this.textArea, 'focus', () => this._setHasFocus(true)));
		this.listenersToDispose.push(DomUtils.addDisposableListener(this.textArea, 'blur', () => this._setHasFocus(false)));

		// On top of the text area, we position a dom node to cover it up
		// (there have been reports of tiny blinking cursors)
		// (in WebKit the textarea is 1px by 1px because it cannot handle input to a 0x0 textarea)
		this.textAreaCover = document.createElement('div');
		if (this.context.configuration.editor.glyphMargin) {
			this.textAreaCover.className = 'monaco-editor-background ' + EditorBrowser.ClassNames.GLYPH_MARGIN + ' ' + EditorBrowser.ClassNames.TEXTAREA_COVER;
		} else {
			if (this.context.configuration.editor.lineNumbers) {
				this.textAreaCover.className = 'monaco-editor-background ' + EditorBrowser.ClassNames.LINE_NUMBERS + ' ' + EditorBrowser.ClassNames.TEXTAREA_COVER;
			} else {
				this.textAreaCover.className = 'monaco-editor-background ' + EditorBrowser.ClassNames.TEXTAREA_COVER;
			}
		}
		this.textAreaCover.style.position = 'absolute';
		DomUtils.StyleMutator.setWidth(this.textAreaCover, 1);
		DomUtils.StyleMutator.setHeight(this.textAreaCover, 1);
		DomUtils.StyleMutator.setTop(this.textAreaCover, 0);
		DomUtils.StyleMutator.setLeft(this.textAreaCover, 0);
	}

	private createViewParts(): void {
		this.viewParts = [];

		// View Lines
		this.viewLines = new ViewLines(this.context, this.layoutProvider);

		// View Zones
		this.viewZones = new ViewZones(this.context, this.layoutProvider);
		this.viewParts.push(this.viewZones);

		// Decorations overview ruler
		var decorationsOverviewRuler = new DecorationsOverviewRuler(
				this.context, this.layoutProvider.getScrollHeight(),
				(lineNumber:number) => this.layoutProvider.getVerticalOffsetForLineNumber(lineNumber)
		);
		this.viewParts.push(decorationsOverviewRuler);


		var scrollDecoration = new ScrollDecorationViewPart(this.context);
		this.viewParts.push(scrollDecoration);

		var contentViewOverlays = new ContentViewOverlays(this.context, this.layoutProvider);
		this.viewParts.push(contentViewOverlays);
		contentViewOverlays.addDynamicOverlay(new CurrentLineHighlightOverlay(this.context, this.layoutProvider));
		contentViewOverlays.addDynamicOverlay(new SelectionsOverlay(this.context));
		contentViewOverlays.addDynamicOverlay(new DecorationsOverlay(this.context));

		var marginViewOverlays = new MarginViewOverlays(this.context, this.layoutProvider);
		this.viewParts.push(marginViewOverlays);
		marginViewOverlays.addDynamicOverlay(new GlyphMarginOverlay(this.context));
		marginViewOverlays.addDynamicOverlay(new LinesDecorationsOverlay(this.context));
		marginViewOverlays.addDynamicOverlay(new LineNumbersOverlay(this.context));


		// Content widgets
		this.contentWidgets = new ViewContentWidgets(this.context, this.domNode);
		this.viewParts.push(this.contentWidgets);

		var viewCursors = new ViewCursors(this.context);
		this.viewParts.push(viewCursors);

		// Overlay widgets
		this.overlayWidgets = new ViewOverlayWidgets(this.context);
		this.viewParts.push(this.overlayWidgets);

		// -------------- Wire dom nodes up

		this.linesContentContainer = this.layoutProvider.getScrollbarContainerDomNode();
		this.linesContentContainer.style.position = 'absolute';

		if (decorationsOverviewRuler) {
			var overviewRulerData = this.layoutProvider.getOverviewRulerInsertData();
			overviewRulerData.parent.insertBefore(decorationsOverviewRuler.getDomNode(), overviewRulerData.insertBefore);
		}

		this.linesContent.appendChild(contentViewOverlays.getDomNode());
		this.linesContent.appendChild(this.viewZones.domNode);
		this.linesContent.appendChild(this.viewLines.domNode);
		this.linesContent.appendChild(this.contentWidgets.domNode);
		this.linesContent.appendChild(viewCursors.getDomNode());
		this.overflowGuardContainer.appendChild(marginViewOverlays.getDomNode());
		this.overflowGuardContainer.appendChild(this.linesContentContainer);
		this.overflowGuardContainer.appendChild(scrollDecoration.getDomNode());
		this.overflowGuardContainer.appendChild(this.overlayWidgets.domNode);
		this.overflowGuardContainer.appendChild(this.textArea);
		this.overflowGuardContainer.appendChild(this.textAreaCover);
		this.domNode.appendChild(this.overflowGuardContainer);
		this.domNode.appendChild(this.contentWidgets.overflowingContentWidgetsDomNode);
	}

	private _flushAccumulatedAndRenderNow(): void {
		this._flushAnyAccumulatedEvents();
		this._renderNow();
	}

	private createPointerHandlerHelper(): EditorBrowser.IPointerHandlerHelper {
		return {
			viewDomNode: this.domNode,
			linesContentDomNode: this.linesContent,

			focusTextArea: () => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.focusTextArea: View is disposed');
				}
				this.focus();
			},

			isDirty: (): boolean => {
				return (this.accumulatedModelEvents.length > 0);
			},

			getScrollTop: () => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.getScrollTop: View is disposed');
				}
				return this.layoutProvider.getScrollTop();
			},
			setScrollTop: (scrollTop: number) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.setScrollTop: View is disposed');
				}
				this.layoutProvider.setScrollTop(scrollTop);
			},
			getScrollLeft: () => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.getScrollLeft: View is disposed');
				}
				return this.layoutProvider.getScrollLeft();
			},
			setScrollLeft: (scrollLeft: number) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.setScrollLeft: View is disposed');
				}
				this.layoutProvider.setScrollLeft(scrollLeft);
			},

			isAfterLines: (verticalOffset: number) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.isAfterLines: View is disposed');
				}
				return this.layoutProvider.isAfterLines(verticalOffset);
			},
			getLineNumberAtVerticalOffset: (verticalOffset: number) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.getLineNumberAtVerticalOffset: View is disposed');
				}
				return this.layoutProvider.getLineNumberAtVerticalOffset(verticalOffset);
			},
			getVerticalOffsetForLineNumber: (lineNumber: number) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.getVerticalOffsetForLineNumber: View is disposed');
				}
				return this.layoutProvider.getVerticalOffsetForLineNumber(lineNumber);
			},
			getWhitespaceAtVerticalOffset: (verticalOffset: number) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.getWhitespaceAtVerticalOffset: View is disposed');
				}
				return this.layoutProvider.getWhitespaceAtVerticalOffset(verticalOffset);
			},
			shouldSuppressMouseDownOnViewZone: (viewZoneId: number) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.shouldSuppressMouseDownOnViewZone: View is disposed');
				}
				return this.viewZones.shouldSuppressMouseDownOnViewZone(viewZoneId);
			},

			getPositionFromDOMInfo: (spanNode: HTMLElement, offset: number) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.getPositionFromDOMInfo: View is disposed');
				}
				this._flushAccumulatedAndRenderNow();
				return this.viewLines.getPositionFromDOMInfo(spanNode, offset);
			},

			visibleRangeForPosition2: (lineNumber: number, column: number) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.visibleRangeForPosition2: View is disposed');
				}
				this._flushAccumulatedAndRenderNow();
				var correctionTop = 0;
				// FF is very weird
//				if (Env.browser.canUseTranslate3d && Env.browser.isFirefox) {
//					correctionTop = this.layoutProvider.getCurrentViewport().top;
//				}
				var visibleRanges = this.viewLines.visibleRangesForRange2(new Range(lineNumber, column, lineNumber, column), 0, correctionTop, false);
				if (!visibleRanges) {
					return null;
				}
				return visibleRanges[0];
			},

			getLineWidth: (lineNumber: number) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.getLineWidth: View is disposed');
				}
				this._flushAccumulatedAndRenderNow();
				return this.viewLines.getLineWidth(lineNumber);
			}
		};
	}

	private createKeyboardHandlerHelper(): EditorBrowser.IKeyboardHandlerHelper {
		return {
			viewDomNode: this.domNode,
			textArea: this.textArea,
			visibleRangeForPositionRelativeToEditor: (lineNumber: number, column: number) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.keyboardHandler.visibleRangeForPositionRelativeToEditor: View is disposed');
				}
				this._flushAccumulatedAndRenderNow();
				var linesViewPortData = this.layoutProvider.getLinesViewportData();
				var correctionTop = 0;
				// FF is very weird
//				if (Env.browser.canUseTranslate3d && Env.browser.isFirefox) {
//					correctionTop = this.layoutProvider.getCurrentViewport().top;
//				}
				var visibleRanges = this.viewLines.visibleRangesForRange2(new Range(lineNumber, column, lineNumber, column), linesViewPortData.visibleRangesDeltaTop, correctionTop, false);
				if (!visibleRanges) {
					return null;
				}
				return visibleRanges[0];
			}
		};
	}

	// --- begin event handlers

	public onLayoutChanged(layoutInfo:EditorCommon.IEditorLayoutInfo): boolean {
		if (Browser.isChrome) {
			// Access overflowGuardContainer.clientWidth to prevent relayouting bug in Chrome
			// See Bug 19676: Editor misses a layout event
			var clientWidth = this.overflowGuardContainer.clientWidth + 'px';
		}
		DomUtils.StyleMutator.setWidth(this.domNode, layoutInfo.width);
		DomUtils.StyleMutator.setHeight(this.domNode, layoutInfo.height);

		DomUtils.StyleMutator.setWidth(this.overflowGuardContainer, layoutInfo.width);
		DomUtils.StyleMutator.setHeight(this.overflowGuardContainer, layoutInfo.height);

		DomUtils.StyleMutator.setWidth(this.linesContent, 1000000);
		DomUtils.StyleMutator.setHeight(this.linesContent, 1000000);

		DomUtils.StyleMutator.setLeft(this.linesContentContainer, layoutInfo.contentLeft);
		DomUtils.StyleMutator.setWidth(this.linesContentContainer, layoutInfo.contentWidth);
		DomUtils.StyleMutator.setHeight(this.linesContentContainer, layoutInfo.contentHeight);

		this.outgoingEventBus.emit(EditorCommon.EventType.ViewLayoutChanged, layoutInfo);
		return false;
	}
	public onConfigurationChanged(e: EditorCommon.IConfigurationChangedEvent): boolean {
		if (e.stylingInfo) {
			Configuration.applyEditorStyling(this.domNode, this.context.configuration.editor.stylingInfo);
		}
		// Give textarea same font size & line height as editor, for the IME case (when the textarea is visible)
		DomUtils.StyleMutator.setFontSize(this.textArea, this.context.configuration.editor.fontSize);
		DomUtils.StyleMutator.setLineHeight(this.textArea, this.context.configuration.editor.lineHeight);
		return false;
	}
	public onScrollChanged(e:EditorCommon.IScrollEvent): boolean {
		this.outgoingEventBus.emit('scroll', {
			scrollTop: this.layoutProvider.getScrollTop(),
			scrollLeft: this.layoutProvider.getScrollLeft()
		});
		return false;
	}
	public onScrollHeightChanged(scrollHeight:number): boolean {
		this.outgoingEventBus.emit('scrollSize', {
			scrollWidth: this.layoutProvider.getScrollWidth(),
			scrollHeight: this.layoutProvider.getScrollHeight()
		});
		return super.onScrollHeightChanged(scrollHeight);
	}
	public onViewFocusChanged(isFocused:boolean): boolean {
		DomUtils.toggleClass(this.domNode, 'focused', isFocused);
		if (isFocused) {
			this._editorTextFocusContextKey.set(true);
			this.outgoingEventBus.emit(EditorCommon.EventType.ViewFocusGained, {});
		} else {
			this._editorTextFocusContextKey.reset();
			this.outgoingEventBus.emit(EditorCommon.EventType.ViewFocusLost, {});
		}
		return false;
	}
	// --- end event handlers

	public dispose(): void {
		this._isDisposed = true;
		if (this.handleAccumulatedModelEventsTimeout !== -1) {
			clearTimeout(this.handleAccumulatedModelEventsTimeout);
			this.handleAccumulatedModelEventsTimeout = -1;
		}
		if (this._renderAnimationFrame !== null) {
			this._renderAnimationFrame.dispose();
			this._renderAnimationFrame = null;
		}
		this.accumulatedModelEvents = [];

		this.eventDispatcher.removeEventHandler(this);
		this.outgoingEventBus.dispose();
		this.listenersToRemove.forEach((element) => {
			element();
		});
		this.listenersToRemove = [];

		this.listenersToDispose = Lifecycle.disposeAll(this.listenersToDispose);

		this.keyboardHandler.dispose();
		this.pointerHandler.dispose();

		this.viewLines.dispose();

		// Destroy IViewPart second
		for (var i = 0, len = this.viewParts.length; i < len; i++) {
			this.viewParts[i].dispose();
		}
		this.viewParts = [];

		this.layoutProvider.dispose();
		this._keybindingService.dispose();
	}

	// --- begin Code Editor APIs

	private codeEditorHelper:EditorBrowser.ICodeEditorHelper;
	public getCodeEditorHelper(): EditorBrowser.ICodeEditorHelper {
		if (!this.codeEditorHelper) {
			this.codeEditorHelper = {
				getScrollTop: () => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.getScrollTop: View is disposed');
					}
					return this.layoutProvider.getScrollTop();
				},
				setScrollTop: (scrollTop: number) => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.setScrollTop: View is disposed');
					}
					this.layoutProvider.setScrollTop(scrollTop);
				},
				getScrollLeft: () => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.getScrollLeft: View is disposed');
					}
					return this.layoutProvider.getScrollLeft();
				},
				setScrollLeft: (scrollLeft: number) => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.setScrollLeft: View is disposed');
					}
					this.layoutProvider.setScrollLeft(scrollLeft);
				},
				getScrollHeight: () => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.getScrollHeight: View is disposed');
					}
					return this.layoutProvider.getScrollHeight();
				},
				getScrollWidth: () => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.getScrollWidth: View is disposed');
					}
					return this.layoutProvider.getScrollWidth();
				},
				getVerticalOffsetForPosition: (modelLineNumber:number, modelColumn:number) => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.getVerticalOffsetForPosition: View is disposed');
					}
					var modelPosition = this.context.model.validateModelPosition({
						lineNumber: modelLineNumber,
						column: modelColumn
					});
					var viewPosition = this.context.model.convertModelPositionToViewPosition(modelPosition.lineNumber, modelPosition.column);
					return this.layoutProvider.getVerticalOffsetForLineNumber(viewPosition.lineNumber);
				},
				delegateVerticalScrollbarMouseDown: (browserEvent: MouseEvent) => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.delegateVerticalScrollbarMouseDown: View is disposed');
					}
					this.layoutProvider.delegateVerticalScrollbarMouseDown(browserEvent);
				},
				getOffsetForColumn: (modelLineNumber: number, modelColumn: number) => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.getOffsetForColumn: View is disposed');
					}
					var modelPosition = this.context.model.validateModelPosition({
						lineNumber: modelLineNumber,
						column: modelColumn
					});
					var viewPosition = this.context.model.convertModelPositionToViewPosition(modelPosition.lineNumber, modelPosition.column);
					this._flushAccumulatedAndRenderNow();
					var visibleRanges = this.viewLines.visibleRangesForRange2(new Range(viewPosition.lineNumber, viewPosition.column, viewPosition.lineNumber, viewPosition.column), 0, 0, false);
					if (!visibleRanges) {
						return -1;
					}
					return visibleRanges[0].left;
				}
			};
		}
		return this.codeEditorHelper;
	}

	public getCenteredRangeInViewport(): EditorCommon.IEditorRange {
		if (this._isDisposed) {
			throw new Error('ViewImpl.getCenteredRangeInViewport: View is disposed');
		}
		var viewLineNumber = this.layoutProvider.getCenteredViewLineNumberInViewport();
		var viewModel = this.context.model;
		var currentCenteredViewRange = new Range(viewLineNumber, 1, viewLineNumber, viewModel.getLineMaxColumn(viewLineNumber));
		return viewModel.convertViewRangeToModelRange(currentCenteredViewRange);
	}

//	public getLineInfoProvider():view.ILineInfoProvider {
//		return this.viewLines;
//	}

	public getInternalEventBus(): EventEmitter.IEventEmitter {
		if (this._isDisposed) {
			throw new Error('ViewImpl.getInternalEventBus: View is disposed');
		}
		return this.outgoingEventBus;
	}

	public saveState(): EditorCommon.IViewState {
		if (this._isDisposed) {
			throw new Error('ViewImpl.saveState: View is disposed');
		}
		return this.layoutProvider.saveState();
	}

	public restoreState(state: EditorCommon.IViewState): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.restoreState: View is disposed');
		}
		this._flushAnyAccumulatedEvents();
		return this.layoutProvider.restoreState(state);
	}

	public focus(): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.focus: View is disposed');
		}
		// Chrome does not trigger the focus event at all if focus is in url bar and clicking into the editor
		// Calling .focus() and then .select() seems to be a good workaround for Chrome in this case
		var state = DomUtils.saveParentsScrollTop(this.textArea);
		this.textArea.focus();
		DomUtils.selectTextInInputElement(this.textArea);
		DomUtils.restoreParentsScrollTop(this.textArea, state);

		// IE does not trigger the focus event immediately, so we must help it a little bit
		this._setHasFocus(true);
	}

	public isFocused(): boolean {
		if (this._isDisposed) {
			throw new Error('ViewImpl.isFocused: View is disposed');
		}
		return this.hasFocus;
	}

	public createOverviewRuler(cssClassName: string, minimumHeight: number, maximumHeight: number): OverviewRuler {
		if (this._isDisposed) {
			throw new Error('ViewImpl.createOverviewRuler: View is disposed');
		}
		return new OverviewRuler(
				this.context, cssClassName, this.layoutProvider.getScrollHeight(), minimumHeight, maximumHeight,
				(lineNumber:number) => this.layoutProvider.getVerticalOffsetForLineNumber(lineNumber)
		);
	}

	public change(callback: (changeAccessor: EditorBrowser.IViewZoneChangeAccessor) => any): boolean {
		if (this._isDisposed) {
			throw new Error('ViewImpl.change: View is disposed');
		}
		var zonesHaveChanged = false;
		this._renderOnce(() => {
			// Handle events to avoid "adjusting" newly inserted view zones
			this._flushAnyAccumulatedEvents();
			var changeAccessor:EditorBrowser.IViewZoneChangeAccessor = {
				addZone: (zone:EditorBrowser.IViewZone): number => {
					zonesHaveChanged = true;
					return this.viewZones.addZone(zone);
				},
				removeZone: (id:number): void => {
					zonesHaveChanged = this.viewZones.removeZone(id) || zonesHaveChanged;
				},
				layoutZone: (id: number): void => {
					zonesHaveChanged = this.viewZones.layoutZone(id) || zonesHaveChanged;
				}
			};

			var r: any = null;
			try {
				r = callback(changeAccessor);
			} catch (e) {
				Errors.onUnexpectedError(e);
			}

			// Invalidate changeAccessor
			changeAccessor.addZone = null;
			changeAccessor.removeZone = null;

			if (zonesHaveChanged) {
				this.context.privateViewEventBus.emit(EditorCommon.EventType.ViewZonesChanged, null);
			}

			return r;
		});
		return zonesHaveChanged;
	}

	public getWhitespaces(): EditorCommon.IEditorWhitespace[]{
		if (this._isDisposed) {
			throw new Error('ViewImpl.getWhitespaces: View is disposed');
		}
		return this.layoutProvider.getWhitespaces();
	}

	public addContentWidget(widgetData: EditorBrowser.IContentWidgetData): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.addContentWidget: View is disposed');
		}
		this._renderOnce(() => {
			this.contentWidgets.addWidget(widgetData.widget);
			this.layoutContentWidget(widgetData);
		});
	}

	public layoutContentWidget(widgetData: EditorBrowser.IContentWidgetData): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.layoutContentWidget: View is disposed');
		}
		this._renderOnce(() => {
			var position1 = widgetData.position ? widgetData.position.position : null;
			var preference1 = widgetData.position ? widgetData.position.preference : null;
			this.contentWidgets.setWidgetPosition(widgetData.widget, position1, preference1);
		});
	}

	public removeContentWidget(widgetData: EditorBrowser.IContentWidgetData): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.removeContentWidget: View is disposed');
		}
		this._renderOnce(() => {
			this.contentWidgets.removeWidget(widgetData.widget);
		});
	}

	public addOverlayWidget(widgetData: EditorBrowser.IOverlayWidgetData): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.addOverlayWidget: View is disposed');
		}
		this._renderOnce(() => {
			this.overlayWidgets.addWidget(widgetData.widget);
			this.layoutOverlayWidget(widgetData);
		});
	}

	public layoutOverlayWidget(widgetData: EditorBrowser.IOverlayWidgetData): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.layoutOverlayWidget: View is disposed');
		}
		this._renderOnce(() => {
			var preference2 = widgetData.position ? widgetData.position.preference : null;
			this.overlayWidgets.setWidgetPosition(widgetData.widget, preference2);
		});
	}

	public removeOverlayWidget(widgetData: EditorBrowser.IOverlayWidgetData): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.removeOverlayWidget: View is disposed');
		}
		this._renderOnce(() => {
			this.overlayWidgets.removeWidget(widgetData.widget);
		});
	}

	public render(now:boolean): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.render: View is disposed');
		}
		// Force a render with a layout event
		this.layoutProvider.emitLayoutChangedEvent();
		if (now) {
			this._flushAccumulatedAndRenderNow();
		}
	}

	public renderOnce(callback: () => any): any {
		if (this._isDisposed) {
			throw new Error('ViewImpl.renderOnce: View is disposed');
		}
		return this._renderOnce(callback);
	}

	// --- end Code Editor APIs

	private _renderOnce(callback: () => any): any {
		if (this._isDisposed) {
			throw new Error('ViewImpl._renderOnce: View is disposed');
		}
		return this.outgoingEventBus.deferredEmit(() => {
			try {
				var r = callback ? callback() : null;
			} finally {
				this._scheduleRender();
			}

			return r;
		});
	}

	private _scheduleRender(): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl._scheduleRender: View is disposed');
		}
		if (this._renderAnimationFrame === null) {
			this._renderAnimationFrame = DomUtils.runAtThisOrScheduleAtNextAnimationFrame(this._onRenderScheduled.bind(this), 100);
		}
	}

	private _onRenderScheduled(): void {
		this._renderAnimationFrame = null;
		this._flushAccumulatedAndRenderNow();
	}

	private _renderNow(): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl._renderNow: View is disposed');
		}
		this.actualRender();
	}

	private createRenderingContext(linesViewportData:EditorCommon.IViewLinesViewportData): EditorBrowser.IRenderingContext {

		var vInfo = this.layoutProvider.getCurrentViewport();

		var deltaTop = linesViewportData.visibleRangesDeltaTop;
		var correctionTop = 0;
		// FF is very weird
//		if (Env.browser.canUseTranslate3d && Env.browser.isFirefox) {
//			correctionTop = vInfo.top;
//		}

		var r:EditorBrowser.IRenderingContext = {
			linesViewportData: linesViewportData,
			scrollWidth: this.layoutProvider.getScrollWidth(),
			scrollHeight: this.layoutProvider.getScrollHeight(),

			visibleRange: linesViewportData.visibleRange,
			bigNumbersDelta: linesViewportData.bigNumbersDelta,

			viewportWidth: vInfo.width,
			viewportHeight: vInfo.height,
			viewportLeft: vInfo.left,
			viewportTop: vInfo.top,

			getScrolledTopFromAbsoluteTop: (absoluteTop:number) => {
				return this.layoutProvider.getScrolledTopFromAbsoluteTop(absoluteTop);
			},

			getViewportVerticalOffsetForLineNumber: (lineNumber:number) => {
				var verticalOffset = this.layoutProvider.getVerticalOffsetForLineNumber(lineNumber);
				var scrolledTop = this.layoutProvider.getScrolledTopFromAbsoluteTop(verticalOffset);
				return scrolledTop;
			},

			heightInPxForLine: (lineNumber:number) => {
				return this.layoutProvider.heightInPxForLine(lineNumber);
			},

			getDecorationsInViewport: () => linesViewportData.getDecorationsInViewport(),

			visibleRangesForRange: (range:EditorCommon.IRange, includeNewLines:boolean) => {
				return this.viewLines.visibleRangesForRange2(range, deltaTop, correctionTop, includeNewLines);
			},

			linesVisibleRangesForRange: (range:EditorCommon.IRange, includeNewLines:boolean) => {
				return this.viewLines.linesVisibleRangesForRange(range, includeNewLines);
			},

			visibleRangeForPosition: (position:EditorCommon.IPosition) => {
				var visibleRanges = this.viewLines.visibleRangesForRange2(new Range(position.lineNumber, position.column, position.lineNumber, position.column), deltaTop, correctionTop, false);
				if (!visibleRanges) {
					return null;
				}
				return visibleRanges[0];
			},

			visibleRangeForPosition2: (lineNumber:number, column:number) => {
				var visibleRanges = this.viewLines.visibleRangesForRange2(new Range(lineNumber, column, lineNumber, column), deltaTop, correctionTop, false);
				if (!visibleRanges) {
					return null;
				}
				return visibleRanges[0];
			},

			lineIsVisible: (lineNumber:number) => {
				return linesViewportData.visibleRange.startLineNumber <= lineNumber && lineNumber <= linesViewportData.visibleRange.endLineNumber;
			}
		};
		return r;
	}

	private actualRender(): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.actualRender: View is disposed');
		}
		if (!DomUtils.isInDOM(this.domNode)) {
			return;
		}

		var t = Timer.start(Timer.Topic.EDITOR, 'View.render');

		var i:number,
			len:number;

		try {

			for (i = 0, len = this.viewParts.length; i < len; i++) {
				this.viewParts[i].onBeforeForcedLayout();
			}

			var linesViewportData = this.viewLines.render();

			var renderingContext = this.createRenderingContext(linesViewportData);

			// Render the rest of the parts
			for (i = 0, len = this.viewParts.length; i < len; i++) {
				this.viewParts[i].onReadAfterForcedLayout(renderingContext);
			}

			for (i = 0, len = this.viewParts.length; i < len; i++) {
				this.viewParts[i].onWriteAfterForcedLayout();
			}
		} catch (err) {
			Errors.onUnexpectedError(err);
		}

		t.stop();
	}

	private _setHasFocus(newHasFocus:boolean): void {
		if (this.hasFocus !== newHasFocus) {
			this.hasFocus = newHasFocus;
			this.context.privateViewEventBus.emit(EditorCommon.EventType.ViewFocusChanged, this.hasFocus);
		}
	}
}

class ViewContext implements EditorBrowser.IViewContext {

	public editorId:number;
	public configuration:EditorCommon.IConfiguration;
	public model: EditorCommon.IViewModel;
	public privateViewEventBus:EditorCommon.IViewEventBus;
	public addEventHandler:(eventHandler:EditorBrowser.IViewEventHandler)=>void;
	public removeEventHandler:(eventHandler:EditorBrowser.IViewEventHandler)=>void;

	constructor(
					editorId:number,
					configuration:EditorCommon.IConfiguration,
					model: EditorCommon.IViewModel,
					privateViewEventBus:EditorCommon.IViewEventBus,
					addEventHandler:(eventHandler:EditorBrowser.IViewEventHandler)=>void,
					removeEventHandler:(eventHandler:EditorBrowser.IViewEventHandler)=>void
				)
	{
		this.editorId = editorId;
		this.configuration = configuration;
		this.model = model;
		this.privateViewEventBus = privateViewEventBus;
		this.addEventHandler = addEventHandler;
		this.removeEventHandler = removeEventHandler;
	}
}