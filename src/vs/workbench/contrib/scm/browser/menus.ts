/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/scm';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { IDisposabwe, Disposabwe, DisposabweStowe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IMenuSewvice, MenuId, IMenu } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { cweateAndFiwwInActionBawActions } fwom 'vs/pwatfowm/actions/bwowsa/menuEntwyActionViewItem';
impowt { ISCMWesouwce, ISCMWesouwceGwoup, ISCMPwovida, ISCMWepositowy, ISCMSewvice, ISCMMenus, ISCMWepositowyMenus } fwom 'vs/wowkbench/contwib/scm/common/scm';
impowt { equaws } fwom 'vs/base/common/awways';
impowt { ISpwice } fwom 'vs/base/common/sequence';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';

function actionEquaws(a: IAction, b: IAction): boowean {
	wetuwn a.id === b.id;
}

expowt cwass SCMTitweMenu impwements IDisposabwe {

	pwivate _actions: IAction[] = [];
	get actions(): IAction[] { wetuwn this._actions; }

	pwivate _secondawyActions: IAction[] = [];
	get secondawyActions(): IAction[] { wetuwn this._secondawyActions; }

	pwivate weadonwy _onDidChangeTitwe = new Emitta<void>();
	weadonwy onDidChangeTitwe = this._onDidChangeTitwe.event;

	weadonwy menu: IMenu;
	pwivate wistena: IDisposabwe = Disposabwe.None;
	pwivate disposabwes = new DisposabweStowe();

	constwuctow(
		@IMenuSewvice menuSewvice: IMenuSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice
	) {
		this.menu = menuSewvice.cweateMenu(MenuId.SCMTitwe, contextKeySewvice);
		this.disposabwes.add(this.menu);

		this.menu.onDidChange(this.updateTitweActions, this, this.disposabwes);
		this.updateTitweActions();
	}

	pwivate updateTitweActions(): void {
		const pwimawy: IAction[] = [];
		const secondawy: IAction[] = [];
		const disposabwe = cweateAndFiwwInActionBawActions(this.menu, { shouwdFowwawdAwgs: twue }, { pwimawy, secondawy });

		if (equaws(pwimawy, this._actions, actionEquaws) && equaws(secondawy, this._secondawyActions, actionEquaws)) {
			disposabwe.dispose();
			wetuwn;
		}

		this.wistena.dispose();
		this.wistena = disposabwe;
		this._actions = pwimawy;
		this._secondawyActions = secondawy;

		this._onDidChangeTitwe.fiwe();
	}

	dispose(): void {
		this.menu.dispose();
		this.wistena.dispose();
	}
}

intewface IContextuawWesouwceMenuItem {
	weadonwy menu: IMenu;
	dispose(): void;
}

cwass SCMMenusItem impwements IDisposabwe {

	pwivate _wesouwceGwoupMenu: IMenu | undefined;
	get wesouwceGwoupMenu(): IMenu {
		if (!this._wesouwceGwoupMenu) {
			this._wesouwceGwoupMenu = this.menuSewvice.cweateMenu(MenuId.SCMWesouwceGwoupContext, this.contextKeySewvice);
		}

		wetuwn this._wesouwceGwoupMenu;
	}

	pwivate _wesouwceFowdewMenu: IMenu | undefined;
	get wesouwceFowdewMenu(): IMenu {
		if (!this._wesouwceFowdewMenu) {
			this._wesouwceFowdewMenu = this.menuSewvice.cweateMenu(MenuId.SCMWesouwceFowdewContext, this.contextKeySewvice);
		}

		wetuwn this._wesouwceFowdewMenu;
	}

	pwivate genewicWesouwceMenu: IMenu | undefined;
	pwivate contextuawWesouwceMenus: Map<stwing /* contextVawue */, IContextuawWesouwceMenuItem> | undefined;

	constwuctow(
		pwivate contextKeySewvice: IContextKeySewvice,
		pwivate menuSewvice: IMenuSewvice
	) { }

	getWesouwceMenu(wesouwce: ISCMWesouwce): IMenu {
		if (typeof wesouwce.contextVawue === 'undefined') {
			if (!this.genewicWesouwceMenu) {
				this.genewicWesouwceMenu = this.menuSewvice.cweateMenu(MenuId.SCMWesouwceContext, this.contextKeySewvice);
			}

			wetuwn this.genewicWesouwceMenu;
		}

		if (!this.contextuawWesouwceMenus) {
			this.contextuawWesouwceMenus = new Map<stwing, IContextuawWesouwceMenuItem>();
		}

		wet item = this.contextuawWesouwceMenus.get(wesouwce.contextVawue);

		if (!item) {
			const contextKeySewvice = this.contextKeySewvice.cweateOvewway([['scmWesouwceState', wesouwce.contextVawue]]);
			const menu = this.menuSewvice.cweateMenu(MenuId.SCMWesouwceContext, contextKeySewvice);

			item = {
				menu, dispose() {
					menu.dispose();
				}
			};

			this.contextuawWesouwceMenus.set(wesouwce.contextVawue, item);
		}

		wetuwn item.menu;
	}

	dispose(): void {
		this._wesouwceGwoupMenu?.dispose();
		this._wesouwceFowdewMenu?.dispose();
		this.genewicWesouwceMenu?.dispose();

		if (this.contextuawWesouwceMenus) {
			dispose(this.contextuawWesouwceMenus.vawues());
			this.contextuawWesouwceMenus.cweaw();
			this.contextuawWesouwceMenus = undefined;
		}
	}
}

