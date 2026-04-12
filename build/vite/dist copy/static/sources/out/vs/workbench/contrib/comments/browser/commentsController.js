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
import { Action } from '../../../../base/common/actions.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { findFirstIdxMonotonousOrArrLen } from '../../../../base/common/arraysFind.js';
import { createCancelablePromise, Delayer } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, dispose } from '../../../../base/common/lifecycle.js';
import './media/review.css';
import { isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { EditorType } from '../../../../editor/common/editorCommon.js';
import { ModelDecorationOptions, TextModel } from '../../../../editor/common/model/textModel.js';
import * as languages from '../../../../editor/common/languages.js';
import * as nls from '../../../../nls.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { CommentGlyphWidget } from './commentGlyphWidget.js';
import { ICommentService } from './commentService.js';
import { CommentWidgetFocus, isMouseUpEventDragFromMouseDown, parseMouseDownInfoFromEvent, ReviewZoneWidget } from './commentThreadZoneWidget.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { EmbeddedCodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { COMMENTS_VIEW_ID } from './commentsTreeViewer.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { COMMENTS_SECTION } from '../common/commentsConfiguration.js';
import { COMMENTEDITOR_DECORATION_KEY } from './commentReply.js';
import { Emitter } from '../../../../base/common/event.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { CommentThreadRangeDecorator } from './commentThreadRangeDecorator.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { CommentContextKeys } from '../common/commentContextKeys.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { URI } from '../../../../base/common/uri.js';
import { threadHasMeaningfulComments } from './commentsModel.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
export const ID = 'editor.contrib.review';
class CommentingRangeDecoration {
    get id() {
        return this._decorationId;
    }
    set id(id) {
        this._decorationId = id;
    }
    get range() {
        return {
            startLineNumber: this._startLineNumber, startColumn: 1,
            endLineNumber: this._endLineNumber, endColumn: 1
        };
    }
    constructor(_editor, _ownerId, _extensionId, _label, _range, options, commentingRangesInfo, isHover = false) {
        this._editor = _editor;
        this._ownerId = _ownerId;
        this._extensionId = _extensionId;
        this._label = _label;
        this._range = _range;
        this.options = options;
        this.commentingRangesInfo = commentingRangesInfo;
        this.isHover = isHover;
        this._startLineNumber = _range.startLineNumber;
        this._endLineNumber = _range.endLineNumber;
    }
    getCommentAction() {
        return {
            extensionId: this._extensionId,
            label: this._label,
            ownerId: this._ownerId,
            commentingRangesInfo: this.commentingRangesInfo
        };
    }
    getOriginalRange() {
        return this._range;
    }
    getActiveRange() {
        return this.id ? this._editor.getModel().getDecorationRange(this.id) : undefined;
    }
}
class CommentingRangeDecorator {
    static { this.description = 'commenting-range-decorator'; }
    constructor() {
        this.commentingRangeDecorations = [];
        this.decorationIds = [];
        this._lastHover = -1;
        this._onDidChangeDecorationsCount = new Emitter();
        this.onDidChangeDecorationsCount = this._onDidChangeDecorationsCount.event;
        const decorationOptions = {
            description: CommentingRangeDecorator.description,
            isWholeLine: true,
            linesDecorationsClassName: 'comment-range-glyph comment-diff-added'
        };
        this.decorationOptions = ModelDecorationOptions.createDynamic(decorationOptions);
        const hoverDecorationOptions = {
            description: CommentingRangeDecorator.description,
            isWholeLine: true,
            linesDecorationsClassName: `comment-range-glyph line-hover`
        };
        this.hoverDecorationOptions = ModelDecorationOptions.createDynamic(hoverDecorationOptions);
        const multilineDecorationOptions = {
            description: CommentingRangeDecorator.description,
            isWholeLine: true,
            linesDecorationsClassName: `comment-range-glyph multiline-add`
        };
        this.multilineDecorationOptions = ModelDecorationOptions.createDynamic(multilineDecorationOptions);
    }
    updateHover(hoverLine) {
        if (this._editor && this._infos && (hoverLine !== this._lastHover)) {
            this._doUpdate(this._editor, this._infos, hoverLine);
        }
        this._lastHover = hoverLine ?? -1;
    }
    updateSelection(cursorLine, range = new Range(0, 0, 0, 0)) {
        this._lastSelection = range.isEmpty() ? undefined : range;
        this._lastSelectionCursor = range.isEmpty() ? undefined : cursorLine;
        // Some scenarios:
        // Selection is made. Emphasis should show on the drag/selection end location.
        // Selection is made, then user clicks elsewhere. We should still show the decoration.
        if (this._editor && this._infos) {
            this._doUpdate(this._editor, this._infos, cursorLine, range);
        }
    }
    update(editor, commentInfos, cursorLine, range) {
        if (editor) {
            this._editor = editor;
            this._infos = commentInfos;
            this._doUpdate(editor, commentInfos, cursorLine, range);
        }
    }
    _lineHasThread(editor, lineRange) {
        return editor.getDecorationsInRange(lineRange)?.find(decoration => decoration.options.description === CommentGlyphWidget.description);
    }
    _doUpdate(editor, commentInfos, emphasisLine = -1, selectionRange = this._lastSelection) {
        const model = editor.getModel();
        if (!model) {
            return;
        }
        // If there's still a selection, use that.
        emphasisLine = this._lastSelectionCursor ?? emphasisLine;
        const commentingRangeDecorations = [];
        for (const info of commentInfos) {
            info.commentingRanges.ranges.forEach(range => {
                const rangeObject = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
                let intersectingSelectionRange = selectionRange ? rangeObject.intersectRanges(selectionRange) : undefined;
                if ((selectionRange && (emphasisLine >= 0) && intersectingSelectionRange)
                    // If there's only one selection line, then just drop into the else if and show an emphasis line.
                    && !((intersectingSelectionRange.startLineNumber === intersectingSelectionRange.endLineNumber)
                        && (emphasisLine === intersectingSelectionRange.startLineNumber))) {
                    // The emphasisLine should be within the commenting range, even if the selection range stretches
                    // outside of the commenting range.
                    // Clip the emphasis and selection ranges to the commenting range
                    let intersectingEmphasisRange;
                    if (emphasisLine <= intersectingSelectionRange.startLineNumber) {
                        intersectingEmphasisRange = intersectingSelectionRange.collapseToStart();
                        intersectingSelectionRange = new Range(intersectingSelectionRange.startLineNumber + 1, 1, intersectingSelectionRange.endLineNumber, 1);
                    }
                    else {
                        intersectingEmphasisRange = new Range(intersectingSelectionRange.endLineNumber, 1, intersectingSelectionRange.endLineNumber, 1);
                        intersectingSelectionRange = new Range(intersectingSelectionRange.startLineNumber, 1, intersectingSelectionRange.endLineNumber - 1, 1);
                    }
                    commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, intersectingSelectionRange, this.multilineDecorationOptions, info.commentingRanges, true));
                    if (!this._lineHasThread(editor, intersectingEmphasisRange)) {
                        commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, intersectingEmphasisRange, this.hoverDecorationOptions, info.commentingRanges, true));
                    }
                    const beforeRangeEndLine = Math.min(intersectingEmphasisRange.startLineNumber, intersectingSelectionRange.startLineNumber) - 1;
                    const hasBeforeRange = rangeObject.startLineNumber <= beforeRangeEndLine;
                    const afterRangeStartLine = Math.max(intersectingEmphasisRange.endLineNumber, intersectingSelectionRange.endLineNumber) + 1;
                    const hasAfterRange = rangeObject.endLineNumber >= afterRangeStartLine;
                    if (hasBeforeRange) {
                        const beforeRange = new Range(range.startLineNumber, 1, beforeRangeEndLine, 1);
                        commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, beforeRange, this.decorationOptions, info.commentingRanges, true));
                    }
                    if (hasAfterRange) {
                        const afterRange = new Range(afterRangeStartLine, 1, range.endLineNumber, 1);
                        commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, afterRange, this.decorationOptions, info.commentingRanges, true));
                    }
                }
                else if ((rangeObject.startLineNumber <= emphasisLine) && (emphasisLine <= rangeObject.endLineNumber)) {
                    if (rangeObject.startLineNumber < emphasisLine) {
                        const beforeRange = new Range(range.startLineNumber, 1, emphasisLine - 1, 1);
                        commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, beforeRange, this.decorationOptions, info.commentingRanges, true));
                    }
                    const emphasisRange = new Range(emphasisLine, 1, emphasisLine, 1);
                    if (!this._lineHasThread(editor, emphasisRange)) {
                        commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, emphasisRange, this.hoverDecorationOptions, info.commentingRanges, true));
                    }
                    if (emphasisLine < rangeObject.endLineNumber) {
                        const afterRange = new Range(emphasisLine + 1, 1, range.endLineNumber, 1);
                        commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, afterRange, this.decorationOptions, info.commentingRanges, true));
                    }
                }
                else {
                    commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, range, this.decorationOptions, info.commentingRanges));
                }
            });
        }
        editor.changeDecorations((accessor) => {
            this.decorationIds = accessor.deltaDecorations(this.decorationIds, commentingRangeDecorations);
            commentingRangeDecorations.forEach((decoration, index) => decoration.id = this.decorationIds[index]);
        });
        const rangesDifference = this.commentingRangeDecorations.length - commentingRangeDecorations.length;
        this.commentingRangeDecorations = commentingRangeDecorations;
        if (rangesDifference) {
            this._onDidChangeDecorationsCount.fire(this.commentingRangeDecorations.length);
        }
    }
    areRangesIntersectingOrTouchingByLine(a, b) {
        // Check if `a` is before `b`
        if (a.endLineNumber < (b.startLineNumber - 1)) {
            return false;
        }
        // Check if `b` is before `a`
        if ((b.endLineNumber + 1) < a.startLineNumber) {
            return false;
        }
        // These ranges must intersect
        return true;
    }
    getMatchedCommentAction(commentRange) {
        if (commentRange === undefined) {
            const foundInfos = this._infos?.filter(info => info.commentingRanges.fileComments);
            if (foundInfos) {
                return foundInfos.map(foundInfo => {
                    return {
                        action: {
                            ownerId: foundInfo.uniqueOwner,
                            extensionId: foundInfo.extensionId,
                            label: foundInfo.label,
                            commentingRangesInfo: foundInfo.commentingRanges
                        }
                    };
                });
            }
            return [];
        }
        // keys is ownerId
        const foundHoverActions = new Map();
        for (const decoration of this.commentingRangeDecorations) {
            const range = decoration.getActiveRange();
            if (range && this.areRangesIntersectingOrTouchingByLine(range, commentRange)) {
                // We can have several commenting ranges that match from the same uniqueOwner because of how
                // the line hover and selection decoration is done.
                // The ranges must be merged so that we can see if the new commentRange fits within them.
                const action = decoration.getCommentAction();
                const alreadyFoundInfo = foundHoverActions.get(action.ownerId);
                if (alreadyFoundInfo?.action.commentingRangesInfo === action.commentingRangesInfo) {
                    // Merge ranges.
                    const newRange = new Range(range.startLineNumber < alreadyFoundInfo.range.startLineNumber ? range.startLineNumber : alreadyFoundInfo.range.startLineNumber, range.startColumn < alreadyFoundInfo.range.startColumn ? range.startColumn : alreadyFoundInfo.range.startColumn, range.endLineNumber > alreadyFoundInfo.range.endLineNumber ? range.endLineNumber : alreadyFoundInfo.range.endLineNumber, range.endColumn > alreadyFoundInfo.range.endColumn ? range.endColumn : alreadyFoundInfo.range.endColumn);
                    foundHoverActions.set(action.ownerId, { range: newRange, action });
                }
                else {
                    foundHoverActions.set(action.ownerId, { range, action });
                }
            }
        }
        const seenOwners = new Set();
        return Array.from(foundHoverActions.values()).filter(action => {
            if (seenOwners.has(action.action.ownerId)) {
                return false;
            }
            else {
                seenOwners.add(action.action.ownerId);
                return true;
            }
        });
    }
    getNearestCommentingRange(findPosition, reverse) {
        let findPositionContainedWithin;
        let decorations;
        if (reverse) {
            decorations = [];
            for (let i = this.commentingRangeDecorations.length - 1; i >= 0; i--) {
                decorations.push(this.commentingRangeDecorations[i]);
            }
        }
        else {
            decorations = this.commentingRangeDecorations;
        }
        for (const decoration of decorations) {
            const range = decoration.getActiveRange();
            if (!range) {
                continue;
            }
            if (findPositionContainedWithin && this.areRangesIntersectingOrTouchingByLine(range, findPositionContainedWithin)) {
                findPositionContainedWithin = Range.plusRange(findPositionContainedWithin, range);
                continue;
            }
            if (range.startLineNumber <= findPosition.lineNumber && findPosition.lineNumber <= range.endLineNumber) {
                findPositionContainedWithin = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
                continue;
            }
            if (!reverse && range.endLineNumber < findPosition.lineNumber) {
                continue;
            }
            if (reverse && range.startLineNumber > findPosition.lineNumber) {
                continue;
            }
            return range;
        }
        return (decorations.length > 0 ? (decorations[0].getActiveRange() ?? undefined) : undefined);
    }
    dispose() {
        this._onDidChangeDecorationsCount.dispose();
        this.commentingRangeDecorations = [];
    }
}
/**
* Navigate to the next or previous comment in the current thread.
* @param type
*/
export function moveToNextCommentInThread(commentInfo, type) {
    if (!commentInfo?.comment || !commentInfo?.thread?.comments) {
        return;
    }
    const currentIndex = commentInfo.thread.comments?.indexOf(commentInfo.comment);
    if (currentIndex === undefined || currentIndex < 0) {
        return;
    }
    if (type === 'previous' && currentIndex === 0) {
        return;
    }
    if (type === 'next' && currentIndex === commentInfo.thread.comments.length - 1) {
        return;
    }
    const comment = commentInfo.thread.comments?.[type === 'previous' ? currentIndex - 1 : currentIndex + 1];
    if (!comment) {
        return;
    }
    return {
        ...commentInfo,
        comment,
    };
}
export function revealCommentThread(commentService, editorService, uriIdentityService, commentThread, comment, focusReply, pinned, preserveFocus, sideBySide) {
    if (!commentThread.resource) {
        return;
    }
    if (!commentService.isCommentingEnabled) {
        commentService.enableCommenting(true);
    }
    const range = commentThread.range;
    const focus = focusReply ? CommentWidgetFocus.Editor : (preserveFocus ? CommentWidgetFocus.None : CommentWidgetFocus.Widget);
    const activeEditor = editorService.activeTextEditorControl;
    // If the active editor is a diff editor where one of the sides has the comment,
    // then we try to reveal the comment in the diff editor.
    const currentActiveResources = isDiffEditor(activeEditor) ? [activeEditor.getOriginalEditor(), activeEditor.getModifiedEditor()]
        : (activeEditor ? [activeEditor] : []);
    const threadToReveal = commentThread.threadId;
    const commentToReveal = comment?.uniqueIdInThread;
    const resource = URI.parse(commentThread.resource);
    for (const editor of currentActiveResources) {
        const model = editor.getModel();
        if ((model instanceof TextModel) && uriIdentityService.extUri.isEqual(resource, model.uri)) {
            if (threadToReveal && isCodeEditor(editor)) {
                const controller = CommentController.get(editor);
                controller?.revealCommentThread(threadToReveal, commentToReveal, true, focus);
            }
            return;
        }
    }
    editorService.openEditor({
        resource,
        options: {
            pinned: pinned,
            preserveFocus: preserveFocus,
            selection: range ?? new Range(1, 1, 1, 1)
        }
    }, sideBySide ? SIDE_GROUP : ACTIVE_GROUP).then(editor => {
        if (editor) {
            const control = editor.getControl();
            if (threadToReveal && isCodeEditor(control)) {
                const controller = CommentController.get(control);
                controller?.revealCommentThread(threadToReveal, commentToReveal, true, focus);
            }
        }
    });
}
let CommentController = class CommentController extends Disposable {
    constructor(editor, commentService, instantiationService, codeEditorService, contextMenuService, quickInputService, viewsService, configurationService, contextKeyService, editorService, keybindingService, accessibilityService, notificationService) {
        super();
        this.commentService = commentService;
        this.instantiationService = instantiationService;
        this.codeEditorService = codeEditorService;
        this.contextMenuService = contextMenuService;
        this.quickInputService = quickInputService;
        this.viewsService = viewsService;
        this.configurationService = configurationService;
        this.editorService = editorService;
        this.keybindingService = keybindingService;
        this.accessibilityService = accessibilityService;
        this.notificationService = notificationService;
        this.localToDispose = this._register(new DisposableStore());
        this.mouseDownInfo = null;
        this._commentingRangeSpaceReserved = false;
        this._commentingRangeAmountReserved = 0;
        this._emptyThreadsToAddQueue = [];
        this._inProcessContinueOnComments = new Map();
        this._editorDisposables = [];
        this._hasRespondedToEditorChange = false;
        this._commentInfos = [];
        this._commentWidgets = [];
        this._pendingNewCommentCache = {};
        this._pendingEditsCache = {};
        this._computePromise = null;
        this._activeCursorHasCommentingRange = CommentContextKeys.activeCursorHasCommentingRange.bindTo(contextKeyService);
        this._activeCursorHasComment = CommentContextKeys.activeCursorHasComment.bindTo(contextKeyService);
        this._activeEditorHasCommentingRange = CommentContextKeys.activeEditorHasCommentingRange.bindTo(contextKeyService);
        this._commentWidgetVisible = CommentContextKeys.commentWidgetVisible.bindTo(contextKeyService);
        if (editor instanceof EmbeddedCodeEditorWidget) {
            return;
        }
        this.editor = editor;
        this._commentingRangeDecorator = this._register(new CommentingRangeDecorator());
        this._register(this._commentingRangeDecorator.onDidChangeDecorationsCount(count => {
            if (count === 0) {
                this.clearEditorListeners();
            }
            else if (this._editorDisposables.length === 0) {
                this.registerEditorListeners();
            }
        }));
        this._register(this._commentThreadRangeDecorator = new CommentThreadRangeDecorator(this.commentService));
        this._register(this.commentService.onDidDeleteDataProvider(ownerId => {
            if (ownerId) {
                delete this._pendingNewCommentCache[ownerId];
                delete this._pendingEditsCache[ownerId];
            }
            else {
                this._pendingNewCommentCache = {};
                this._pendingEditsCache = {};
            }
            this.beginCompute();
        }));
        this._register(this.commentService.onDidSetDataProvider(_ => this.beginComputeAndHandleEditorChange()));
        this._register(this.commentService.onDidUpdateCommentingRanges(_ => this.beginComputeAndHandleEditorChange()));
        this._register(this.commentService.onDidSetResourceCommentInfos(async (e) => {
            const editorURI = this.editor && this.editor.hasModel() && this.editor.getModel().uri;
            if (editorURI && editorURI.toString() === e.resource.toString()) {
                await this.setComments(e.commentInfos.filter(commentInfo => commentInfo !== null));
            }
        }));
        this._register(this.commentService.onDidChangeCommentingEnabled(e => {
            if (e) {
                this.registerEditorListeners();
                this.beginCompute();
            }
            else {
                this.tryUpdateReservedSpace();
                this.clearEditorListeners();
                this._commentingRangeDecorator.update(this.editor, []);
                this._commentThreadRangeDecorator.update(this.editor, []);
                dispose(this._commentWidgets);
                this._commentWidgets = [];
            }
        }));
        this._register(this.editor.onWillChangeModel(e => this.onWillChangeModel(e)));
        this._register(this.editor.onDidChangeModel(_ => this.onModelChanged()));
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('diffEditor.renderSideBySide')) {
                this.beginCompute();
            }
        }));
        this.onModelChanged();
        this._register(this.codeEditorService.registerDecorationType('comment-controller', COMMENTEDITOR_DECORATION_KEY, {}));
        this._register(this.commentService.registerContinueOnCommentProvider({
            provideContinueOnComments: () => {
                const pendingComments = [];
                if (this._commentWidgets) {
                    for (const zone of this._commentWidgets) {
                        const zonePendingComments = zone.getPendingComments();
                        const pendingNewComment = zonePendingComments.newComment;
                        if (!pendingNewComment) {
                            continue;
                        }
                        let lastCommentBody;
                        if (zone.commentThread.comments && zone.commentThread.comments.length) {
                            const lastComment = zone.commentThread.comments[zone.commentThread.comments.length - 1];
                            if (typeof lastComment.body === 'string') {
                                lastCommentBody = lastComment.body;
                            }
                            else {
                                lastCommentBody = lastComment.body.value;
                            }
                        }
                        if (pendingNewComment.body !== lastCommentBody) {
                            pendingComments.push({
                                uniqueOwner: zone.uniqueOwner,
                                uri: zone.editor.getModel().uri,
                                range: zone.commentThread.range,
                                comment: pendingNewComment,
                                isReply: (zone.commentThread.comments !== undefined) && (zone.commentThread.comments.length > 0)
                            });
                        }
                    }
                }
                return pendingComments;
            }
        }));
    }
    registerEditorListeners() {
        this._editorDisposables = [];
        if (!this.editor) {
            return;
        }
        this._editorDisposables.push(this.editor.onMouseMove(e => this.onEditorMouseMove(e)));
        this._editorDisposables.push(this.editor.onMouseLeave(() => this.onEditorMouseLeave()));
        this._editorDisposables.push(this.editor.onDidChangeCursorPosition(e => this.onEditorChangeCursorPosition(e.position)));
        this._editorDisposables.push(this.editor.onDidFocusEditorWidget(() => this.onEditorChangeCursorPosition(this.editor?.getPosition() ?? null)));
        this._editorDisposables.push(this.editor.onDidChangeCursorSelection(e => this.onEditorChangeCursorSelection(e)));
        this._editorDisposables.push(this.editor.onDidBlurEditorWidget(() => this.onEditorChangeCursorSelection()));
    }
    clearEditorListeners() {
        dispose(this._editorDisposables);
        this._editorDisposables = [];
    }
    onEditorMouseLeave() {
        this._commentingRangeDecorator.updateHover();
    }
    onEditorMouseMove(e) {
        const position = e.target.position?.lineNumber;
        if (e.event.leftButton.valueOf() && position && this.mouseDownInfo) {
            this._commentingRangeDecorator.updateSelection(position, new Range(this.mouseDownInfo.lineNumber, 1, position, 1));
        }
        else {
            this._commentingRangeDecorator.updateHover(position);
        }
    }
    onEditorChangeCursorSelection(e) {
        const position = this.editor?.getPosition()?.lineNumber;
        if (position) {
            this._commentingRangeDecorator.updateSelection(position, e?.selection);
        }
    }
    onEditorChangeCursorPosition(e) {
        if (!e) {
            return;
        }
        const range = Range.fromPositions(e, { column: -1, lineNumber: e.lineNumber });
        const decorations = this.editor?.getDecorationsInRange(range);
        let hasCommentingRange = false;
        if (decorations) {
            for (const decoration of decorations) {
                if (decoration.options.description === CommentGlyphWidget.description) {
                    // We don't allow multiple comments on the same line.
                    hasCommentingRange = false;
                    break;
                }
                else if (decoration.options.description === CommentingRangeDecorator.description) {
                    hasCommentingRange = true;
                }
            }
        }
        this._activeCursorHasCommentingRange.set(hasCommentingRange);
        this._activeCursorHasComment.set(this.getCommentsAtLine(range).length > 0);
    }
    isEditorInlineOriginal(testEditor) {
        if (this.configurationService.getValue('diffEditor.renderSideBySide')) {
            return false;
        }
        const foundEditor = this.editorService.visibleTextEditorControls.find(editor => {
            if (editor.getEditorType() === EditorType.IDiffEditor) {
                const diffEditor = editor;
                return diffEditor.getOriginalEditor() === testEditor;
            }
            return false;
        });
        return !!foundEditor;
    }
    beginCompute() {
        this._computePromise = createCancelablePromise(token => {
            const editorURI = this.editor && this.editor.hasModel() && this.editor.getModel().uri;
            if (editorURI) {
                return this.commentService.getDocumentComments(editorURI);
            }
            return Promise.resolve([]);
        });
        this._computeAndSetPromise = this._computePromise.then(async (commentInfos) => {
            await this.setComments(coalesce(commentInfos));
            this._computePromise = null;
        }, error => console.log(error));
        this._computePromise.then(() => this._computeAndSetPromise = undefined);
        return this._computeAndSetPromise;
    }
    beginComputeCommentingRanges() {
        if (this._computeCommentingRangeScheduler) {
            this._computeCommentingRangeScheduler.trigger(() => {
                const editorURI = this.editor && this.editor.hasModel() && this.editor.getModel().uri;
                if (editorURI) {
                    return this.commentService.getDocumentComments(editorURI);
                }
                return Promise.resolve([]);
            }).then(commentInfos => {
                if (this.commentService.isCommentingEnabled) {
                    const meaningfulCommentInfos = coalesce(commentInfos);
                    this._commentingRangeDecorator.update(this.editor, meaningfulCommentInfos, this.editor?.getPosition()?.lineNumber, this.editor?.getSelection() ?? undefined);
                }
            }, (err) => {
                onUnexpectedError(err);
                return null;
            });
        }
    }
    static get(editor) {
        return editor.getContribution(ID);
    }
    revealCommentThread(threadId, commentUniqueId, fetchOnceIfNotExist, focus) {
        const commentThreadWidget = this._commentWidgets.filter(widget => widget.commentThread.threadId === threadId);
        if (commentThreadWidget.length === 1) {
            commentThreadWidget[0].reveal(commentUniqueId, focus);
        }
        else if (fetchOnceIfNotExist) {
            if (this._computeAndSetPromise) {
                this._computeAndSetPromise.then(_ => {
                    this.revealCommentThread(threadId, commentUniqueId, false, focus);
                });
            }
            else {
                this.beginCompute().then(_ => {
                    this.revealCommentThread(threadId, commentUniqueId, false, focus);
                });
            }
        }
    }
    collapseAll() {
        for (const widget of this._commentWidgets) {
            widget.collapse(true);
        }
    }
    async collapseVisibleComments() {
        if (!this.editor) {
            return;
        }
        const visibleRanges = this.editor.getVisibleRanges();
        for (const widget of this._commentWidgets) {
            if (widget.expanded && widget.commentThread.range) {
                const isVisible = visibleRanges.some(visibleRange => Range.areIntersectingOrTouching(visibleRange, widget.commentThread.range));
                if (isVisible) {
                    await widget.collapse(true);
                }
            }
        }
    }
    _updateCommentWidgetVisibleContext() {
        const hasExpanded = this._commentWidgets.some(widget => widget.expanded);
        this._commentWidgetVisible.set(hasExpanded);
    }
    expandAll() {
        for (const widget of this._commentWidgets) {
            widget.expand();
        }
    }
    expandUnresolved() {
        for (const widget of this._commentWidgets) {
            if (widget.commentThread.state === languages.CommentThreadState.Unresolved) {
                widget.expand();
            }
        }
    }
    nextCommentThread(focusThread) {
        this._findNearestCommentThread(focusThread);
    }
    _findNearestCommentThread(focusThread, reverse) {
        if (!this._commentWidgets.length || !this.editor?.hasModel()) {
            return;
        }
        const after = reverse ? this.editor.getSelection().getStartPosition() : this.editor.getSelection().getEndPosition();
        const sortedWidgets = this._commentWidgets.sort((a, b) => {
            if (reverse) {
                const temp = a;
                a = b;
                b = temp;
            }
            if (a.commentThread.range === undefined) {
                return -1;
            }
            if (b.commentThread.range === undefined) {
                return 1;
            }
            if (a.commentThread.range.startLineNumber < b.commentThread.range.startLineNumber) {
                return -1;
            }
            if (a.commentThread.range.startLineNumber > b.commentThread.range.startLineNumber) {
                return 1;
            }
            if (a.commentThread.range.startColumn < b.commentThread.range.startColumn) {
                return -1;
            }
            if (a.commentThread.range.startColumn > b.commentThread.range.startColumn) {
                return 1;
            }
            return 0;
        });
        const idx = findFirstIdxMonotonousOrArrLen(sortedWidgets, widget => {
            const lineValueOne = reverse ? after.lineNumber : (widget.commentThread.range?.startLineNumber ?? 0);
            const lineValueTwo = reverse ? (widget.commentThread.range?.startLineNumber ?? 0) : after.lineNumber;
            const columnValueOne = reverse ? after.column : (widget.commentThread.range?.startColumn ?? 0);
            const columnValueTwo = reverse ? (widget.commentThread.range?.startColumn ?? 0) : after.column;
            if (lineValueOne > lineValueTwo) {
                return true;
            }
            if (lineValueOne < lineValueTwo) {
                return false;
            }
            if (columnValueOne > columnValueTwo) {
                return true;
            }
            return false;
        });
        const nextWidget = sortedWidgets[idx];
        if (nextWidget !== undefined) {
            this.editor.setSelection(nextWidget.commentThread.range ?? new Range(1, 1, 1, 1));
            nextWidget.reveal(undefined, focusThread ? CommentWidgetFocus.Widget : CommentWidgetFocus.None);
        }
    }
    previousCommentThread(focusThread) {
        this._findNearestCommentThread(focusThread, true);
    }
    _findNearestCommentingRange(reverse) {
        if (!this.editor?.hasModel()) {
            return;
        }
        const after = this.editor.getSelection().getEndPosition();
        const range = this._commentingRangeDecorator.getNearestCommentingRange(after, reverse);
        if (range) {
            const position = reverse ? range.getEndPosition() : range.getStartPosition();
            this.editor.setPosition(position);
            this.editor.revealLineInCenterIfOutsideViewport(position.lineNumber);
        }
        if (this.accessibilityService.isScreenReaderOptimized()) {
            const commentRangeStart = range?.getStartPosition().lineNumber;
            const commentRangeEnd = range?.getEndPosition().lineNumber;
            if (commentRangeStart && commentRangeEnd) {
                const oneLine = commentRangeStart === commentRangeEnd;
                oneLine ? status(nls.localize('commentRange', "Line {0}", commentRangeStart)) : status(nls.localize('commentRangeStart', "Lines {0} to {1}", commentRangeStart, commentRangeEnd));
            }
        }
    }
    nextCommentingRange() {
        this._findNearestCommentingRange();
    }
    previousCommentingRange() {
        this._findNearestCommentingRange(true);
    }
    dispose() {
        super.dispose();
        dispose(this._editorDisposables);
        dispose(this._commentWidgets);
        this.editor = null; // Strict null override - nulling out in dispose
    }
    onWillChangeModel(e) {
        if (e.newModelUrl) {
            this.tryUpdateReservedSpace(e.newModelUrl);
        }
    }
    async handleCommentAdded(editorId, uniqueOwner, thread) {
        const matchedZones = this._commentWidgets.filter(zoneWidget => zoneWidget.uniqueOwner === uniqueOwner && zoneWidget.commentThread.threadId === thread.threadId);
        if (matchedZones.length) {
            return;
        }
        const matchedNewCommentThreadZones = this._commentWidgets.filter(zoneWidget => zoneWidget.uniqueOwner === uniqueOwner && zoneWidget.commentThread.commentThreadHandle === -1 && Range.equalsRange(zoneWidget.commentThread.range, thread.range));
        if (matchedNewCommentThreadZones.length) {
            matchedNewCommentThreadZones[0].update(thread);
            return;
        }
        const continueOnCommentIndex = this._inProcessContinueOnComments.get(uniqueOwner)?.findIndex(pending => {
            if (pending.range === undefined) {
                return thread.range === undefined;
            }
            else {
                return Range.lift(pending.range).equalsRange(thread.range);
            }
        });
        let continueOnCommentText;
        if ((continueOnCommentIndex !== undefined) && continueOnCommentIndex >= 0) {
            continueOnCommentText = this._inProcessContinueOnComments.get(uniqueOwner)?.splice(continueOnCommentIndex, 1)[0].comment.body;
        }
        const pendingCommentText = (this._pendingNewCommentCache[uniqueOwner] && this._pendingNewCommentCache[uniqueOwner][thread.threadId])
            ?? continueOnCommentText;
        const pendingEdits = this._pendingEditsCache[uniqueOwner] && this._pendingEditsCache[uniqueOwner][thread.threadId];
        const shouldReveal = thread.canReply && thread.isTemplate && (!thread.comments || (thread.comments.length === 0)) && (!thread.editorId || (thread.editorId === editorId));
        await this.displayCommentThread(uniqueOwner, thread, shouldReveal, pendingCommentText, pendingEdits);
        this._commentInfos.filter(info => info.uniqueOwner === uniqueOwner)[0].threads.push(thread);
        this.tryUpdateReservedSpace();
    }
    onModelChanged() {
        this.localToDispose.clear();
        this.tryUpdateReservedSpace();
        this.removeCommentWidgetsAndStoreCache();
        if (!this.editor) {
            return;
        }
        this._hasRespondedToEditorChange = false;
        this.localToDispose.add(this.editor.onMouseDown(e => this.onEditorMouseDown(e)));
        this.localToDispose.add(this.editor.onMouseUp(e => this.onEditorMouseUp(e)));
        if (this._editorDisposables.length) {
            this.clearEditorListeners();
            this.registerEditorListeners();
        }
        this._computeCommentingRangeScheduler = new Delayer(200);
        this.localToDispose.add({
            dispose: () => {
                this._computeCommentingRangeScheduler?.cancel();
                this._computeCommentingRangeScheduler = null;
            }
        });
        this.localToDispose.add(this.editor.onDidChangeModelContent(async () => {
            this.beginComputeCommentingRanges();
        }));
        this.localToDispose.add(this.commentService.onDidUpdateCommentThreads(async (e) => {
            const editorURI = this.editor && this.editor.hasModel() && this.editor.getModel().uri;
            if (!editorURI || !this.commentService.isCommentingEnabled) {
                return;
            }
            if (this._computePromise) {
                await this._computePromise;
            }
            const commentInfo = this._commentInfos.filter(info => info.uniqueOwner === e.uniqueOwner);
            if (!commentInfo || !commentInfo.length) {
                return;
            }
            const added = e.added.filter(thread => thread.resource && thread.resource === editorURI.toString());
            const removed = e.removed.filter(thread => thread.resource && thread.resource === editorURI.toString());
            const changed = e.changed.filter(thread => thread.resource && thread.resource === editorURI.toString());
            const pending = e.pending.filter(pending => pending.uri.toString() === editorURI.toString());
            removed.forEach(thread => {
                const matchedZones = this._commentWidgets.filter(zoneWidget => zoneWidget.uniqueOwner === e.uniqueOwner && zoneWidget.commentThread.threadId === thread.threadId && zoneWidget.commentThread.threadId !== '');
                if (matchedZones.length) {
                    const matchedZone = matchedZones[0];
                    const index = this._commentWidgets.indexOf(matchedZone);
                    this._commentWidgets.splice(index, 1);
                    matchedZone.dispose();
                }
                const infosThreads = this._commentInfos.filter(info => info.uniqueOwner === e.uniqueOwner)[0].threads;
                for (let i = 0; i < infosThreads.length; i++) {
                    if (infosThreads[i] === thread) {
                        infosThreads.splice(i, 1);
                        i--;
                    }
                }
            });
            for (const thread of changed) {
                const matchedZones = this._commentWidgets.filter(zoneWidget => zoneWidget.uniqueOwner === e.uniqueOwner && zoneWidget.commentThread.threadId === thread.threadId);
                if (matchedZones.length) {
                    const matchedZone = matchedZones[0];
                    matchedZone.update(thread);
                    this.openCommentsView(thread);
                }
            }
            const editorId = this.editor?.getId();
            for (const thread of added) {
                await this.handleCommentAdded(editorId, e.uniqueOwner, thread);
            }
            for (const thread of pending) {
                await this.resumePendingComment(editorURI, thread);
            }
            this._commentThreadRangeDecorator.update(this.editor, commentInfo);
        }));
        this.beginComputeAndHandleEditorChange();
    }
    async resumePendingComment(editorURI, thread) {
        const matchedZones = this._commentWidgets.filter(zoneWidget => zoneWidget.uniqueOwner === thread.uniqueOwner && Range.lift(zoneWidget.commentThread.range)?.equalsRange(thread.range));
        if (thread.isReply && matchedZones.length) {
            this.commentService.removeContinueOnComment({ uniqueOwner: thread.uniqueOwner, uri: editorURI, range: thread.range, isReply: true });
            matchedZones[0].setPendingComment(thread.comment);
        }
        else if (matchedZones.length) {
            this.commentService.removeContinueOnComment({ uniqueOwner: thread.uniqueOwner, uri: editorURI, range: thread.range, isReply: false });
            const existingPendingComment = matchedZones[0].getPendingComments().newComment;
            // We need to try to reconcile the existing pending comment with the incoming pending comment
            let pendingComment;
            if (!existingPendingComment || thread.comment.body.includes(existingPendingComment.body)) {
                pendingComment = thread.comment;
            }
            else if (existingPendingComment.body.includes(thread.comment.body)) {
                pendingComment = existingPendingComment;
            }
            else {
                pendingComment = { body: `${existingPendingComment}\n${thread.comment.body}`, cursor: thread.comment.cursor };
            }
            matchedZones[0].setPendingComment(pendingComment);
        }
        else if (!thread.isReply) {
            const threadStillAvailable = this.commentService.removeContinueOnComment({ uniqueOwner: thread.uniqueOwner, uri: editorURI, range: thread.range, isReply: false });
            if (!threadStillAvailable) {
                return;
            }
            if (!this._inProcessContinueOnComments.has(thread.uniqueOwner)) {
                this._inProcessContinueOnComments.set(thread.uniqueOwner, []);
            }
            this._inProcessContinueOnComments.get(thread.uniqueOwner)?.push(thread);
            await this.commentService.createCommentThreadTemplate(thread.uniqueOwner, thread.uri, thread.range ? Range.lift(thread.range) : undefined);
        }
    }
    beginComputeAndHandleEditorChange() {
        this.beginCompute().then(() => {
            if (!this._hasRespondedToEditorChange) {
                if (this._commentInfos.some(commentInfo => commentInfo.commentingRanges.ranges.length > 0 || commentInfo.commentingRanges.fileComments)) {
                    this._hasRespondedToEditorChange = true;
                    const verbose = this.configurationService.getValue("accessibility.verbosity.comments" /* AccessibilityVerbositySettingId.Comments */);
                    if (verbose) {
                        const keybinding = this.keybindingService.lookupKeybinding("editor.action.accessibilityHelp" /* AccessibilityCommandId.OpenAccessibilityHelp */)?.getAriaLabel();
                        if (keybinding) {
                            status(nls.localize('hasCommentRangesKb', "Editor has commenting ranges, run the command Open Accessibility Help ({0}), for more information.", keybinding));
                        }
                        else {
                            status(nls.localize('hasCommentRangesNoKb', "Editor has commenting ranges, run the command Open Accessibility Help, which is currently not triggerable via keybinding, for more information."));
                        }
                    }
                    else {
                        status(nls.localize('hasCommentRanges', "Editor has commenting ranges."));
                    }
                }
            }
        });
    }
    async openCommentsView(thread) {
        if (thread.comments && (thread.comments.length > 0) && threadHasMeaningfulComments(thread)) {
            const openViewState = this.configurationService.getValue(COMMENTS_SECTION).openView;
            if (openViewState === 'file') {
                return this.viewsService.openView(COMMENTS_VIEW_ID);
            }
            else if (openViewState === 'firstFile' || (openViewState === 'firstFileUnresolved' && thread.state === languages.CommentThreadState.Unresolved)) {
                const hasShownView = this.viewsService.getViewWithId(COMMENTS_VIEW_ID)?.hasRendered;
                if (!hasShownView) {
                    return this.viewsService.openView(COMMENTS_VIEW_ID);
                }
            }
        }
        return undefined;
    }
    async displayCommentThread(uniqueOwner, thread, shouldReveal, pendingComment, pendingEdits) {
        const editor = this.editor?.getModel();
        if (!editor) {
            return;
        }
        if (!this.editor || this.isEditorInlineOriginal(this.editor)) {
            return;
        }
        let continueOnCommentReply;
        if (thread.range && !pendingComment) {
            continueOnCommentReply = this.commentService.removeContinueOnComment({ uniqueOwner, uri: editor.uri, range: thread.range, isReply: true });
        }
        const zoneWidget = this.instantiationService.createInstance(ReviewZoneWidget, this.editor, uniqueOwner, thread, pendingComment ?? continueOnCommentReply?.comment, pendingEdits);
        await zoneWidget.display(thread.range, shouldReveal);
        this._commentWidgets.push(zoneWidget);
        this.localToDispose.add(zoneWidget.onDidChangeExpandedState(() => this._updateCommentWidgetVisibleContext()));
        this.localToDispose.add(zoneWidget.onDidClose(() => this._updateCommentWidgetVisibleContext()));
        this.openCommentsView(thread);
    }
    onEditorMouseDown(e) {
        this.mouseDownInfo = (e.target.element?.className.indexOf('comment-range-glyph') ?? -1) >= 0 ? parseMouseDownInfoFromEvent(e) : null;
    }
    onEditorMouseUp(e) {
        const matchedLineNumber = isMouseUpEventDragFromMouseDown(this.mouseDownInfo, e);
        this.mouseDownInfo = null;
        if (!this.editor || matchedLineNumber === null || !e.target.element) {
            return;
        }
        const mouseUpIsOnDecorator = (e.target.element.className.indexOf('comment-range-glyph') >= 0);
        const lineNumber = e.target.position.lineNumber;
        let range;
        let selection;
        // Check for drag along gutter decoration
        if ((matchedLineNumber !== lineNumber)) {
            if (matchedLineNumber > lineNumber) {
                selection = new Range(matchedLineNumber, this.editor.getModel().getLineLength(matchedLineNumber) + 1, lineNumber, 1);
            }
            else {
                selection = new Range(matchedLineNumber, 1, lineNumber, this.editor.getModel().getLineLength(lineNumber) + 1);
            }
        }
        else if (mouseUpIsOnDecorator) {
            selection = this.editor.getSelection();
        }
        // Check for selection at line number.
        if (selection && (selection.startLineNumber <= lineNumber) && (lineNumber <= selection.endLineNumber)) {
            range = selection;
            this.editor.setSelection(new Range(selection.endLineNumber, 1, selection.endLineNumber, 1));
        }
        else if (mouseUpIsOnDecorator) {
            range = new Range(lineNumber, 1, lineNumber, 1);
        }
        if (range) {
            this.addOrToggleCommentAtLine(range, e);
        }
    }
    getCommentsAtLine(commentRange) {
        return this._commentWidgets.filter(widget => widget.getGlyphPosition() === (commentRange ? commentRange.endLineNumber : 0));
    }
    async addOrToggleCommentAtLine(commentRange, e) {
        // If an add is already in progress, queue the next add and process it after the current one finishes to
        // prevent empty comment threads from being added to the same line.
        if (!this._addInProgress) {
            this._addInProgress = true;
            // The widget's position is undefined until the widget has been displayed, so rely on the glyph position instead
            const existingCommentsAtLine = this.getCommentsAtLine(commentRange);
            if (existingCommentsAtLine.length) {
                const allExpanded = existingCommentsAtLine.every(widget => widget.expanded);
                existingCommentsAtLine.forEach(allExpanded ? widget => widget.collapse(true) : widget => widget.expand(true));
                this.processNextThreadToAdd();
                return;
            }
            else {
                this.addCommentAtLine(commentRange, e);
            }
        }
        else {
            this._emptyThreadsToAddQueue.push([commentRange, e]);
        }
    }
    processNextThreadToAdd() {
        this._addInProgress = false;
        const info = this._emptyThreadsToAddQueue.shift();
        if (info) {
            this.addOrToggleCommentAtLine(info[0], info[1]);
        }
    }
    clipUserRangeToCommentRange(userRange, commentRange) {
        if (userRange.startLineNumber < commentRange.startLineNumber) {
            userRange = new Range(commentRange.startLineNumber, commentRange.startColumn, userRange.endLineNumber, userRange.endColumn);
        }
        if (userRange.endLineNumber > commentRange.endLineNumber) {
            userRange = new Range(userRange.startLineNumber, userRange.startColumn, commentRange.endLineNumber, commentRange.endColumn);
        }
        return userRange;
    }
    addCommentAtLine(range, e) {
        const newCommentInfos = this._commentingRangeDecorator.getMatchedCommentAction(range);
        if (!newCommentInfos.length || !this.editor?.hasModel()) {
            this._addInProgress = false;
            if (!newCommentInfos.length) {
                if (range) {
                    this.notificationService.error(nls.localize('comments.addCommand.error', "The cursor must be within a commenting range to add a comment."));
                }
                else {
                    this.notificationService.error(nls.localize('comments.addFileCommentCommand.error', "File comments are not allowed on this file."));
                }
            }
            return Promise.resolve();
        }
        if (newCommentInfos.length > 1) {
            if (e && range) {
                this.contextMenuService.showContextMenu({
                    getAnchor: () => e.event,
                    getActions: () => this.getContextMenuActions(newCommentInfos, range),
                    getActionsContext: () => newCommentInfos.length ? newCommentInfos[0] : undefined,
                    onHide: () => { this._addInProgress = false; }
                });
                return Promise.resolve();
            }
            else {
                const picks = this.getCommentProvidersQuickPicks(newCommentInfos);
                return this.quickInputService.pick(picks, { placeHolder: nls.localize('pickCommentService', "Select Comment Provider"), matchOnDescription: true }).then(pick => {
                    if (!pick) {
                        return;
                    }
                    const commentInfos = newCommentInfos.filter(info => info.action.ownerId === pick.id);
                    if (commentInfos.length) {
                        const { ownerId } = commentInfos[0].action;
                        const clippedRange = range && commentInfos[0].range ? this.clipUserRangeToCommentRange(range, commentInfos[0].range) : range;
                        this.addCommentAtLine2(clippedRange, ownerId);
                    }
                }).then(() => {
                    this._addInProgress = false;
                });
            }
        }
        else {
            const { ownerId } = newCommentInfos[0].action;
            const clippedRange = range && newCommentInfos[0].range ? this.clipUserRangeToCommentRange(range, newCommentInfos[0].range) : range;
            this.addCommentAtLine2(clippedRange, ownerId);
        }
        return Promise.resolve();
    }
    getCommentProvidersQuickPicks(commentInfos) {
        const picks = commentInfos.map((commentInfo) => {
            const { ownerId, extensionId, label } = commentInfo.action;
            return {
                label: label ?? extensionId ?? ownerId,
                id: ownerId
            };
        });
        return picks;
    }
    getContextMenuActions(commentInfos, commentRange) {
        const actions = [];
        commentInfos.forEach(commentInfo => {
            const { ownerId, extensionId, label } = commentInfo.action;
            actions.push(new Action('addCommentThread', `${label || extensionId}`, undefined, true, () => {
                const clippedRange = commentInfo.range ? this.clipUserRangeToCommentRange(commentRange, commentInfo.range) : commentRange;
                this.addCommentAtLine2(clippedRange, ownerId);
                return Promise.resolve();
            }));
        });
        return actions;
    }
    addCommentAtLine2(range, ownerId) {
        if (!this.editor) {
            return;
        }
        this.commentService.createCommentThreadTemplate(ownerId, this.editor.getModel().uri, range, this.editor.getId());
        this.processNextThreadToAdd();
        return;
    }
    getExistingCommentEditorOptions(editor) {
        const lineDecorationsWidth = editor.getOption(74 /* EditorOption.lineDecorationsWidth */);
        let extraEditorClassName = [];
        const configuredExtraClassName = editor.getRawOptions().extraEditorClassName;
        if (configuredExtraClassName) {
            extraEditorClassName = configuredExtraClassName.split(' ');
        }
        return { lineDecorationsWidth, extraEditorClassName };
    }
    getWithoutCommentsEditorOptions(editor, extraEditorClassName, startingLineDecorationsWidth) {
        let lineDecorationsWidth = startingLineDecorationsWidth;
        const inlineCommentPos = extraEditorClassName.findIndex(name => name === 'inline-comment');
        if (inlineCommentPos >= 0) {
            extraEditorClassName.splice(inlineCommentPos, 1);
        }
        const options = editor.getOptions();
        if (options.get(52 /* EditorOption.folding */) && options.get(126 /* EditorOption.showFoldingControls */) !== 'never') {
            lineDecorationsWidth += 11; // 11 comes from https://github.com/microsoft/vscode/blob/94ee5f58619d59170983f453fe78f156c0cc73a3/src/vs/workbench/contrib/comments/browser/media/review.css#L485
        }
        lineDecorationsWidth -= 24;
        return { extraEditorClassName, lineDecorationsWidth };
    }
    getWithCommentsLineDecorationWidth(editor, startingLineDecorationsWidth) {
        let lineDecorationsWidth = startingLineDecorationsWidth;
        const options = editor.getOptions();
        if (options.get(52 /* EditorOption.folding */) && options.get(126 /* EditorOption.showFoldingControls */) !== 'never') {
            lineDecorationsWidth -= 11;
        }
        lineDecorationsWidth += 24;
        this._commentingRangeAmountReserved = lineDecorationsWidth;
        return this._commentingRangeAmountReserved;
    }
    getWithCommentsEditorOptions(editor, extraEditorClassName, startingLineDecorationsWidth) {
        extraEditorClassName.push('inline-comment');
        return { lineDecorationsWidth: this.getWithCommentsLineDecorationWidth(editor, startingLineDecorationsWidth), extraEditorClassName };
    }
    updateEditorLayoutOptions(editor, extraEditorClassName, lineDecorationsWidth) {
        editor.updateOptions({
            extraEditorClassName: extraEditorClassName.join(' '),
            lineDecorationsWidth: lineDecorationsWidth
        });
    }
    ensureCommentingRangeReservedAmount(editor) {
        const existing = this.getExistingCommentEditorOptions(editor);
        if (existing.lineDecorationsWidth !== this._commentingRangeAmountReserved) {
            editor.updateOptions({
                lineDecorationsWidth: this.getWithCommentsLineDecorationWidth(editor, existing.lineDecorationsWidth)
            });
        }
    }
    tryUpdateReservedSpace(uri) {
        if (!this.editor) {
            return;
        }
        const hasCommentsOrRangesInInfo = this._commentInfos.some(info => {
            const hasRanges = Boolean(info.commentingRanges && (Array.isArray(info.commentingRanges) ? info.commentingRanges : info.commentingRanges.ranges).length);
            return hasRanges || (info.threads.length > 0);
        });
        uri = uri ?? this.editor.getModel()?.uri;
        const resourceHasCommentingRanges = uri ? this.commentService.resourceHasCommentingRanges(uri) : false;
        const hasCommentsOrRanges = hasCommentsOrRangesInInfo || resourceHasCommentingRanges;
        if (hasCommentsOrRanges && this.commentService.isCommentingEnabled) {
            if (!this._commentingRangeSpaceReserved) {
                this._commentingRangeSpaceReserved = true;
                const { lineDecorationsWidth, extraEditorClassName } = this.getExistingCommentEditorOptions(this.editor);
                const newOptions = this.getWithCommentsEditorOptions(this.editor, extraEditorClassName, lineDecorationsWidth);
                this.updateEditorLayoutOptions(this.editor, newOptions.extraEditorClassName, newOptions.lineDecorationsWidth);
            }
            else {
                this.ensureCommentingRangeReservedAmount(this.editor);
            }
        }
        else if ((!hasCommentsOrRanges || !this.commentService.isCommentingEnabled) && this._commentingRangeSpaceReserved) {
            this._commentingRangeSpaceReserved = false;
            const { lineDecorationsWidth, extraEditorClassName } = this.getExistingCommentEditorOptions(this.editor);
            const newOptions = this.getWithoutCommentsEditorOptions(this.editor, extraEditorClassName, lineDecorationsWidth);
            this.updateEditorLayoutOptions(this.editor, newOptions.extraEditorClassName, newOptions.lineDecorationsWidth);
        }
    }
    async setComments(commentInfos) {
        if (!this.editor || !this.commentService.isCommentingEnabled) {
            return;
        }
        this._commentInfos = commentInfos;
        this.tryUpdateReservedSpace();
        // create viewzones
        this.removeCommentWidgetsAndStoreCache();
        let hasCommentingRanges = false;
        for (const info of this._commentInfos) {
            if (!hasCommentingRanges && (info.commentingRanges.ranges.length > 0 || info.commentingRanges.fileComments)) {
                hasCommentingRanges = true;
            }
            const providerCacheStore = this._pendingNewCommentCache[info.uniqueOwner];
            const providerEditsCacheStore = this._pendingEditsCache[info.uniqueOwner];
            info.threads = info.threads.filter(thread => !thread.isDisposed);
            for (const thread of info.threads) {
                let pendingComment = undefined;
                if (providerCacheStore) {
                    pendingComment = providerCacheStore[thread.threadId];
                }
                let pendingEdits = undefined;
                if (providerEditsCacheStore) {
                    pendingEdits = providerEditsCacheStore[thread.threadId];
                }
                await this.displayCommentThread(info.uniqueOwner, thread, false, pendingComment, pendingEdits);
            }
            for (const thread of info.pendingCommentThreads ?? []) {
                this.resumePendingComment(this.editor.getModel().uri, thread);
            }
        }
        this._commentingRangeDecorator.update(this.editor, this._commentInfos);
        this._commentThreadRangeDecorator.update(this.editor, this._commentInfos);
        if (hasCommentingRanges) {
            this._activeEditorHasCommentingRange.set(true);
        }
        else {
            this._activeEditorHasCommentingRange.set(false);
        }
    }
    collapseAndFocusRange(threadId) {
        this._commentWidgets?.find(widget => widget.commentThread.threadId === threadId)?.collapseAndFocusRange();
    }
    removeCommentWidgetsAndStoreCache() {
        if (this._commentWidgets) {
            this._commentWidgets.forEach(zone => {
                const pendingComments = zone.getPendingComments();
                const pendingNewComment = pendingComments.newComment;
                const providerNewCommentCacheStore = this._pendingNewCommentCache[zone.uniqueOwner];
                let lastCommentBody;
                if (zone.commentThread.comments && zone.commentThread.comments.length) {
                    const lastComment = zone.commentThread.comments[zone.commentThread.comments.length - 1];
                    if (typeof lastComment.body === 'string') {
                        lastCommentBody = lastComment.body;
                    }
                    else {
                        lastCommentBody = lastComment.body.value;
                    }
                }
                if (pendingNewComment && (pendingNewComment.body !== lastCommentBody)) {
                    if (!providerNewCommentCacheStore) {
                        this._pendingNewCommentCache[zone.uniqueOwner] = {};
                    }
                    this._pendingNewCommentCache[zone.uniqueOwner][zone.commentThread.threadId] = pendingNewComment;
                }
                else {
                    if (providerNewCommentCacheStore) {
                        delete providerNewCommentCacheStore[zone.commentThread.threadId];
                    }
                }
                const pendingEdits = pendingComments.edits;
                const providerEditsCacheStore = this._pendingEditsCache[zone.uniqueOwner];
                if (Object.keys(pendingEdits).length > 0) {
                    if (!providerEditsCacheStore) {
                        this._pendingEditsCache[zone.uniqueOwner] = {};
                    }
                    this._pendingEditsCache[zone.uniqueOwner][zone.commentThread.threadId] = pendingEdits;
                }
                else if (providerEditsCacheStore) {
                    delete providerEditsCacheStore[zone.commentThread.threadId];
                }
                zone.dispose();
            });
        }
        this._commentWidgets = [];
    }
};
CommentController = __decorate([
    __param(1, ICommentService),
    __param(2, IInstantiationService),
    __param(3, ICodeEditorService),
    __param(4, IContextMenuService),
    __param(5, IQuickInputService),
    __param(6, IViewsService),
    __param(7, IConfigurationService),
    __param(8, IContextKeyService),
    __param(9, IEditorService),
    __param(10, IKeybindingService),
    __param(11, IAccessibilityService),
    __param(12, INotificationService)
], CommentController);
export { CommentController };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWVudHNDb250cm9sbGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY29tbWVudHMvYnJvd3Nlci9jb21tZW50c0NvbnRyb2xsZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE1BQU0sRUFBVyxNQUFNLG9DQUFvQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN2RixPQUFPLEVBQXFCLHVCQUF1QixFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBZSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pHLE9BQU8sb0JBQW9CLENBQUM7QUFDNUIsT0FBTyxFQUFrQyxZQUFZLEVBQUUsWUFBWSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDekgsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDOUYsT0FBTyxFQUFVLEtBQUssRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxVQUFVLEVBQWlFLE1BQU0sMkNBQTJDLENBQUM7QUFFdEksT0FBTyxFQUFFLHNCQUFzQixFQUFFLFNBQVMsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ2pHLE9BQU8sS0FBSyxTQUFTLE1BQU0sd0NBQXdDLENBQUM7QUFDcEUsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztB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