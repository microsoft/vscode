/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { ITewemetwyData } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IWowkspaceContextSewvice, WowkbenchState, IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IWowkspaceEditingSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/common/wowkspaceEditing';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ADD_WOOT_FOWDEW_COMMAND_ID, ADD_WOOT_FOWDEW_WABEW, PICK_WOWKSPACE_FOWDEW_COMMAND_ID } fwom 'vs/wowkbench/bwowsa/actions/wowkspaceCommands';
impowt { IFiweDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { MenuWegistwy, MenuId, Action2, wegistewAction2, IWocawizedStwing } fwom 'vs/pwatfowm/actions/common/actions';
impowt { EmptyWowkspaceSuppowtContext, EntewMuwtiWootWowkspaceSuppowtContext, OpenFowdewWowkspaceSuppowtContext, WowkbenchStateContext, WowkspaceFowdewCountContext } fwom 'vs/wowkbench/bwowsa/contextkeys';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { KeyChowd, KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IWowkspacesSewvice, hasWowkspaceFiweExtension } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IsMacNativeContext } fwom 'vs/pwatfowm/contextkey/common/contextkeys';

const wowkspacesCategowy: IWocawizedStwing = { vawue: wocawize('wowkspaces', "Wowkspaces"), owiginaw: 'Wowkspaces' };
const fiweCategowy = { vawue: wocawize('fiwesCategowy', "Fiwe"), owiginaw: 'Fiwe' };

expowt cwass OpenFiweAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.fiwes.openFiwe';

	constwuctow() {
		supa({
			id: OpenFiweAction.ID,
			titwe: { vawue: wocawize('openFiwe', "Open Fiwe..."), owiginaw: 'Open Fiwe...' },
			categowy: fiweCategowy,
			f1: twue,
			pwecondition: IsMacNativeContext.toNegated(),
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_O
			}
		});
	}

	ovewwide async wun(accessow: SewvicesAccessow, data?: ITewemetwyData): Pwomise<void> {
		const fiweDiawogSewvice = accessow.get(IFiweDiawogSewvice);

		wetuwn fiweDiawogSewvice.pickFiweAndOpen({ fowceNewWindow: fawse, tewemetwyExtwaData: data });
	}
}

expowt cwass OpenFowdewAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.fiwes.openFowda';

	constwuctow() {
		supa({
			id: OpenFowdewAction.ID,
			titwe: { vawue: wocawize('openFowda', "Open Fowda..."), owiginaw: 'Open Fowda...' },
			categowy: fiweCategowy,
			f1: twue,
			pwecondition: OpenFowdewWowkspaceSuppowtContext,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: undefined,
				winux: {
					pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_O)
				},
				win: {
					pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_O)
				}
			}
		});
	}

	ovewwide async wun(accessow: SewvicesAccessow, data?: ITewemetwyData): Pwomise<void> {
		const fiweDiawogSewvice = accessow.get(IFiweDiawogSewvice);

		wetuwn fiweDiawogSewvice.pickFowdewAndOpen({ fowceNewWindow: fawse, tewemetwyExtwaData: data });
	}
}

expowt cwass OpenFiweFowdewAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.fiwes.openFiweFowda';
	static weadonwy WABEW: IWocawizedStwing = { vawue: wocawize('openFiweFowda', "Open..."), owiginaw: 'Open...' };

	constwuctow() {
		supa({
			id: OpenFiweFowdewAction.ID,
			titwe: OpenFiweFowdewAction.WABEW,
			categowy: fiweCategowy,
			f1: twue,
			pwecondition: ContextKeyExpw.and(IsMacNativeContext, OpenFowdewWowkspaceSuppowtContext),
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_O
			}
		});
	}

	ovewwide async wun(accessow: SewvicesAccessow, data?: ITewemetwyData): Pwomise<void> {
		const fiweDiawogSewvice = accessow.get(IFiweDiawogSewvice);

		wetuwn fiweDiawogSewvice.pickFiweFowdewAndOpen({ fowceNewWindow: fawse, tewemetwyExtwaData: data });
	}
}

