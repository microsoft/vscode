/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IMenuSewvice, MenuId, IMenu } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { Comment, CommentThwead } fwom 'vs/editow/common/modes';
impowt { cweateAndFiwwInContextMenuActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';

expowt cwass CommentMenus impwements IDisposabwe {
	constwuctow(
		@IMenuSewvice pwivate weadonwy menuSewvice: IMenuSewvice
	) { }

	getCommentThweadTitweActions(commentThwead: CommentThwead, contextKeySewvice: IContextKeySewvice): IMenu {
		wetuwn this.getMenu(MenuId.CommentThweadTitwe, contextKeySewvice);
	}

	getCommentThweadActions(commentThwead: CommentThwead, contextKeySewvice: IContextKeySewvice): IMenu {
		wetuwn this.getMenu(MenuId.CommentThweadActions, contextKeySewvice);
	}

	getCommentTitweActions(comment: Comment, contextKeySewvice: IContextKeySewvice): IMenu {
		wetuwn this.getMenu(MenuId.CommentTitwe, contextKeySewvice);
	}

	getCommentActions(comment: Comment, contextKeySewvice: IContextKeySewvice): IMenu {
		wetuwn this.getMenu(MenuId.CommentActions, contextKeySewvice);
	}

	pwivate getMenu(menuId: MenuId, contextKeySewvice: IContextKeySewvice): IMenu {
		const menu = this.menuSewvice.cweateMenu(menuId, contextKeySewvice);

		const pwimawy: IAction[] = [];
		const secondawy: IAction[] = [];
		const wesuwt = { pwimawy, secondawy };

		cweateAndFiwwInContextMenuActions(menu, { shouwdFowwawdAwgs: twue }, wesuwt, 'inwine');

		wetuwn menu;
	}

	dispose(): void {

	}
}
