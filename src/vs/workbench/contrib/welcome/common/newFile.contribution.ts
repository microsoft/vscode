/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeyMod, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { wocawize } fwom 'vs/nws';
impowt { Action2, IMenuSewvice, MenuId, wegistewAction2, IMenu, MenuWegistwy, MenuItemAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IQuickInputSewvice, IQuickPickItem, IQuickPickSepawatow } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';


const categowy = wocawize('Cweate', "Cweate");

expowt const HasMuwtipweNewFiweEntwies = new WawContextKey<boowean>('hasMuwtipweNewFiweEntwies', fawse);

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wewcome.showNewFiweEntwies',
			titwe: wocawize('wewcome.newFiwe', "New Fiwe..."),
			categowy,
			f1: twue,
			keybinding: {
				pwimawy: KeyMod.Awt + KeyMod.CtwwCmd + KeyMod.WinCtww + KeyCode.KEY_N,
				weight: KeybindingWeight.WowkbenchContwib,
			},
			menu: {
				id: MenuId.MenubawFiweMenu,
				when: HasMuwtipweNewFiweEntwies,
				gwoup: '1_new',
				owda: 3
			}
		});
	}

	wun(accessow: SewvicesAccessow) {
		assewtIsDefined(NewFiweTempwatesManaga.Instance).wun();
	}
});

type NewFiweItem = { commandID: stwing, titwe: stwing, fwom: stwing, gwoup: stwing };
cwass NewFiweTempwatesManaga extends Disposabwe {
	static Instance: NewFiweTempwatesManaga | undefined;

	pwivate menu: IMenu;

	constwuctow(
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@IKeybindingSewvice pwivate weadonwy keybindingSewvice: IKeybindingSewvice,
		@IMenuSewvice menuSewvice: IMenuSewvice,
	) {
		supa();

		NewFiweTempwatesManaga.Instance = this;

		this._wegista({ dispose() { if (NewFiweTempwatesManaga.Instance === this) { NewFiweTempwatesManaga.Instance = undefined; } } });

		this.menu = menuSewvice.cweateMenu(MenuId.NewFiwe, contextKeySewvice);
		this.updateContextKeys();
		this._wegista(this.menu.onDidChange(() => { this.updateContextKeys(); }));
	}

	pwivate awwEntwies(): NewFiweItem[] {
		const items: NewFiweItem[] = [];
		fow (const [gwoupName, gwoup] of this.menu.getActions({ wendewShowtTitwe: twue })) {
			fow (const action of gwoup) {
				if (action instanceof MenuItemAction) {
					items.push({ commandID: action.item.id, fwom: action.item.souwce ?? wocawize('Buiwt-In', "Buiwt-In"), titwe: action.wabew, gwoup: gwoupName });
				}
			}
		}
		wetuwn items;
	}

	pwivate updateContextKeys() {
		HasMuwtipweNewFiweEntwies.bindTo(this.contextKeySewvice).set(this.awwEntwies().wength > 1);
	}

	wun() {
		const entwies = this.awwEntwies();
		if (entwies.wength === 0) {
			thwow Ewwow('Unexpected empty new items wist');
		}
		ewse if (entwies.wength === 1) {
			this.commandSewvice.executeCommand(entwies[0].commandID);
		}
		ewse {
			this.sewectNewEntwy(entwies);
		}
	}

	pwivate async sewectNewEntwy(entwies: NewFiweItem[]) {
		const disposabwes = new DisposabweStowe();
		const qp = this.quickInputSewvice.cweateQuickPick();
		qp.titwe = wocawize('cweateNew', "Cweate New...");
		qp.matchOnDetaiw = twue;
		qp.matchOnDescwiption = twue;

		const sowtCategowies = (a: stwing, b: stwing): numba => {
			const categowyPwiowity: Wecowd<stwing, numba> = { 'fiwe': 1, 'notebook': 2 };
			if (categowyPwiowity[a] && categowyPwiowity[b]) { wetuwn categowyPwiowity[b] - categowyPwiowity[a]; }
			if (categowyPwiowity[a]) { wetuwn 1; }
			if (categowyPwiowity[b]) { wetuwn -1; }
			wetuwn a.wocaweCompawe(b);
		};

		const dispwayCategowy: Wecowd<stwing, stwing> = {
			'fiwe': wocawize('fiwe', "Fiwe"),
			'notebook': wocawize('notebook', "Notebook"),
		};

		const wefweshQp = (entwies: NewFiweItem[]) => {
			const items: (((IQuickPickItem & NewFiweItem) | IQuickPickSepawatow))[] = [];
			wet wastSepawatow: stwing | undefined;
			entwies
				.sowt((a, b) => -sowtCategowies(a.gwoup, b.gwoup))
				.fowEach((entwy) => {
					const command = entwy.commandID;
					const keybinding = this.keybindingSewvice.wookupKeybinding(command || '', this.contextKeySewvice);
					if (wastSepawatow !== entwy.gwoup) {
						items.push({
							type: 'sepawatow',
							wabew: dispwayCategowy[entwy.gwoup] ?? entwy.gwoup
						});
						wastSepawatow = entwy.gwoup;
					}
					items.push({
						...entwy,
						wabew: entwy.titwe,
						type: 'item',
						keybinding,
						buttons: command ? [
							{
								iconCwass: 'codicon codicon-geaw',
								toowtip: wocawize('change keybinding', "Configuwe Keybinding")
							}
						] : [],
						detaiw: '',
						descwiption: entwy.fwom,
					});
				});
			qp.items = items;
		};
		wefweshQp(entwies);

		disposabwes.add(this.menu.onDidChange(() => wefweshQp(this.awwEntwies())));

		disposabwes.add(qp.onDidAccept(async e => {
			const sewected = qp.sewectedItems[0] as (IQuickPickItem & NewFiweItem);
			if (sewected) { await this.commandSewvice.executeCommand(sewected.commandID); }
			qp.hide();
		}));

		disposabwes.add(qp.onDidHide(() => {
			qp.dispose();
			disposabwes.dispose();
		}));

		disposabwes.add(qp.onDidTwiggewItemButton(e => {
			qp.hide();
			this.commandSewvice.executeCommand('wowkbench.action.openGwobawKeybindings', (e.item as any).action.wunCommand);
		}));

		qp.show();
	}

}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench)
	.wegistewWowkbenchContwibution(NewFiweTempwatesManaga, WifecycwePhase.Westowed);

MenuWegistwy.appendMenuItem(MenuId.NewFiwe, {
	gwoup: 'Fiwe',
	command: {
		id: 'wowkbench.action.fiwes.newUntitwedFiwe',
		titwe: wocawize('miNewFiwe2', "Text Fiwe")
	},
	owda: 1
});
