/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/review.css';
import * as dom from '../../../../base/browser/dom.js';
import { GlobalPointerMoveMonitor } from '../../../../base/browser/globalPointerMoveMonitor.js';
import { IMouseWheelEvent } from '../../../../base/browser/mouseEvent.js';
import { IResizeEvent, ResizableHTMLElement } from '../../../../base/browser/ui/resizable/resizable.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Color } from '../../../../base/common/color.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { clamp } from '../../../../base/common/numbers.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { CodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { IEditorDecorationsCollection } from '../../../../editor/common/editorCommon.js';
import * as languages from '../../../../editor/common/languages.js';
import { ModelDecorationOptions } from '../../../../editor/common/model/textModel.js';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { commentThreadStateBackgroundColorVar, commentThreadStateColorVar, getCommentThreadRangeBorderColor } from './commentColors.js';
import { CommentGlyphWidget } from './commentGlyphWidget.js';
import { ICommentService } from './commentService.js';
import { CommentedCodeGeometry, CommentThreadConnector } from './commentThreadConnector.js';
import { commentThreadHasDraft, CommentWidgetFocus, confirmCommentThreadCollapse, createCommentThreadGlyph, getCommentThreadWidgetStateColor, ICommentThreadEditorWidget, updateCommentThreadTemplateRange } from './commentThreadEditorWidget.js';
import { computeFloatingWidgetPlacement, EDGE_MARGIN, FloatingWidgetSizeModel, getCenteredTop, getDefaultFloatingWidgetWidth, getPlacementBesideLines, getRevealScrollTop, getWidthBesideCode, IBesideLinesPlacement, ICommentThreadFloatingWidgetLayout, IFloatingWidgetChosenSize, IFloatingWidgetContentHeights, IFloatingWidgetContentWidths, IFloatingWidgetObstacle, IFloatingWidgetPlacement, IFloatingWidgetPlacementRequest, IPoint, IRect, ISize, ISizeRange, isInTheWayOf, MIN_HEIGHT, MIN_WIDTH, rectsIntersect, shouldDockFloatingWidgets } from './commentThreadFloatingWidgetLayout.js';
import { FloatingWidgetDockZone, FloatingWidgetRoom } from './commentThreadFloatingWidgetRoom.js';
import { CommentThreadWidget } from './commentThreadWidget.js';

const closeIcon = registerIcon('review-comment-close', Codicon.close, nls.localize('closeIcon', "Icon to close a floating review comment."));

const emptyRangeHighlightOptions = ModelDecorationOptions.register({
	description: 'comment-thread-floating-range',
	className: 'comment-thread-range',
	zIndex: 20,
	shouldFillLineOnLineBreak: true
});

/**
 * The layout of a docked widget that hasn't floated yet. The widget is placed among the other widgets once it floats.
 */
const AUTOMATIC_DOCKED_LAYOUT: ICommentThreadFloatingWidgetLayout = { offsetTop: undefined, left: 0, width: 0, height: undefined, isChosenByUser: false };

/**
 * Provided by the owner of the floating widgets of an editor.
 */
export interface ICommentThreadFloatingWidgetHost {
	getLayout(widget: ReviewFloatingWidget): ICommentThreadFloatingWidgetLayout | undefined;
	setLayout(widget: ReviewFloatingWidget, layout: ICommentThreadFloatingWidgetLayout): void;
	/** The size that the user last resized a widget to, which the widgets that are placed or docked after that start out at. */
	getLastChosenSize(): IFloatingWidgetChosenSize;
	setLastChosenSize(size: IFloatingWidgetChosenSize): void;
	/** Adds a widget to the floating widgets of the editor, until the returned disposable is disposed. */
	addWidget(widget: ReviewFloatingWidget): IDisposable;
	/** The other floating widgets of the editor. */
	getOtherWidgets(widget: ReviewFloatingWidget): readonly ReviewFloatingWidget[];
	/**
	 * The room that an editor that grows with its content makes for its floating widgets, or `undefined` for an
	 * editor whose height limits the widgets.
	 */
	getRoom(): FloatingWidgetRoom | undefined;
}

interface IResizeSession {
	readonly layout: ICommentThreadFloatingWidgetLayout;
	/** Document top of the widget when the resize started. */
	readonly top: number;
	readonly left: number;
	readonly width: number;
	readonly height: number;
	/** The widths the widget's content allows, which don't depend on the widget's size. */
	readonly widthRange: ISizeRange;
	north: boolean;
	west: boolean;
	/** Whether the user dragged the left or right edge, which chooses the widget's width. */
	horizontal: boolean;
	/** Whether the user dragged the top or bottom edge, which chooses the widget's height. */
	vertical: boolean;
}

/**
 * Where a widget is placed, and the size it is placed with.
 */
interface ISizedFloatingWidgetPlacement extends IFloatingWidgetPlacement, ISize { }

/**
 * Where a widget may be placed, whatever its size.
 */
type FloatingWidgetPlacementArea = Omit<IFloatingWidgetPlacementRequest, 'width' | 'height'>;

/**
 * Shows a comment thread in a window that floats above the editor. The window can be moved by dragging
 * its title and resized from its edges. A line connects it to the outlined code that the thread is about,
 * and it moves along with that code when the editor scrolls. Once the user resized a window, the windows that
 * are placed after that start out at its size.
 *
 * In an editor that is too narrow for the window to float without covering much of the code, such as a narrow diff
 * editor, the window is docked right below its code instead, in space that the editor makes for it between its lines,
 * until the editor is wide enough again. A docked window looks the same and is still connected to its code, but only
 * its height can be changed.
 */
export class ReviewFloatingWidget extends Disposable implements ICommentThreadEditorWidget {

	private static _idPool = 0;
	private static _frontWidget: ReviewFloatingWidget | undefined;

	private readonly _id = `review.floatingWidget.${ReviewFloatingWidget._idPool++}`;
	private readonly _resizable: ResizableHTMLElement;
	private readonly _domNode: HTMLElement;
	private readonly _container: HTMLElement;
	private readonly _boxOverlay: IOverlayWidget;
	private _boxPosition: IOverlayWidgetPosition | null = null;
	private readonly _codeGeometry: CommentedCodeGeometry;
	private readonly _connector: CommentThreadConnector;
	private readonly _dockZone: FloatingWidgetDockZone;
	private readonly _sizeModel = new FloatingWidgetSizeModel();

	private readonly _contextKeyService: IContextKeyService;
	private readonly _scopedInstantiationService: IInstantiationService;
	private readonly _commentThreadWidget: CommentThreadWidget<IRange>;
	private readonly _emptyRangeHighlight: IEditorDecorationsCollection;
	private readonly _dragMonitor = this._register(new GlobalPointerMoveMonitor());
	private readonly _scheduledRender = this._register(new MutableDisposable());
	private readonly _attachedDisposables = this._register(new DisposableStore());
	private readonly _commentThreadDisposables = this._register(new DisposableStore());
	private readonly _glyphDisposables = this._register(new DisposableStore());