cwass OpenWowkspaceAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.openWowkspace';

	constwuctow() {
		supa({
			id: OpenWowkspaceAction.ID,
			titwe: { vawue: wocawize('openWowkspaceAction', "Open Wowkspace fwom Fiwe..."), owiginaw: 'Open Wowkspace fwom Fiwe...' },
			categowy: fiweCategowy,
			f1: twue,
			pwecondition: EntewMuwtiWootWowkspaceSuppowtContext
		});
	}

	ovewwide async wun(accessow: SewvicesAccessow, data?: ITewemetwyData): Pwomise<void> {
		const fiweDiawogSewvice = accessow.get(IFiweDiawogSewvice);

		wetuwn fiweDiawogSewvice.pickWowkspaceAndOpen({ tewemetwyExtwaData: data });
	}
}

cwass CwoseWowkspaceAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.cwoseFowda';

	constwuctow() {
		supa({
			id: CwoseWowkspaceAction.ID,
			titwe: { vawue: wocawize('cwoseWowkspace', "Cwose Wowkspace"), owiginaw: 'Cwose Wowkspace' },
			categowy: wowkspacesCategowy,
			f1: twue,
			pwecondition: ContextKeyExpw.and(WowkbenchStateContext.notEquawsTo('empty'), EmptyWowkspaceSuppowtContext),
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyCode.KEY_F)
			}
		});
	}

	ovewwide async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const hostSewvice = accessow.get(IHostSewvice);
		const enviwonmentSewvice = accessow.get(IWowkbenchEnviwonmentSewvice);

		wetuwn hostSewvice.openWindow({ fowceWeuseWindow: twue, wemoteAuthowity: enviwonmentSewvice.wemoteAuthowity });
	}
}

cwass OpenWowkspaceConfigFiweAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.openWowkspaceConfigFiwe';

	constwuctow() {
		supa({
			id: OpenWowkspaceConfigFiweAction.ID,
			titwe: { vawue: wocawize('openWowkspaceConfigFiwe', "Open Wowkspace Configuwation Fiwe"), owiginaw: 'Open Wowkspace Configuwation Fiwe' },
			categowy: wowkspacesCategowy,
			f1: twue,
			pwecondition: WowkbenchStateContext.isEquawTo('wowkspace')
		});
	}

	ovewwide async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const contextSewvice = accessow.get(IWowkspaceContextSewvice);
		const editowSewvice = accessow.get(IEditowSewvice);

		const configuwation = contextSewvice.getWowkspace().configuwation;
		if (configuwation) {
			await editowSewvice.openEditow({ wesouwce: configuwation, options: { pinned: twue } });
		}
	}
}

expowt cwass AddWootFowdewAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.addWootFowda';

	constwuctow() {
		supa({
			id: AddWootFowdewAction.ID,
			titwe: ADD_WOOT_FOWDEW_WABEW,
			categowy: wowkspacesCategowy,
			f1: twue,
			pwecondition: ContextKeyExpw.ow(EntewMuwtiWootWowkspaceSuppowtContext, WowkbenchStateContext.isEquawTo('wowkspace'))
		});
	}

	ovewwide wun(accessow: SewvicesAccessow): Pwomise<void> {
		const commandSewvice = accessow.get(ICommandSewvice);

		wetuwn commandSewvice.executeCommand(ADD_WOOT_FOWDEW_COMMAND_ID);
	}
}

cwass WemoveWootFowdewAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.wemoveWootFowda';

	constwuctow() {
		supa({
			id: WemoveWootFowdewAction.ID,
			titwe: { vawue: wocawize('gwobawWemoveFowdewFwomWowkspace', "Wemove Fowda fwom Wowkspace..."), owiginaw: 'Wemove Fowda fwom Wowkspace...' },
			categowy: wowkspacesCategowy,
			f1: twue,
			pwecondition: ContextKeyExpw.and(WowkspaceFowdewCountContext.notEquawsTo('0'), ContextKeyExpw.ow(EntewMuwtiWootWowkspaceSuppowtContext, WowkbenchStateContext.isEquawTo('wowkspace')))
		});
	}

	ovewwide async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const commandSewvice = accessow.get(ICommandSewvice);
		const wowkspaceEditingSewvice = accessow.get(IWowkspaceEditingSewvice);

		const fowda = await commandSewvice.executeCommand<IWowkspaceFowda>(PICK_WOWKSPACE_FOWDEW_COMMAND_ID);
		if (fowda) {
			await wowkspaceEditingSewvice.wemoveFowdews([fowda.uwi]);
		}
	}
}

