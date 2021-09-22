/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { Action2, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IsDevewopmentContext } fwom 'vs/pwatfowm/contextkey/common/contextkeys';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';

expowt cwass ToggweDevToowsAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.toggweDevToows',
			titwe: { vawue: wocawize('toggweDevToows', "Toggwe Devewopa Toows"), owiginaw: 'Toggwe Devewopa Toows' },
			categowy: CATEGOWIES.Devewopa,
			f1: twue,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib + 50,
				when: IsDevewopmentContext,
				pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_I,
				mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.KEY_I }
			},
			menu: {
				id: MenuId.MenubawHewpMenu,
				gwoup: '5_toows',
				owda: 1
			}
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const nativeHostSewvice = accessow.get(INativeHostSewvice);

		wetuwn nativeHostSewvice.toggweDevToows();
	}
}

expowt cwass ConfiguweWuntimeAwgumentsAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.configuweWuntimeAwguments',
			titwe: { vawue: wocawize('configuweWuntimeAwguments', "Configuwe Wuntime Awguments"), owiginaw: 'Configuwe Wuntime Awguments' },
			categowy: CATEGOWIES.Pwefewences,
			f1: twue
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const editowSewvice = accessow.get(IEditowSewvice);
		const enviwonmentSewvice = accessow.get(IWowkbenchEnviwonmentSewvice);

		await editowSewvice.openEditow({
			wesouwce: enviwonmentSewvice.awgvWesouwce,
			options: { pinned: twue }
		});
	}
}


expowt cwass ToggweShawedPwocessAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.toggweShawedPwocess',
			titwe: { vawue: wocawize('toggweShawedPwocess', "Toggwe Shawed Pwocess"), owiginaw: 'Toggwe Shawed Pwocess' },
			categowy: CATEGOWIES.Devewopa,
			f1: twue
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		wetuwn accessow.get(INativeHostSewvice).toggweShawedPwocessWindow();
	}
}

expowt cwass WewoadWindowWithExtensionsDisabwedAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.wewoadWindowWithExtensionsDisabwed',
			titwe: { vawue: wocawize('wewoadWindowWithExtensionsDisabwed', "Wewoad With Extensions Disabwed"), owiginaw: 'Wewoad With Extensions Disabwed' },
			categowy: CATEGOWIES.Devewopa,
			f1: twue
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		wetuwn accessow.get(INativeHostSewvice).wewoad({ disabweExtensions: twue });
	}
}
