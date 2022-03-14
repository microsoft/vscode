/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Color } from 'vs/base/common/color';
import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
import { withNullAsUndefined } from 'vs/base/common/types';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { IPosition } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import * as languages from 'vs/editor/common/languages';
import { peekViewBorder } from 'vs/editor/contrib/peekView/browser/peekView';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { contrastBorder, focusBorder, inputValidationErrorBackground, inputValidationErrorBorder, inputValidationErrorForeground, textBlockQuoteBackground, textBlockQuoteBorder, textLinkActiveForeground, textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { IColorTheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { CommentGlyphWidget } from 'vs/workbench/contrib/comments/browser/commentGlyphWidget';
import { CommentMenus } from 'vs/workbench/contrib/comments/browser/commentMenus';
import { ICommentService } from 'vs/workbench/contrib/comments/browser/commentService';
import { CommentContextKeys } from 'vs/workbench/contrib/comments/common/commentContextKeys';
import { ICommentThreadWidget } from 'vs/workbench/contrib/comments/common/commentThreadWidget';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { PANEL_BORDER } from 'vs/workbench/common/theme';
import { CommentThreadHeader } from 'vs/workbench/contrib/comments/browser/commentThreadHeader';
import { CommentThreadBody } from 'vs/workbench/contrib/comments/browser/commentThreadBody';
import { CommentReply } from 'vs/workbench/contrib/comments/browser/commentReply';


export function parseMouseDownInfoFromEvent(e: IEditorMouseEvent) {
	const range = e.target.range;

	if (!range) {
		return null;
	}

	if (!e.event.leftButton) {
		return null;
	}

	if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
		return null;
	}

	const data = e.target.detail;
	const gutterOffsetX = data.offsetX - data.glyphMarginWidth - data.lineNumbersWidth - data.glyphMarginLeft;

	// don't collide with folding and git decorations
	if (gutterOffsetX > 14) {
		return null;
	}

	return { lineNumber: range.startLineNumber };
}

export function isMouseUpEventMatchMouseDown(mouseDownInfo: { lineNumber: number } | null, e: IEditorMouseEvent) {
	if (!mouseDownInfo) {
		return null;
	}

	const { lineNumber } = mouseDownInfo;

	const range = e.target.range;

	if (!range || range.startLineNumber !== lineNumber) {
		return null;
	}

	if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
		return null;
	}

	return lineNumber;
}


export class ReviewZoneWidget extends ZoneWidget implements ICommentThreadWidget {
	private _header!: CommentThreadHeader;
	private _body!: CommentThreadBody;
	private _commentReply?: CommentReply;
	private readonly _onDidClose = new Emitter<ReviewZoneWidget | undefined>();
	private readonly _onDidCreateThread = new Emitter<ReviewZoneWidget>();
	private _isExpanded?: boolean;
	private _commentGlyph?: CommentGlyphWidget;
	private readonly _globalToDispose = new DisposableStore();
	private _commentThreadDisposables: IDisposable[] = [];
	private _styleElement: HTMLStyleElement;
	private _contextKeyService: IContextKeyService;
	private _threadIsEmpty: IContextKey<boolean>;
	private _commentThreadContextValue: IContextKey<string | undefined>;
	private _scopedInstatiationService: IInstantiationService;

	public get owner(): string {
		return this._owner;
	}
	public get commentThread(): languages.CommentThread {
		return this._commentThread;
	}

	private _commentMenus: CommentMenus;

	private _commentOptions: languages.CommentOptions | undefined;

