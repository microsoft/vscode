/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Color } from '../../../../base/common/color.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IDisposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ICodeEditor, IEditorMouseEvent, isCodeEditor, MouseTargetType } from '../../../../editor/browser/editorBrowser.js';
import { IPosition } from '../../../../editor/common/core/position.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import * as languages from '../../../../editor/common/languages.js';
import { ZoneWidget } from '../../../../editor/contrib/zoneWidget/browser/zoneWidget.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IColorTheme, IThemeService } from '../../../../platform/theme/common/themeService.js';
import { CommentGlyphWidget } from './commentGlyphWidget.js';
import { ICommentService } from './commentService.js';
import { ICommentThreadWidget } from '../common/commentThreadWidget.js';
import { EDITOR_FONT_DEFAULTS, EditorOption, IEditorOptions } from '../../../../editor/common/config/editorOptions.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { CommentThreadWidget } from './commentThreadWidget.js';
import { ICellRange } from '../../notebook/common/notebookRange.js';
import { commentThreadStateBackgroundColorVar, commentThreadStateColorVar, getCommentThreadStateBorderColor } from './commentColors.js';
import { peekViewBorder } from '../../../../editor/contrib/peekView/browser/peekView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { StableEditorScrollState } from '../../../../editor/browser/stableEditorScroll.js';
import Severity from '../../../../base/common/severity.js';
import * as nls from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';

function getCommentThreadWidgetStateColor(thread: languages.CommentThreadState | undefined, theme: IColorTheme): Color | undefined {
	return getCommentThreadStateBorderColor(thread, theme) ?? theme.getColor(peekViewBorder);
}

export enum CommentWidgetFocus {
	None = 0,
	Widget = 1,
	Editor = 2
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