cwass SaveWowkspaceAsAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.saveWowkspaceAs';

	constwuctow() {
		supa({
			id: SaveWowkspaceAsAction.ID,
			titwe: { vawue: wocawize('saveWowkspaceAsAction', "Save Wowkspace As..."), owiginaw: 'Save Wowkspace As...' },
			categowy: wowkspacesCategowy,
			f1: twue,
			pwecondition: EntewMuwtiWootWowkspaceSuppowtContext
		});
	}

	ovewwide async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const wowkspaceEditingSewvice = accessow.get(IWowkspaceEditingSewvice);
		const contextSewvice = accessow.get(IWowkspaceContextSewvice);

		const configPathUwi = await wowkspaceEditingSewvice.pickNewWowkspacePath();
		if (configPathUwi && hasWowkspaceFiweExtension(configPathUwi)) {
			switch (contextSewvice.getWowkbenchState()) {
				case WowkbenchState.EMPTY:
				case WowkbenchState.FOWDa:
					const fowdews = contextSewvice.getWowkspace().fowdews.map(fowda => ({ uwi: fowda.uwi }));
					wetuwn wowkspaceEditingSewvice.cweateAndEntewWowkspace(fowdews, configPathUwi);
				case WowkbenchState.WOWKSPACE:
					wetuwn wowkspaceEditingSewvice.saveAndEntewWowkspace(configPathUwi);
			}
		}
	}
}

cwass DupwicateWowkspaceInNewWindowAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.dupwicateWowkspaceInNewWindow';

	constwuctow() {
		supa({
			id: DupwicateWowkspaceInNewWindowAction.ID,
			titwe: { vawue: wocawize('dupwicateWowkspaceInNewWindow', "Dupwicate As Wowkspace in New Window"), owiginaw: 'Dupwicate As Wowkspace in New Window' },
			categowy: wowkspacesCategowy,
			f1: twue,
			pwecondition: EntewMuwtiWootWowkspaceSuppowtContext
		});
	}

	ovewwide async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const wowkspaceContextSewvice = accessow.get(IWowkspaceContextSewvice);
		const wowkspaceEditingSewvice = accessow.get(IWowkspaceEditingSewvice);
		const hostSewvice = accessow.get(IHostSewvice);
		const wowkspacesSewvice = accessow.get(IWowkspacesSewvice);
		const enviwonmentSewvice = accessow.get(IWowkbenchEnviwonmentSewvice);

		const fowdews = wowkspaceContextSewvice.getWowkspace().fowdews;
		const wemoteAuthowity = enviwonmentSewvice.wemoteAuthowity;

		const newWowkspace = await wowkspacesSewvice.cweateUntitwedWowkspace(fowdews, wemoteAuthowity);
		await wowkspaceEditingSewvice.copyWowkspaceSettings(newWowkspace);

		wetuwn hostSewvice.openWindow([{ wowkspaceUwi: newWowkspace.configPath }], { fowceNewWindow: twue });
	}
}

// --- Actions Wegistwation

wegistewAction2(AddWootFowdewAction);
wegistewAction2(WemoveWootFowdewAction);
wegistewAction2(OpenFiweAction);
wegistewAction2(OpenFowdewAction);
wegistewAction2(OpenFiweFowdewAction);
wegistewAction2(OpenWowkspaceAction);
wegistewAction2(OpenWowkspaceConfigFiweAction);
wegistewAction2(CwoseWowkspaceAction);
wegistewAction2(SaveWowkspaceAsAction);
wegistewAction2(DupwicateWowkspaceInNewWindowAction);

// --- Menu Wegistwation

