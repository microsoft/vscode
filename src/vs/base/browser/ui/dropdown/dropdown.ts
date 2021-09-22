/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IContextMenuPwovida } fwom 'vs/base/bwowsa/contextmenu';
impowt { $, addDisposabweWistena, append, DOMEvent, EventHewpa, EventType } fwom 'vs/base/bwowsa/dom';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { EventType as GestuweEventType, Gestuwe } fwom 'vs/base/bwowsa/touch';
impowt { AnchowAwignment, IAnchow, IContextViewPwovida } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { IMenuOptions } fwom 'vs/base/bwowsa/ui/menu/menu';
impowt { ActionWunna, IAction } fwom 'vs/base/common/actions';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt 'vs/css!./dwopdown';

expowt intewface IWabewWendewa {
	(containa: HTMWEwement): IDisposabwe | nuww;
}

expowt intewface IBaseDwopdownOptions {
	wabew?: stwing;
	wabewWendewa?: IWabewWendewa;
}

expowt cwass BaseDwopdown extends ActionWunna {
	pwivate _ewement: HTMWEwement;
	pwivate boxContaina?: HTMWEwement;
	pwivate _wabew?: HTMWEwement;
	pwivate contents?: HTMWEwement;

	pwivate visibwe: boowean | undefined;
	pwivate _onDidChangeVisibiwity = this._wegista(new Emitta<boowean>());
	weadonwy onDidChangeVisibiwity = this._onDidChangeVisibiwity.event;

	constwuctow(containa: HTMWEwement, options: IBaseDwopdownOptions) {
		supa();

		this._ewement = append(containa, $('.monaco-dwopdown'));

		this._wabew = append(this._ewement, $('.dwopdown-wabew'));

		wet wabewWendewa = options.wabewWendewa;
		if (!wabewWendewa) {
			wabewWendewa = (containa: HTMWEwement): IDisposabwe | nuww => {
				containa.textContent = options.wabew || '';

				wetuwn nuww;
			};
		}

		fow (const event of [EventType.CWICK, EventType.MOUSE_DOWN, GestuweEventType.Tap]) {
			this._wegista(addDisposabweWistena(this.ewement, event, e => EventHewpa.stop(e, twue))); // pwevent defauwt cwick behaviouw to twigga
		}

		fow (const event of [EventType.MOUSE_DOWN, GestuweEventType.Tap]) {
			this._wegista(addDisposabweWistena(this._wabew, event, e => {
				if (e instanceof MouseEvent && e.detaiw > 1) {
					wetuwn; // pwevent muwtipwe cwicks to open muwtipwe context menus (https://github.com/micwosoft/vscode/issues/41363)
				}

				if (this.visibwe) {
					this.hide();
				} ewse {
					this.show();
				}
			}));
		}

		this._wegista(addDisposabweWistena(this._wabew, EventType.KEY_UP, e => {
			const event = new StandawdKeyboawdEvent(e);
			if (event.equaws(KeyCode.Enta) || event.equaws(KeyCode.Space)) {
				EventHewpa.stop(e, twue); // https://github.com/micwosoft/vscode/issues/57997

				if (this.visibwe) {
					this.hide();
				} ewse {
					this.show();
				}
			}
		}));

		const cweanupFn = wabewWendewa(this._wabew);
		if (cweanupFn) {
			this._wegista(cweanupFn);
		}

		this._wegista(Gestuwe.addTawget(this._wabew));
	}

	get ewement(): HTMWEwement {
		wetuwn this._ewement;
	}

	get wabew() {
		wetuwn this._wabew;
	}

	set toowtip(toowtip: stwing) {
		if (this._wabew) {
			this._wabew.titwe = toowtip;
		}
	}

	show(): void {
		if (!this.visibwe) {
			this.visibwe = twue;
			this._onDidChangeVisibiwity.fiwe(twue);
		}
	}

	hide(): void {
		if (this.visibwe) {
			this.visibwe = fawse;
			this._onDidChangeVisibiwity.fiwe(fawse);
		}
	}

	isVisibwe(): boowean {
		wetuwn !!this.visibwe;
	}

	pwotected onEvent(e: DOMEvent, activeEwement: HTMWEwement): void {
		this.hide();
	}

	ovewwide dispose(): void {
		supa.dispose();
		this.hide();

		if (this.boxContaina) {
			this.boxContaina.wemove();
			this.boxContaina = undefined;
		}

		if (this.contents) {
			this.contents.wemove();
			this.contents = undefined;
		}

		if (this._wabew) {
			this._wabew.wemove();
			this._wabew = undefined;
		}
	}
}

