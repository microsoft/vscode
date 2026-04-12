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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IMenuService } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { COMMENTS_VIEW_ID, CommentsMenus } from './commentsTreeViewer.js';
import { CONTEXT_KEY_COMMENT_FOCUSED } from './commentsView.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ICommentService } from './commentService.js';
import { CommentContextKeys } from '../common/commentContextKeys.js';
import { moveToNextCommentInThread as findNextCommentInThread, revealCommentThread } from './commentsController.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { URI } from '../../../../base/common/uri.js';
export class CommentsAccessibleView extends Disposable {
    getProvider(accessor) {
        const contextKeyService = accessor.get(IContextKeyService);
        const viewsService = accessor.get(IViewsService);
        const menuService = accessor.get(IMenuService);
        const commentsView = viewsService.getActiveViewWithId(COMMENTS_VIEW_ID);
        const focusedCommentNode = commentsView?.focusedCommentNode;
        if (!commentsView || !focusedCommentNode) {
            return;
        }
        const menus = this._register(new CommentsMenus(menuService));
        menus.setContextKeyService(contextKeyService);
        return new CommentsAccessibleContentProvider(commentsView, focusedCommentNode, menus);
    }
    constructor() {
        super();
        this.priority = 90;
        this.name = 'comment';
        this.when = CONTEXT_KEY_COMMENT_FOCUSED;
        this.type = "view" /* AccessibleViewType.View */;
    }
}
export class CommentThreadAccessibleView extends Disposable {
    getProvider(accessor) {
        const commentService = accessor.get(ICommentService);
        const editorService = accessor.get(IEditorService);
        const uriIdentityService = accessor.get(IUriIdentityService);
        const threads = commentService.commentsModel.hasCommentThreads();
        if (!threads) {
            return;
        }
        return new CommentsThreadWidgetAccessibleContentProvider(commentService, editorService, uriIdentityService);
    }
    constructor() {
        super();
        this.priority = 85;
        this.name = 'commentThread';
        this.when = CommentContextKeys.commentFocused;
        this.type = "view" /* AccessibleViewType.View */;
    }
}
class CommentsAccessibleContentProvider extends Disposable {
    constructor(_commentsView, _focusedCommentNode, _menus) {
        super();
        this._commentsView = _commentsView;
        this._focusedCommentNode = _focusedCommentNode;
        this._menus = _menus;
        this.id = "comments" /* AccessibleViewProviderId.Comments */;
        this.verbositySettingKey = "accessibility.verbosity.comments" /* AccessibilityVerbositySettingId.Comments */;
        this.options = { type: "view" /* AccessibleViewType.View */ };
        this.actions = [...this._menus.getResourceContextActions(this._focusedCommentNode)].filter(i => i.enabled).map(action => {
            return {
                ...action,
                run: () => {
                    this._commentsView.focus();
                    action.run({
                        thread: this._focusedCommentNode.thread,
                        $mid: 7 /* MarshalledId.CommentThread */,
                        commentControlHandle: this._focusedCommentNode.controllerHandle,
                        commentThreadHandle: this._focusedCommentNode.threadHandle,
                    });
                }
            };
        });
    }
    provideContent() {
        const commentNode = this._commentsView.focusedCommentNode;
        const content = this._commentsView.focusedCommentInfo?.toString();
        if (!commentNode || !content) {
            throw new Error('Comment tree is focused but no comment is selected');
        }
        return content;
    }
    onClose() {
        this._commentsView.focus();
    }
    provideNextContent() {
        this._commentsView.focusNextNode();
        return this.provideContent();
    }
    providePreviousContent() {
        this._commentsView.focusPreviousNode();
        return this.provideContent();
    }
}
let CommentsThreadWidgetAccessibleContentProvider = class CommentsThreadWidgetAccessibleContentProvider extends Disposable {
    constructor(_commentService, _editorService, _uriIdentityService) {
        super();
        this._commentService = _commentService;
        this._editorService = _editorService;
        this._uriIdentityService = _uriIdentityService;
        this.id = "commentThread" /* AccessibleViewProviderId.CommentThread */;
        this.verbositySettingKey = "accessibility.verbosity.comments" /* AccessibilityVerbositySettingId.Comments */;
        this.options = { type: "view" /* AccessibleViewType.View */ };
    }
    get activeCommentInfo() {
        if (!this._activeCommentInfo && this._commentService.lastActiveCommentcontroller) {
            this._activeCommentInfo = this._commentService.lastActiveCommentcontroller.activeComment;
        }
        return this._activeCommentInfo;
    }
    provideContent() {
        if (!this.activeCommentInfo) {
            throw new Error('No current comment thread');
        }
        const comment = this.activeCommentInfo.comment?.body;
        const commentLabel = typeof comment === 'string' ? comment : comment?.value ?? '';
        const resource = this.activeCommentInfo.thread.resource;
        const range = this.activeCommentInfo.thread.range;
        let contentLabel = '';
        if (resource && range) {
            const editor = this._editorService.findEditors(URI.parse(resource)) || [];
            const codeEditor = this._editorService.activeEditorPane?.getControl();
            if (editor?.length && isCodeEditor(codeEditor)) {
                const content = codeEditor.getModel()?.getValueInRange(range);
                if (content) {
                    contentLabel = '\nCorresponding code: \n' + content;
                }
            }
        }
        return commentLabel + contentLabel;
    }
    onClose() {
        const lastComment = this._activeCommentInfo;
        this._activeCommentInfo = undefined;
        if (lastComment) {
            revealCommentThread(this._commentService, this._editorService, this._uriIdentityService, lastComment.thread, lastComment.comment);
        }
    }
    provideNextContent() {
        const newCommentInfo = findNextCommentInThread(this._activeCommentInfo, 'next');
        if (newCommentInfo) {
            this._activeCommentInfo = newCommentInfo;
            return this.provideContent();
        }
        return undefined;
    }
    providePreviousContent() {
        const newCommentInfo = findNextCommentInThread(this._activeCommentInfo, 'previous');
        if (newCommentInfo) {
            this._activeCommentInfo = newCommentInfo;
            return this.provideContent();
        }
        return undefined;
    }
};
CommentsThreadWidgetAccessibleContentProvider = __decorate([
    __param(0, ICommentService),
    __param(1, IEditorService),
    __param(2, IUriIdentityService)
], CommentsThreadWidgetAccessibleContentProvider);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWVudHNBY2Nlc3NpYmxlVmlldy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NvbW1lbnRzL2Jyb3dzZXIvY29tbWVudHNBY2Nlc3NpYmxlVmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFLbEUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzlFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRTFGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxhQUFhLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUMxRSxPQUFPLEVBQWlCLDJCQUEyQixFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDL0UsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUV0RCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUseUJBQXlCLElBQUksdUJBQXVCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNwSCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDN0YsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUtyRCxNQUFNLE9BQU8sc0JBQXVCLFNBQVEsVUFBVTtJQUtyRCxXQUFXLENBQUMsUUFBMEI7UUFDckMsTUFBTSxp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