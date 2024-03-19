/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { Event, Emitter } from 'vs/base/common/event';
import { CommentsViewFilterFocusContextKey, ICommentsView } from 'vs/workbench/contrib/comments/browser/comments';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { ViewAction } from 'vs/workbench/browser/parts/views/viewPane';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { COMMENTS_VIEW_ID } from 'vs/workbench/contrib/comments/browser/commentsTreeViewer';
import { FocusedViewContext } from 'vs/workbench/common/contextkeys';
import { viewFilterSubmenu } from 'vs/workbench/browser/parts/views/viewFilter';

const CONTEXT_KEY_SHOW_RESOLVED = new RawContextKey<boolean>('commentsView.showResolvedFilter', true);
const CONTEXT_KEY_SHOW_UNRESOLVED = new RawContextKey<boolean>('commentsView.showUnResolvedFilter', true);

export interface CommentsFiltersChangeEvent {
	showResolved?: boolean;
	showUnresolved?: boolean;
}

interface CommentsFiltersOptions {
	showResolved: boolean;
	showUnresolved: boolean;
}

export class CommentsFilters extends Disposable {

	private readonly _onDidChange: Emitter<CommentsFiltersChangeEvent> = this._register(new Emitter<CommentsFiltersChangeEvent>());
	readonly onDidChange: Event<CommentsFiltersChangeEvent> = this._onDidChange.event;

	constructor(options: CommentsFiltersOptions, private readonly contextKeyService: IContextKeyService) {
		super();
		this._showResolved.set(options.showResolved);
		this._showUnresolved.set(options.showUnresolved);
	}

	private readonly _showUnresolved = CONTEXT_KEY_SHOW_UNRESOLVED.bindTo(this.contextKeyService);
	get showUnresolved(): boolean {
		return !!this._showUnresolved.get();
	}
	set showUnresolved(showUnresolved: boolean) {
		if (this._showUnresolved.get() !== showUnresolved) {
			this._showUnresolved.set(showUnresolved);
			this._onDidChange.fire(<CommentsFiltersChangeEvent>{ showUnresolved: true });
		}
	}

	private _showResolved = CONTEXT_KEY_SHOW_RESOLVED.bindTo(this.contextKeyService);
	get showResolved(): boolean {
		return !!this._showResolved.get();
	}
	set showResolved(showResolved: boolean) {
		if (this._showResolved.get() !== showResolved) {
			this._showResolved.set(showResolved);
			this._onDidChange.fire(<CommentsFiltersChangeEvent>{ showResolved: true });
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
