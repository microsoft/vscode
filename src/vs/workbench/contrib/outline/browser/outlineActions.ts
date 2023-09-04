/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Codicon } from 'vs/base/common/codicons';
import { MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ViewAction } from 'vs/workbench/browser/parts/views/viewPane';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ctxAllCollapsed, ctxFilterOnType, ctxFollowsCursor, ctxSortMode, IOutlinePane, OutlineSortOrder } from 'vs/workbench/contrib/outline/browser/outline';


// --- commands

registerAction2(class CollapseAll extends ViewAction<IOutlinePane> {
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
	runInView(_accessor: ServicesAccessor, view: IOutlinePane) {
		view.collapseAll();
	}
});

registerAction2(class ExpandAll extends ViewAction<IOutlinePane> {
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
	runInView(_accessor: ServicesAccessor, view: IOutlinePane) {
		view.expandAll();
	}
});

registerAction2(class FollowCursor extends ViewAction<IOutlinePane> {
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
	runInView(_accessor: ServicesAccessor, view: IOutlinePane) {
		view.outlineViewState.followCursor = !view.outlineViewState.followCursor;
	}
});

registerAction2(class FilterOnType extends ViewAction<IOutlinePane> {
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
	runInView(_accessor: ServicesAccessor, view: IOutlinePane) {
		view.outlineViewState.filterOnType = !view.outlineViewState.filterOnType;
	}
});


registerAction2(class SortByPosition extends ViewAction<IOutlinePane> {
	constructor() {
		super({
			viewId: IOutlinePane.Id,
			id: 'outline.sortByPosition',
			title: localize('sortByPosition', "Sort By: Position"),
			f1: false,
			toggled: ctxSortMode.isEqualTo(OutlineSortOrder.ByPosition),
			menu: {
				id: MenuId.ViewTitle,
				group: 'sort',
				order: 1,
				when: ContextKeyExpr.equals('view', IOutlinePane.Id)
			}
		});
	}
	runInView(_accessor: ServicesAccessor, view: IOutlinePane) {
		view.outlineViewState.sortBy = OutlineSortOrder.ByPosition;
	}
});

registerAction2(class SortByName extends ViewAction<IOutlinePane> {
	constructor() {
		super({
			viewId: IOutlinePane.Id,
			id: 'outline.sortByName',
			title: localize('sortByName', "Sort By: Name"),
			f1: false,
			toggled: ctxSortMode.isEqualTo(OutlineSortOrder.ByName),
			menu: {
				id: MenuId.ViewTitle,
				group: 'sort',
				order: 2,
				when: ContextKeyExpr.equals('view', IOutlinePane.Id)
			}
		});
	}
	runInView(_accessor: ServicesAccessor, view: IOutlinePane) {
		view.outlineViewState.sortBy = OutlineSortOrder.ByName;
	}
});

registerAction2(class SortByKind extends ViewAction<IOutlinePane> {
	constructor() {
		super({
			viewId: IOutlinePane.Id,
			id: 'outline.sortByKind',
			title: localize('sortByKind', "Sort By: Category"),
			f1: false,
			toggled: ctxSortMode.isEqualTo(OutlineSortOrder.ByKind),
			menu: {
				id: MenuId.ViewTitle,
				group: 'sort',
				order: 3,
				when: ContextKeyExpr.equals('view', IOutlinePane.Id)
			}
		});
	}
	runInView(_accessor: ServicesAccessor, view: IOutlinePane) {
		view.outlineViewState.sortBy = OutlineSortOrder.ByKind;
	}
});
