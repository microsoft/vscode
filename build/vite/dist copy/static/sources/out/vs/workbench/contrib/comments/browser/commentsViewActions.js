/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { Emitter } from '../../../../base/common/event.js';
import { CommentsViewFilterFocusContextKey } from './comments.js';
import { MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ViewAction } from '../../../browser/parts/views/viewPane.js';
import { COMMENTS_VIEW_ID } from './commentsTreeViewer.js';
import { FocusedViewContext } from '../../../common/contextkeys.js';
import { viewFilterSubmenu } from '../../../browser/parts/views/viewFilter.js';
import { Codicon } from '../../../../base/common/codicons.js';
export var CommentsSortOrder;
(function (CommentsSortOrder) {
    CommentsSortOrder["ResourceAscending"] = "resourceAscending";
    CommentsSortOrder["UpdatedAtDescending"] = "updatedAtDescending";
})(CommentsSortOrder || (CommentsSortOrder = {}));
const CONTEXT_KEY_SHOW_RESOLVED = new RawContextKey('commentsView.showResolvedFilter', true);
const CONTEXT_KEY_SHOW_UNRESOLVED = new RawContextKey('commentsView.showUnResolvedFilter', true);
const CONTEXT_KEY_SORT_BY = new RawContextKey('commentsView.sortBy', "resourceAscending" /* CommentsSortOrder.ResourceAscending */);
export class CommentsFilters extends Disposable {
    constructor(options, contextKeyService) {
        super();
        this.contextKeyService = contextKeyService;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._showUnresolved = CONTEXT_KEY_SHOW_UNRESOLVED.bindTo(this.contextKeyService);
        this._showResolved = CONTEXT_KEY_SHOW_RESOLVED.bindTo(this.contextKeyService);
        this._sortBy = CONTEXT_KEY_SORT_BY.bindTo(this.contextKeyService);
        this._showResolved.set(options.showResolved);
        this._showUnresolved.set(options.showUnresolved);
        this._sortBy.set(options.sortBy);
    }
    get showUnresolved() {
        return !!this._showUnresolved.get();
    }
    set showUnresolved(showUnresolved) {
        if (this._showUnresolved.get() !== showUnresolved) {
            this._showUnresolved.set(showUnresolved);
            this._onDidChange.fire({ showUnresolved: true });
        }
    }
    get showResolved() {
        return !!this._showResolved.get();
    }
    set showResolved(showResolved) {
        if (this._showResolved.get() !== showResolved) {
            this._showResolved.set(showResolved);
            this._onDidChange.fire({ showResolved: true });
        }
    }
    get sortBy() {
        return this._sortBy.get() ?? "resourceAscending" /* CommentsSortOrder.ResourceAscending */;
    }
    set sortBy(sortBy) {
        if (this._sortBy.get() !== sortBy) {
            this._sortBy.set(sortBy);
            this._onDidChange.fire({ sortBy });
        }
    }
}
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: 'commentsFocusViewFromFilter',
            title: localize('focusCommentsList', "Focus Comments view"),
            keybinding: {
                when: CommentsViewFilterFocusContextKey,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */
            },
            viewId: COMMENTS_VIEW_ID
        });
    }
    async runInView(serviceAccessor, commentsView) {
        commentsView.focus();
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: 'commentsClearFilterText',
            title: localize('commentsClearFilterText', "Clear filter text"),
            keybinding: {
                when: CommentsViewFilterFocusContextKey,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 9 /* KeyCode.Escape */
            },
            viewId: COMMENTS_VIEW_ID
        });
    }
    async runInView(serviceAccessor, commentsView) {
        commentsView.clearFilterText();
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: 'commentsFocusFilter',
            title: localize('focusCommentsFilter', "Focus comments filter"),
            keybinding: {
                when: FocusedViewContext.isEqualTo(COMMENTS_VIEW_ID),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 36 /* KeyCode.KeyF */
            },
            viewId: COMMENTS_VIEW_ID
        });
    }
    async runInView(serviceAccessor, commentsView) {
        commentsView.focusFilter();
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: `workbench.actions.${COMMENTS_VIEW_ID}.toggleUnResolvedComments`,
            title: localize('toggle unresolved', "Show Unresolved"),
            category: localize('comments', "Comments"),
            toggled: {
                condition: CONTEXT_KEY_SHOW_UNRESOLVED,
                title: localize('unresolved', "Show Unresolved"),
            },
            menu: {
                id: viewFilterSubmenu,
                group: '1_filter',
                when: ContextKeyExpr.equals('view', COMMENTS_VIEW_ID),
                order: 1
            },
            viewId: COMMENTS_VIEW_ID
        });
    }
    async runInView(serviceAccessor, view) {
        view.filters.showUnresolved = !view.filters.showUnresolved;
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: `workbench.actions.${COMMENTS_VIEW_ID}.toggleResolvedComments`,
            title: localize('toggle resolved', "Show Resolved"),
            category: localize('comments', "Comments"),
            toggled: {
                condition: CONTEXT_KEY_SHOW_RESOLVED,
                title: localize('resolved', "Show Resolved"),
            },
            menu: {
                id: viewFilterSubmenu,
                group: '1_filter',
                when: ContextKeyExpr.equals('view', COMMENTS_VIEW_ID),
                order: 1
            },
            viewId: COMMENTS_VIEW_ID
        });
    }
    async runInView(serviceAccessor, view) {
        view.filters.showResolved = !view.filters.showResolved;
    }
});
const commentSortSubmenu = new MenuId('submenu.filter.commentSort');
MenuRegistry.appendMenuItem(viewFilterSubmenu, {
    submenu: commentSortSubmenu,
    title: localize('comment sorts', "Sort By"),
    group: '2_sort',
    icon: Codicon.history,
    when: ContextKeyExpr.equals('view', COMMENTS_VIEW_ID),
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: `workbench.actions.${COMMENTS_VIEW_ID}.toggleSortByUpdatedAt`,
            title: localize('toggle sorting by updated at', "Updated Time"),
            category: localize('comments', "Comments"),
            icon: Codicon.history,
            viewId: COMMENTS_VIEW_ID,
            toggled: {
                condition: ContextKeyExpr.equals(CONTEXT_KEY_SORT_BY.key, "updatedAtDescending" /* CommentsSortOrder.UpdatedAtDescending */),
                title: localize('sorting by updated at', "Updated Time"),
            },
            menu: {
                id: commentSortSubmenu,
                group: 'navigation',
                order: 1,
                isHiddenByDefault: false,
            },
        });
    }
    async runInView(serviceAccessor, view) {
        view.filters.sortBy = "updatedAtDescending" /* CommentsSortOrder.UpdatedAtDescending */;
    }
});
registerAction2(class extends ViewAction {
    constructor() {
        super({
            id: `workbench.actions.${COMMENTS_VIEW_ID}.toggleSortByResource`,
            title: localize('toggle sorting by resource', "Position in File"),
            category: localize('comments', "Comments"),
            icon: Codicon.history,
            viewId: COMMENTS_VIEW_ID,
            toggled: {
                condition: ContextKeyExpr.equals(CONTEXT_KEY_SORT_BY.key, "resourceAscending" /* CommentsSortOrder.ResourceAscending */),
                title: localize('sorting by position in file', "Position in File"),
            },
            menu: {
                id: commentSortSubmenu,
                group: 'navigation',
                order: 0,
                isHiddenByDefault: false,
            },
        });
    }
    async runInView(serviceAccessor, view) {
        view.filters.sortBy = "resourceAscending" /* CommentsSortOrder.ResourceAscending */;
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWVudHNWaWV3QWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NvbW1lbnRzL2Jyb3dzZXIvY29tbWVudHNWaWV3QWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRTlDLE9BQU8sRUFBRSxjQUFjLEVBQW1DLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RJLE9BQU8sRUFBUyxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsaUNBQWlDLEVBQWlCLE1BQU0sZUFBZSxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUV0RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUMzRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFOUQsTUFBTSxDQUFOLElBQWtCLGlCQUdqQjtBQUhELFdBQWtCLGlCQUFpQjtJQUNsQyw0REFBdUMsQ0FBQTtJQUN2QyxnRUFBMkMsQ0FBQTtBQUM1QyxDQUFDLEVBSGlCLGlCQUFpQixLQUFqQixpQkFBaUIsUUFHbEM7QUFHRCxNQUFNLHlCQUF5QixHQUFHLElBQUksYUFBYSxDQUFVLGlDQUFpQyxFQUFFLElB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