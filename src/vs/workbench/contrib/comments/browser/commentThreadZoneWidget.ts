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
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IColorTheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { CommentGlyphWidget } from 'vs/workbench/contrib/comments/browser/commentGlyphWidget';
import { ICommentService } from 'vs/workbench/contrib/comments/browser/commentService';
import { ICommentThreadWidget } from 'vs/workbench/contrib/comments/common/commentThreadWidget';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { CommentThreadWidget } from 'vs/workbench/contrib/comments/browser/commentThreadWidget';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';
import { commentThreadStateBackgroundColorVar, commentThreadStateColorVar, getCommentThreadStateColor } from 'vs/workbench/contrib/comments/browser/commentColors';
import { peekViewBorder } from 'vs/editor/contrib/peekView/browser/peekView';

export function getCommentThreadWidgetStateColor(thread: languages.CommentThreadState | undefined, theme: IColorTheme): Color | undefined {
	return getCommentThreadStateColor(thread, theme) ?? theme.getColor(peekViewBorder);
}

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
	if (gutterOffsetX > 20) {
		return null;
	}

	return { lineNumber: range.startLineNumber };
}

export function isMouseUpEventDragFromMouseDown(mouseDownInfo: { lineNumber: number } | null, e: IEditorMouseEvent) {
	if (!mouseDownInfo) {
		return null;
	}

	const { lineNumber } = mouseDownInfo;

	const range = e.target.range;

	if (!range) {
		return null;
	}

	return lineNumber;
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
	private _commentThreadWidget!: CommentThreadWidget;
	private readonly _onDidClose = new Emitter<ReviewZoneWidget | undefined>();
	private readonly _onDidCreateThread = new Emitter<ReviewZoneWidget>();
	private _isExpanded?: boolean;
	private _commentGlyph?: CommentGlyphWidget;
	private readonly _globalToDispose = new DisposableStore();
	private _commentThreadDisposables: IDisposable[] = [];
	private _contextKeyService: IContextKeyService;
	private _scopedInstantiationService: IInstantiationService;

	public get owner(): string {
		return this._owner;
	}
	public get commentThread(): languages.CommentThread {
		return this._commentThread;
	}

	private _commentOptions: languages.CommentOptions | undefined;

	constructor(
		editor: ICodeEditor,
		private _owner: string,
		private _commentThread: languages.CommentThread,
		private _pendingComment: string | null,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService private themeService: IThemeService,
		@ICommentService private commentService: ICommentService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(editor, { keepEditorSelection: true });
		this._contextKeyService = contextKeyService.createScoped(this.domNode);

		this._scopedInstantiationService = instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, this._contextKeyService]
		));

		const controller = this.commentService.getCommentController(this._owner);
		if (controller) {
			this._commentOptions = controller.options;
		}

		this._isExpanded = _commentThread.collapsibleState === languages.CommentThreadCollapsibleState.Expanded;
		this._commentThreadDisposables = [];
		this.create();

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

	public reveal(commentUniqueId?: number, focus: boolean = false) {
		if (!this._isExpanded) {
			this.show({ lineNumber: this._commentThread.range.endLineNumber, column: 1 }, 2);
		}

		if (commentUniqueId !== undefined) {
			const height = this.editor.getLayoutInfo().height;
			const coords = this._commentThreadWidget.getCommentCoords(commentUniqueId);
			if (coords) {
				const commentThreadCoords = coords.thread;
				const commentCoords = coords.comment;

				this.editor.setScrollTop(this.editor.getTopForLineNumber(this._commentThread.range.startLineNumber) - height / 2 + commentCoords.top - commentThreadCoords.top);
				return;
			}
		}

		this.editor.revealRangeInCenter(this._commentThread.range);
		if (focus) {
			this._commentThreadWidget.focus();
		}
	}

	public getPendingComment(): string | null {
		return this._commentThreadWidget.getPendingComment();
	}

	protected _fillContainer(container: HTMLElement): void {
		this.setCssClass('review-widget');
		this._commentThreadWidget = this._scopedInstantiationService.createInstance(
			CommentThreadWidget,
			container,
			this._owner,
			this.editor.getModel()!.uri,
			this._contextKeyService,
			this._scopedInstantiationService,
			this._commentThread as unknown as languages.CommentThread<IRange | ICellRange>,
			this._pendingComment,
			{ editor: this.editor, codeBlockFontSize: '' },
			this._commentOptions,
			{
				actionRunner: () => {
					if (!this._commentThread.comments || !this._commentThread.comments.length) {
						const newPosition = this.getPosition();

						if (newPosition) {
							let range: Range;
							const originalRange = this._commentThread.range;
							if (newPosition.lineNumber !== originalRange.endLineNumber) {
								// The widget could have moved as a result of editor changes.
								// We need to try to calculate the new, more correct, range for the comment.
								const distance = newPosition.lineNumber - this._commentThread.range.endLineNumber;
								range = new Range(originalRange.startLineNumber + distance, originalRange.startColumn, originalRange.endLineNumber + distance, originalRange.endColumn);
							} else {
								range = new Range(originalRange.startLineNumber, originalRange.startColumn, originalRange.endLineNumber, originalRange.endColumn);
							}
							this.commentService.updateCommentThreadTemplate(this.owner, this._commentThread.commentThreadHandle, range);
						}
					}
				},
				collapse: () => {
					this.collapse();
				}
			}
		) as unknown as CommentThreadWidget<IRange>;

		this._disposables.add(this._commentThreadWidget);
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

	public expand(): Promise<void> {
		this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Expanded;
		const lineNumber = this._commentThread.range.endLineNumber;

		this.show({ lineNumber, column: 1 }, 2);
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

	async update(commentThread: languages.CommentThread<IRange>) {
		if (this._commentThread !== commentThread) {
			this._commentThreadDisposables.forEach(disposable => disposable.dispose());
			this._commentThread = commentThread;
			this._commentThreadDisposables = [];
			this.bindCommentThreadListeners();
		}

		this._commentThreadWidget.updateCommentThread(commentThread);

		// Move comment glyph widget and show position if the line has changed.
		const lineNumber = this._commentThread.range.endLineNumber;
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
	}

	protected override _onWidth(widthInPixel: number): void {
		this._commentThreadWidget.layout(widthInPixel);
	}

	protected override _doLayout(heightInPixel: number, widthInPixel: number): void {
		this._commentThreadWidget.layout(widthInPixel);
	}

	display(lineNumber: number) {
		this._commentGlyph = new CommentGlyphWidget(this.editor, lineNumber);

		this._commentThreadWidget.display(this.editor.getOption(EditorOption.lineHeight));
		this._disposables.add(this._commentThreadWidget.onDidResize(dimension => {
			this._refresh(dimension);
		}));
		if (this._commentThread.collapsibleState === languages.CommentThreadCollapsibleState.Expanded) {
			this.show({ lineNumber: lineNumber, column: 1 }, 2);
		}

		// If this is a new comment thread awaiting user input then we need to reveal it.
		if (this._commentThread.canReply && this._commentThread.isTemplate && (!this._commentThread.comments || (this._commentThread.comments.length === 0))) {
			this.reveal();
		}

		this.bindCommentThreadListeners();
	}

	private bindCommentThreadListeners() {
		this._commentThreadDisposables.push(this._commentThread.onDidChangeComments(async _ => {
			await this.update(this._commentThread);
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

		this._commentThreadDisposables.push(this._commentThread.onDidChangeCollapsibleState(state => {
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


		this._commentThreadDisposables.push(this._commentThread.onDidChangeState(() => {
			const borderColor =
				getCommentThreadWidgetStateColor(this._commentThread.state, this.themeService.getColorTheme()) || Color.transparent;
			this.style({
				frameColor: borderColor,
				arrowColor: borderColor,
			});
			this.container?.style.setProperty(commentThreadStateColorVar, `${borderColor}`);
			this.container?.style.setProperty(commentThreadStateBackgroundColorVar, `${borderColor.transparent(.1)}`);
		}));
	}

	async submitComment(): Promise<void> {
		this._commentThreadWidget.submitComment();
	}

	_refresh(dimensions?: dom.Dimension) {
		if (this._isExpanded && dimensions) {
			this._commentThreadWidget.layout();

			const headHeight = Math.ceil(this.editor.getOption(EditorOption.lineHeight) * 1.2);
			const lineHeight = this.editor.getOption(EditorOption.lineHeight);
			const arrowHeight = Math.round(lineHeight / 3);
			const frameThickness = Math.round(lineHeight / 9) * 2;

			const computedLinesNumber = Math.ceil((headHeight + dimensions.height + arrowHeight + frameThickness + 8 /** margin bottom to avoid margin collapse */) / lineHeight);

			if (this._viewZone?.heightInLines === computedLinesNumber) {
				return;
			}

			const currentPosition = this.getPosition();

			if (this._viewZone && currentPosition && currentPosition.lineNumber !== this._viewZone.afterLineNumber) {
				this._viewZone.afterLineNumber = currentPosition.lineNumber;
			}

			if (!this._commentThread.comments || !this._commentThread.comments.length) {
				this._commentThreadWidget.focusCommentEditor();
			}

			this._relayout(computedLinesNumber);
		}
	}

	private _applyTheme(theme: IColorTheme) {
		const borderColor = getCommentThreadWidgetStateColor(this._commentThread.state, this.themeService.getColorTheme()) || Color.transparent;
		this.style({
			arrowColor: borderColor,
			frameColor: borderColor
		});
		const fontInfo = this.editor.getOption(EditorOption.fontInfo);

		// Editor decorations should also be responsive to theme changes
		this._commentThreadWidget.applyTheme(theme, fontInfo);
	}

	override show(rangeOrPos: IRange | IPosition, heightInLines: number): void {
		this._isExpanded = true;
		super.show(rangeOrPos, heightInLines);
		this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Expanded;
		this._refresh(this._commentThreadWidget.getDimensions());
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
