/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { CommentsViewFilterFocusContextKey, ICommentsView } from './comments.js';
import { MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ViewAction } from '../../../browser/parts/views/viewPane.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { COMMENTS_VIEW_ID } from './commentsTreeViewer.js';
import { FocusedViewContext } from '../../../common/contextkeys.js';
import { viewFilterSubmenu } from '../../../browser/parts/views/viewFilter.js';
import { Codicon } from '../../../../base/common/codicons.js';

export const enum CommentsSortOrder {
	ResourceAscending = 'resourceAscending',
	UpdatedAtDescending = 'updatedAtDescending',
}


const CONTEXT_KEY_SHOW_RESOLVED = new RawContextKey<boolean>('commentsView.showResolvedFilter', true);
const CONTEXT_KEY_SHOW_UNRESOLVED = new RawContextKey<boolean>('commentsView.showUnResolvedFilter', true);
const CONTEXT_KEY_SORT_BY = new RawContextKey<CommentsSortOrder>('commentsView.sortBy', CommentsSortOrder.ResourceAscending);

export interface CommentsFiltersChangeEvent {
	showResolved?: boolean;
	showUnresolved?: boolean;
	sortBy?: CommentsSortOrder;
}

interface CommentsFiltersOptions {
	showResolved: boolean;
	showUnresolved: boolean;
	sortBy: CommentsSortOrder;
}

export class CommentsFilters extends Disposable {

	private readonly _onDidChange: Emitter<CommentsFiltersChangeEvent> = this._register(new Emitter<CommentsFiltersChangeEvent>());
	readonly onDidChange: Event<CommentsFiltersChangeEvent> = this._onDidChange.event;
	private readonly _showUnresolved: IContextKey<boolean>;
	private readonly _showResolved: IContextKey<boolean>;
	private readonly _sortBy: IContextKey<CommentsSortOrder>;

	constructor(options: CommentsFiltersOptions, private readonly contextKeyService: IContextKeyService) {
		super();
		this._showUnresolved = CONTEXT_KEY_SHOW_UNRESOLVED.bindTo(this.contextKeyService);
		this._showResolved = CONTEXT_KEY_SHOW_RESOLVED.bindTo(this.contextKeyService);
		this._sortBy = CONTEXT_KEY_SORT_BY.bindTo(this.contextKeyService);
		this._showResolved.set(options.showResolved);
		this._showUnresolved.set(options.showUnresolved);
		this._sortBy.set(options.sortBy);
	}

	get showUnresolved(): boolean {
		return !!this._showUnresolved.get();
	}
	set showUnresolved(showUnresolved: boolean) {
		if (this._showUnresolved.get() !== showUnresolved) {
			this._showUnresolved.set(showUnresolved);
			this._onDidChange.fire({ showUnresolved: true });
		}
	}

	get showResolved(): boolean {
		return !!this._showResolved.get();
	}
	set showResolved(showResolved: boolean) {
		if (this._showResolved.get() !== showResolved) {
			this._showResolved.set(showResolved);
			this._onDidChange.fire({ showResolved: true });
		}
	}

	get sortBy(): CommentsSortOrder {
		return this._sortBy.get() ?? CommentsSortOrder.ResourceAscending;
	}
	set sortBy(sortBy: CommentsSortOrder) {
		if (this._sortBy.get() !== sortBy) {
			this._sortBy.set(sortBy);
			this._onDidChange.fire({ sortBy });
		}
	}
}

registerAction2(class extends ViewAction<ICommentsView> {
	constructor() {
		super({
			id: 'commentsFocusViewFromFilter',
			title: localize('focusCommentsList', "Focus Comments view"),
			keybinding: {
				when: CommentsViewFilterFocusContextKey,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.DownArrow
			},
			viewId: COMMENTS_VIEW_ID
		});
	}
	async runInView(serviceAccessor: ServicesAccessor, commentsView: ICommentsView): Promise<void> {
		commentsView.focus();
	}
});

registerAction2(class extends ViewAction<ICommentsView> {
	constructor() {
		super({
			id: 'commentsClearFilterText',
			title: localize('commentsClearFilterText', "Clear filter text"),
			keybinding: {
				when: CommentsViewFilterFocusContextKey,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.Escape
			},
			viewId: COMMENTS_VIEW_ID
		});
	}
	async runInView(serviceAccessor: ServicesAccessor, commentsView: ICommentsView): Promise<void> {
		commentsView.clearFilterText();
	}
});

registerAction2(class extends ViewAction<ICommentsView> {
	constructor() {
		super({
			id: 'commentsFocusFilter',
			title: localize('focusCommentsFilter', "Focus comments filter"),
			keybinding: {
				when: FocusedViewContext.isEqualTo(COMMENTS_VIEW_ID),
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyF
			},
			viewId: COMMENTS_VIEW_ID
		});
	}
	async runInView(serviceAccessor: ServicesAccessor, commentsView: ICommentsView): Promise<void> {
		commentsView.focusFilter();
	}
});

registerAction2(class extends ViewAction<ICommentsView> {
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

	async runInView(serviceAccessor: ServicesAccessor, view: ICommentsView): Promise<void> {
		view.filters.showUnresolved = !view.filters.showUnresolved;
	}
});

registerAction2(class extends ViewAction<ICommentsView> {
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

	async runInView(serviceAccessor: ServicesAccessor, view: ICommentsView): Promise<void> {
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

registerAction2(class extends ViewAction<ICommentsView> {
	constructor() {
		super({
			id: `workbench.actions.${COMMENTS_VIEW_ID}.toggleSortByUpdatedAt`,
			title: localize('toggle sorting by updated at', "Updated Time"),
			category: localize('comments', "Comments"),
			icon: Codicon.history,
			viewId: COMMENTS_VIEW_ID,
			toggled: {
				condition: ContextKeyExpr.equals(CONTEXT_KEY_SORT_BY.key, CommentsSortOrder.UpdatedAtDescending),
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

	async runInView(serviceAccessor: ServicesAccessor, view: ICommentsView): Promise<void> {
		view.filters.sortBy = CommentsSortOrder.UpdatedAtDescending;
	}
});

registerAction2(class extends ViewAction<ICommentsView> {
	constructor() {
		super({
			id: `workbench.actions.${COMMENTS_VIEW_ID}.toggleSortByResource`,
			title: localize('toggle sorting by resource', "Position in File"),
			category: localize('comments', "Comments"),
			icon: Codicon.history,
			viewId: COMMENTS_VIEW_ID,
			toggled: {
				condition: ContextKeyExpr.equals(CONTEXT_KEY_SORT_BY.key, CommentsSortOrder.ResourceAscending),
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

	async runInView(serviceAccessor: ServicesAccessor, view: ICommentsView): Promise<void> {
		view.filters.sortBy = CommentsSortOrder.ResourceAscending;
	}
});