	private _commentGlyph: CommentGlyphWidget | undefined;
	private _initialCollapsibleState: languages.CommentThreadCollapsibleState | undefined;
	private _isExpanded: boolean | undefined;
	private _isAttached = false;
	private _isDisposed = false;
	/** Whether the widget is docked below its code, rather than floating over the code. */
	private _isDocked = false;
	/**
	 * The height that the user last gave a docked widget when this one was docked, which it has while docked until the
	 * user resizes it there.
	 */
	private _initialDockedHeight: number | undefined;
	private _layout: ICommentThreadFloatingWidgetLayout | undefined;
	private _renderedLeft = 0;
	/** The width of the widget's border, which its content doesn't get. */
	private _frameWidth = 0;
	/** The width that the thread's content was last laid out for. */
	private _contentLayoutWidth: number | undefined;
	/** The connector ends on the widget's rounded top left corner, which this is the radius of. */
	private _cornerRadius = 0;
	private _resizeSession: IResizeSession | undefined;
	/** The bottom of the widget, in document coordinates, that the editor last made room for. */
	private _bottomWithRoom: number | undefined;

	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;

	private readonly _onDidChangeExpandedState = this._register(new Emitter<boolean>());
	readonly onDidChangeExpandedState = this._onDidChangeExpandedState.event;

	get uniqueOwner(): string {
		return this._uniqueOwner;
	}

	get commentThread(): languages.CommentThread {
		return this._commentThread;
	}

	get expanded(): boolean | undefined {
		return this._isExpanded;
	}