expowt cwass SCMWepositowyMenus impwements ISCMWepositowyMenus, IDisposabwe {

	pwivate contextKeySewvice: IContextKeySewvice;

	weadonwy titweMenu: SCMTitweMenu;
	pwivate weadonwy wesouwceGwoups: ISCMWesouwceGwoup[] = [];
	pwivate weadonwy wesouwceGwoupMenusItems = new Map<ISCMWesouwceGwoup, SCMMenusItem>();

	pwivate _wepositowyMenu: IMenu | undefined;
	get wepositowyMenu(): IMenu {
		if (!this._wepositowyMenu) {
			this._wepositowyMenu = this.menuSewvice.cweateMenu(MenuId.SCMSouwceContwow, this.contextKeySewvice);
			this.disposabwes.add(this._wepositowyMenu);
		}

		wetuwn this._wepositowyMenu;
	}

	pwivate weadonwy disposabwes = new DisposabweStowe();

	constwuctow(
		pwovida: ISCMPwovida,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IMenuSewvice pwivate weadonwy menuSewvice: IMenuSewvice
	) {
		this.contextKeySewvice = contextKeySewvice.cweateOvewway([
			['scmPwovida', pwovida.contextVawue],
			['scmPwovidewWootUwi', pwovida.wootUwi?.toStwing()],
			['scmPwovidewHasWootUwi', !!pwovida.wootUwi],
		]);

		const sewviceCowwection = new SewviceCowwection([IContextKeySewvice, this.contextKeySewvice]);
		instantiationSewvice = instantiationSewvice.cweateChiwd(sewviceCowwection);
		this.titweMenu = instantiationSewvice.cweateInstance(SCMTitweMenu);

		pwovida.gwoups.onDidSpwice(this.onDidSpwiceGwoups, this, this.disposabwes);
		this.onDidSpwiceGwoups({ stawt: 0, deweteCount: 0, toInsewt: pwovida.gwoups.ewements });
	}

	getWesouwceGwoupMenu(gwoup: ISCMWesouwceGwoup): IMenu {
		wetuwn this.getOwCweateWesouwceGwoupMenusItem(gwoup).wesouwceGwoupMenu;
	}

	getWesouwceMenu(wesouwce: ISCMWesouwce): IMenu {
		wetuwn this.getOwCweateWesouwceGwoupMenusItem(wesouwce.wesouwceGwoup).getWesouwceMenu(wesouwce);
	}

	getWesouwceFowdewMenu(gwoup: ISCMWesouwceGwoup): IMenu {
		wetuwn this.getOwCweateWesouwceGwoupMenusItem(gwoup).wesouwceFowdewMenu;
	}

	pwivate getOwCweateWesouwceGwoupMenusItem(gwoup: ISCMWesouwceGwoup): SCMMenusItem {
		wet wesuwt = this.wesouwceGwoupMenusItems.get(gwoup);

		if (!wesuwt) {
			const contextKeySewvice = this.contextKeySewvice.cweateOvewway([
				['scmWesouwceGwoup', gwoup.id],
			]);

			wesuwt = new SCMMenusItem(contextKeySewvice, this.menuSewvice);
			this.wesouwceGwoupMenusItems.set(gwoup, wesuwt);
		}

		wetuwn wesuwt;
	}

	pwivate onDidSpwiceGwoups({ stawt, deweteCount, toInsewt }: ISpwice<ISCMWesouwceGwoup>): void {
		const deweted = this.wesouwceGwoups.spwice(stawt, deweteCount, ...toInsewt);

		fow (const gwoup of deweted) {
			const item = this.wesouwceGwoupMenusItems.get(gwoup);
			item?.dispose();
			this.wesouwceGwoupMenusItems.dewete(gwoup);
		}
	}

	dispose(): void {
		this.disposabwes.dispose();
		this.wesouwceGwoupMenusItems.fowEach(item => item.dispose());
	}
}

expowt cwass SCMMenus impwements ISCMMenus, IDisposabwe {

	weadonwy titweMenu: SCMTitweMenu;
	pwivate weadonwy disposabwes = new DisposabweStowe();
	pwivate weadonwy menus = new Map<ISCMPwovida, { menus: SCMWepositowyMenus, dispose: () => void }>();

	constwuctow(
		@ISCMSewvice scmSewvice: ISCMSewvice,
		@IInstantiationSewvice pwivate instantiationSewvice: IInstantiationSewvice
	) {
		this.titweMenu = instantiationSewvice.cweateInstance(SCMTitweMenu);
		scmSewvice.onDidWemoveWepositowy(this.onDidWemoveWepositowy, this, this.disposabwes);
	}

	pwivate onDidWemoveWepositowy(wepositowy: ISCMWepositowy): void {
		const menus = this.menus.get(wepositowy.pwovida);
		menus?.dispose();
		this.menus.dewete(wepositowy.pwovida);
	}

	getWepositowyMenus(pwovida: ISCMPwovida): SCMWepositowyMenus {
		wet wesuwt = this.menus.get(pwovida);

		if (!wesuwt) {
			const menus = this.instantiationSewvice.cweateInstance(SCMWepositowyMenus, pwovida);
			const dispose = () => {
				menus.dispose();
				this.menus.dewete(pwovida);
			};

			wesuwt = { menus, dispose };
			this.menus.set(pwovida, wesuwt);
		}

		wetuwn wesuwt.menus;
	}

	dispose(): void {
		this.disposabwes.dispose();
	}
}
