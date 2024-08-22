/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey';
import { IMenuService, MenuId, IMenu } from '../../../../platform/actions/common/actions';
import { IAction } from '../../../../base/common/actions';
import { Comment } from '../../../../editor/common/languages';
import { createAndFillInContextMenuActions } from '../../../../platform/actions/browser/menuEntryActionViewItem';

export class CommentMenus implements IDisposable {
	constructor(
		@IMenuService private readonly menuService: IMenuService
	) { }

	getCommentThreadTitleActions(contextKeyService: IContextKeyService): IMenu {
		return this.getMenu(MenuId.CommentThreadTitle, contextKeyService);
	}

	getCommentThreadActions(contextKeyService: IContextKeyService): IMenu {
		return this.getMenu(MenuId.CommentThreadActions, contextKeyService);
	}

	getCommentEditorActions(contextKeyService: IContextKeyService): IMenu {
		return this.getMenu(MenuId.CommentEditorActions, contextKeyService);
	}

	getCommentThreadAdditionalActions(contextKeyService: IContextKeyService): IMenu {
		return this.getMenu(MenuId.CommentThreadAdditionalActions, contextKeyService);
	}

	getCommentTitleActions(comment: Comment, contextKeyService: IContextKeyService): IMenu {
		return this.getMenu(MenuId.CommentTitle, contextKeyService);
	}

	getCommentActions(comment: Comment, contextKeyService: IContextKeyService): IMenu {
		return this.getMenu(MenuId.CommentActions, contextKeyService);
	}

	getCommentThreadTitleContextActions(contextKeyService: IContextKeyService): IMenu {
		return this.getMenu(MenuId.CommentThreadTitleContext, contextKeyService);
	}

	private getMenu(menuId: MenuId, contextKeyService: IContextKeyService): IMenu {
		const menu = this.menuService.createMenu(menuId, contextKeyService);

		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };

		createAndFillInContextMenuActions(menu, { shouldForwardArgs: true }, result, 'inline');

		return menu;
	}

	dispose(): void {

	}
}
