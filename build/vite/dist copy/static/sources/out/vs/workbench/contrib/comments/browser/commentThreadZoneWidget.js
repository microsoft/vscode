/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Color } from '../../../../base/common/color.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Range } from '../../../../editor/common/core/range.js';
import * as languages from '../../../../editor/common/languages.js';
import { ZoneWidget } from '../../../../editor/contrib/zoneWidget/browser/zoneWidget.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { CommentGlyphWidget } from './commentGlyphWidget.js';
import { ICommentService } from './commentService.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { CommentThreadWidget } from './commentThreadWidget.js';
import { commentThreadStateBackgroundColorVar, commentThreadStateColorVar, getCommentThreadStateBorderColor } from './commentColors.js';
import { peekViewBorder } from '../../../../editor/contrib/peekView/browser/peekView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { StableEditorScrollState } from '../../../../editor/browser/stableEditorScroll.js';
import Severity from '../../../../base/common/severity.js';
import * as nls from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
function getCommentThreadWidgetStateColor(thread, theme) {
    return getCommentThreadStateBorderColor(thread, theme) ?? theme.getColor(peekViewBorder);
}
/**
 * Check if a comment thread has any draft comments
 */
function commentThreadHasDraft(commentThread) {
    const comments = commentThread.comments;
    if (!comments) {
        return false;
    }
    return comments.some(comment => comment.state === languages.CommentState.Draft);
}
export var CommentWidgetFocus;
(function (CommentWidgetFocus) {
    CommentWidgetFocus[CommentWidgetFocus["None"] = 0] = "None";
    CommentWidgetFocus[CommentWidgetFocus["Widget"] = 1] = "Widget";
    CommentWidgetFocus[CommentWidgetFocus["Editor"] = 2] = "Editor";
})(CommentWidgetFocus || (CommentWidgetFocus = {}));
export function parseMouseDownInfoFromEvent(e) {
    const range = e.target.range;
    if (!range) {
        return null;
    }
    if (!e.event.leftButton) {
        return null;
    }
    if (e.target.type !== 4 /* MouseTargetType.GUTTER_LINE_DECORATIONS */) {
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
export function isMouseUpEventDragFromMouseDown(mouseDownInfo, e) {
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
export function isMouseUpEventMatchMouseDown(mouseDownInfo, e) {
    if (!mouseDownInfo) {
        return null;
    }
    const { lineNumber } = mouseDownInfo;
    const range = e.target.range;
    if (!range || range.startLineNumber !== lineNumber) {
        return null;
    }
    if (e.target.type !== 4 /* MouseTargetType.GUTTER_LINE_DECORATIONS */) {
        return null;
    }
    return lineNumber;
}
let ReviewZoneWidget = class ReviewZoneWidget extends ZoneWidget {
    get uniqueOwner() {
        return this._uniqueOwner;
    }
    get commentThread() {
        return this._commentThread;
    }
    get expanded() {
        return this._isExpanded;
    }
    constructor(editor, _uniqueOwner, _commentThread, _pendingComment, _pendingEdits, instantiationService, themeService, commentService, contextKeyService, configurationService, dialogService) {
        super(editor, { keepEditorSelection: true, isAccessible: true, showArrow: !!_commentThread.range });
        this._uniqueOwner = _uniqueOwner;
        this._commentThread = _commentThread;
        this._pendingComment = _pendingComment;
        this._pendingEdits = _pendingEdits;
        this.themeService = themeService;
        this.commentService = commentService;
        this.configurationService = configurationService;
        this.dialogService = dialogService;
        this._onDidClose = new Emitter();
        this._onDidCreateThread = new Emitter();
        this._onDidChangeExpandedState = new Emitter();
        this._globalToDispose = new DisposableStore();
        this._commentThreadDisposables = [];
        this._contextKeyService = this._globalToDispose.add(contextKeyService.createScoped(this.domNode));
        this._scopedInstantiationService = this._globalToDispose.add(instantiationService.createChild(new ServiceCollection([IContextKeyService, this._contextKeyService])));
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
            if (e.hasChanged(59 /* EditorOption.fontInfo */)) {
                this._applyTheme();
            }
        }));
        this._applyTheme();
    }
    get onDidClose() {
        return this._onDidClose.event;
    }
    get onDidCreateThread() {
        return this._onDidCreateThread.event;
    }
    get onDidChangeExpandedState() {
        return this._onDidChangeExpandedState.event;
    }
    getPosition() {
        if (this.position) {
            return this.position;
        }
        if (this._commentGlyph) {
            return this._commentGlyph.getPosition().position ?? undefined;
        }
        return undefined;
    }
    revealRange() {
        // we don't do anything here as we always do the reveal ourselves.
    }
    reveal(commentUniqueId, focus = CommentWidgetFocus.None) {
        this.makeVisible(commentUniqueId, focus);
        const comment = this._commentThread.comments?.find(comment => comment.uniqueIdInThread === commentUniqueId) ?? this._commentThread.comments?.[0];
        this.commentService.setActiveCommentAndThread(this.uniqueOwner, { thread: this._commentThread, comment });
    }
    _expandAndShowZoneWidget() {
        if (!this._isExpanded) {
            this.show(this.arrowPosition(this._commentThread.range), 2);
        }
    }
    _setFocus(commentUniqueId, focus) {
        if (focus === CommentWidgetFocus.Widget) {
            this._commentThreadWidget.focus(commentUniqueId);
        }
        else if (focus === CommentWidgetFocus.Editor) {
            this._commentThreadWidget.focusCommentEditor();
        }
    }
    _goToComment(commentUniqueId, focus) {
        const height = this.editor.getLayoutInfo().height;
        const coords = this._commentThreadWidget.getCommentCoords(commentUniqueId);
        if (coords) {
            let scrollTop = 1;
            if (this._commentThread.range) {
                const commentThreadCoords = coords.thread;
                const commentCoords = coords.comment;
                scrollTop = this.editor.getTopForLineNumber(this._commentThread.range.startLineNumber) - height / 2 + commentCoords.top - commentThreadCoords.top;
            }
            this.editor.setScrollTop(scrollTop);
            this._setFocus(commentUniqueId, focus);
        }
        else {
            this._goToThread(focus);
        }
    }
    _goToThread(focus) {
        const rangeToReveal = this._commentThread.range
            ? new Range(this._commentThread.range.startLineNumber, this._commentThread.range.startColumn, this._commentThread.range.endLineNumber + 1, 1)
            : new Range(1, 1, 1, 1);
        this.editor.revealRangeInCenter(rangeToReveal);
        this._setFocus(undefined, focus);
    }
    makeVisible(commentUniqueId, focus = CommentWidgetFocus.None) {
        this._expandAndShowZoneWidget();
        if (commentUniqueId !== undefined) {
            this._goToComment(commentUniqueId, focus);
        }
        else {
            this._goToThread(focus);
        }
    }
    getPendingComments() {
        return {
            newComment: this._commentThreadWidget.getPendingComment(),
            edits: this._commentThreadWidget.getPendingEdits()
        };
    }
    setPendingComment(pending) {
        this._pendingComment = pending;
        this.expand();
        this._commentThreadWidget.setPendingComment(pending);
    }
    _fillContainer(container) {
        this.setCssClass('review-widget');
        this._commentThreadWidget = this._scopedInstantiationService.createInstance((CommentThreadWidget), container, this.editor, this._uniqueOwner, this.editor.getModel().uri, this._contextKeyService, this._scopedInstantiationService, this._commentThread, this._pendingComment, this._pendingEdits, { context: this.editor, }, this._commentOptions, {
            actionRunner: async () => {
                if (!this._commentThread.comments || !this._commentThread.comments.length) {
                    const newPosition = this.getPosition();
                    if (newPosition) {
                        const originalRange = this._commentThread.range;
                        if (!originalRange) {
                            return;
                        }
                        let range;
                        if (newPosition.lineNumber !== originalRange.endLineNumber) {
                            // The widget could have moved as a result of editor changes.
                            // We need to try to calculate the new, more correct, range for the comment.
                            const distance = newPosition.lineNumber - originalRange.endLineNumber;
                            range = new Range(originalRange.startLineNumber + distance, originalRange.startColumn, originalRange.endLineNumber + distance, originalRange.endColumn);
                        }
                        else {
                            range = new Range(originalRange.startLineNumber, originalRange.startColumn, originalRange.endLineNumber, originalRange.endColumn);
                        }
                        await this.commentService.updateCommentThreadTemplate(this.uniqueOwner, this._commentThread.commentThreadHandle, range);
                    }
                }
            },
            collapse: () => {
                return this.collapse(true);
            }
        });
        this._disposables.add(this._commentThreadWidget);
    }
    arrowPosition(range) {
        if (!range) {
            return undefined;
        }
        // Arrow on top edge of zone widget will be at the start of the line if range is multi-line, else at midpoint of range (rounding rightwards)
        return { lineNumber: range.endLineNumber, column: range.endLineNumber === range.startLineNumber ? (range.startColumn + range.endColumn + 1) / 2 : 1 };
    }
    deleteCommentThread() {
        this.dispose();
        this.commentService.disposeCommentThread(this.uniqueOwner, this._commentThread.threadId);
    }
    doCollapse() {
        this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Collapsed;
    }
    async collapse(confirm = false) {
        if (!confirm || (await this.confirmCollapse())) {
            this.doCollapse();
            return true;
        }
        else {
            return false;
        }
    }
    async confirmCollapse() {
        const confirmSetting = this.configurationService.getValue('comments.thread.confirmOnCollapse');
        if (confirmSetting === 'whenHasUnsubmittedComments' && this._commentThreadWidget.hasUnsubmittedComments) {
            const result = await this.dialogService.confirm({
                message: nls.localize('confirmCollapse', "Collapsing this comment thread will discard unsubmitted comments. Are you sure you want to discard these comments?"),
                primaryButton: nls.localize('discard', "Discard"),
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
    expand(setActive) {
        this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Expanded;
        if (setActive) {
            this.commentService.setActiveCommentAndThread(this.uniqueOwner, { thread: this._commentThread });
        }
    }
    getGlyphPosition() {
        if (this._commentGlyph) {
            return this._commentGlyph.getPosition().position.lineNumber;
        }
        return 0;
    }
    async update(commentThread) {
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
            const hasDraft = commentThreadHasDraft(commentThread);
            this._commentGlyph.setThreadState(commentThread.state, hasDraft);
            if (this._commentGlyph.getPosition().position.lineNumber !== lineNumber) {
                shouldMoveWidget = true;
                this._commentGlyph.setLineNumber(lineNumber);
            }
        }
        if ((shouldMoveWidget && this._isExpanded) || (this._commentThread.collapsibleState === languages.CommentThreadCollapsibleState.Expanded && !this._isExpanded)) {
            this.show(this.arrowPosition(this._commentThread.range), 2);
        }
        else if (this._commentThread.collapsibleState !== languages.CommentThreadCollapsibleState.Expanded) {
            this.hide();
        }
    }
    _onWidth(widthInPixel) {
        this._commentThreadWidget.layout(widthInPixel);
    }
    _doLayout(heightInPixel, widthInPixel) {
        this._commentThreadWidget.layout(widthInPixel);
    }
    async display(range, shouldReveal) {
        if (range) {
            this._commentGlyph = new CommentGlyphWidget(this.editor, range?.endLineNumber ?? -1);
            const hasDraft = commentThreadHasDraft(this._commentThread);
            this._commentGlyph.setThreadState(this._commentThread.state, hasDraft);
            this._globalToDispose.add(this._commentGlyph.onDidChangeLineNumber(async (e) => {
                if (!this._commentThread.range) {
                    return;
                }
                const shift = e - (this._commentThread.range.endLineNumber);
                const newRange = new Range(this._commentThread.range.startLineNumber + shift, this._commentThread.range.startColumn, this._commentThread.range.endLineNumber + shift, this._commentThread.range.endColumn);
                this._commentThread.range = newRange;
            }));
        }
        await this._commentThreadWidget.display(this.editor.getOption(75 /* EditorOption.lineHeight */), shouldReveal);
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
    bindCommentThreadListeners() {
        this._commentThreadDisposables.push(this._commentThread.onDidChangeComments(async (_) => {
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
            const borderColor = getCommentThreadWidgetStateColor(this._commentThread.state, this.themeService.getColorTheme()) || Color.transparent;
            this.style({
                frameColor: borderColor,
                arrowColor: borderColor,
            });
            this.container?.style.setProperty(commentThreadStateColorVar, `${borderColor}`);
            this.container?.style.setProperty(commentThreadStateBackgroundColorVar, `${borderColor.transparent(.1)}`);
        }));
    }
    async submitComment() {
        return this._commentThreadWidget.submitComment();
    }
    _refresh(dimensions) {
        if ((this._isExpanded === undefined) && (dimensions.height === 0) && (dimensions.width === 0)) {
            this.commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Collapsed;
            return;
        }
        if (this._isExpanded) {
            this._commentThreadWidget.layout();
            const headHeight = Math.ceil(this.editor.getOption(75 /* EditorOption.lineHeight */) * 1.2);
            const lineHeight = this.editor.getOption(75 /* EditorOption.lineHeight */);
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
    _applyTheme() {
        const borderColor = getCommentThreadWidgetStateColor(this._commentThread.state, this.themeService.getColorTheme()) || Color.transparent;
        this.style({
            arrowColor: borderColor,
            frameColor: borderColor
        });
        const fontInfo = this.editor.getOption(59 /* EditorOption.fontInfo */);
        this._commentThreadWidget.applyTheme(fontInfo);
    }
    show(rangeOrPos, heightInLines) {
        const glyphPosition = this._commentGlyph?.getPosition();
        let range = Range.isIRange(rangeOrPos) ? rangeOrPos : (rangeOrPos ? Range.fromPositions(rangeOrPos) : undefined);
        if (glyphPosition?.position && range && glyphPosition.position.lineNumber !== range.endLineNumber) {
            // The widget could have moved as a result of editor changes.
            // We need to try to calculate the new, more correct, range for the comment.
            const distance = glyphPosition.position.lineNumber - range.endLineNumber;
            range = new Range(range.startLineNumber + distance, range.startColumn, range.endLineNumber + distance, range.endColumn);
        }
        const wasExpanded = this._isExpanded;
        this._isExpanded = true;
        super.show(range ?? new Range(0, 0, 0, 0), heightInLines);
        this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Expanded;
        this._refresh(this._commentThreadWidget.getDimensions());
        if (!wasExpanded) {
            this._onDidChangeExpandedState.fire(true);
        }
    }
    async collapseAndFocusRange() {
        if (await this.collapse(true) && Range.isIRange(this.commentThread.range) && isCodeEditor(this.editor)) {
            this.editor.setSelection(this.commentThread.range);
        }
    }
    hide() {
        if (this._isExpanded) {
            this._isExpanded = false;
            // Focus the container so that the comment editor will be blurred before it is hidden
            if (this.editor.hasWidgetFocus()) {
                this.editor.focus();
            }
            if (!this._commentThread.comments || !this._commentThread.comments.length) {
                this.deleteCommentThread();
            }
            this._onDidChangeExpandedState.fire(false);
        }
        super.hide();
    }
    dispose() {
        super.dispose();
        if (this._commentGlyph) {
            this._commentGlyph.dispose();
            this._commentGlyph = undefined;
        }
        this._globalToDispose.dispose();
        this._commentThreadDisposables.forEach(global => global.dispose());
        this._onDidClose.fire(undefined);
        this._onDidClose.dispose();
        this._onDidCreateThread.dispose();
        this._onDidChangeExpandedState.dispose();
    }
};
ReviewZoneWidget = __decorate([
    __param(5, IInstantiationService),
    __param(6, IThemeService),
    __param(7, ICommentService),
    __param(8, IContextKeyService),
    __param(9, IConfigurationService),
    __param(10, IDialogService)
], ReviewZoneWidget);
export { ReviewZoneWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWVudFRocmVhZFpvbmVXaWRnZXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jb21tZW50cy9icm93c2VyL2NvbW1lbnRUaHJlYWRab25lV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFlLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3BGLE9BQU8sRUFBa0MsWUFBWSxFQUFtQixNQUFNLDZDQUE2QyxDQUFDO0FBRTVILE9BQU8sRUFBVSxLQUFLLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN4RSxPQUFPLEtBQUssU0FBUyxNQUFNLHdDQUF3QyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUN6RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQWUsYUFBYSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDL0YsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDN0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBR3RELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQ25HLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxvQ0FBb0MsRUFBRSwwQkFBMEIsRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLG9CQUFv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