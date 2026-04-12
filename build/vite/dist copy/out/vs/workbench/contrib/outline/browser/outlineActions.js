/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ViewAction } from '../../../browser/parts/views/viewPane.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ctxAllCollapsed, ctxFilterOnType, ctxFollowsCursor, ctxSortMode, IOutlinePane } from './outline.js';
// --- commands
registerAction2(class CollapseAll extends ViewAction {
    constructor() {
        super({
            viewId: IOutlinePane.Id,
            id: 'outline.collapse',
            title: localize('collapse', "Collapse All"),
            f1: false,
            icon: Codicon.collapseAll,
            menu: {
                id: MenuId.ViewTitle,
                group: 'navigation',
                when: ContextKeyExpr.and(ContextKeyExpr.equals('view', IOutlinePane.Id), ctxAllCollapsed.isEqualTo(false))
            }
        });
    }
    runInView(_accessor, view) {
        view.collapseAll();
    }
});
registerAction2(class ExpandAll extends ViewAction {
    constructor() {
        super({
            viewId: IOutlinePane.Id,
            id: 'outline.expand',
            title: localize('expand', "Expand All"),
            f1: false,
            icon: Codicon.expandAll,
            menu: {
                id: MenuId.ViewTitle,
                group: 'navigation',
                when: ContextKeyExpr.and(ContextKeyExpr.equals('view', IOutlinePane.Id), ctxAllCollapsed.isEqualTo(true))
            }
        });
    }
    runInView(_accessor, view) {
        view.expandAll();
    }
});
registerAction2(class FollowCursor extends ViewAction {
    constructor() {
        super({
            viewId: IOutlinePane.Id,
            id: 'outline.followCursor',
            title: localize('followCur', "Follow Cursor"),
            f1: false,
            toggled: ctxFollowsCursor,
            menu: {
                id: MenuId.ViewTitle,
                group: 'config',
                order: 1,
                when: ContextKeyExpr.equals('view', IOutlinePane.Id)
            }
        });
    }
    runInView(_accessor, view) {
        view.outlineViewState.followCursor = !view.outlineViewState.followCursor;
    }
});
registerAction2(class FilterOnType extends ViewAction {
    constructor() {
        super({
            viewId: IOutlinePane.Id,
            id: 'outline.filterOnType',
            title: localize('filterOnType', "Filter on Type"),
            f1: false,
            toggled: ctxFilterOnType,
            menu: {
                id: MenuId.ViewTitle,
                group: 'config',
                order: 2,
                when: ContextKeyExpr.equals('view', IOutlinePane.Id)
            }
        });
    }
    runInView(_accessor, view) {
        view.outlineViewState.filterOnType = !view.outlineViewState.filterOnType;
    }
});
registerAction2(class SortByPosition extends ViewAction {
    constructor() {
        super({
            viewId: IOutlinePane.Id,
            id: 'outline.sortByPosition',
            title: localize('sortByPosition', "Sort By: Position"),
            f1: false,
            toggled: ctxSortMode.isEqualTo(0 /* OutlineSortOrder.ByPosition */),
            menu: {
                id: MenuId.ViewTitle,
                group: 'sort',
                order: 1,
                when: ContextKeyExpr.equals('view', IOutlinePane.Id)
            }
        });
    }
    runInView(_accessor, view) {
        view.outlineViewState.sortBy = 0 /* OutlineSortOrder.ByPosition */;
    }
});
registerAction2(class SortByName extends ViewAction {
    constructor() {
        super({
            viewId: IOutlinePane.Id,
            id: 'outline.sortByName',
            title: localize('sortByName', "Sort By: Name"),
            f1: false,
            toggled: ctxSortMode.isEqualTo(1 /* OutlineSortOrder.ByName */),
            menu: {
                id: MenuId.ViewTitle,
                group: 'sort',
                order: 2,
                when: ContextKeyExpr.equals('view', IOutlinePane.Id)
            }
        });
    }
    runInView(_accessor, view) {
        view.outlineViewState.sortBy = 1 /* OutlineSortOrder.ByName */;
    }
});
registerAction2(class SortByKind extends ViewAction {
    constructor() {
        super({
            viewId: IOutlinePane.Id,
            id: 'outline.sortByKind',
            title: localize('sortByKind', "Sort By: Category"),
            f1: false,
            toggled: ctxSortMode.isEqualTo(2 /* OutlineSortOrder.ByKind */),
            menu: {
                id: MenuId.ViewTitle,
                group: 'sort',
                order: 3,
                when: ContextKeyExpr.equals('view', IOutlinePane.Id)
            }
        });
    }
    runInView(_accessor, view) {
        view.outlineViewState.sortBy = 2 /* OutlineSortOrder.ByKind */;
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3V0bGluZUFjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9vdXRsaW5lL2Jyb3dzZXIvb3V0bGluZUFjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFdEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxlQUFlLEVBQUUsZ0JBQWdCLEVBQUUsV0FBVyxFQUFFLFlBQVksRUFBb0IsTUFBTSxjQUFjLENBQUM7QUFHL0gsZUFBZTtBQUVmLGVBQWUsQ0FBQyxNQUFNLFdBQVksU0FBUSxVQUF3QjtJQUNqRTtRQUNDLEtBQUssQ0FBQztZQUNMLE1BQU0sRUFBRSxZQUFZLENBQUMsRUFBRTtZQUN2QixFQUFFLEVBQUUsa0JBQWtCO1lBQ3RCLEtBQUssRUFBRSxRQUFRLENBQUMsVUFBVSxFQUFFLGNBQWMsQ0FBQztZQUMzQyxFQUFFLEVBQUUsS0FBSztZQUNULElBQUksRUFBRSxPQUFPLENBQUMsV0FBVztZQUN6QixJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxTQUFTO2dCQUNwQixLQUFLLEVBQUUsWUFBWTtnQkFDbkIsSUFBSSxFQUFFLGNBQWMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsWUFBWSxDQUFDLEVBQUUsQ0FBQyxFQUFFLGVBQWUsQ0FBQyxT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