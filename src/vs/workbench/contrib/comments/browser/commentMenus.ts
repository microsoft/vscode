/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IAction } from 'vs/base/common/actions';
import { MainThreadCommentController } from 'vs/workbench/api/browser/mainThreadComments';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { Comment, CommentThread2 } from 'vs/editor/common/modes';
import { fillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';

export class CommentMenus implements IDisposable {
	constructor(
		controller: MainThreadCommentController,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService
	) {
		const commentControllerKey = this.contextKeyService.createKey<string | undefined>('commentController', undefined);

		commentControllerKey.set(controller.contextValue);
	}

	getCommentThreadTitleActions(commentThread: CommentThread2, contextKeyService: IContextKeyService): IAction[] {
		return this.getActions(MenuId.CommentThreadTitle, contextKeyService).primary;
	}

	getCommentThreadActions(commentThread: CommentThread2, contextKeyService: IContextKeyService): IAction[] {
		return this.getActions(MenuId.CommentThreadActions, contextKeyService).primary;
	}

	getCommentTitleActions(comment: Comment, contextKeyService: IContextKeyService): IAction[] {
		return this.getActions(MenuId.CommentTitle, contextKeyService).primary;
	}

	getCommentActions(comment: Comment, contextKeyService: IContextKeyService): IAction[] {
		return this.getActions(MenuId.CommentActions, contextKeyService).primary;
	}

	private getActions(menuId: MenuId, contextKeyService: IContextKeyService) {
		const menu = this.menuService.createMenu(menuId, contextKeyService);
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };

		fillInContextMenuActions(menu, { shouldForwardArgs: true }, result, this.contextMenuService, g => true);

		menu.dispose();
		return result;
	}

	dispose(): void {

	}
}