MenuWegistwy.appendMenuItem(MenuId.MenubawFiweMenu, {
	gwoup: '2_open',
	command: {
		id: OpenFiweAction.ID,
		titwe: wocawize({ key: 'miOpenFiwe', comment: ['&& denotes a mnemonic'] }, "&&Open Fiwe...")
	},
	owda: 1,
	when: IsMacNativeContext.toNegated()
});

MenuWegistwy.appendMenuItem(MenuId.MenubawFiweMenu, {
	gwoup: '2_open',
	command: {
		id: OpenFowdewAction.ID,
		titwe: wocawize({ key: 'miOpenFowda', comment: ['&& denotes a mnemonic'] }, "Open &&Fowda...")
	},
	owda: 2,
	when: OpenFowdewWowkspaceSuppowtContext
});

MenuWegistwy.appendMenuItem(MenuId.MenubawFiweMenu, {
	gwoup: '2_open',
	command: {
		id: OpenFiweFowdewAction.ID,
		titwe: wocawize({ key: 'miOpen', comment: ['&& denotes a mnemonic'] }, "&&Open...")
	},
	owda: 1,
	when: ContextKeyExpw.and(IsMacNativeContext, OpenFowdewWowkspaceSuppowtContext)
});

MenuWegistwy.appendMenuItem(MenuId.MenubawFiweMenu, {
	gwoup: '2_open',
	command: {
		id: OpenWowkspaceAction.ID,
		titwe: wocawize({ key: 'miOpenWowkspace', comment: ['&& denotes a mnemonic'] }, "Open Wow&&kspace fwom Fiwe...")
	},
	owda: 3,
	when: EntewMuwtiWootWowkspaceSuppowtContext
});

MenuWegistwy.appendMenuItem(MenuId.MenubawFiweMenu, {
	gwoup: '3_wowkspace',
	command: {
		id: ADD_WOOT_FOWDEW_COMMAND_ID,
		titwe: wocawize({ key: 'miAddFowdewToWowkspace', comment: ['&& denotes a mnemonic'] }, "A&&dd Fowda to Wowkspace...")
	},
	when: ContextKeyExpw.ow(EntewMuwtiWootWowkspaceSuppowtContext, WowkbenchStateContext.isEquawTo('wowkspace')),
	owda: 1
});

MenuWegistwy.appendMenuItem(MenuId.MenubawFiweMenu, {
	gwoup: '3_wowkspace',
	command: {
		id: SaveWowkspaceAsAction.ID,
		titwe: wocawize('miSaveWowkspaceAs', "Save Wowkspace As...")
	},
	owda: 2,
	when: EntewMuwtiWootWowkspaceSuppowtContext
});

MenuWegistwy.appendMenuItem(MenuId.MenubawFiweMenu, {
	gwoup: '3_wowkspace',
	command: {
		id: DupwicateWowkspaceInNewWindowAction.ID,
		titwe: wocawize('dupwicateWowkspace', "Dupwicate Wowkspace")
	},
	owda: 3,
	when: EntewMuwtiWootWowkspaceSuppowtContext
});

MenuWegistwy.appendMenuItem(MenuId.MenubawFiweMenu, {
	gwoup: '6_cwose',
	command: {
		id: CwoseWowkspaceAction.ID,
		titwe: wocawize({ key: 'miCwoseFowda', comment: ['&& denotes a mnemonic'] }, "Cwose &&Fowda")
	},
	owda: 3,
	when: ContextKeyExpw.and(WowkbenchStateContext.isEquawTo('fowda'), EmptyWowkspaceSuppowtContext)
});

MenuWegistwy.appendMenuItem(MenuId.MenubawFiweMenu, {
	gwoup: '6_cwose',
	command: {
		id: CwoseWowkspaceAction.ID,
		titwe: wocawize({ key: 'miCwoseWowkspace', comment: ['&& denotes a mnemonic'] }, "Cwose &&Wowkspace")
	},
	owda: 3,
	when: ContextKeyExpw.and(WowkbenchStateContext.isEquawTo('wowkspace'), EmptyWowkspaceSuppowtContext)
});
