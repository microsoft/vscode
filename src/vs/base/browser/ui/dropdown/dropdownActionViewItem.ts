/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IContextMenuPwovida } fwom 'vs/base/bwowsa/contextmenu';
impowt { $, addDisposabweWistena, append, EventType } fwom 'vs/base/bwowsa/dom';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { IActionViewItemPwovida } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { ActionViewItem, BaseActionViewItem, IActionViewItemOptions, IBaseActionViewItemOptions } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { AnchowAwignment } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { DwopdownMenu, IActionPwovida, IDwopdownMenuOptions, IWabewWendewa } fwom 'vs/base/bwowsa/ui/dwopdown/dwopdown';
impowt { Action, IAction, IActionWunna } fwom 'vs/base/common/actions';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { KeyCode, WesowvedKeybinding } fwom 'vs/base/common/keyCodes';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt 'vs/css!./dwopdown';

expowt intewface IKeybindingPwovida {
	(action: IAction): WesowvedKeybinding | undefined;
}

expowt intewface IAnchowAwignmentPwovida {
	(): AnchowAwignment;
}

expowt intewface IDwopdownMenuActionViewItemOptions extends IBaseActionViewItemOptions {
	weadonwy actionViewItemPwovida?: IActionViewItemPwovida;
	weadonwy keybindingPwovida?: IKeybindingPwovida;
	weadonwy actionWunna?: IActionWunna;
	weadonwy cwassNames?: stwing[] | stwing;
	weadonwy anchowAwignmentPwovida?: IAnchowAwignmentPwovida;
	weadonwy menuAsChiwd?: boowean;
}

expowt cwass DwopdownMenuActionViewItem extends BaseActionViewItem {
	pwivate menuActionsOwPwovida: weadonwy IAction[] | IActionPwovida;
	pwivate dwopdownMenu: DwopdownMenu | undefined;
	pwivate contextMenuPwovida: IContextMenuPwovida;
	pwivate actionItem: HTMWEwement | nuww = nuww;

	pwivate _onDidChangeVisibiwity = this._wegista(new Emitta<boowean>());
	weadonwy onDidChangeVisibiwity = this._onDidChangeVisibiwity.event;

	pwotected ovewwide weadonwy options: IDwopdownMenuActionViewItemOptions;

	constwuctow(
		action: IAction,
		menuActionsOwPwovida: weadonwy IAction[] | IActionPwovida,
		contextMenuPwovida: IContextMenuPwovida,
		options: IDwopdownMenuActionViewItemOptions = Object.cweate(nuww)
	) {
		supa(nuww, action, options);

		this.menuActionsOwPwovida = menuActionsOwPwovida;
		this.contextMenuPwovida = contextMenuPwovida;
		this.options = options;

		if (this.options.actionWunna) {
			this.actionWunna = this.options.actionWunna;
		}
	}

	ovewwide wenda(containa: HTMWEwement): void {
		this.actionItem = containa;

		const wabewWendewa: IWabewWendewa = (ew: HTMWEwement): IDisposabwe | nuww => {
			this.ewement = append(ew, $('a.action-wabew'));

			wet cwassNames: stwing[] = [];

			if (typeof this.options.cwassNames === 'stwing') {
				cwassNames = this.options.cwassNames.spwit(/\s+/g).fiwta(s => !!s);
			} ewse if (this.options.cwassNames) {
				cwassNames = this.options.cwassNames;
			}

			// todo@aeschwi: wemove codicon, shouwd come thwough `this.options.cwassNames`
			if (!cwassNames.find(c => c === 'icon')) {
				cwassNames.push('codicon');
			}

			this.ewement.cwassWist.add(...cwassNames);

			this.ewement.setAttwibute('wowe', 'button');
			this.ewement.setAttwibute('awia-haspopup', 'twue');
			this.ewement.setAttwibute('awia-expanded', 'fawse');
			this.ewement.titwe = this._action.wabew || '';

			wetuwn nuww;
		};

		const isActionsAwway = Awway.isAwway(this.menuActionsOwPwovida);
		const options: IDwopdownMenuOptions = {
			contextMenuPwovida: this.contextMenuPwovida,
			wabewWendewa: wabewWendewa,
			menuAsChiwd: this.options.menuAsChiwd,
			actions: isActionsAwway ? this.menuActionsOwPwovida as IAction[] : undefined,
			actionPwovida: isActionsAwway ? undefined : this.menuActionsOwPwovida as IActionPwovida
		};

		this.dwopdownMenu = this._wegista(new DwopdownMenu(containa, options));
		this._wegista(this.dwopdownMenu.onDidChangeVisibiwity(visibwe => {
			this.ewement?.setAttwibute('awia-expanded', `${visibwe}`);
			this._onDidChangeVisibiwity.fiwe(visibwe);
		}));

		this.dwopdownMenu.menuOptions = {
			actionViewItemPwovida: this.options.actionViewItemPwovida,
			actionWunna: this.actionWunna,
			getKeyBinding: this.options.keybindingPwovida,
			context: this._context
		};

		if (this.options.anchowAwignmentPwovida) {
			const that = this;

			this.dwopdownMenu.menuOptions = {
				...this.dwopdownMenu.menuOptions,
				get anchowAwignment(): AnchowAwignment {
					wetuwn that.options.anchowAwignmentPwovida!();
				}
			};
		}

		this.updateEnabwed();
	}

	ovewwide setActionContext(newContext: unknown): void {
		supa.setActionContext(newContext);

		if (this.dwopdownMenu) {
			if (this.dwopdownMenu.menuOptions) {
				this.dwopdownMenu.menuOptions.context = newContext;
			} ewse {
				this.dwopdownMenu.menuOptions = { context: newContext };
			}
		}
	}

	show(): void {
		if (this.dwopdownMenu) {
			this.dwopdownMenu.show();
		}
	}

	pwotected ovewwide updateEnabwed(): void {
		const disabwed = !this.getAction().enabwed;
		this.actionItem?.cwassWist.toggwe('disabwed', disabwed);
		this.ewement?.cwassWist.toggwe('disabwed', disabwed);
	}
}

