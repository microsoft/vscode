/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { onUnexpectedError } from 'vs/base/common/errors';
import { IEventEmitter } from 'vs/base/common/eventEmitter';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import * as browser from 'vs/base/browser/browser';
import * as dom from 'vs/base/browser/dom';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ViewEventHandler } from 'vs/editor/common/viewModel/viewEventHandler';
import { Configuration } from 'vs/editor/browser/config/configuration';
import { KeyboardHandler, IKeyboardHandlerHelper } from 'vs/editor/browser/controller/keyboardHandler';
import { PointerHandler } from 'vs/editor/browser/controller/pointerHandler';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import { ViewController, TriggerCursorHandler } from 'vs/editor/browser/view/viewController';
import { ViewEventDispatcher } from 'vs/editor/common/view/viewEventDispatcher';
import { ContentViewOverlays, MarginViewOverlays } from 'vs/editor/browser/view/viewOverlays';
import { LayoutProvider } from 'vs/editor/common/viewLayout/viewLayout';
import { ViewContentWidgets } from 'vs/editor/browser/viewParts/contentWidgets/contentWidgets';
import { CurrentLineHighlightOverlay } from 'vs/editor/browser/viewParts/currentLineHighlight/currentLineHighlight';
import { CurrentLineMarginHighlightOverlay } from 'vs/editor/browser/viewParts/currentLineMarginHighlight/currentLineMarginHighlight';
import { DecorationsOverlay } from 'vs/editor/browser/viewParts/decorations/decorations';
import { GlyphMarginOverlay } from 'vs/editor/browser/viewParts/glyphMargin/glyphMargin';
import { LineNumbersOverlay } from 'vs/editor/browser/viewParts/lineNumbers/lineNumbers';
import { IndentGuidesOverlay } from 'vs/editor/browser/viewParts/indentGuides/indentGuides';
import { ViewLines } from 'vs/editor/browser/viewParts/lines/viewLines';
import { Margin } from 'vs/editor/browser/viewParts/margin/margin';
import { LinesDecorationsOverlay } from 'vs/editor/browser/viewParts/linesDecorations/linesDecorations';
import { MarginViewLineDecorationsOverlay } from 'vs/editor/browser/viewParts/marginDecorations/marginDecorations';
import { ViewOverlayWidgets } from 'vs/editor/browser/viewParts/overlayWidgets/overlayWidgets';
import { DecorationsOverviewRuler } from 'vs/editor/browser/viewParts/overviewRuler/decorationsOverviewRuler';
import { OverviewRuler } from 'vs/editor/browser/viewParts/overviewRuler/overviewRuler';
import { Rulers } from 'vs/editor/browser/viewParts/rulers/rulers';
import { ScrollDecorationViewPart } from 'vs/editor/browser/viewParts/scrollDecoration/scrollDecoration';
import { SelectionsOverlay } from 'vs/editor/browser/viewParts/selections/selections';
import { ViewCursors } from 'vs/editor/browser/viewParts/viewCursors/viewCursors';
import { ViewZones } from 'vs/editor/browser/viewParts/viewZones/viewZones';
import { ViewPart, PartFingerprint, PartFingerprints } from 'vs/editor/browser/view/viewPart';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { IViewModel } from 'vs/editor/common/viewModel/viewModel';
import { RenderingContext } from 'vs/editor/common/view/renderingContext';
import { IPointerHandlerHelper } from 'vs/editor/browser/controller/mouseHandler';
import { ViewOutgoingEvents } from 'vs/editor/browser/view/viewOutgoingEvents';
import { ViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';
import { EditorScrollbar } from 'vs/editor/browser/viewParts/editorScrollbar/editorScrollbar';
import { Minimap } from 'vs/editor/browser/viewParts/minimap/minimap';
import * as viewEvents from 'vs/editor/common/view/viewEvents';

export class View extends ViewEventHandler implements editorBrowser.IView, IDisposable {

	private eventDispatcher: ViewEventDispatcher;

	private listenersToRemove: IDisposable[];
	private listenersToDispose: IDisposable[];

	private layoutProvider: LayoutProvider;
	private _scrollbar: EditorScrollbar;
	public _context: ViewContext;

	// The view lines
	private viewLines: ViewLines;

	// These are parts, but we must do some API related calls on them, so we keep a reference
	private viewZones: ViewZones;
	private contentWidgets: ViewContentWidgets;
	private overlayWidgets: ViewOverlayWidgets;
	private viewCursors: ViewCursors;
	private viewParts: ViewPart[];

	private keyboardHandler: KeyboardHandler;
	private pointerHandler: PointerHandler;

	private outgoingEvents: ViewOutgoingEvents;

	// Dom nodes
	private linesContent: FastDomNode<HTMLElement>;
	public domNode: FastDomNode<HTMLElement>;
	public textArea: FastDomNode<HTMLTextAreaElement>;
	private textAreaCover: FastDomNode<HTMLElement>;
	private overflowGuardContainer: FastDomNode<HTMLElement>;

	// Actual mutable state
	private hasFocus: boolean;
	private _isDisposed: boolean;

	private handleAccumulatedModelEventsTimeout: number;
	private accumulatedModelEvents: viewEvents.ViewEvent[];
	private _renderAnimationFrame: IDisposable;

	constructor(
		commandService: ICommandService,
		configuration: Configuration,
		model: IViewModel,
		private triggerCursorHandler: TriggerCursorHandler
	) {
		super();
		this._isDisposed = false;
		this._renderAnimationFrame = null;
		this.outgoingEvents = new ViewOutgoingEvents(model);

		let viewController = new ViewController(model, triggerCursorHandler, this.outgoingEvents, commandService);

		this.listenersToRemove = [];
		this.listenersToDispose = [];

		// The event dispatcher will always go through _renderOnce before dispatching any events
		this.eventDispatcher = new ViewEventDispatcher((callback: () => void) => this._renderOnce(callback));

		// Ensure the view is the first event handler in order to update the layout
		this.eventDispatcher.addEventHandler(this);

		// The layout provider has such responsibilities as:
		// - scrolling (i.e. viewport / full size) & co.
		// - whitespaces (a.k.a. view zones) management & co.
		// - line heights updating & co.
		this.layoutProvider = new LayoutProvider(configuration, model.getLineCount(), this.eventDispatcher);

		// The view context is passed on to most classes (basically to reduce param. counts in ctors)
		this._context = new ViewContext(configuration, model, this.eventDispatcher);

		this.createTextArea();
		this.createViewParts();
		this._setLayout();

		// Keyboard handler
		this.keyboardHandler = new KeyboardHandler(this._context, viewController, this.createKeyboardHandlerHelper());

		// Pointer handler
		this.pointerHandler = new PointerHandler(this._context, viewController, this.createPointerHandlerHelper());

		this.hasFocus = false;
		this.codeEditorHelper = null;


		// The view lines rendering calls model.getLineTokens() that might emit events that its tokens have changed.
		// This delayed processing of incoming model events acts as a guard against undesired/unexpected recursion.
		this.handleAccumulatedModelEventsTimeout = -1;
		this.accumulatedModelEvents = [];
		this.listenersToRemove.push(model.addEventListener((events: viewEvents.ViewEvent[]) => {
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
		let toEmit = this.accumulatedModelEvents;
		this.accumulatedModelEvents = [];
		if (toEmit.length > 0) {
			this.eventDispatcher.emitMany(toEmit);
		}
	}

	private createTextArea(): void {
		// Text Area (The focus will always be in the textarea when the cursor is blinking)
		this.textArea = createFastDomNode(document.createElement('textarea'));
		PartFingerprints.write(this.textArea.domNode, PartFingerprint.TextArea);
		this.textArea.setClassName(editorBrowser.ClassNames.TEXTAREA);
		this.textArea.setAttribute('wrap', 'off');
		this.textArea.setAttribute('autocorrect', 'off');
		this.textArea.setAttribute('autocapitalize', 'off');
		this.textArea.setAttribute('spellcheck', 'false');
		this.textArea.setAttribute('aria-label', this._context.configuration.editor.viewInfo.ariaLabel);
		this.textArea.setAttribute('role', 'textbox');
		this.textArea.setAttribute('aria-multiline', 'true');
		this.textArea.setAttribute('aria-haspopup', 'false');
		this.textArea.setAttribute('aria-autocomplete', 'both');

		this.textArea.setTop(0);
		this.textArea.setLeft(0);

		this.listenersToDispose.push(dom.addDisposableListener(this.textArea.domNode, 'focus', () => this._setHasFocus(true)));
		this.listenersToDispose.push(dom.addDisposableListener(this.textArea.domNode, 'blur', () => this._setHasFocus(false)));

		// On top of the text area, we position a dom node to cover it up
		// (there have been reports of tiny blinking cursors)
		// (in WebKit the textarea is 1px by 1px because it cannot handle input to a 0x0 textarea)
		this.textAreaCover = createFastDomNode(document.createElement('div'));
		if (this._context.configuration.editor.viewInfo.glyphMargin) {
			this.textAreaCover.setClassName('monaco-editor-background ' + editorBrowser.ClassNames.GLYPH_MARGIN + ' ' + editorBrowser.ClassNames.TEXTAREA_COVER);
		} else {
			if (this._context.configuration.editor.viewInfo.renderLineNumbers) {
				this.textAreaCover.setClassName('monaco-editor-background ' + editorBrowser.ClassNames.LINE_NUMBERS + ' ' + editorBrowser.ClassNames.TEXTAREA_COVER);
			} else {
				this.textAreaCover.setClassName('monaco-editor-background ' + editorBrowser.ClassNames.TEXTAREA_COVER);
			}
		}
		this.textAreaCover.setPosition('absolute');
		this.textAreaCover.setWidth(1);
		this.textAreaCover.setHeight(1);
		this.textAreaCover.setTop(0);
		this.textAreaCover.setLeft(0);
	}

	private createViewParts(): void {
		// These two dom nodes must be constructed up front, since references are needed in the layout provider (scrolling & co.)
		this.linesContent = createFastDomNode(document.createElement('div'));
		this.linesContent.setClassName(editorBrowser.ClassNames.LINES_CONTENT + ' monaco-editor-background');
		this.linesContent.setPosition('absolute');

		this.domNode = createFastDomNode(document.createElement('div'));
		this.domNode.setClassName(this._context.configuration.editor.viewInfo.editorClassName);

		this.overflowGuardContainer = createFastDomNode(document.createElement('div'));
		PartFingerprints.write(this.overflowGuardContainer.domNode, PartFingerprint.OverflowGuard);
		this.overflowGuardContainer.setClassName(editorBrowser.ClassNames.OVERFLOW_GUARD);

		this.viewParts = [];

		this._scrollbar = new EditorScrollbar(this._context, this.layoutProvider.getScrollable(), this.linesContent, this.domNode, this.overflowGuardContainer);
		this.viewParts.push(this._scrollbar);

		// View Lines
		this.viewLines = new ViewLines(this._context, this.linesContent, this.layoutProvider);

		// View Zones
		this.viewZones = new ViewZones(this._context, this.layoutProvider);
		this.viewParts.push(this.viewZones);

		// Decorations overview ruler
		let decorationsOverviewRuler = new DecorationsOverviewRuler(
			this._context, this.layoutProvider.getScrollHeight(),
			(lineNumber: number) => this.layoutProvider.getVerticalOffsetForLineNumber(lineNumber)
		);
		this.viewParts.push(decorationsOverviewRuler);


		let scrollDecoration = new ScrollDecorationViewPart(this._context);
		this.viewParts.push(scrollDecoration);

		let contentViewOverlays = new ContentViewOverlays(this._context);
		this.viewParts.push(contentViewOverlays);
		contentViewOverlays.addDynamicOverlay(new CurrentLineHighlightOverlay(this._context));
		contentViewOverlays.addDynamicOverlay(new SelectionsOverlay(this._context));
		contentViewOverlays.addDynamicOverlay(new DecorationsOverlay(this._context));
		contentViewOverlays.addDynamicOverlay(new IndentGuidesOverlay(this._context));

		let marginViewOverlays = new MarginViewOverlays(this._context);
		this.viewParts.push(marginViewOverlays);
		marginViewOverlays.addDynamicOverlay(new CurrentLineMarginHighlightOverlay(this._context));
		marginViewOverlays.addDynamicOverlay(new GlyphMarginOverlay(this._context));
		marginViewOverlays.addDynamicOverlay(new MarginViewLineDecorationsOverlay(this._context));
		marginViewOverlays.addDynamicOverlay(new LinesDecorationsOverlay(this._context));
		marginViewOverlays.addDynamicOverlay(new LineNumbersOverlay(this._context));

		let margin = new Margin(this._context);
		margin.getDomNode().appendChild(this.viewZones.marginDomNode.domNode);
		margin.getDomNode().appendChild(marginViewOverlays.getDomNode());
		this.viewParts.push(margin);

		// Content widgets
		this.contentWidgets = new ViewContentWidgets(this._context, this.domNode);
		this.viewParts.push(this.contentWidgets);

		this.viewCursors = new ViewCursors(this._context);
		this.viewParts.push(this.viewCursors);

		// Overlay widgets
		this.overlayWidgets = new ViewOverlayWidgets(this._context);
		this.viewParts.push(this.overlayWidgets);

		let rulers = new Rulers(this._context);
		this.viewParts.push(rulers);

		let minimap = new Minimap(this._context, this.layoutProvider, this._scrollbar);
		this.viewParts.push(minimap);

		// -------------- Wire dom nodes up

		if (decorationsOverviewRuler) {
			let overviewRulerData = this._scrollbar.getOverviewRulerLayoutInfo();
			overviewRulerData.parent.insertBefore(decorationsOverviewRuler.getDomNode(), overviewRulerData.insertBefore);
		}

		this.linesContent.domNode.appendChild(contentViewOverlays.getDomNode());
		this.linesContent.domNode.appendChild(rulers.domNode);
		this.linesContent.domNode.appendChild(this.viewZones.domNode.domNode);
		this.linesContent.domNode.appendChild(this.viewLines.getDomNode());
		this.linesContent.domNode.appendChild(this.contentWidgets.domNode);
		this.linesContent.domNode.appendChild(this.viewCursors.getDomNode());
		this.overflowGuardContainer.domNode.appendChild(margin.getDomNode());
		this.overflowGuardContainer.domNode.appendChild(this._scrollbar.getDomNode());
		this.overflowGuardContainer.domNode.appendChild(scrollDecoration.getDomNode());
		this.overflowGuardContainer.domNode.appendChild(this.overlayWidgets.getDomNode());
		this.overflowGuardContainer.domNode.appendChild(this.textArea.domNode);
		this.overflowGuardContainer.domNode.appendChild(this.textAreaCover.domNode);
		this.overflowGuardContainer.domNode.appendChild(minimap.getDomNode());
		this.domNode.domNode.appendChild(this.overflowGuardContainer.domNode);
		this.domNode.domNode.appendChild(this.contentWidgets.overflowingContentWidgetsDomNode);
	}

	private _flushAccumulatedAndRenderNow(): void {
		this._flushAnyAccumulatedEvents();
		this._renderNow();
	}

	private createPointerHandlerHelper(): IPointerHandlerHelper {
		return {
			viewDomNode: this.domNode.domNode,
			linesContentDomNode: this.linesContent.domNode,

			focusTextArea: () => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.focusTextArea: View is disposed');
				}
				this.focus();
			},

			isDirty: (): boolean => {
				return (this.accumulatedModelEvents.length > 0);
			},

			getScrollLeft: () => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.getScrollLeft: View is disposed');
				}
				return this.layoutProvider.getScrollLeft();
			},
			getScrollTop: () => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.getScrollTop: View is disposed');
				}
				return this.layoutProvider.getScrollTop();
			},

			setScrollPosition: (position: editorCommon.INewScrollPosition) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.setScrollPosition: View is disposed');
				}
				this.layoutProvider.setScrollPosition(position);
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
			getLastViewCursorsRenderData: () => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.getLastViewCursorsRenderData: View is disposed');
				}
				return this.viewCursors.getLastRenderData() || [];
			},
			shouldSuppressMouseDownOnViewZone: (viewZoneId: number) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.shouldSuppressMouseDownOnViewZone: View is disposed');
				}
				return this.viewZones.shouldSuppressMouseDownOnViewZone(viewZoneId);
			},
			shouldSuppressMouseDownOnWidget: (widgetId: string) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.pointerHandler.shouldSuppressMouseDownOnWidget: View is disposed');
				}
				return this.contentWidgets.shouldSuppressMouseDownOnWidget(widgetId);
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
				let visibleRanges = this.viewLines.visibleRangesForRange2(new Range(lineNumber, column, lineNumber, column));
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

	private createKeyboardHandlerHelper(): IKeyboardHandlerHelper {
		return {
			viewDomNode: this.domNode,
			textArea: this.textArea,
			visibleRangeForPositionRelativeToEditor: (lineNumber: number, column: number) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.keyboardHandler.visibleRangeForPositionRelativeToEditor: View is disposed');
				}
				this._flushAccumulatedAndRenderNow();
				let visibleRanges = this.viewLines.visibleRangesForRange2(new Range(lineNumber, column, lineNumber, column));
				if (!visibleRanges) {
					return null;
				}
				return visibleRanges[0];
			},
			getVerticalOffsetForLineNumber: (lineNumber: number) => {
				if (this._isDisposed) {
					throw new Error('ViewImpl.keyboardHandler.getVerticalOffsetForLineNumber: View is disposed');
				}
				return this.layoutProvider.getVerticalOffsetForLineNumber(lineNumber);
			},
			flushAnyAccumulatedEvents: () => {
				this._flushAnyAccumulatedEvents();
			}
		};
	}

	public setAriaActiveDescendant(id: string): void {
		if (id) {
			this.textArea.setAttribute('role', 'combobox');
			if (this.textArea.getAttribute('aria-activedescendant') !== id) {
				this.textArea.setAttribute('aria-haspopup', 'true');
				this.textArea.setAttribute('aria-activedescendant', id);
			}
		} else {
			this.textArea.setAttribute('role', 'textbox');
			this.textArea.removeAttribute('aria-activedescendant');
			this.textArea.removeAttribute('aria-haspopup');
		}
	}

	private _setLayout(): void {
		const layoutInfo = this._context.configuration.editor.layoutInfo;
		if (browser.isChrome) {
			/* tslint:disable:no-unused-variable */
			// Access overflowGuardContainer.clientWidth to prevent relayouting bug in Chrome
			// See Bug 19676: Editor misses a layout event
			let clientWidth = this.overflowGuardContainer.domNode.clientWidth + 'px';
			/* tslint:enable:no-unused-variable */
		}
		this.domNode.setWidth(layoutInfo.width);
		this.domNode.setHeight(layoutInfo.height);

		this.overflowGuardContainer.setWidth(layoutInfo.width);
		this.overflowGuardContainer.setHeight(layoutInfo.height);

		this.linesContent.setWidth(1000000);
		this.linesContent.setHeight(1000000);

	}

	// --- begin event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		if (e.viewInfo.editorClassName) {
			this.domNode.setClassName(this._context.configuration.editor.viewInfo.editorClassName);
		}
		if (e.viewInfo.ariaLabel) {
			this.textArea.setAttribute('aria-label', this._context.configuration.editor.viewInfo.ariaLabel);
		}
		if (e.layoutInfo) {
			this._setLayout();
		}
		this.layoutProvider.onConfigurationChanged(e);
		return false;
	}
	public onFlushed(e: viewEvents.ViewFlushedEvent): boolean {
		this.layoutProvider.onFlushed(this._context.model.getLineCount());
		return false;
	}
	public onFocusChanged(e: viewEvents.ViewFocusChangedEvent): boolean {
		this.domNode.toggleClassName('focused', e.isFocused);
		if (e.isFocused) {
			this.outgoingEvents.emitViewFocusGained();
		} else {
			this.outgoingEvents.emitViewFocusLost();
		}
		return false;
	}
	public onLinesDeleted(e: viewEvents.ViewLinesDeletedEvent): boolean {
		this.layoutProvider.onLinesDeleted(e);
		return false;
	}
	public onLinesInserted(e: viewEvents.ViewLinesInsertedEvent): boolean {
		this.layoutProvider.onLinesInserted(e);
		return false;
	}
	public onRevealRangeRequest(e: viewEvents.ViewRevealRangeRequestEvent): boolean {
		return e.revealCursor ? this.revealCursor() : false;
	}
	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		this.outgoingEvents.emitScrollChanged(e);
		return false;
	}
	public onScrollRequest(e: viewEvents.ViewScrollRequestEvent): boolean {
		let currentScrollTop = this.layoutProvider.getScrollTop();
		let newScrollTop = currentScrollTop + e.deltaLines * this._context.configuration.editor.lineHeight;
		this.layoutProvider.setScrollPosition({
			scrollTop: newScrollTop
		});
		return e.revealCursor ? this.revealCursor() : false;
	}
	private revealCursor(): boolean {
		this.triggerCursorHandler('revealCursor', editorCommon.Handler.CursorMove, { to: editorCommon.CursorMovePosition.ViewPortIfOutside });
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
		this.outgoingEvents.dispose();
		this.listenersToRemove = dispose(this.listenersToRemove);
		this.listenersToDispose = dispose(this.listenersToDispose);

		this.keyboardHandler.dispose();
		this.pointerHandler.dispose();

		this.viewLines.dispose();

		// Destroy view parts
		for (let i = 0, len = this.viewParts.length; i < len; i++) {
			this.viewParts[i].dispose();
		}
		this.viewParts = [];

		this.layoutProvider.dispose();
	}

	// --- begin Code Editor APIs

	private codeEditorHelper: editorBrowser.ICodeEditorHelper;
	public getCodeEditorHelper(): editorBrowser.ICodeEditorHelper {
		if (!this.codeEditorHelper) {
			this.codeEditorHelper = {
				getScrollWidth: () => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.getScrollWidth: View is disposed');
					}
					return this.layoutProvider.getScrollWidth();
				},

				getScrollLeft: () => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.getScrollLeft: View is disposed');
					}
					return this.layoutProvider.getScrollLeft();
				},

				getScrollHeight: () => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.getScrollHeight: View is disposed');
					}
					return this.layoutProvider.getScrollHeight();
				},

				getScrollTop: () => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.getScrollTop: View is disposed');
					}
					return this.layoutProvider.getScrollTop();
				},

				setScrollPosition: (scrollPosition: editorCommon.INewScrollPosition) => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.setScrollPosition: View is disposed');
					}
					this.layoutProvider.setScrollPosition(scrollPosition);
				},

				getVerticalOffsetForPosition: (modelLineNumber: number, modelColumn: number) => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.getVerticalOffsetForPosition: View is disposed');
					}
					let modelPosition = this._context.model.validateModelPosition({
						lineNumber: modelLineNumber,
						column: modelColumn
					});
					let viewPosition = this._context.model.coordinatesConverter.convertModelPositionToViewPosition(modelPosition);
					return this.layoutProvider.getVerticalOffsetForLineNumber(viewPosition.lineNumber);
				},

				delegateVerticalScrollbarMouseDown: (browserEvent: MouseEvent) => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.delegateVerticalScrollbarMouseDown: View is disposed');
					}
					this._scrollbar.delegateVerticalScrollbarMouseDown(browserEvent);
				},

				getOffsetForColumn: (modelLineNumber: number, modelColumn: number) => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.getOffsetForColumn: View is disposed');
					}
					let modelPosition = this._context.model.validateModelPosition({
						lineNumber: modelLineNumber,
						column: modelColumn
					});
					let viewPosition = this._context.model.coordinatesConverter.convertModelPositionToViewPosition(modelPosition);
					this._flushAccumulatedAndRenderNow();
					let visibleRanges = this.viewLines.visibleRangesForRange2(new Range(viewPosition.lineNumber, viewPosition.column, viewPosition.lineNumber, viewPosition.column));
					if (!visibleRanges) {
						return -1;
					}
					return visibleRanges[0].left;
				},

				getTargetAtClientPoint: (clientX: number, clientY: number): editorBrowser.IMouseTarget => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.getTargetAtClientPoint: View is disposed');
					}
					return this.pointerHandler.getTargetAtClientPoint(clientX, clientY);
				},

				getCompletelyVisibleViewRange: (): Range => {
					if (this._isDisposed) {
						throw new Error('ViewImpl.codeEditorHelper.getCompletelyVisibleViewRange: View is disposed');
					}

					// Ensure we share the state of the view model
					this._flushAnyAccumulatedEvents();

					const partialData = this.layoutProvider.getLinesViewportData();
					const startViewLineNumber = partialData.completelyVisibleStartLineNumber;
					const endViewLineNumber = partialData.completelyVisibleEndLineNumber;

					return new Range(
						startViewLineNumber, this._context.model.getLineMinColumn(startViewLineNumber),
						endViewLineNumber, this._context.model.getLineMaxColumn(endViewLineNumber)
					);
				}

			};
		}
		return this.codeEditorHelper;
	}

	public getInternalEventBus(): IEventEmitter {
		if (this._isDisposed) {
			throw new Error('ViewImpl.getInternalEventBus: View is disposed');
		}
		return this.outgoingEvents.getInternalEventBus();
	}

	public saveState(): editorCommon.IViewState {
		if (this._isDisposed) {
			throw new Error('ViewImpl.saveState: View is disposed');
		}
		return this.layoutProvider.saveState();
	}

	public restoreState(state: editorCommon.IViewState): void {
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
		this.keyboardHandler.focusTextArea();

		// IE does not trigger the focus event immediately, so we must help it a little bit
		if (document.activeElement === this.textArea.domNode) {
			this._setHasFocus(true);
		}
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
			this._context, cssClassName, this.layoutProvider.getScrollHeight(), minimumHeight, maximumHeight,
			(lineNumber: number) => this.layoutProvider.getVerticalOffsetForLineNumber(lineNumber)
		);
	}

	public change(callback: (changeAccessor: editorBrowser.IViewZoneChangeAccessor) => any): boolean {
		if (this._isDisposed) {
			throw new Error('ViewImpl.change: View is disposed');
		}
		let zonesHaveChanged = false;

		this._renderOnce(() => {
			// Handle events to avoid "adjusting" newly inserted view zones
			this._flushAnyAccumulatedEvents();
			let changeAccessor: editorBrowser.IViewZoneChangeAccessor = {
				addZone: (zone: editorBrowser.IViewZone): number => {
					zonesHaveChanged = true;
					return this.viewZones.addZone(zone);
				},
				removeZone: (id: number): void => {
					if (!id) {
						return;
					}
					zonesHaveChanged = this.viewZones.removeZone(id) || zonesHaveChanged;
				},
				layoutZone: (id: number): void => {
					if (!id) {
						return;
					}
					zonesHaveChanged = this.viewZones.layoutZone(id) || zonesHaveChanged;
				}
			};

			safeInvoke1Arg(callback, changeAccessor);

			// Invalidate changeAccessor
			changeAccessor.addZone = null;
			changeAccessor.removeZone = null;

			if (zonesHaveChanged) {
				this.layoutProvider.onHeightMaybeChanged();
				this._context.privateViewEventBus.emit(new viewEvents.ViewZonesChangedEvent());
			}
		});
		return zonesHaveChanged;
	}

	public getWhitespaces(): editorCommon.IEditorWhitespace[] {
		if (this._isDisposed) {
			throw new Error('ViewImpl.getWhitespaces: View is disposed');
		}
		return this.layoutProvider.getWhitespaces();
	}

	public addContentWidget(widgetData: editorBrowser.IContentWidgetData): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.addContentWidget: View is disposed');
		}
		this.contentWidgets.addWidget(widgetData.widget);
		this.layoutContentWidget(widgetData);
		this._scheduleRender();
	}

	public layoutContentWidget(widgetData: editorBrowser.IContentWidgetData): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.layoutContentWidget: View is disposed');
		}

		let newPosition = widgetData.position ? widgetData.position.position : null;
		let newPreference = widgetData.position ? widgetData.position.preference : null;
		this.contentWidgets.setWidgetPosition(widgetData.widget, newPosition, newPreference);
		this._scheduleRender();
	}

	public removeContentWidget(widgetData: editorBrowser.IContentWidgetData): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.removeContentWidget: View is disposed');
		}
		this.contentWidgets.removeWidget(widgetData.widget);
		this._scheduleRender();
	}

	public addOverlayWidget(widgetData: editorBrowser.IOverlayWidgetData): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.addOverlayWidget: View is disposed');
		}
		this.overlayWidgets.addWidget(widgetData.widget);
		this.layoutOverlayWidget(widgetData);
		this._scheduleRender();
	}

	public layoutOverlayWidget(widgetData: editorBrowser.IOverlayWidgetData): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.layoutOverlayWidget: View is disposed');
		}

		let newPreference = widgetData.position ? widgetData.position.preference : null;
		let shouldRender = this.overlayWidgets.setWidgetPosition(widgetData.widget, newPreference);
		if (shouldRender) {
			this._scheduleRender();
		}
	}

	public removeOverlayWidget(widgetData: editorBrowser.IOverlayWidgetData): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.removeOverlayWidget: View is disposed');
		}
		this.overlayWidgets.removeWidget(widgetData.widget);
		this._scheduleRender();
	}

	public render(now: boolean, everything: boolean): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl.render: View is disposed');
		}
		if (everything) {
			// Force everything to render...
			this.viewLines.forceShouldRender();
			for (let i = 0, len = this.viewParts.length; i < len; i++) {
				let viewPart = this.viewParts[i];
				viewPart.forceShouldRender();
			}
		}
		if (now) {
			this._flushAccumulatedAndRenderNow();
		} else {
			this._scheduleRender();
		}
	}

	// --- end Code Editor APIs

	private _renderOnce(callback: () => any): any {
		if (this._isDisposed) {
			throw new Error('ViewImpl._renderOnce: View is disposed');
		}
		return this.outgoingEvents.deferredEmit(() => {
			let r = safeInvokeNoArg(callback);
			this._scheduleRender();
			return r;
		});
	}

	private _scheduleRender(): void {
		if (this._isDisposed) {
			throw new Error('ViewImpl._scheduleRender: View is disposed');
		}
		if (this._renderAnimationFrame === null) {
			this._renderAnimationFrame = dom.runAtThisOrScheduleAtNextAnimationFrame(this._onRenderScheduled.bind(this), 100);
		}
	}

	private _onRenderScheduled(): void {
		this._renderAnimationFrame = null;
		this._flushAccumulatedAndRenderNow();
	}

	private _renderNow(): void {
		safeInvokeNoArg(() => this._actualRender());
	}

	private _getViewPartsToRender(): ViewPart[] {
		let result: ViewPart[] = [];
		for (let i = 0, len = this.viewParts.length; i < len; i++) {
			let viewPart = this.viewParts[i];
			if (viewPart.shouldRender()) {
				result.push(viewPart);
			}
		}
		return result;
	}

	private _actualRender(): void {
		if (!dom.isInDOM(this.domNode.domNode)) {
			return;
		}

		let viewPartsToRender = this._getViewPartsToRender();

		if (!this.viewLines.shouldRender() && viewPartsToRender.length === 0) {
			// Nothing to render
			this.keyboardHandler.writeToTextArea();
			return;
		}

		let partialViewportData = this.layoutProvider.getLinesViewportData();
		this._context.model.setViewport(partialViewportData.startLineNumber, partialViewportData.endLineNumber, partialViewportData.centeredLineNumber);

		let viewportData = new ViewportData(partialViewportData, this._context.model);

		if (this.viewLines.shouldRender()) {
			this.viewLines.renderText(viewportData, () => {
				this.keyboardHandler.writeToTextArea();
			});
			this.viewLines.onDidRender();

			// Rendering of viewLines might cause scroll events to occur, so collect view parts to render again
			viewPartsToRender = this._getViewPartsToRender();
		} else {
			this.keyboardHandler.writeToTextArea();
		}

		let renderingContext = new RenderingContext(this.layoutProvider, viewportData, this.viewLines);

		// Render the rest of the parts
		for (let i = 0, len = viewPartsToRender.length; i < len; i++) {
			let viewPart = viewPartsToRender[i];
			viewPart.prepareRender(renderingContext);
		}

		for (let i = 0, len = viewPartsToRender.length; i < len; i++) {
			let viewPart = viewPartsToRender[i];
			viewPart.render(renderingContext);
			viewPart.onDidRender();
		}
	}

	private _setHasFocus(newHasFocus: boolean): void {
		if (this.hasFocus !== newHasFocus) {
			this.hasFocus = newHasFocus;
			this._context.privateViewEventBus.emit(new viewEvents.ViewFocusChangedEvent(this.hasFocus));
		}
	}
}

function safeInvokeNoArg(func: Function): any {
	try {
		return func();
	} catch (e) {
		onUnexpectedError(e);
	}
}

function safeInvoke1Arg(func: Function, arg1: any): any {
	try {
		return func(arg1);
	} catch (e) {
		onUnexpectedError(e);
	}
}