	constructor(
		editor: ICodeEditor,
		private _owner: string,
		private _commentThread: languages.CommentThread,
		private _pendingComment: string | null,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService private themeService: IThemeService,
		@ICommentService private commentService: ICommentService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(editor, { keepEditorSelection: true });
		this._contextKeyService = contextKeyService.createScoped(this.domNode);

		this._scopedInstatiationService = instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, this._contextKeyService]
		));

		this._threadIsEmpty = CommentContextKeys.commentThreadIsEmpty.bindTo(this._contextKeyService);
		this._threadIsEmpty.set(!_commentThread.comments || !_commentThread.comments.length);
		this._commentThreadContextValue = this._contextKeyService.createKey<string | undefined>('commentThread', undefined);
		this._commentThreadContextValue.set(_commentThread.contextValue);

		const commentControllerKey = this._contextKeyService.createKey<string | undefined>('commentController', undefined);
		const controller = this.commentService.getCommentController(this._owner);

		if (controller) {
			commentControllerKey.set(controller.contextValue);
			this._commentOptions = controller.options;
		}

		this._isExpanded = _commentThread.collapsibleState === languages.CommentThreadCollapsibleState.Expanded;
		this._commentThreadDisposables = [];
		this._commentMenus = this.commentService.getCommentMenus(this._owner);
		this.create();

		this._styleElement = dom.createStyleSheet(this.domNode);
		this._globalToDispose.add(this.themeService.onDidColorThemeChange(this._applyTheme, this));
		this._globalToDispose.add(this.editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.fontInfo)) {
				this._applyTheme(this.themeService.getColorTheme());
			}
		}));
		this._applyTheme(this.themeService.getColorTheme());

	}

	public get onDidClose(): Event<ReviewZoneWidget | undefined> {
		return this._onDidClose.event;
	}

	public get onDidCreateThread(): Event<ReviewZoneWidget> {
		return this._onDidCreateThread.event;
	}

	public getPosition(): IPosition | undefined {
		if (this.position) {
			return this.position;
		}

		if (this._commentGlyph) {
			return withNullAsUndefined(this._commentGlyph.getPosition().position);
		}
		return undefined;
	}

	protected override revealLine(lineNumber: number) {
		// we don't do anything here as we always do the reveal ourselves.
	}

	public reveal(commentUniqueId?: number) {
		if (!this._isExpanded) {
			this.show({ lineNumber: this._commentThread.range.startLineNumber, column: 1 }, 2);
		}

		if (commentUniqueId !== undefined) {
			let height = this.editor.getLayoutInfo().height;
			const coords = this._body.getCommentCoords(commentUniqueId);
			if (coords) {
				const commentThreadCoords = coords.thread;
				const commentCoords = coords.comment;

				this.editor.setScrollTop(this.editor.getTopForLineNumber(this._commentThread.range.startLineNumber) - height / 2 + commentCoords.top - commentThreadCoords.top);
				return;
			}
		}

		this.editor.revealRangeInCenter(this._commentThread.range);
	}

	public getPendingComment(): string | null {
		if (this._commentReply) {
			return this._commentReply.getPendingComment();
		}

		return null;
	}

	protected _fillContainer(container: HTMLElement): void {
		this.setCssClass('review-widget');
		this._header = new CommentThreadHeader(
			container,
			{
				collapse: this.collapse.bind(this)
			},
			this._commentMenus,
			this._commentThread,
			this._contextKeyService,
			this.instantiationService
		);

		const bodyElement = <HTMLDivElement>dom.$('.body');
		container.appendChild(bodyElement);

		this._body = this._scopedInstatiationService.createInstance(
			CommentThreadBody,
			this.owner,
			this.editor.getModel()!.uri,
			bodyElement,
			{ editor: this.editor },
			this._commentThread,
			this._scopedInstatiationService,
			this
		);
	}

	private deleteCommentThread(): void {
		this.dispose();
		this.commentService.disposeCommentThread(this.owner, this._commentThread.threadId);
	}

	public collapse(): Promise<void> {
		this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Collapsed;
		if (this._commentThread.comments && this._commentThread.comments.length === 0) {
			this.deleteCommentThread();
			return Promise.resolve();
		}

		this.hide();
		return Promise.resolve();
	}

	public getGlyphPosition(): number {
		if (this._commentGlyph) {
			return this._commentGlyph.getPosition().position!.lineNumber;
		}
		return 0;
	}

	toggleExpand(lineNumber: number) {
		if (this._isExpanded) {
			this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Collapsed;
			this.hide();
			if (!this._commentThread.comments || !this._commentThread.comments.length) {
				this.deleteCommentThread();
			}
		} else {
			this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Expanded;
			this.show({ lineNumber: lineNumber, column: 1 }, 2);
		}
	}

	async update(commentThread: languages.CommentThread) {
		if (this._commentThread !== commentThread) {
			this._commentThreadDisposables.forEach(disposable => disposable.dispose());
		}

		this._commentThread = commentThread;
		this._commentThreadDisposables = [];
		this.bindCommentThreadListeners();

		this._body.updateCommentThread(commentThread);
		this._threadIsEmpty.set(!this._body.length);
		this._header.updateCommentThread(commentThread);
		this._commentReply?.updateCommentThread(commentThread);

		// Move comment glyph widget and show position if the line has changed.
		const lineNumber = this._commentThread.range.startLineNumber;
		let shouldMoveWidget = false;
		if (this._commentGlyph) {
			if (this._commentGlyph.getPosition().position!.lineNumber !== lineNumber) {
				shouldMoveWidget = true;
				this._commentGlyph.setLineNumber(lineNumber);
			}
		}

		if (shouldMoveWidget && this._isExpanded) {
			this.show({ lineNumber, column: 1 }, 2);
		}

		if (this._commentThread.collapsibleState === languages.CommentThreadCollapsibleState.Expanded) {
			this.show({ lineNumber, column: 1 }, 2);
		} else {
			this.hide();
		}

		if (this._commentThread.contextValue) {
			this._commentThreadContextValue.set(this._commentThread.contextValue);
		} else {
			this._commentThreadContextValue.reset();
		}
	}

	protected override _onWidth(widthInPixel: number): void {
		this._commentReply?.layout(widthInPixel);
	}

	protected override _doLayout(heightInPixel: number, widthInPixel: number): void {
		this._commentReply?.layout(widthInPixel);
	}

	display(lineNumber: number) {
		this._commentGlyph = new CommentGlyphWidget(this.editor, lineNumber);

		this._disposables.add(this.editor.onMouseDown(e => this.onEditorMouseDown(e)));
		this._disposables.add(this.editor.onMouseUp(e => this.onEditorMouseUp(e)));

		let headHeight = Math.ceil(this.editor.getOption(EditorOption.lineHeight) * 1.2);
		this._header.updateHeight(headHeight);

		this._body.display();

		// create comment thread only when it supports reply
		if (this._commentThread.canReply) {
			this.createCommentForm();
		}

		this._disposables.add(this._body.onDidResize(dimension => {
			this._refresh(dimension);
		}));

		if (this._commentThread.collapsibleState === languages.CommentThreadCollapsibleState.Expanded) {
			this.show({ lineNumber: lineNumber, column: 1 }, 2);
		}

		// If there are no existing comments, place focus on the text area. This must be done after show, which also moves focus.
		// if this._commentThread.comments is undefined, it doesn't finish initialization yet, so we don't focus the editor immediately.
		if (this._commentThread.canReply && this._commentReply) {
			this._commentReply?.focusIfNeeded();
		}

		this.bindCommentThreadListeners();
	}

	private bindCommentThreadListeners() {
		this._commentThreadDisposables.push(this._commentThread.onDidChangeCanReply(() => {
			if (this._commentReply) {
				this._commentReply.updateCanReply();
			} else {
				if (this._commentThread.canReply) {
					this.createCommentForm();
				}
			}
		}));

		this._commentThreadDisposables.push(this._commentThread.onDidChangeComments(async _ => {
			await this.update(this._commentThread);
		}));

		this._commentThreadDisposables.push(this._commentThread.onDidChangeLabel(_ => {
			this._header.createThreadLabel();
		}));

		this._commentThreadDisposables.push(this._commentThread.onDidChangeRange(range => {
			// Move comment glyph widget and show position if the line has changed.
			const lineNumber = this._commentThread.range.startLineNumber;
			let shouldMoveWidget = false;
			if (this._commentGlyph) {
				if (this._commentGlyph.getPosition().position!.lineNumber !== lineNumber) {
					shouldMoveWidget = true;
					this._commentGlyph.setLineNumber(lineNumber);
				}
			}

			if (shouldMoveWidget && this._isExpanded) {
				this.show({ lineNumber, column: 1 }, 2);
			}
		}));

		this._commentThreadDisposables.push(this._commentThread.onDidChangeCollasibleState(state => {
			if (state === languages.CommentThreadCollapsibleState.Expanded && !this._isExpanded) {
				const lineNumber = this._commentThread.range.startLineNumber;

				this.show({ lineNumber, column: 1 }, 2);
				return;
			}

			if (state === languages.CommentThreadCollapsibleState.Collapsed && this._isExpanded) {
				this.hide();
				return;
			}
		}));
	}

	private createCommentForm() {
		this._commentReply = this._scopedInstatiationService.createInstance(
			CommentReply,
			this.owner,
			this._body.container,
			this._commentThread,
			this._scopedInstatiationService,
			this._contextKeyService,
			this._commentMenus,
			this._commentOptions,
			this._pendingComment,
			this,
			() => {
				if (!this._commentThread.comments || !this._commentThread.comments.length) {
					let newPosition = this.getPosition();

					if (newPosition) {
						this.commentService.updateCommentThreadTemplate(this.owner, this._commentThread.commentThreadHandle, new Range(newPosition.lineNumber, 1, newPosition.lineNumber, 1));
					}
				}
			}
		);

		this._disposables.add(this._commentReply);
	}

	async submitComment(): Promise<void> {
		const activeComment = this._body.activeComment;
		if (activeComment instanceof ReviewZoneWidget) {
			this._commentReply?.submitComment();
		}
	}

	_refresh(dimensions?: dom.Dimension) {
		if (this._isExpanded && this._body && dimensions) {
			this._body.layout();

			const headHeight = Math.ceil(this.editor.getOption(EditorOption.lineHeight) * 1.2);
			const lineHeight = this.editor.getOption(EditorOption.lineHeight);
			const arrowHeight = Math.round(lineHeight / 3);
			const frameThickness = Math.round(lineHeight / 9) * 2;

			const computedLinesNumber = Math.ceil((headHeight + dimensions.height + arrowHeight + frameThickness + 8 /** margin bottom to avoid margin collapse */) / lineHeight);

			if (this._viewZone?.heightInLines === computedLinesNumber) {
				return;
			}

			let currentPosition = this.getPosition();

			if (this._viewZone && currentPosition && currentPosition.lineNumber !== this._viewZone.afterLineNumber) {
				this._viewZone.afterLineNumber = currentPosition.lineNumber;
			}

			if (!this._commentThread.comments || !this._commentThread.comments.length) {
				this._commentReply?.focusCommentEditor();
			}

			this._relayout(computedLinesNumber);
		}
	}

	private mouseDownInfo: { lineNumber: number } | null = null;

	private onEditorMouseDown(e: IEditorMouseEvent): void {
		this.mouseDownInfo = parseMouseDownInfoFromEvent(e);
	}

	private onEditorMouseUp(e: IEditorMouseEvent): void {
		const matchedLineNumber = isMouseUpEventMatchMouseDown(this.mouseDownInfo, e);
		this.mouseDownInfo = null;

		if (matchedLineNumber === null || !e.target.element) {
			return;
		}

		if (this._commentGlyph && this._commentGlyph.getPosition().position!.lineNumber !== matchedLineNumber) {
			return;
		}

		if (e.target.element.className.indexOf('comment-thread') >= 0) {
			this.toggleExpand(matchedLineNumber);
		}
	}

	private _applyTheme(theme: IColorTheme) {
		const borderColor = theme.getColor(peekViewBorder);
		this.style({
			arrowColor: borderColor || Color.transparent,
			frameColor: borderColor || Color.transparent
		});

		const content: string[] = [];

		if (borderColor) {
			content.push(`.monaco-editor .review-widget > .body { border-top: 1px solid ${borderColor} }`);
		}

		const linkColor = theme.getColor(textLinkForeground);
		if (linkColor) {
			content.push(`.monaco-editor .review-widget .body .comment-body a { color: ${linkColor} }`);
		}

		const linkActiveColor = theme.getColor(textLinkActiveForeground);
		if (linkActiveColor) {
			content.push(`.monaco-editor .review-widget .body .comment-body a:hover, a:active { color: ${linkActiveColor} }`);
		}

		const focusColor = theme.getColor(focusBorder);
		if (focusColor) {
			content.push(`.monaco-editor .review-widget .body .comment-body a:focus { outline: 1px solid ${focusColor}; }`);
			content.push(`.monaco-editor .review-widget .body .monaco-editor.focused { outline: 1px solid ${focusColor}; }`);
		}

		const blockQuoteBackground = theme.getColor(textBlockQuoteBackground);
		if (blockQuoteBackground) {
			content.push(`.monaco-editor .review-widget .body .review-comment blockquote { background: ${blockQuoteBackground}; }`);
		}

		const blockQuoteBOrder = theme.getColor(textBlockQuoteBorder);
		if (blockQuoteBOrder) {
			content.push(`.monaco-editor .review-widget .body .review-comment blockquote { border-color: ${blockQuoteBOrder}; }`);
		}

		const border = theme.getColor(PANEL_BORDER);
		if (border) {
			content.push(`.monaco-editor .review-widget .body .review-comment .review-comment-contents .comment-reactions .action-item a.action-label { border-color: ${border}; }`);
		}

		const hcBorder = theme.getColor(contrastBorder);
		if (hcBorder) {
			content.push(`.monaco-editor .review-widget .body .comment-form .review-thread-reply-button { outline-color: ${hcBorder}; }`);
			content.push(`.monaco-editor .review-widget .body .monaco-editor { outline: 1px solid ${hcBorder}; }`);
		}

		const errorBorder = theme.getColor(inputValidationErrorBorder);
		if (errorBorder) {
			content.push(`.monaco-editor .review-widget .validation-error { border: 1px solid ${errorBorder}; }`);
		}

		const errorBackground = theme.getColor(inputValidationErrorBackground);
		if (errorBackground) {
			content.push(`.monaco-editor .review-widget .validation-error { background: ${errorBackground}; }`);
		}

		const errorForeground = theme.getColor(inputValidationErrorForeground);
		if (errorForeground) {
			content.push(`.monaco-editor .review-widget .body .comment-form .validation-error { color: ${errorForeground}; }`);
		}

		const fontInfo = this.editor.getOption(EditorOption.fontInfo);
		const fontFamilyVar = '--comment-thread-editor-font-family';
		const fontSizeVar = '--comment-thread-editor-font-size';
		const fontWeightVar = '--comment-thread-editor-font-weight';
		this.container?.style.setProperty(fontFamilyVar, fontInfo.fontFamily);
		this.container?.style.setProperty(fontSizeVar, `${fontInfo.fontSize}px`);
		this.container?.style.setProperty(fontWeightVar, fontInfo.fontWeight);

		content.push(`.monaco-editor .review-widget .body code {
			font-family: var(${fontFamilyVar});
			font-weight: var(${fontWeightVar});
			font-size: var(${fontSizeVar});
		}`);

		this._styleElement.textContent = content.join('\n');

		// Editor decorations should also be responsive to theme changes
		this._commentReply?.setCommentEditorDecorations();
	}

	override show(rangeOrPos: IRange | IPosition, heightInLines: number): void {
		this._isExpanded = true;
		super.show(rangeOrPos, heightInLines);
		this._refresh(this._body?.getDimensions());
	}

	override hide() {
		if (this._isExpanded) {
			this._isExpanded = false;
			// Focus the container so that the comment editor will be blurred before it is hidden
			if (this.editor.hasWidgetFocus()) {
				this.editor.focus();
			}
		}
		super.hide();
	}

	override dispose() {
		super.dispose();

		if (this._commentGlyph) {
			this._commentGlyph.dispose();
			this._commentGlyph = undefined;
		}

		this._globalToDispose.dispose();
		this._commentThreadDisposables.forEach(global => global.dispose());
		this._onDidClose.fire(undefined);
	}
}