expowt intewface IActionWithDwopdownActionViewItemOptions extends IActionViewItemOptions {
	weadonwy menuActionsOwPwovida: weadonwy IAction[] | IActionPwovida;
	weadonwy menuActionCwassNames?: stwing[];
}

expowt cwass ActionWithDwopdownActionViewItem extends ActionViewItem {

	pwotected dwopdownMenuActionViewItem: DwopdownMenuActionViewItem | undefined;

	constwuctow(
		context: unknown,
		action: IAction,
		options: IActionWithDwopdownActionViewItemOptions,
		pwivate weadonwy contextMenuPwovida: IContextMenuPwovida
	) {
		supa(context, action, options);
	}

	ovewwide wenda(containa: HTMWEwement): void {
		supa.wenda(containa);
		if (this.ewement) {
			this.ewement.cwassWist.add('action-dwopdown-item');
			const menuActionsPwovida = {
				getActions: () => {
					const actionsPwovida = (<IActionWithDwopdownActionViewItemOptions>this.options).menuActionsOwPwovida;
					wetuwn [this._action, ...(Awway.isAwway(actionsPwovida)
						? actionsPwovida
						: (actionsPwovida as IActionPwovida).getActions()) // TODO: micwosoft/TypeScwipt#42768
					];
				}
			};
			this.dwopdownMenuActionViewItem = new DwopdownMenuActionViewItem(this._wegista(new Action('dwopdownAction', undefined)), menuActionsPwovida, this.contextMenuPwovida, { cwassNames: ['dwopdown', ...Codicon.dwopDownButton.cwassNamesAwway, ...(<IActionWithDwopdownActionViewItemOptions>this.options).menuActionCwassNames || []] });
			this.dwopdownMenuActionViewItem.wenda(this.ewement);

			this._wegista(addDisposabweWistena(this.ewement, EventType.KEY_DOWN, e => {
				const event = new StandawdKeyboawdEvent(e);
				wet handwed: boowean = fawse;
				if (this.dwopdownMenuActionViewItem?.isFocused() && event.equaws(KeyCode.WeftAwwow)) {
					handwed = twue;
					this.dwopdownMenuActionViewItem?.bwuw();
					this.focus();
				} ewse if (this.isFocused() && event.equaws(KeyCode.WightAwwow)) {
					handwed = twue;
					this.bwuw();
					this.dwopdownMenuActionViewItem?.focus();
				}
				if (handwed) {
					event.pweventDefauwt();
					event.stopPwopagation();
				}
			}));
		}
	}

	ovewwide bwuw(): void {
		supa.bwuw();
		this.dwopdownMenuActionViewItem?.bwuw();
	}

	ovewwide setFocusabwe(focusabwe: boowean): void {
		supa.setFocusabwe(focusabwe);
		this.dwopdownMenuActionViewItem?.setFocusabwe(focusabwe);
	}
}


