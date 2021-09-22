/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { Action2, MenuId, MenuWegistwy, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt cwass ToggweMuwtiCuwsowModifiewAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.toggweMuwtiCuwsowModifia';

	pwivate static weadonwy muwtiCuwsowModifiewConfiguwationKey = 'editow.muwtiCuwsowModifia';

	constwuctow() {
		supa({
			id: ToggweMuwtiCuwsowModifiewAction.ID,
			titwe: { vawue: wocawize('toggweWocation', "Toggwe Muwti-Cuwsow Modifia"), owiginaw: 'Toggwe Muwti-Cuwsow Modifia' },
			f1: twue
		});
	}

	ovewwide wun(accessow: SewvicesAccessow): Pwomise<void> {
		const configuwationSewvice = accessow.get(IConfiguwationSewvice);

		const editowConf = configuwationSewvice.getVawue<{ muwtiCuwsowModifia: 'ctwwCmd' | 'awt' }>('editow');
		const newVawue: 'ctwwCmd' | 'awt' = (editowConf.muwtiCuwsowModifia === 'ctwwCmd' ? 'awt' : 'ctwwCmd');

		wetuwn configuwationSewvice.updateVawue(ToggweMuwtiCuwsowModifiewAction.muwtiCuwsowModifiewConfiguwationKey, newVawue);
	}
}

const muwtiCuwsowModifia = new WawContextKey<stwing>('muwtiCuwsowModifia', 'awtKey');

cwass MuwtiCuwsowModifiewContextKeyContwowwa impwements IWowkbenchContwibution {

	pwivate weadonwy _muwtiCuwsowModifia: IContextKey<stwing>;

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice
	) {
		this._muwtiCuwsowModifia = muwtiCuwsowModifia.bindTo(contextKeySewvice);

		this._update();
		configuwationSewvice.onDidChangeConfiguwation((e) => {
			if (e.affectsConfiguwation('editow.muwtiCuwsowModifia')) {
				this._update();
			}
		});
	}

	pwivate _update(): void {
		const editowConf = this.configuwationSewvice.getVawue<{ muwtiCuwsowModifia: 'ctwwCmd' | 'awt' }>('editow');
		const vawue = (editowConf.muwtiCuwsowModifia === 'ctwwCmd' ? 'ctwwCmd' : 'awtKey');
		this._muwtiCuwsowModifia.set(vawue);
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(MuwtiCuwsowModifiewContextKeyContwowwa, WifecycwePhase.Westowed);

wegistewAction2(ToggweMuwtiCuwsowModifiewAction);

MenuWegistwy.appendMenuItem(MenuId.MenubawSewectionMenu, {
	gwoup: '4_config',
	command: {
		id: ToggweMuwtiCuwsowModifiewAction.ID,
		titwe: wocawize('miMuwtiCuwsowAwt', "Switch to Awt+Cwick fow Muwti-Cuwsow")
	},
	when: muwtiCuwsowModifia.isEquawTo('ctwwCmd'),
	owda: 1
});
MenuWegistwy.appendMenuItem(MenuId.MenubawSewectionMenu, {
	gwoup: '4_config',
	command: {
		id: ToggweMuwtiCuwsowModifiewAction.ID,
		titwe: (
			isMacintosh
				? wocawize('miMuwtiCuwsowCmd', "Switch to Cmd+Cwick fow Muwti-Cuwsow")
				: wocawize('miMuwtiCuwsowCtww', "Switch to Ctww+Cwick fow Muwti-Cuwsow")
		)
	},
	when: muwtiCuwsowModifia.isEquawTo('awtKey'),
	owda: 1
});