	public get uniqueOwner(): string {
		return this._uniqueOwner;
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
		private _uniqueOwner: string,
		private _commentThread: languages.CommentThread,
		private _pendingComment: languages.PendingComment | undefined,
		private _pendingEdits: { [key: number]: languages.PendingComment } | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService private themeService: IThemeService,
		@ICommentService private commentService: ICommentService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IDialogService private readonly dialogService: IDialogService
	) {
		super(editor, { keepEditorSelection: true, isAccessible: true, showArrow: !!_commentThread.range });
		this._contextKeyService = contextKeyService.createScoped(this.domNode);

		this._scopedInstantiationService = this._globalToDispose.add(instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, this._contextKeyService]
		)));

		const controller = this.commentService.getCommentController(this._uniqueOwner);
		if (controller) {
			this._commentOptions = controller.options;
		}

		this._initialCollapsibleState = _pendingComment ? languages.CommentThreadCollapsibleState.Expanded : _commentThread.initialCollapsibleState;
		_commentThread.initialCollapsibleState = this._initialCollapsibleState;
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

	public reveal(commentUniqueId?: number, focus: CommentWidgetFocus = CommentWidgetFocus.None) {
		this.makeVisible(commentUniqueId, focus);
		const comment = this._commentThread.comments?.find(comment => comment.uniqueIdInThread === commentUniqueId) ?? this._commentThread.comments?.[0];
		this.commentService.setActiveCommentAndThread(this.uniqueOwner, { thread: this._commentThread, comment });
	}

	private _expandAndShowZoneWidget() {
		if (!this._isExpanded) {
			this.show(this.arrowPosition(this._commentThread.range), 2);
		}
	}

	private _setFocus(commentUniqueId: number | undefined, focus: CommentWidgetFocus) {
		if (focus === CommentWidgetFocus.Widget) {
			this._commentThreadWidget.focus(commentUniqueId);
		} else if (focus === CommentWidgetFocus.Editor) {
			this._commentThreadWidget.focusCommentEditor();
		}
	}

	private _goToComment(commentUniqueId: number, focus: CommentWidgetFocus) {
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
			this._setFocus(commentUniqueId, focus);
		} else {
			this._goToThread(focus);
		}
	}

	private _goToThread(focus: CommentWidgetFocus) {
		const rangeToReveal = this._commentThread.range
			? new Range(this._commentThread.range.startLineNumber, this._commentThread.range.startColumn, this._commentThread.range.endLineNumber + 1, 1)
			: new Range(1, 1, 1, 1);

		this.editor.revealRangeInCenter(rangeToReveal);
		this._setFocus(undefined, focus);
	}

	public makeVisible(commentUniqueId?: number, focus: CommentWidgetFocus = CommentWidgetFocus.None) {
		this._expandAndShowZoneWidget();

		if (commentUniqueId !== undefined) {
			this._goToComment(commentUniqueId, focus);
		} else {
			this._goToThread(focus);
		}
	}

	public getPendingComments(): { newComment: languages.PendingComment | undefined; edits: { [key: number]: languages.PendingComment } } {
		return {
			newComment: this._commentThreadWidget.getPendingComment(),
			edits: this._commentThreadWidget.getPendingEdits()
		};
	}

	public setPendingComment(pending: languages.PendingComment) {
		this._pendingComment = pending;
		this.expand();
		this._commentThreadWidget.setPendingComment(pending);
	}

	protected _fillContainer(container: HTMLElement): void {
		this.setCssClass('review-widget');
		this._commentThreadWidget = this._scopedInstantiationService.createInstance(
			CommentThreadWidget,
			container,
			this.editor,
			this._uniqueOwner,
			this.editor.getModel()!.uri,
			this._contextKeyService,
			this._scopedInstantiationService,
			this._commentThread as unknown as languages.CommentThread<IRange | ICellRange>,
			this._pendingComment,
			this._pendingEdits,
			{ editor: this.editor, codeBlockFontSize: '', codeBlockFontFamily: this.configurationService.getValue<IEditorOptions>('editor').fontFamily || EDITOR_FONT_DEFAULTS.fontFamily },
			this._commentOptions,
			{
				actionRunner: async () => {
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
							await this.commentService.updateCommentThreadTemplate(this.uniqueOwner, this._commentThread.commentThreadHandle, range);
						}
					}
				},
				collapse: () => {
					return this.collapse(true);
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
		this.commentService.disposeCommentThread(this.uniqueOwner, this._commentThread.threadId);
	}

	private doCollapse() {
		this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Collapsed;
	}

	public async collapse(confirm: boolean = false): Promise<boolean> {
		if (!confirm || (await this.confirmCollapse())) {
			this.doCollapse();
			return true;
		} else {
			return false;
		}
	}

	private async confirmCollapse(): Promise<boolean> {
		const confirmSetting = this.configurationService.getValue<'whenHasUnsubmittedComments' | 'never'>('comments.thread.confirmOnCollapse');

		if (confirmSetting === 'whenHasUnsubmittedComments' && this._commentThreadWidget.hasUnsubmittedComments) {
			const result = await this.dialogService.confirm({
				message: nls.localize('confirmCollapse', "Collapsing a comment thread will discard unsubmitted comments. Do you want to collapse this comment thread?"),
				primaryButton: nls.localize('collapse', "Collapse"),
				type: Severity.Warning,
				checkbox: { label: nls.localize('neverAskAgain', "Never ask me again"), checked: false }
			});
			if (result.checkboxChecked) {
				await this.configurationService.updateValue('comments.thread.confirmOnCollapse', 'never');
			}
			return result.confirmed;
		}
		return true;
	}

	public expand(setActive?: boolean) {
		this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Expanded;
		if (setActive) {
			this.commentService.setActiveCommentAndThread(this.uniqueOwner, { thread: this._commentThread });
		}
	}

	public getGlyphPosition(): number {
		if (this._commentGlyph) {
			return this._commentGlyph.getPosition().position!.lineNumber;
		}
		return 0;
	}

	async update(commentThread: languages.CommentThread<IRange>) {
		if (this._commentThread !== commentThread) {
			this._commentThreadDisposables.forEach(disposable => disposable.dispose());
			this._commentThread = commentThread;
			this._commentThreadDisposables = [];
			this.bindCommentThreadListeners();
		}

		await this._commentThreadWidget.updateCommentThread(commentThread);

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

		if ((shouldMoveWidget && this._isExpanded) || (this._commentThread.collapsibleState === languages.CommentThreadCollapsibleState.Expanded && !this._isExpanded)) {
			this.show(this.arrowPosition(this._commentThread.range), 2);
		} else if (this._commentThread.collapsibleState !== languages.CommentThreadCollapsibleState.Expanded) {
			this.hide();
		}
	}

	protected override _onWidth(widthInPixel: number): void {
		this._commentThreadWidget.layout(widthInPixel);
	}

	protected override _doLayout(heightInPixel: number, widthInPixel: number): void {
		this._commentThreadWidget.layout(widthInPixel);
	}

	async display(range: IRange | undefined, shouldReveal: boolean) {
		if (range) {
			this._commentGlyph = new CommentGlyphWidget(this.editor, range?.endLineNumber ?? -1);
			this._commentGlyph.setThreadState(this._commentThread.state);
			this._globalToDispose.add(this._commentGlyph.onDidChangeLineNumber(async e => {
				if (!this._commentThread.range) {
					return;
				}
				const shift = e - (this._commentThread.range.endLineNumber);
				const newRange = new Range(this._commentThread.range.startLineNumber + shift, this._commentThread.range.startColumn, this._commentThread.range.endLineNumber + shift, this._commentThread.range.endColumn);
				this._commentThread.range = newRange;
			}));
		}

		await this._commentThreadWidget.display(this.editor.getOption(EditorOption.lineHeight), shouldReveal);
		this._disposables.add(this._commentThreadWidget.onDidResize(dimension => {
			this._refresh(dimension);
		}));
		if (this._commentThread.collapsibleState === languages.CommentThreadCollapsibleState.Expanded) {
			this.show(this.arrowPosition(range), 2);
		}

		// If this is a new comment thread awaiting user input then we need to reveal it.
		if (shouldReveal) {
			this.makeVisible();
		}

		this.bindCommentThreadListeners();
	}

	private bindCommentThreadListeners() {
		this._commentThreadDisposables.push(this._commentThread.onDidChangeComments(async _ => {
			await this.update(this._commentThread);
		}));

		this._commentThreadDisposables.push(this._commentThread.onDidChangeCollapsibleState(state => {
			if (state === languages.CommentThreadCollapsibleState.Expanded && !this._isExpanded) {
				this.show(this.arrowPosition(this._commentThread.range), 2);
				this._commentThreadWidget.ensureFocusIntoNewEditingComment();
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
				this._initialCollapsibleState = state;
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
		if ((this._isExpanded === undefined) && (dimensions.height === 0) && (dimensions.width === 0)) {
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

			const capture = StableEditorScrollState.capture(this.editor);
			this._relayout(computedLinesNumber);
			capture.restore(this.editor);
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
		const glyphPosition = this._commentGlyph?.getPosition();
		let range = Range.isIRange(rangeOrPos) ? rangeOrPos : (rangeOrPos ? Range.fromPositions(rangeOrPos) : undefined);
		if (glyphPosition?.position && range && glyphPosition.position.lineNumber !== range.endLineNumber) {
			// The widget could have moved as a result of editor changes.
			// We need to try to calculate the new, more correct, range for the comment.
			const distance = glyphPosition.position.lineNumber - range.endLineNumber;
			range = new Range(range.startLineNumber + distance, range.startColumn, range.endLineNumber + distance, range.endColumn);
		}

		this._isExpanded = true;
		super.show(range ?? new Range(0, 0, 0, 0), heightInLines);
		this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Expanded;
		this._refresh(this._commentThreadWidget.getDimensions());
	}

	async collapseAndFocusRange() {
		if (await this.collapse(true) && Range.isIRange(this.commentThread.range) && isCodeEditor(this.editor)) {
			this.editor.setSelection(this.commentThread.range);
		}
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
