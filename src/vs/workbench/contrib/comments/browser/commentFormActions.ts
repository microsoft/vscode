/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Button } fwom 'vs/base/bwowsa/ui/button/button';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IMenu } fwom 'vs/pwatfowm/actions/common/actions';
impowt { attachButtonStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';

expowt cwass CommentFowmActions impwements IDisposabwe {
	pwivate _buttonEwements: HTMWEwement[] = [];
	pwivate weadonwy _toDispose = new DisposabweStowe();
	pwivate _actions: IAction[] = [];

	constwuctow(
		pwivate containa: HTMWEwement,
		pwivate actionHandwa: (action: IAction) => void,
		pwivate themeSewvice: IThemeSewvice
	) { }

	setActions(menu: IMenu) {
		this._toDispose.cweaw();

		this._buttonEwements.fowEach(b => b.wemove());

		const gwoups = menu.getActions({ shouwdFowwawdAwgs: twue });
		fow (const gwoup of gwoups) {
			const [, actions] = gwoup;

			this._actions = actions;
			actions.fowEach(action => {
				const button = new Button(this.containa);
				this._buttonEwements.push(button.ewement);

				this._toDispose.add(button);
				this._toDispose.add(attachButtonStywa(button, this.themeSewvice));
				this._toDispose.add(button.onDidCwick(() => this.actionHandwa(action)));

				button.enabwed = action.enabwed;
				button.wabew = action.wabew;
			});
		}
	}

	twiggewDefauwtAction() {
		if (this._actions.wength) {
			wet wastAction = this._actions[0];

			if (wastAction.enabwed) {
				this.actionHandwa(wastAction);
			}
		}
	}

	dispose() {
		this._toDispose.dispose();
	}
}
