/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { MarshalledId } from 'vs/base/common/marshallingIds';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { AccessibleViewProviderId, AccessibleViewType, IAccessibleViewContentProvider } from 'vs/platform/accessibility/browser/accessibleView';
import { IAccessibleViewImplentation } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { COMMENTS_VIEW_ID, CommentsMenus } from 'vs/workbench/contrib/comments/browser/commentsTreeViewer';
import { CommentsPanel, CONTEXT_KEY_COMMENT_FOCUSED } from 'vs/workbench/contrib/comments/browser/commentsView';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';

export class CommentsAccessibleView extends Disposable implements IAccessibleViewImplentation {
	readonly priority = 90;
	readonly name = 'comment';
	readonly when = CONTEXT_KEY_COMMENT_FOCUSED;
	readonly type = AccessibleViewType.View;
	getProvider(accessor: ServicesAccessor) {
		const contextKeyService = accessor.get(IContextKeyService);
		const viewsService = accessor.get(IViewsService);
		const menuService = accessor.get(IMenuService);
		const commentsView = viewsService.getActiveViewWithId<CommentsPanel>(COMMENTS_VIEW_ID);
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
	}
}

class CommentsAccessibleContentProvider extends Disposable implements IAccessibleViewContentProvider {
	constructor(
		private readonly _commentsView: CommentsPanel,
		private readonly _focusedCommentNode: any,
		private readonly _menus: CommentsMenus,
	) {
		super();
	}
	readonly id = AccessibleViewProviderId.Comments;
	readonly verbositySettingKey = AccessibilityVerbositySettingId.Comments;
	readonly options = { type: AccessibleViewType.View };
	public actions = [...this._menus.getResourceContextActions(this._focusedCommentNode)].filter(i => i.enabled).map(action => {
		return {
			...action,
			run: () => {
				this._commentsView.focus();
				action.run({
					thread: this._focusedCommentNode.thread,
					$mid: MarshalledId.CommentThread,
					commentControlHandle: this._focusedCommentNode.controllerHandle,
					commentThreadHandle: this._focusedCommentNode.threadHandle,
				});
			}
		};
	});
	provideContent(): string {
		const commentNode = this._commentsView.focusedCommentNode;
		const content = this._commentsView.focusedCommentInfo?.toString();
		if (!commentNode || !content) {
			throw new Error('Comment tree is focused but no comment is selected');
		}
		return content;
	}
	onClose(): void {
		this._commentsView.focus();
	}
	provideNextContent(): string | undefined {
		this._commentsView.focusNextNode();
		return this.provideContent();
	}
	providePreviousContent(): string | undefined {
		this._commentsView.focusPreviousNode();
		return this.provideContent();
	}
}
