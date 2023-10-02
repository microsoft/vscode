/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Color } from 'vs/base/common/color';
import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable, DisposableStore } from 'vs/base/common/lifecycle';
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
import { EDITOR_FONT_DEFAULTS, EditorOption, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { CommentThreadWidget } from 'vs/workbench/contrib/comments/browser/commentThreadWidget';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';
import { commentThreadStateBackgroundColorVar, commentThreadStateColorVar, getCommentThreadStateBorderColor } from 'vs/workbench/contrib/comments/browser/commentColors';
import { peekViewBorder } from 'vs/editor/contrib/peekView/browser/peekView';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

function getCommentThreadWidgetStateColor(thread: languages.CommentThreadState | undefined, theme: IColorTheme): Color | undefined {
	return getCommentThreadStateBorderColor(thread, theme) ?? theme.getColor(peekViewBorder);
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
	private _initialCollapsibleState?: languages.CommentThreadCollapsibleState;
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

	public get expanded(): boolean | undefined {
		return this._isExpanded;
	}

	private _commentOptions: languages.CommentOptions | undefined;

	constructor(
		editor: ICodeEditor,
		private _owner: string,
		private _commentThread: languages.CommentThread,
		private _pendingComment: string | undefined,
		private _pendingEdits: { [key: number]: string } | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService private themeService: IThemeService,
		@ICommentService private commentService: ICommentService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super(editor, { keepEditorSelection: true, isAccessible: true });
		this._contextKeyService = contextKeyService.createScoped(this.domNode);

		this._scopedInstantiationService = instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, this._contextKeyService]
		));

		const controller = this.commentService.getCommentController(this._owner);
		if (controller) {
			this._commentOptions = controller.options;
		}

		this._initialCollapsibleState = _commentThread.initialCollapsibleState;
		this._isExpanded = _commentThread.initialCollapsibleState === languages.CommentThreadCollapsibleState.Expanded;
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
			return this._commentGlyph.getPosition().position ?? undefined;
		}
		return undefined;
	}

	protected override revealRange() {
		// we don't do anything here as we always do the reveal ourselves.
	}

	public reveal(commentUniqueId?: number, focus: boolean = false) {
		if (!this._isExpanded) {
			this.show(this.arrowPosition(this._commentThread.range), 2);
		}

		if (commentUniqueId !== undefined) {
			const height = this.editor.getLayoutInfo().height;
			const coords = this._commentThreadWidget.getCommentCoords(commentUniqueId);
			if (coords) {
				let scrollTop: number = 1;
				if (this._commentThread.range) {
					const commentThreadCoords = coords.thread;
					const commentCoords = coords.comment;
					scrollTop = this.editor.getTopForLineNumber(this._commentThread.range.startLineNumber) - height / 2 + commentCoords.top - commentThreadCoords.top;
				}
				this.editor.setScrollTop(scrollTop);
				if (focus) {
					this._commentThreadWidget.focus();
				}
				return;
			}
		}

		this.editor.revealRangeInCenter(this._commentThread.range ?? new Range(1, 1, 1, 1));
		if (focus) {
			this._commentThreadWidget.focus();
		}
	}

	public getPendingComments(): { newComment: string | undefined; edits: { [key: number]: string } } {
		return {
			newComment: this._commentThreadWidget.getPendingComment(),
			edits: this._commentThreadWidget.getPendingEdits()
		};
	}

	protected _fillContainer(container: HTMLElement): void {
		this.setCssClass('review-widget');
		this._commentThreadWidget = this._scopedInstantiationService.createInstance(
			CommentThreadWidget,
			container,
			this.editor,
			this._owner,
			this.editor.getModel()!.uri,
			this._contextKeyService,
			this._scopedInstantiationService,
			this._commentThread as unknown as languages.CommentThread<IRange | ICellRange>,
			this._pendingComment,
			this._pendingEdits,
			{ editor: this.editor, codeBlockFontSize: '', codeBlockFontFamily: this.configurationService.getValue<IEditorOptions>('editor').fontFamily || EDITOR_FONT_DEFAULTS.fontFamily },
			this._commentOptions,
			{
				actionRunner: () => {
					if (!this._commentThread.comments || !this._commentThread.comments.length) {
						const newPosition = this.getPosition();

						if (newPosition) {
							const originalRange = this._commentThread.range;
							if (!originalRange) {
								return;
							}
							let range: Range;

							if (newPosition.lineNumber !== originalRange.endLineNumber) {
								// The widget could have moved as a result of editor changes.
								// We need to try to calculate the new, more correct, range for the comment.
								const distance = newPosition.lineNumber - originalRange.endLineNumber;
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

	private arrowPosition(range: IRange | undefined): IPosition | undefined {
		if (!range) {
			return undefined;
		}
		// Arrow on top edge of zone widget will be at the start of the line if range is multi-line, else at midpoint of range (rounding rightwards)
		return { lineNumber: range.endLineNumber, column: range.endLineNumber === range.startLineNumber ? (range.startColumn + range.endColumn + 1) / 2 : 1 };
	}

	private deleteCommentThread(): void {
		this.dispose();
		this.commentService.disposeCommentThread(this.owner, this._commentThread.threadId);
	}

	public collapse() {
		this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Collapsed;
	}

	public expand() {
		this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Expanded;
	}

	public getGlyphPosition(): number {
		if (this._commentGlyph) {
			return this._commentGlyph.getPosition().position!.lineNumber;
		}
		return 0;
	}

	toggleExpand() {
		if (this._isExpanded) {
			this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Collapsed;
		} else {
			this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Expanded;
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
		const lineNumber = this._commentThread.range?.endLineNumber ?? 1;
		let shouldMoveWidget = false;
		if (this._commentGlyph) {
			this._commentGlyph.setThreadState(commentThread.state);
			if (this._commentGlyph.getPosition().position!.lineNumber !== lineNumber) {
				shouldMoveWidget = true;
				this._commentGlyph.setLineNumber(lineNumber);
			}
		}

		if (shouldMoveWidget && this._isExpanded) {
			this.show(this.arrowPosition(this._commentThread.range), 2);
		}

		if (this._commentThread.collapsibleState === languages.CommentThreadCollapsibleState.Expanded) {
			this.show(this.arrowPosition(this._commentThread.range), 2);
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

	display(range: IRange | undefined) {
		if (range) {
			this._commentGlyph = new CommentGlyphWidget(this.editor, range?.endLineNumber ?? -1);
			this._commentGlyph.setThreadState(this._commentThread.state);
		}

		this._commentThreadWidget.display(this.editor.getOption(EditorOption.lineHeight));
		this._disposables.add(this._commentThreadWidget.onDidResize(dimension => {
			this._refresh(dimension);
		}));
		if ((this._commentThread.collapsibleState === languages.CommentThreadCollapsibleState.Expanded) || (range === undefined)) {
			this.show(this.arrowPosition(range), 2);
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
			const lineNumber = this._commentThread.range?.startLineNumber ?? 1;
			let shouldMoveWidget = false;
			if (this._commentGlyph) {
				if (this._commentGlyph.getPosition().position!.lineNumber !== lineNumber) {
					shouldMoveWidget = true;
					this._commentGlyph.setLineNumber(lineNumber);
				}
			}

			if (shouldMoveWidget && this._isExpanded) {
				this.show(this.arrowPosition(this._commentThread.range), 2);
			}
		}));

		this._commentThreadDisposables.push(this._commentThread.onDidChangeCollapsibleState(state => {
			if (state === languages.CommentThreadCollapsibleState.Expanded && !this._isExpanded) {
				this.show(this.arrowPosition(this._commentThread.range), 2);
				return;
			}

			if (state === languages.CommentThreadCollapsibleState.Collapsed && this._isExpanded) {
				this.hide();
				return;
			}
		}));

		if (this._initialCollapsibleState === undefined) {
			const onDidChangeInitialCollapsibleState = this._commentThread.onDidChangeInitialCollapsibleState(state => {
				// File comments always start expanded
				this._initialCollapsibleState = this._commentThread.range ? state : languages.CommentThreadCollapsibleState.Expanded;
				this._commentThread.collapsibleState = this._initialCollapsibleState;
				onDidChangeInitialCollapsibleState.dispose();
			});
			this._commentThreadDisposables.push(onDidChangeInitialCollapsibleState);
		}


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
		return this._commentThreadWidget.submitComment();
	}

	_refresh(dimensions: dom.Dimension) {
		if (dimensions.height === 0 && dimensions.width === 0) {
			this.commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Collapsed;
			return;
		}
		if (this._isExpanded) {
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

			if (this._viewZone && currentPosition && currentPosition.lineNumber !== this._viewZone.afterLineNumber && this._viewZone.afterLineNumber !== 0) {
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

	override show(rangeOrPos: IRange | IPosition | undefined, heightInLines: number): void {
		this._isExpanded = true;
		super.show(rangeOrPos ?? new Range(0, 0, 0, 0), heightInLines);
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

			if (!this._commentThread.comments || !this._commentThread.comments.length) {
				this.deleteCommentThread();
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