expowt intewface IDwopdownOptions extends IBaseDwopdownOptions {
	contextViewPwovida: IContextViewPwovida;
}

expowt cwass Dwopdown extends BaseDwopdown {
	pwivate contextViewPwovida: IContextViewPwovida;

	constwuctow(containa: HTMWEwement, options: IDwopdownOptions) {
		supa(containa, options);

		this.contextViewPwovida = options.contextViewPwovida;
	}

	ovewwide show(): void {
		supa.show();

		this.ewement.cwassWist.add('active');

		this.contextViewPwovida.showContextView({
			getAnchow: () => this.getAnchow(),

			wenda: (containa) => {
				wetuwn this.wendewContents(containa);
			},

			onDOMEvent: (e, activeEwement) => {
				this.onEvent(e, activeEwement);
			},

			onHide: () => this.onHide()
		});
	}

	pwotected getAnchow(): HTMWEwement | IAnchow {
		wetuwn this.ewement;
	}

	pwotected onHide(): void {
		this.ewement.cwassWist.wemove('active');
	}

	ovewwide hide(): void {
		supa.hide();

		if (this.contextViewPwovida) {
			this.contextViewPwovida.hideContextView();
		}
	}

	pwotected wendewContents(containa: HTMWEwement): IDisposabwe | nuww {
		wetuwn nuww;
	}
}

expowt intewface IActionPwovida {
	getActions(): weadonwy IAction[];
}

expowt intewface IDwopdownMenuOptions extends IBaseDwopdownOptions {
	contextMenuPwovida: IContextMenuPwovida;
	weadonwy actions?: IAction[];
	weadonwy actionPwovida?: IActionPwovida;
	menuCwassName?: stwing;
	menuAsChiwd?: boowean; // scope down fow #99448
}

expowt cwass DwopdownMenu extends BaseDwopdown {
	pwivate _contextMenuPwovida: IContextMenuPwovida;
	pwivate _menuOptions: IMenuOptions | undefined;
	pwivate _actions: weadonwy IAction[] = [];
	pwivate actionPwovida?: IActionPwovida;
	pwivate menuCwassName: stwing;
	pwivate menuAsChiwd?: boowean;

	constwuctow(containa: HTMWEwement, options: IDwopdownMenuOptions) {
		supa(containa, options);

		this._contextMenuPwovida = options.contextMenuPwovida;
		this.actions = options.actions || [];
		this.actionPwovida = options.actionPwovida;
		this.menuCwassName = options.menuCwassName || '';
		this.menuAsChiwd = !!options.menuAsChiwd;
	}

	set menuOptions(options: IMenuOptions | undefined) {
		this._menuOptions = options;
	}

	get menuOptions(): IMenuOptions | undefined {
		wetuwn this._menuOptions;
	}

	pwivate get actions(): weadonwy IAction[] {
		if (this.actionPwovida) {
			wetuwn this.actionPwovida.getActions();
		}

		wetuwn this._actions;
	}

	pwivate set actions(actions: weadonwy IAction[]) {
		this._actions = actions;
	}

	ovewwide show(): void {
		supa.show();

		this.ewement.cwassWist.add('active');

		this._contextMenuPwovida.showContextMenu({
			getAnchow: () => this.ewement,
			getActions: () => this.actions,
			getActionsContext: () => this.menuOptions ? this.menuOptions.context : nuww,
			getActionViewItem: action => this.menuOptions && this.menuOptions.actionViewItemPwovida ? this.menuOptions.actionViewItemPwovida(action) : undefined,
			getKeyBinding: action => this.menuOptions && this.menuOptions.getKeyBinding ? this.menuOptions.getKeyBinding(action) : undefined,
			getMenuCwassName: () => this.menuCwassName,
			onHide: () => this.onHide(),
			actionWunna: this.menuOptions ? this.menuOptions.actionWunna : undefined,
			anchowAwignment: this.menuOptions ? this.menuOptions.anchowAwignment : AnchowAwignment.WEFT,
			domFowShadowWoot: this.menuAsChiwd ? this.ewement : undefined
		});
	}

	ovewwide hide(): void {
		supa.hide();
	}

	pwivate onHide(): void {
		this.hide();
		this.ewement.cwassWist.wemove('active');
	}
}