	constructor(
		readonly editor: ICodeEditor,
		private readonly _uniqueOwner: string,
		private _commentThread: languages.CommentThread<IRange>,
		private _pendingComment: languages.PendingComment | undefined,
		pendingEdits: { [key: number]: languages.PendingComment } | undefined,
		private readonly _host: ICommentThreadFloatingWidgetHost,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService private readonly _themeService: IThemeService,
		@ICommentService private readonly _commentService: ICommentService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IDialogService private readonly _dialogService: IDialogService
	) {
		super();
		// Other widgets are placed around this one as soon as it's shown, which can be before its owner has added it.
		this._register(_host.addWidget(this));

		this._resizable = this._register(new ResizableHTMLElement());
		this._domNode = this._resizable.domNode;
		this._domNode.classList.add('comment-thread-floating-widget');
		this._resizable.minSize = new dom.Dimension(MIN_WIDTH, MIN_HEIGHT);
		this._container = dom.append(this._domNode, dom.$('.review-widget'));

		this._contextKeyService = this._register(contextKeyService.createScoped(this._domNode));
		this._scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, this._contextKeyService]
		)));

		this._initialCollapsibleState = _pendingComment ? languages.CommentThreadCollapsibleState.Expanded : _commentThread.initialCollapsibleState;
		_commentThread.initialCollapsibleState = this._initialCollapsibleState;

		this._commentThreadWidget = this._register(this._scopedInstantiationService.createInstance(
			CommentThreadWidget<IRange>,
			this._container,
			this.editor,
			this._uniqueOwner,
			this.editor.getModel()!.uri,
			this._contextKeyService,
			this._scopedInstantiationService,
			this._commentThread,
			this._pendingComment,
			pendingEdits,
			{ context: this.editor },
			this._commentService.getCommentController(this._uniqueOwner)?.options,
			{
				actionRunner: () => updateCommentThreadTemplateRange(this._commentService, this._uniqueOwner, this._commentThread, this._commentGlyph?.getPosition().position ?? undefined),
				collapse: () => this.collapse(true)
			},
			{
				collapseAction: { label: nls.localize('label.close', "Close"), icon: closeIcon },
				// The reply and the thread's additional actions stay in view below the comments.
				scrollableComments: true
			}
		));

		this._codeGeometry = this._register(new CommentedCodeGeometry(this.editor, () => this._commentThread.range));
		this._connector = this._register(new CommentThreadConnector(this.editor, `${this._id}.connector`));
		this._dockZone = this._register(new FloatingWidgetDockZone(this.editor));
		this._boxOverlay = {
			getId: () => this._id,
			getDomNode: () => this._domNode,
			getPosition: () => this._boxPosition
		};

		this._emptyRangeHighlight = this.editor.createDecorationsCollection();
		this._register(toDisposable(() => this._emptyRangeHighlight.clear()));

		this._register(this._resizable.onDidWillResize(() => this._onWillResize()));
		this._register(this._resizable.onDidResize(e => this._onResize(e)));
		this._register(this._commentThreadWidget.onDidChangeContentSize(() => this._onContentSizeChanged()));

		const header = this._commentThreadWidget.headerDomNode;
		this._register(dom.addDisposableListener(header, dom.EventType.POINTER_DOWN, e => this._onHeaderPointerDown(e)));
		this._register(dom.addDisposableListener(header, dom.EventType.DBLCLICK, e => this._onHeaderDoubleClick(e)));
		this._register(dom.addDisposableListener(this._domNode, dom.EventType.POINTER_DOWN, () => this._bringToFront(), true));
		this._register(dom.addDisposableListener(this._domNode, dom.EventType.MOUSE_WHEEL, (e: IMouseWheelEvent) => this._onMouseWheel(e), { passive: false }));
		const focusTracker = this._register(dom.trackFocus(this._domNode));
		this._register(focusTracker.onDidFocus(() => {
			this._bringToFront();
			this._connector.setActive(true);
		}));
		this._register(focusTracker.onDidBlur(() => this._connector.setActive(false)));

		this._register(this._themeService.onDidColorThemeChange(() => this._applyTheme()));
		this._register(this.editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.fontInfo)) {
				this._applyTheme();
			}
		}));
		this._applyTheme();
	}

	async display(range: IRange | undefined, shouldReveal: boolean): Promise<void> {
		if (range) {
			this._commentGlyph = this._glyphDisposables.add(createCommentThreadGlyph(this.editor, range, () => this._commentThread, this._glyphDisposables));
			this._glyphDisposables.add(this._commentGlyph.onDidChangeLineNumber(() => this._scheduleRender()));
		}

		await this._commentThreadWidget.display(this.editor.getOption(EditorOption.lineHeight), shouldReveal);
		// The widget is placed among the other widgets at its size, which includes the reply's.
		await this._commentThreadWidget.whenReplyInitialized();
		if (this._isDisposed) {
			return;
		}

		if (this._commentThread.collapsibleState === languages.CommentThreadCollapsibleState.Expanded) {
			this._show();
		}

		// If this is a new comment thread awaiting user input then we need to reveal it. A new comment for code in view
		// goes within the view, rather than the editor scrolling away from where it's being written.
		if (shouldReveal) {
			this._makeVisible(undefined, CommentWidgetFocus.None, true);
			// The editor moves the widget to where it was just placed or scrolled to when it next renders. Focusing the
			// reply before then, where the widget was, could make the browser scroll the editor to it.
			this.editor.render();
		}
		// The reply was initialized before the widget was in the editor, so it couldn't take focus then.
		this._commentThreadWidget.focusReplyIfPending();

		this._bindCommentThreadListeners();
	}

	async update(commentThread: languages.CommentThread<IRange>): Promise<void> {
		if (this._commentThread !== commentThread) {
			this._commentThreadDisposables.clear();
			this._commentThread = commentThread;
			this._bindCommentThreadListeners();
		}

		await this._commentThreadWidget.updateCommentThread(commentThread);
		if (this._isDisposed) {
			return;
		}
		// The commented range may have changed.
		this._codeGeometry.invalidate();

		if (this._commentGlyph) {
			this._commentGlyph.setThreadState(commentThread.state, commentThreadHasDraft(commentThread));
			const lineNumber = this._commentThread.range?.endLineNumber ?? 1;
			if (this._commentGlyph.getPosition().position?.lineNumber !== lineNumber) {
				this._commentGlyph.setLineNumber(lineNumber);
			}
		}

		if (this._commentThread.collapsibleState === languages.CommentThreadCollapsibleState.Expanded) {
			this._show();
		} else {
			this._hide();
		}
	}

	reveal(commentUniqueId?: number, focus: CommentWidgetFocus = CommentWidgetFocus.None): void {
		this._makeVisible(commentUniqueId, focus);
		const comment = this._commentThread.comments?.find(comment => comment.uniqueIdInThread === commentUniqueId) ?? this._commentThread.comments?.[0];
		this._commentService.setActiveCommentAndThread(this.uniqueOwner, { thread: this._commentThread, comment });
	}

	expand(setActive?: boolean): void {
		this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Expanded;
		if (setActive) {
			this._commentService.setActiveCommentAndThread(this.uniqueOwner, { thread: this._commentThread });
		}
	}

	async collapse(confirm: boolean = false): Promise<boolean> {
		if (confirm && !(await confirmCommentThreadCollapse(this._commentThreadWidget.hasUnsubmittedComments, this._configurationService, this._dialogService))) {
			return false;
		}
		this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Collapsed;
		return true;
	}

	async collapseAndFocusRange(): Promise<void> {
		if (await this.collapse(true) && Range.isIRange(this._commentThread.range) && isCodeEditor(this.editor)) {
			this.editor.setSelection(this._commentThread.range);
		}
	}

	getGlyphPosition(): number {
		return this._commentGlyph?.getPosition().position?.lineNumber ?? 0;
	}

	getPendingComments(): { newComment: languages.PendingComment | undefined; edits: { [key: number]: languages.PendingComment } } {
		return {
			newComment: this._commentThreadWidget.getPendingComment(),
			edits: this._commentThreadWidget.getPendingEdits()
		};
	}

	setPendingComment(pending: languages.PendingComment): void {
		this._pendingComment = pending;
		this.expand();
		this._commentThreadWidget.setPendingComment(pending);
	}

	submitComment(): Promise<void> {
		return this._commentThreadWidget.submitComment();
	}

	/**
	 * The area taken up by the widget in document coordinates, and where its code starts, or `undefined` when it isn't
	 * floating over the code: when it isn't shown, or when it's docked below its code.
	 */
	getDocumentRect(): IFloatingWidgetObstacle | undefined {
		if (!this._isAttached || !this._layout || this._isDocked) {
			return undefined;
		}
		const { width, height } = this._resizable.size;
		return { top: this._getDocumentTop(this._layout, height), left: this._renderedLeft, width, height, codeTop: this._codeGeometry.getVerticalBounds().top };
	}

	override dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		this._isExpanded = false;
		this._detach();
		if (ReviewFloatingWidget._frontWidget === this) {
			ReviewFloatingWidget._frontWidget = undefined;
		}
		this._onDidClose.fire();
		super.dispose();
	}

	private _bindCommentThreadListeners(): void {
		this._commentThreadDisposables.add(this._commentThread.onDidChangeComments(async () => {
			await this.update(this._commentThread);
		}));

		this._commentThreadDisposables.add(this._commentThread.onDidChangeCollapsibleState(state => {
			if (state === languages.CommentThreadCollapsibleState.Expanded && !this._isExpanded) {
				this._show();
				this._commentThreadWidget.ensureFocusIntoNewEditingComment();
			} else if (state === languages.CommentThreadCollapsibleState.Collapsed && this._isExpanded) {
				this._hide();
			}
		}));

		if (this._initialCollapsibleState === undefined) {
			const onDidChangeInitialCollapsibleState = this._commentThread.onDidChangeInitialCollapsibleState(state => {
				// File comments always start expanded
				this._initialCollapsibleState = state;
				this._commentThread.collapsibleState = this._initialCollapsibleState;
				onDidChangeInitialCollapsibleState.dispose();
			});
			this._commentThreadDisposables.add(onDidChangeInitialCollapsibleState);
		}

		this._commentThreadDisposables.add(this._commentThread.onDidChangeState(() => this._applyTheme()));
	}

	private _show(): void {
		const wasExpanded = this._isExpanded;
		const wasAttached = this._isAttached;
		this._isExpanded = true;
		if (this._commentThread.collapsibleState !== languages.CommentThreadCollapsibleState.Expanded) {
			this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Expanded;
		}

		this._attach();
		if (wasAttached) {
			this._applySize();
			this._render();
		} else {
			this._sizeModel.resetGrowth();
			// A widget that the user moved or resized goes where the user put it. The others are placed among the
			// other widgets, in the order of their code. A docked widget goes below its code, and keeps its floating
			// placement for when it floats again.
			this._layout ??= this._host.getLayout(this);
			if (this._isDocked) {
				this._layout ??= AUTOMATIC_DOCKED_LAYOUT;
				this._applySize();
				this._render();
			} else {
				this._placeAmongOtherWidgets(this._layout?.isChosenByUser ? this._layout : undefined);
			}
		}
		this._updateEmptyRangeHighlight();

		if (!wasExpanded) {
			this._onDidChangeExpandedState.fire(true);
		}
	}

	private _hide(): void {
		if (this._isExpanded) {
			this._isExpanded = false;
			// Move focus out of the widget before it is removed from the DOM.
			if (dom.isAncestorOfActiveElement(this._domNode)) {
				this.editor.focus();
			}

			if (!this._commentThread.comments || !this._commentThread.comments.length) {
				this.dispose();
				this._commentService.disposeCommentThread(this.uniqueOwner, this._commentThread.threadId);
				return;
			}
			this._onDidChangeExpandedState.fire(false);
		}
		this._detach();
		this._updateEmptyRangeHighlight();
	}

	private _attach(): void {
		if (this._isAttached) {
			return;
		}
		this._isAttached = true;
		this._connector.attach();
		this.editor.addOverlayWidget(this._boxOverlay);
		this._sizeModel.captureEditorSize(this._measureEditorSize());
		this._cornerRadius = parseFloat(dom.getWindow(this._domNode).getComputedStyle(this._domNode).borderTopLeftRadius) || 0;
		this._setDockedState(this._shouldDock());

		this._attachedDisposables.add(this.editor.onDidScrollChange(e => {
			if (e.scrollTopChanged || e.scrollLeftChanged) {
				this._render();
			}
		}));
		this._attachedDisposables.add(this.editor.onDidLayoutChange(() => {
			if (this._updateDocking()) {
				return;
			}
			const editorSize = this._sizeModel.editorSize;
			if (editorSize.width <= 0 || editorSize.height <= 0) {
				// Resizing the editor doesn't resize a floating widget, unless the editor had no size when the widget was shown.
				this._sizeModel.captureEditorSize(this._measureEditorSize());
				this._applySize();
			} else if (this._isDocked) {
				// A docked widget is as wide as the editor.
				const width = this._measureEditorSize().width;
				if (width !== editorSize.width) {
					this._sizeModel.captureEditorSize({ width, height: editorSize.height });
					this._applySize();
				}
			}
			this._render();
		}));
		// Edits and folding can move the commented code. Wait for the editor to process them before following it.
		this._attachedDisposables.add(this.editor.onDidChangeHiddenAreas(() => this._scheduleRender()));
		this._attachedDisposables.add(this.editor.onDidContentSizeChange(() => this._scheduleRender()));
		this._attachedDisposables.add(this.editor.onDidChangeModelContent(() => this._scheduleRender()));
		// Other view zones can move the code, and the space below the code that a docked widget is in.
		this._attachedDisposables.add(this.editor.onDidChangeViewZones(() => this._scheduleRender()));
		this._attachedDisposables.add(this.editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.fontInfo) || e.hasChanged(EditorOption.lineHeight)) {
				this._scheduleRender();
			}
		}));
	}

	private _detach(): void {
		if (!this._isAttached) {
			return;
		}
		this._isAttached = false;
		this._attachedDisposables.clear();
		this._scheduledRender.clear();
		this._dragMonitor.stopMonitoring(false);
		this._resizeSession = undefined;
		this.editor.removeOverlayWidget(this._boxOverlay);
		this._connector.detach();
		this._dockZone.hide();
		if (this._bottomWithRoom !== undefined) {
			this._bottomWithRoom = undefined;
			this._host.getRoom()?.update();
		}
	}

	/**
	 * Shows the widget, reveals it and the commented code in the editor, and moves focus into it as requested.
	 * @param placeWithinView Whether to place the widget for code that is in view within the view, rather than scroll
	 * the editor to it.
	 */
	private _makeVisible(commentUniqueId?: number, focus: CommentWidgetFocus = CommentWidgetFocus.None, placeWithinView = false): void {
		if (!this._isExpanded) {
			this._show();
		}
		this._revealInEditor(placeWithinView);
		if (commentUniqueId !== undefined) {
			this._commentThreadWidget.revealComment(commentUniqueId);
		}

		if (focus === CommentWidgetFocus.Widget) {
			this._commentThreadWidget.focus(commentUniqueId);
		} else if (focus === CommentWidgetFocus.Editor) {
			this._commentThreadWidget.focusCommentEditor();
		}
	}

	/**
	 * Scrolls the editor so that the commented code and the widget are visible, if they aren't already. When requested,
	 * a floating widget for code that is in view, but that reaches below the view, is placed again within the view first,
	 * so that the code doesn't move, unless it would cover the code there. An editor that grows with its content can only
	 * scroll the view that it's shown in down, so for such an editor, a floating widget is always placed again instead of
	 * scrolling, and the view scrolls down to a docked widget, which stays below its code.
	 */
	private _revealInEditor(placeWithinView: boolean): void {
		if (!this._layout) {
			return;
		}
		const code = this._codeGeometry.getVerticalBounds();
		const room = this._host.getRoom();
		const viewport = this._getViewport();
		const viewportBottom = viewport.top + viewport.height;
		const isCodeInView = code.top >= viewport.top && code.bottom <= viewportBottom;
		let height = this._resizable.size.height;
		if (isCodeInView && (placeWithinView || room) && !this._isDocked && !this._layout.isChosenByUser && this._getDocumentTop(this._layout, height) + height > viewportBottom - EDGE_MARGIN) {
			this._placeAmongOtherWidgets(undefined, viewportBottom);
			height = this._resizable.size.height;
		}
		const widgetTop = this._getDocumentTop(this._layout, height);
		const widget = { top: widgetTop, bottom: widgetTop + height };
		if (isCodeInView && room) {
			if (this._isDocked) {
				const scrollTop = getRevealScrollTop(code, widget, viewport.top, viewport.height);
				if (scrollTop !== undefined) {
					room.scrollDownTo(scrollTop);
				}
			}
			return;
		}
		const scrollTop = getRevealScrollTop(code, widget, this.editor.getScrollTop(), this.editor.getLayoutInfo().height);
		if (scrollTop !== undefined) {
			this.editor.setScrollTop(scrollTop);
		}
	}

	private _storeLayout(): void {
		if (this._layout) {
			this._host.setLayout(this, this._layout);
		}
	}

	/**
	 * Where the widget goes and how large it is until the user moves or resizes it. Once the user resized a widget, this
	 * one starts out at that size instead of at one that suits the editor. The widget is laid out to measure its
	 * content, and may be left at another width than the layout's until the layout is applied.
	 * @param obstacles The areas that other widgets take up, which the widget is placed around.
	 * @param maxBottom How far down the widget can go, when that's less far than the editor can scroll through, such as
	 * to keep it within the view. `undefined` when the widget can't go above that without covering its code.
	 */
	private _computeDefaultLayout(obstacles: readonly IFloatingWidgetObstacle[], maxBottom?: number): ICommentThreadFloatingWidgetLayout | undefined {
		this._sizeModel.resetGrowth();
		this._sizeModel.captureEditorSize(this._measureEditorSize());
		const bounds = this._getHorizontalBounds();
		const contentWidths = this._measureContentWidths();
		const widthRange = this._sizeModel.getWidthRange(contentWidths);
		const isNewComment = !this._commentThread.comments?.length;
		const chosenSize = this._host.getLastChosenSize();
		const preferredWidth = getDefaultFloatingWidgetWidth(this.editor.getLayoutInfo().contentWidth, bounds.right - bounds.left - 2 * EDGE_MARGIN, isNewComment, chosenSize.width);
		const defaultWidth = this._sizeModel.getDefaultWidth(contentWidths, preferredWidth, this._commentThreadWidget.isEditing);
		// A width that the user chose is kept where the widget is placed, rather than fit to the room or content there.
		const isWidthChosen = chosenSize.width !== undefined;

		const editorCode = this._codeGeometry.getBoundingRect();
		const code = editorCode && { ...editorCode, top: editorCode.top + this.editor.getScrollTop() };
		const area: FloatingWidgetPlacementArea = {
			minLeft: bounds.left + EDGE_MARGIN,
			maxRight: bounds.right,
			code,
			obstacles,
			scrollableHeight: maxBottom ?? this._getScrollableHeight()
		};
		// Laying the widget out makes the browser lay it out, so its size at the default width is measured at most once.
		let defaultSize: ISize | undefined;
		const measureDefaultSize = () => defaultSize ??= this._layOutAtWidth(defaultWidth, widthRange, chosenSize.height);
		// A new comment goes right after its code when it can, so that it's close to where it's written.
		let placement = code && isNewComment ? this._placeBesideCode({ ...area, ...measureDefaultSize() }, code, isWidthChosen ? defaultWidth : widthRange.min, widthRange, chosenSize.height) : undefined;
		placement ??= code && this._placeBesideLines(area, code, defaultWidth, measureDefaultSize, isWidthChosen ? defaultWidth : contentWidths.natural, widthRange, chosenSize.height);
		if (!placement) {
			const request = { ...area, ...measureDefaultSize() };
			placement = { ...computeFloatingWidgetPlacement(request), width: request.width, height: request.height };
		}
		if (maxBottom !== undefined && code && rectsIntersect(placement, code)) {
			return undefined;
		}
		const { top, left, centered, width } = placement;
		return { offsetTop: centered ? undefined : top - this._codeGeometry.getVerticalBounds().top, left, width, height: chosenSize.height, isChosenByUser: false };
	}

	/**
	 * Places the widget around the other widgets, or where the user put it, and places the automatically placed widgets
	 * that it's in the way of again, so that the widgets stay in the order of their code. Those are the ones for later
	 * code, and, for a widget that the user moved or resized, also the ones for earlier code, which may have been placed
	 * where it is while it was hidden. Widgets that the user moved or resized stay where they are. Widgets that aren't in
	 * the way stay where they are as well, so placing a widget only moves the ones that it must.
	 * @param layoutChosenByUser Where the user put the widget, when the user moved or resized it.
	 * @param maxBottom How far down the widget can go, when that's less far than the editor can scroll through. A widget
	 * that can't go above that without covering its code stays where it is, and so do the other widgets.
	 */
	private _placeAmongOtherWidgets(layoutChosenByUser?: ICommentThreadFloatingWidgetLayout, maxBottom?: number): void {
		const otherWidgets = this._host.getOtherWidgets(this);
		if (layoutChosenByUser) {
			this._layout = layoutChosenByUser;
			this._applySize();
			this._render();
		} else if (!this._placeAutomatically(otherWidgets, maxBottom)) {
			return;
		}
		const placed = this.getDocumentRect();
		if (!placed) {
			return;
		}
		const widgetsToMove: { widget: ReviewFloatingWidget; rect: IFloatingWidgetObstacle }[] = [];
		for (const widget of otherWidgets) {
			const rect = widget.getDocumentRect();
			if (rect && !widget._layout?.isChosenByUser && (layoutChosenByUser || rect.codeTop > placed.codeTop)) {
				widgetsToMove.push({ widget, rect });
			}
		}
		widgetsToMove.sort((a, b) => a.rect.codeTop - b.rect.codeTop);
		// Each widget that is placed again can be in the way of the widgets for code after its own.
		const movedRects = [placed];
		const allWidgets = [this, ...otherWidgets];
		for (const { widget, rect } of widgetsToMove) {
			if (movedRects.some(movedRect => isInTheWayOf(rect, movedRect))) {
				widget._placeAutomatically(allWidgets.filter(other => other !== widget));
				const movedRect = widget.getDocumentRect();
				if (movedRect) {
					movedRects.push(movedRect);
				}
			}
		}
	}

	/**
	 * Places the widget where it goes until the user moves or resizes it, around the given other widgets that the user
	 * moved or resized, or that are for code that doesn't start after its own. The height that the user gave the widget
	 * while docked is kept for when it's docked again.
	 * @param maxBottom How far down the widget can go, when that's less far than the editor can scroll through.
	 * @returns Whether the widget was placed, which it isn't when it can't go above `maxBottom` without covering its code.
	 */
	private _placeAutomatically(otherWidgets: readonly ReviewFloatingWidget[], maxBottom?: number): boolean {
		const codeTop = this._codeGeometry.getVerticalBounds().top;
		const obstacles: IFloatingWidgetObstacle[] = [];
		for (const widget of otherWidgets) {
			const rect = widget.getDocumentRect();
			if (rect && (widget._layout?.isChosenByUser || rect.codeTop <= codeTop)) {
				obstacles.push(rect);
			}
		}
		const layout = this._computeDefaultLayout(obstacles, maxBottom);
		if (!layout) {
			// Measuring the widget laid it out at other sizes than its layout's.
			this._applySize();
			return false;
		}
		this._layout = { ...layout, dockedHeight: this._layout?.dockedHeight };
		this._storeLayout();
		this._applySize();
		this._render();
		return true;
	}

	/**
	 * Places a new comment right after the end of its code, level with it, when there is room, so that it's close to
	 * where it's written. `undefined` when there isn't, or when other widgets or the end of the area that the widget is
	 * kept within move it away from its code, where it would hide the lines next to it.
	 * @param minWidth The narrowest that the widget may be made to fit there.
	 * @param chosenHeight The height that the user chose, or `undefined` when the widget sizes itself to its content.
	 */
	private _placeBesideCode(request: IFloatingWidgetPlacementRequest, code: IRect, minWidth: number, widthRange: ISizeRange, chosenHeight: number | undefined): ISizedFloatingWidgetPlacement | undefined {
		const width = getWidthBesideCode(code, request.height, request.width, minWidth, request.maxRight, request.obstacles);
		if (width === undefined) {
			return undefined;
		}
		const size = this._layOutAtWidth(width, widthRange, chosenHeight);
		const placement = computeFloatingWidgetPlacement({ ...request, ...size, besideCode: true });
		return placement.top === code.top ? { ...placement, ...size } : undefined;
	}

	/**
	 * Places a comment right after the end of the lines next to its code, and as wide as its content fills, when there
	 * is room, so that it's close to its code. See {@link getPlacementBesideLines} for which lines it may hide. When
	 * other widgets or the end of the area that the widget is kept within move it next to lines that leave it less room,
	 * it's placed right after those instead, once, so that it hides no more of them while staying as close to its code
	 * as it can.
	 *
	 * Laying the widget out at a new width takes far longer than estimating where lines end, so it's laid out once,
	 * unless its height decides how wide it is. Which lines it's next to depends on its height, which is only known once
	 * it's laid out, but it's at least the minimum height and at most the height that it sizes itself to, or that the
	 * user chose. A taller widget is next to more lines, which leave it no more room, so when both heights leave the same
	 * room, so do the heights in between. A wider widget is no taller, so it's next to no more lines.
	 * @param measureDefaultSize Lays the widget out at its default width, the first time only, and returns its size there.
	 * @param chosenHeight The height that the user chose, or `undefined` when the widget sizes itself to its content.
	 */
	private _placeBesideLines(area: FloatingWidgetPlacementArea, code: IRect, defaultWidth: number, measureDefaultSize: () => ISize, naturalWidth: number, widthRange: ISizeRange, chosenHeight: number | undefined): ISizedFloatingWidgetPlacement | undefined {
		const maxHeight = this._sizeModel.getMaxHeight(chosenHeight);
		const centeredTop = (height: number) => getCenteredTop(code.top, code.top + code.height, height);
		const nearbyLines = this._codeGeometry.estimateLineRects(centeredTop(maxHeight), centeredTop(maxHeight) + maxHeight);
		const getPlacement = (lines: readonly IRect[], top: number, height: number) => getPlacementBesideLines(lines, top, top + height, code.left + code.width, area.maxRight, defaultWidth, naturalWidth);
		const getCenteredPlacement = (height: number) => getPlacement(nearbyLines, centeredTop(height), height);

		const shortest = getCenteredPlacement(MIN_HEIGHT);
		if (!shortest) {
			return undefined;
		}
		const tallest = getCenteredPlacement(maxHeight);
		let beside: IBesideLinesPlacement | undefined;
		let size: ISize | undefined;
		if (tallest && tallest.linesRight === shortest.linesRight && tallest.width === shortest.width
			&& computeFloatingWidgetPlacement({ ...area, width: tallest.width, height: maxHeight, linesRight: tallest.linesRight }).centered) {
			beside = tallest;
			size = this._layOutAtWidth(beside.width, widthRange, chosenHeight);
		} else {
			const defaultSize = measureDefaultSize();
			beside = defaultSize.height <= maxHeight ? getCenteredPlacement(defaultSize.height) : undefined;
			size = beside && (beside.width === defaultSize.width ? defaultSize : this._layOutAtWidth(beside.width, widthRange, chosenHeight));
		}
		// A widget whose title, reply and actions alone are taller than it sizes itself to is next to unchecked lines.
		if (!beside || !size || size.height > maxHeight) {
			return undefined;
		}
		const getPlacementAt = (top: number) => getPlacement(this._codeGeometry.estimateLineRects(top, top + size.height), top, size.height);
		let linesRight = beside.linesRight;
		// The widget is placed again only once, so that the widgets that move it can't keep moving it.
		for (let attempt = 0; attempt < 2; attempt++) {
			const placement = computeFloatingWidgetPlacement({ ...area, ...size, linesRight });
			if (placement.centered) {
				return { ...placement, ...size };
			}
			// The widget was moved away from the code, next to other lines.
			const moved = getPlacementAt(placement.top);
			if (!moved || moved.width < size.width) {
				return undefined;
			}
			if (moved.linesRight <= linesRight) {
				return { ...placement, ...size };
			}
			linesRight = moved.linesRight;
		}
		return undefined;
	}

	/**
	 * Lays the widget out at the given width, within the given range, and measures the size that it then takes at the
	 * given height chosen by the user, or when it sizes itself to its content.
	 */
	private _layOutAtWidth(width: number, range: ISizeRange, chosenHeight: number | undefined): ISize {
		const newWidth = this._setWidth(width, range);
		return { width: newWidth, height: this._sizeModel.getHeight(this._measureContentHeights(), chosenHeight) };
	}

	/**
	 * Sizes the widget to its layout, or a docked widget to the editor's width, within the sizes that its content allows.
	 * The content is measured before the widget is changed, so that measuring doesn't make the browser lay out the
	 * changes, unless the widget's width changes, which changes the height of its content.
	 */
	private _applySize(): void {
		const layout = this._layout;
		if (!layout) {
			return;
		}
		let heights = this._measureContentHeights();
		const widthRange = this._sizeModel.getWidthRange(this._measureContentWidths());
		const previousWidth = this._resizable.size.width;
		if (this._setWidth(this._isDocked ? this._getDockedWidth() : layout.width, widthRange) !== previousWidth) {
			heights = this._measureContentHeights();
		}
		const growthChanged = this._sizeModel.updateGrowth(heights);
		const height = this._setHeight(this._sizeModel.getHeight(heights, this._getChosenHeight(layout)), heights);
		// A docked widget grows down, moving the code below it down.
		if (growthChanged && !this._isDocked) {
			const viewport = this._getViewport();
			this._sizeModel.updateUpwardShift(layout.offsetTop, this._codeGeometry.getVerticalBounds(), height, viewport.top, viewport.height);
		}
	}

	/**
	 * Sets the widget's width within the given range, and lays out its content for that width.
	 */
	private _setWidth(width: number, range: ISizeRange): number {
		const newWidth = clamp(width, range.min, range.max);
		if (!this._resizeSession) {
			this._resizable.minSize = new dom.Dimension(range.min, 0);
			this._resizable.maxSize = new dom.Dimension(range.max, Number.MAX_SAFE_INTEGER);
		}
		this._resizable.layout(this._resizable.size.height, newWidth);
		const contentWidth = newWidth - this._frameWidth;
		if (contentWidth !== this._contentLayoutWidth) {
			this._contentLayoutWidth = contentWidth;
			this._commentThreadWidget.layout(contentWidth);
		}
		return newWidth;
	}

	/**
	 * Sets the widget's height within the heights its content allows at its current width, and gives the comments
	 * the space that the rest of the thread leaves.
	 */
	private _setHeight(height: number, content: IFloatingWidgetContentHeights): number {
		const range = this._sizeModel.getHeightRange(content);
		const newHeight = clamp(height, range.min, range.max);
		if (!this._resizeSession) {
			this._resizable.minSize = new dom.Dimension(this._resizable.minSize.width, range.min);
			this._resizable.maxSize = new dom.Dimension(this._resizable.maxSize.width, range.max);
		}
		this._resizable.layout(newHeight, this._resizable.size.width);
		this._commentThreadWidget.layoutCommentsHeight(this._sizeModel.getCommentsHeight(content, newHeight));
		return newHeight;
	}

	private _measureContentWidths(): IFloatingWidgetContentWidths {
		this._frameWidth = this._domNode.offsetWidth - this._domNode.clientWidth;
		const widths = this._commentThreadWidget.measureWidths();
		return { minimum: this._frameWidth + widths.minimum, natural: this._frameWidth + widths.natural };
	}

	private _measureContentHeights(): IFloatingWidgetContentHeights {
		const frame = this._domNode.offsetHeight - this._domNode.clientHeight;
		const heights = this._commentThreadWidget.measureHeights();
		return { fixed: frame + heights.fixed, comments: heights.comments };
	}

	private _measureEditorSize(): ISize {
		const bounds = this._getHorizontalBounds();
		return { width: Math.max(0, bounds.right - bounds.left), height: this._getViewport().height };
	}

	/**
	 * The part of the document that is in view, in document coordinates: the editor's viewport or, for an editor that
	 * grows with its content, the part of the editor that the view it's shown in shows.
	 */
	private _getViewport(): { top: number; height: number } {
		return this._host.getRoom()?.getViewport() ?? { top: this.editor.getScrollTop(), height: this.editor.getLayoutInfo().height };
	}

	/**
	 * The horizontal range, in editor coordinates, of the area that shows the code.
	 */
	private _getHorizontalBounds(): { left: number; right: number } {
		const layoutInfo = this.editor.getLayoutInfo();
		const left = layoutInfo.contentLeft;
		const right = layoutInfo.contentLeft + layoutInfo.contentWidth - layoutInfo.verticalScrollbarWidth;
		return { left, right: Math.max(left, right) };
	}

	/**
	 * The top of the widget in document coordinates: where its layout puts it, or in the space below its code when it's
	 * docked.
	 */
	private _getDocumentTop(layout: ICommentThreadFloatingWidgetLayout, height: number): number {
		if (this._isDocked) {
			// The space is made before the widget is placed, unless the editor has no view to make it in.
			return (this._dockZone.getTop() ?? this._codeGeometry.getVerticalBounds().bottom) + EDGE_MARGIN;
		}
		return this._sizeModel.getTop(layout.offsetTop, this._codeGeometry.getVerticalBounds(), height, this._getScrollableHeight());
	}

	/**
	 * Whether the widget should be docked below its code, rather than float over the code, in the editor at its current
	 * width and font. An editor that has no size, such as one that isn't shown yet, leaves the widget as it is.
	 */
	private _shouldDock(): boolean {
		const bounds = this._getHorizontalBounds();
		const codeAreaWidth = bounds.right - bounds.left;
		return codeAreaWidth > 0 ? shouldDockFloatingWidgets(codeAreaWidth, this.editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth) : this._isDocked;
	}

	/**
	 * Docks the widget below its code, or lets it float over the code, without placing it.
	 */
	private _setDockedState(docked: boolean): void {
		this._isDocked = docked;
		this._domNode.classList.toggle('docked', docked);
		// A docked widget is as wide as the editor, so only its height can be changed.
		this._resizable.enableSashes(!docked, !docked, true, !docked);
		if (docked) {
			this._initialDockedHeight = this._host.getLastChosenSize().dockedHeight;
		} else {
			this._dockZone.hide();
		}
	}

	/**
	 * Docks the widget below its code when the editor became too narrow for it to float over the code, and lets it float
	 * again, where the user put it or among the other widgets, once the editor is wide enough.
	 * @returns Whether the widget was docked or undocked, and placed again.
	 */
	private _updateDocking(): boolean {
		const docked = this._shouldDock();
		// A drag or resize that is going on finishes as it started, and the widget is docked or undocked after it.
		if (docked === this._isDocked || this._resizeSession || this._dragMonitor.isMonitoring()) {
			return false;
		}
		this._setDockedState(docked);
		this._sizeModel.captureEditorSize(this._measureEditorSize());
		if (docked) {
			this._sizeModel.clearUpwardShift();
			this._applySize();
			this._render();
		} else {
			this._placeAmongOtherWidgets(this._layout?.isChosenByUser ? this._layout : undefined);
		}
		return true;
	}

	/**
	 * The width of a docked widget, which spans the area that shows the code.
	 */
	private _getDockedWidth(): number {
		const bounds = this._getHorizontalBounds();
		return bounds.right - bounds.left - 2 * EDGE_MARGIN;
	}

	/**
	 * The height that the user chose for the widget where it is now, docked below its code or floating, or `undefined`
	 * when it sizes itself to its content there. A docked widget that the user didn't resize there has the height that
	 * the user last gave a docked widget when it was docked.
	 */
	private _getChosenHeight(layout: ICommentThreadFloatingWidgetLayout): number | undefined {
		return this._isDocked ? layout.dockedHeight ?? this._initialDockedHeight : layout.height;
	}

	/**
	 * Where the connector from the code meets the widget, in editor coordinates: on the widget's rounded top left corner,
	 * where the corner's curve is halfway around, or, for a docked widget, on its top edge, straight below the start of
	 * the last line of the code, which it's right below.
	 */
	private _getConnectorAnchor(codeLines: readonly IRect[] | undefined, left: number, top: number, width: number): IPoint {
		if (this._isDocked) {
			const lastLine = codeLines?.[codeLines.length - 1];
			const x = clamp((lastLine?.left ?? left) + this._cornerRadius, left + this._cornerRadius, left + width - this._cornerRadius);
			return { x, y: top };
		}
		const cornerInset = this._cornerRadius * (1 - Math.SQRT1_2);
		return { x: left + cornerInset, y: top + cornerInset };
	}

	/**
	 * The height of the area that the widget can be in. Overlay widgets don't make the area that the editor can scroll
	 * through larger, but an editor that grows with its content makes room for them below its content.
	 */
	private _getScrollableHeight(): number {
		return this._host.getRoom()?.getScrollableHeight() ?? Math.max(this.editor.getScrollHeight(), this.editor.getLayoutInfo().height);
	}

	private _render(): void {
		if (!this._isAttached || !this._layout) {
			return;
		}
		this._scheduledRender.clear();
		const { width, height } = this._resizable.size;
		if (this._isDocked) {
			// The space is made before the widget is placed in it, with room for the connector above and a margin below.
			const isResizing = this._resizeSession !== undefined;
			this._dockZone.show(this._codeGeometry.getLines()?.endLineNumber ?? 0, Math.ceil(height) + 2 * EDGE_MARGIN, isResizing);
		}
		const bounds = this._getHorizontalBounds();
		const left = clamp(this._isDocked ? bounds.left + EDGE_MARGIN : this._layout.left, bounds.left, Math.max(bounds.left, bounds.right - width));
		const documentTop = this._getDocumentTop(this._layout, height);
		const top = documentTop - this.editor.getScrollTop();
		// Measure the code before moving the widget: measuring code that is newly in view makes the editor render.
		const codeLines = this._codeGeometry.getLineRects();
		this._renderedLeft = left;
		this._boxPosition = { preference: { top: Math.round(top), left: Math.round(left) } };
		this.editor.layoutOverlayWidget(this._boxOverlay);
		this._connector.render(codeLines, this._getConnectorAnchor(codeLines, left, top, width), bounds);
		// Scrolling doesn't move the widget within the document, so the editor only makes room again when it moved. A
		// docked widget is in the space below its code instead.
		const room = this._host.getRoom();
		const bottom = this._isDocked ? undefined : documentTop + height;
		if (room && bottom !== this._bottomWithRoom) {
			this._bottomWithRoom = bottom;
			room.update();
		}
	}

	private _scheduleRender(): void {
		if (this._isAttached && !this._scheduledRender.value) {
			this._scheduledRender.value = dom.scheduleAtNextAnimationFrame(dom.getWindow(this.editor.getContainerDomNode()), () => {
				// The editor's font, like its width, decides whether the widget is docked.
				if (!this._updateDocking()) {
					this._render();
				}
			});
		}
	}

	/**
	 * Highlights the commented line of an empty range. Other ranges are highlighted for all comment threads.
	 */
	private _updateEmptyRangeHighlight(): void {
		const range = this._commentThread.range;
		const model = this.editor.getModel();
		if (!this._isExpanded || !range || !model || !Range.isEmpty(range)) {
			this._emptyRangeHighlight.clear();
			return;
		}
		const lineNumber = clamp(range.startLineNumber, 1, model.getLineCount());
		this._emptyRangeHighlight.set([{
			range: new Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)),
			options: emptyRangeHighlightOptions
		}]);
	}

	private _onContentSizeChanged(): void {
		if (this._isAttached && !this._resizeSession) {
			this._applySize();
			this._render();
		}
	}

	/**
	 * The whole title bar can be dragged, except for its actions.
	 */
	private _isInHeaderActions(target: EventTarget | null): boolean {
		return dom.isHTMLElement(target) && !!target.closest('.review-actions .action-item');
	}

	private _onHeaderPointerDown(e: PointerEvent): void {
		const startLayout = this._layout;
		// A docked widget stays below its code.
		if (e.button !== 0 || !startLayout || !this._isAttached || this._isDocked || this._isInHeaderActions(e.target)) {
			return;
		}
		// Prevent the text selection and focus change that a mouse down would cause.
		e.preventDefault();

		const header = this._commentThreadWidget.headerDomNode;
		const startTop = this._getDocumentTop(startLayout, this._resizable.size.height);
		const startLeft = this._renderedLeft;
		const startX = e.clientX;
		const startY = e.clientY;
		const headerHeight = header.offsetHeight;
		this._domNode.classList.add('dragging');
		this._dragMonitor.startMonitoring(header, e.pointerId, e.buttons, moveEvent => {
			const bounds = this._getHorizontalBounds();
			const scrollTop = this.editor.getScrollTop();
			// Keep the title within the editor so that the widget can always be dragged back.
			const maxTop = Math.max(0, this.editor.getLayoutInfo().height - headerHeight);
			const top = clamp(startTop - scrollTop + moveEvent.clientY - startY, 0, maxTop) + scrollTop;
			const left = clamp(startLeft + moveEvent.clientX - startX, bounds.left, Math.max(bounds.left, bounds.right - this._resizable.size.width));
			// The widget is now where the user puts it, which includes any upward shift for its expanded reply.
			this._sizeModel.clearUpwardShift();
			this._layout = { ...startLayout, left, offsetTop: top - this._codeGeometry.getVerticalBounds().top, isChosenByUser: true };
			this._render();
		}, () => {
			this._domNode.classList.remove('dragging');
			this._storeLayout();
			this._updateDocking();
		});
	}

	private _onHeaderDoubleClick(e: MouseEvent): void {
		if (!this._isAttached || this._isInHeaderActions(e.target)) {
			return;
		}
		const lastChosenSize = this._host.getLastChosenSize();
		if (this._isDocked) {
			// Restore the initial height below the code, also for the widgets that are docked after this one. The floating
			// placement and size stay as they are.
			this._host.setLastChosenSize({ ...lastChosenSize, dockedHeight: undefined });
			this._initialDockedHeight = undefined;
			this._layout = { ...this._layout ?? AUTOMATIC_DOCKED_LAYOUT, dockedHeight: undefined };
			this._storeLayout();
			this._sizeModel.resetGrowth();
			this._applySize();
			this._render();
			return;
		}
		// Restore the initial placement and size, also for the widgets that are placed after this one.
		this._host.setLastChosenSize({ ...lastChosenSize, width: undefined, height: undefined });
		this._placeAmongOtherWidgets();
	}

	private _onWillResize(): void {
		if (!this._layout) {
			return;
		}
		// The user can resize the widget to fit the editor's current size, without it first shrinking to fit an editor
		// that became smaller after the widget was shown.
		this._sizeModel.growEditorSize(this._measureEditorSize());
		const { width, height } = this._resizable.size;
		const top = this._getDocumentTop(this._layout, height);
		const widthRange = this._sizeModel.getWidthRange(this._measureContentWidths());
		this._resizeSession = { layout: this._layout, top, left: this._renderedLeft, width, height, widthRange, north: false, west: false, horizontal: false, vertical: false };
		// The allowed height changes with the width, so the sizes are limited while handling each resize instead.
		this._resizable.minSize = new dom.Dimension(0, 0);
		this._resizable.maxSize = new dom.Dimension(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
	}

	private _onResize(e: IResizeEvent): void {
		const session = this._resizeSession;
		if (!session) {
			return;
		}
		session.north ||= !!e.north;
		session.west ||= !!e.west;
		session.horizontal ||= !!(e.east || e.west);
		session.vertical ||= !!(e.north || e.south);
		if (e.done && !session.horizontal && !session.vertical) {
			// Clicking an edge without dragging it doesn't resize the widget, so it isn't taken as a size the user chose.
			this._resizeSession = undefined;
			if (!this._updateDocking()) {
				this._applySize();
				this._render();
			}
			return;
		}

		// Keep the widget within the editor horizontally.
		const bounds = this._getHorizontalBounds();
		const maxWidthOnSide = session.west ? session.left + session.width - bounds.left : bounds.right - session.left;
		const widthRange = { min: session.widthRange.min, max: Math.max(session.widthRange.min, Math.min(session.widthRange.max, maxWidthOnSide)) };
		const width = this._setWidth(e.dimension.width, widthRange);

		// Dragging a corner trades width for height: the allowed height depends on the new width.
		const heights = this._measureContentHeights();
		this._sizeModel.updateGrowth(heights);
		let requestedHeight = session.vertical ? e.dimension.height : this._sizeModel.getHeight(heights, this._getChosenHeight(session.layout));
		if (session.north) {
			// The top edge can't go above the start of the document.
			requestedHeight = Math.min(requestedHeight, session.top + session.height);
		} else if (session.vertical && !this._isDocked) {
			// The bottom edge can't go below the area that the editor can scroll through. A docked widget makes the
			// space below its code taller instead.
			requestedHeight = Math.min(requestedHeight, this._getScrollableHeight() - EDGE_MARGIN - session.top);
		}
		const height = this._setHeight(requestedHeight, heights);

		if (this._isDocked) {
			// A docked widget stays below its code, as wide as the editor, and keeps its height there apart from its
			// floating size.
			this._layout = { ...session.layout, dockedHeight: session.vertical ? height : session.layout.dockedHeight };
		} else {
			// Resizing vertically pins the edge that isn't being dragged, so the widget stops being centered on the code.
			let offsetTop = session.layout.offsetTop;
			if (session.vertical) {
				const top = session.north ? Math.max(0, session.top + session.height - height) : session.top;
				offsetTop = top - this._codeGeometry.getVerticalBounds().top;
				// The pinned edge includes any upward shift for the widget's expanded reply.
				this._sizeModel.clearUpwardShift();
			}
			this._layout = {
				...session.layout,
				offsetTop,
				left: session.west ? session.left + session.width - width : session.left,
				width,
				height: session.vertical ? height : session.layout.height,
				isChosenByUser: true
			};
		}
		this._render();

		if (e.done) {
			this._resizeSession = undefined;
			if (session.vertical) {
				// The chosen height includes the reply and additional actions as they are now.
				this._sizeModel.resetGrowth();
			}
			this._storeLayout();
			// The widgets that are placed or docked after this one start out at the size that the user chose, in the
			// dimensions that the user changed.
			const lastChosenSize = this._host.getLastChosenSize();
			this._host.setLastChosenSize(this._isDocked
				? { ...lastChosenSize, dockedHeight: session.vertical ? height : lastChosenSize.dockedHeight }
				: { ...lastChosenSize, width: session.horizontal ? width : lastChosenSize.width, height: session.vertical ? height : lastChosenSize.height });
			if (!this._updateDocking()) {
				this._applySize();
				this._render();
			}
		}
	}

	private _onMouseWheel(e: IMouseWheelEvent): void {
		// The comment body didn't scroll, so scroll the editor instead. The widget moves along with the code.
		if (this.editor instanceof CodeEditorWidget && this.editor.getOption(EditorOption.scrollbar).handleMouseWheel) {
			this.editor.delegateScrollFromMouseWheelEvent(e);
			e.preventDefault();
			e.stopPropagation();
		}
	}

	private _bringToFront(): void {
		if (ReviewFloatingWidget._frontWidget === this) {
			return;
		}
		ReviewFloatingWidget._frontWidget?._domNode.classList.remove('front');
		ReviewFloatingWidget._frontWidget = this;
		this._domNode.classList.add('front');
	}

	private _applyTheme(): void {
		const theme = this._themeService.getColorTheme();
		const color = getCommentThreadWidgetStateColor(this._commentThread.state, theme) ?? Color.transparent;
		this._domNode.style.setProperty(commentThreadStateColorVar, `${color}`);
		this._domNode.style.setProperty(commentThreadStateBackgroundColorVar, `${color.transparent(.1)}`);
		// The outline and connector must stand out from the code even when the widget's frame is subtle.
		this._connector.setColor(`${getCommentThreadRangeBorderColor(this._commentThread.state, theme) ?? color}`);
		this._commentThreadWidget.applyTheme(this.editor.getOption(EditorOption.fontInfo));
	}
}
