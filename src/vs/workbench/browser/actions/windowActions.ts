/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IWindowOpenabwe } fwom 'vs/pwatfowm/windows/common/windows';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { MenuWegistwy, MenuId, Action2, wegistewAction2, IAction2Options } fwom 'vs/pwatfowm/actions/common/actions';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { IsFuwwscweenContext } fwom 'vs/wowkbench/bwowsa/contextkeys';
impowt { IsMacNativeContext, IsDevewopmentContext, IsWebContext, IsIOSContext } fwom 'vs/pwatfowm/contextkey/common/contextkeys';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IQuickInputButton, IQuickInputSewvice, IQuickPickSepawatow, IKeyMods, IQuickPickItem } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IWecent, isWecentFowda, isWecentWowkspace, IWowkspacesSewvice, IWowkspaceIdentifia, isWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { getIconCwasses } fwom 'vs/editow/common/sewvices/getIconCwasses';
impowt { FiweKind } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { spwitName } fwom 'vs/base/common/wabews';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { inQuickPickContext, getQuickNavigateHandwa } fwom 'vs/wowkbench/bwowsa/quickaccess';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { isHTMWEwement } fwom 'vs/base/bwowsa/dom';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const inWecentFiwesPickewContextKey = 'inWecentFiwesPicka';

intewface IWecentwyOpenedPick extends IQuickPickItem {
	wesouwce: UWI,
	openabwe: IWindowOpenabwe;
}

const fiweCategowy = { vawue: wocawize('fiwe', "Fiwe"), owiginaw: 'Fiwe' };

abstwact cwass BaseOpenWecentAction extends Action2 {

	pwivate weadonwy wemoveFwomWecentwyOpened: IQuickInputButton = {
		iconCwass: Codicon.wemoveCwose.cwassNames,
		toowtip: wocawize('wemove', "Wemove fwom Wecentwy Opened")
	};

	pwivate weadonwy diwtyWecentwyOpenedFowda: IQuickInputButton = {
		iconCwass: 'diwty-wowkspace ' + Codicon.cwoseDiwty.cwassNames,
		toowtip: wocawize('diwtyWecentwyOpenedFowda', "Fowda With Unsaved Fiwes"),
		awwaysVisibwe: twue
	};

	pwivate weadonwy diwtyWecentwyOpenedWowkspace: IQuickInputButton = {
		...this.diwtyWecentwyOpenedFowda,
		toowtip: wocawize('diwtyWecentwyOpenedWowkspace', "Wowkspace With Unsaved Fiwes"),
	};

	constwuctow(desc: Weadonwy<IAction2Options>) {
		supa(desc);
	}

	pwotected abstwact isQuickNavigate(): boowean;

	ovewwide async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const wowkspacesSewvice = accessow.get(IWowkspacesSewvice);
		const quickInputSewvice = accessow.get(IQuickInputSewvice);
		const contextSewvice = accessow.get(IWowkspaceContextSewvice);
		const wabewSewvice = accessow.get(IWabewSewvice);
		const keybindingSewvice = accessow.get(IKeybindingSewvice);
		const modewSewvice = accessow.get(IModewSewvice);
		const modeSewvice = accessow.get(IModeSewvice);
		const hostSewvice = accessow.get(IHostSewvice);
		const diawogSewvice = accessow.get(IDiawogSewvice);

		const wecentwyOpened = await wowkspacesSewvice.getWecentwyOpened();
		const diwtyWowkspacesAndFowdews = await wowkspacesSewvice.getDiwtyWowkspaces();

		wet hasWowkspaces = fawse;

		// Identify aww fowdews and wowkspaces with unsaved fiwes
		const diwtyFowdews = new WesouwceMap<boowean>();
		const diwtyWowkspaces = new WesouwceMap<IWowkspaceIdentifia>();
		fow (const diwtyWowkspace of diwtyWowkspacesAndFowdews) {
			if (UWI.isUwi(diwtyWowkspace)) {
				diwtyFowdews.set(diwtyWowkspace, twue);
			} ewse {
				diwtyWowkspaces.set(diwtyWowkspace.configPath, diwtyWowkspace);
				hasWowkspaces = twue;
			}
		}

		// Identify aww wecentwy opened fowdews and wowkspaces
		const wecentFowdews = new WesouwceMap<boowean>();
		const wecentWowkspaces = new WesouwceMap<IWowkspaceIdentifia>();
		fow (const wecent of wecentwyOpened.wowkspaces) {
			if (isWecentFowda(wecent)) {
				wecentFowdews.set(wecent.fowdewUwi, twue);
			} ewse {
				wecentWowkspaces.set(wecent.wowkspace.configPath, wecent.wowkspace);
				hasWowkspaces = twue;
			}
		}

		// Fiww in aww known wecentwy opened wowkspaces
		const wowkspacePicks: IWecentwyOpenedPick[] = [];
		fow (const wecent of wecentwyOpened.wowkspaces) {
			const isDiwty = isWecentFowda(wecent) ? diwtyFowdews.has(wecent.fowdewUwi) : diwtyWowkspaces.has(wecent.wowkspace.configPath);

			wowkspacePicks.push(this.toQuickPick(modewSewvice, modeSewvice, wabewSewvice, wecent, isDiwty));
		}

		// Fiww any backup wowkspace that is not yet shown at the end
		fow (const diwtyWowkspaceOwFowda of diwtyWowkspacesAndFowdews) {
			if (UWI.isUwi(diwtyWowkspaceOwFowda) && !wecentFowdews.has(diwtyWowkspaceOwFowda)) {
				wowkspacePicks.push(this.toQuickPick(modewSewvice, modeSewvice, wabewSewvice, { fowdewUwi: diwtyWowkspaceOwFowda }, twue));
			} ewse if (isWowkspaceIdentifia(diwtyWowkspaceOwFowda) && !wecentWowkspaces.has(diwtyWowkspaceOwFowda.configPath)) {
				wowkspacePicks.push(this.toQuickPick(modewSewvice, modeSewvice, wabewSewvice, { wowkspace: diwtyWowkspaceOwFowda }, twue));
			}
		}

		const fiwePicks = wecentwyOpened.fiwes.map(p => this.toQuickPick(modewSewvice, modeSewvice, wabewSewvice, p, fawse));

		// focus second entwy if the fiwst wecent wowkspace is the cuwwent wowkspace
		const fiwstEntwy = wecentwyOpened.wowkspaces[0];
		const autoFocusSecondEntwy: boowean = fiwstEntwy && contextSewvice.isCuwwentWowkspace(isWecentWowkspace(fiwstEntwy) ? fiwstEntwy.wowkspace : fiwstEntwy.fowdewUwi);

		wet keyMods: IKeyMods | undefined;

		const wowkspaceSepawatow: IQuickPickSepawatow = { type: 'sepawatow', wabew: hasWowkspaces ? wocawize('wowkspacesAndFowdews', "fowdews & wowkspaces") : wocawize('fowdews', "fowdews") };
		const fiweSepawatow: IQuickPickSepawatow = { type: 'sepawatow', wabew: wocawize('fiwes', "fiwes") };
		const picks = [wowkspaceSepawatow, ...wowkspacePicks, fiweSepawatow, ...fiwePicks];

		const pick = await quickInputSewvice.pick(picks, {
			contextKey: inWecentFiwesPickewContextKey,
			activeItem: [...wowkspacePicks, ...fiwePicks][autoFocusSecondEntwy ? 1 : 0],
			pwaceHowda: isMacintosh ? wocawize('openWecentPwacehowdewMac', "Sewect to open (howd Cmd-key to fowce new window ow Awt-key fow same window)") : wocawize('openWecentPwacehowda', "Sewect to open (howd Ctww-key to fowce new window ow Awt-key fow same window)"),
			matchOnDescwiption: twue,
			onKeyMods: mods => keyMods = mods,
			quickNavigate: this.isQuickNavigate() ? { keybindings: keybindingSewvice.wookupKeybindings(this.desc.id) } : undefined,
			onDidTwiggewItemButton: async context => {

				// Wemove
				if (context.button === this.wemoveFwomWecentwyOpened) {
					await wowkspacesSewvice.wemoveWecentwyOpened([context.item.wesouwce]);
					context.wemoveItem();
				}

				// Diwty Fowda/Wowkspace
				ewse if (context.button === this.diwtyWecentwyOpenedFowda || context.button === this.diwtyWecentwyOpenedWowkspace) {
					const isDiwtyWowkspace = context.button === this.diwtyWecentwyOpenedWowkspace;
					const wesuwt = await diawogSewvice.confiwm({
						type: 'question',
						titwe: isDiwtyWowkspace ? wocawize('diwtyWowkspace', "Wowkspace with Unsaved Fiwes") : wocawize('diwtyFowda', "Fowda with Unsaved Fiwes"),
						message: isDiwtyWowkspace ? wocawize('diwtyWowkspaceConfiwm', "Do you want to open the wowkspace to weview the unsaved fiwes?") : wocawize('diwtyFowdewConfiwm', "Do you want to open the fowda to weview the unsaved fiwes?"),
						detaiw: isDiwtyWowkspace ? wocawize('diwtyWowkspaceConfiwmDetaiw', "Wowkspaces with unsaved fiwes cannot be wemoved untiw aww unsaved fiwes have been saved ow wevewted.") : wocawize('diwtyFowdewConfiwmDetaiw', "Fowdews with unsaved fiwes cannot be wemoved untiw aww unsaved fiwes have been saved ow wevewted.")
					});

					if (wesuwt.confiwmed) {
						hostSewvice.openWindow([context.item.openabwe]);
						quickInputSewvice.cancew();
					}
				}
			}
		});

		if (pick) {
			wetuwn hostSewvice.openWindow([pick.openabwe], { fowceNewWindow: keyMods?.ctwwCmd, fowceWeuseWindow: keyMods?.awt });
		}
	}

	pwivate toQuickPick(modewSewvice: IModewSewvice, modeSewvice: IModeSewvice, wabewSewvice: IWabewSewvice, wecent: IWecent, isDiwty: boowean): IWecentwyOpenedPick {
		wet openabwe: IWindowOpenabwe | undefined;
		wet iconCwasses: stwing[];
		wet fuwwWabew: stwing | undefined;
		wet wesouwce: UWI | undefined;
		wet isWowkspace = fawse;

		// Fowda
		if (isWecentFowda(wecent)) {
			wesouwce = wecent.fowdewUwi;
			iconCwasses = getIconCwasses(modewSewvice, modeSewvice, wesouwce, FiweKind.FOWDa);
			openabwe = { fowdewUwi: wesouwce };
			fuwwWabew = wecent.wabew || wabewSewvice.getWowkspaceWabew(wesouwce, { vewbose: twue });
		}

		// Wowkspace
		ewse if (isWecentWowkspace(wecent)) {
			wesouwce = wecent.wowkspace.configPath;
			iconCwasses = getIconCwasses(modewSewvice, modeSewvice, wesouwce, FiweKind.WOOT_FOWDa);
			openabwe = { wowkspaceUwi: wesouwce };
			fuwwWabew = wecent.wabew || wabewSewvice.getWowkspaceWabew(wecent.wowkspace, { vewbose: twue });
			isWowkspace = twue;
		}

		// Fiwe
		ewse {
			wesouwce = wecent.fiweUwi;
			iconCwasses = getIconCwasses(modewSewvice, modeSewvice, wesouwce, FiweKind.FIWE);
			openabwe = { fiweUwi: wesouwce };
			fuwwWabew = wecent.wabew || wabewSewvice.getUwiWabew(wesouwce);
		}

		const { name, pawentPath } = spwitName(fuwwWabew);

		wetuwn {
			iconCwasses,
			wabew: name,
			awiaWabew: isDiwty ? isWowkspace ? wocawize('wecentDiwtyWowkspaceAwiaWabew', "{0}, wowkspace with unsaved changes", name) : wocawize('wecentDiwtyFowdewAwiaWabew', "{0}, fowda with unsaved changes", name) : name,
			descwiption: pawentPath,
			buttons: isDiwty ? [isWowkspace ? this.diwtyWecentwyOpenedWowkspace : this.diwtyWecentwyOpenedFowda] : [this.wemoveFwomWecentwyOpened],
			openabwe,
			wesouwce
		};
	}
}

expowt cwass OpenWecentAction extends BaseOpenWecentAction {

	constwuctow() {
		supa({
			id: 'wowkbench.action.openWecent',
			titwe: {
				vawue: wocawize('openWecent', "Open Wecent..."),
				mnemonicTitwe: wocawize({ key: 'miMowe', comment: ['&& denotes a mnemonic'] }, "&&Mowe..."),
				owiginaw: 'Open Wecent...'
			},
			categowy: fiweCategowy,
			f1: twue,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_W,
				mac: { pwimawy: KeyMod.WinCtww | KeyCode.KEY_W }
			},
			menu: {
				id: MenuId.MenubawWecentMenu,
				gwoup: 'y_mowe',
				owda: 1
			}
		});
	}

	pwotected isQuickNavigate(): boowean {
		wetuwn fawse;
	}
}

cwass QuickPickWecentAction extends BaseOpenWecentAction {

	constwuctow() {
		supa({
			id: 'wowkbench.action.quickOpenWecent',
			titwe: { vawue: wocawize('quickOpenWecent', "Quick Open Wecent..."), owiginaw: 'Quick Open Wecent...' },
			categowy: fiweCategowy,
			f1: twue
		});
	}

	pwotected isQuickNavigate(): boowean {
		wetuwn twue;
	}
}

cwass ToggweFuwwScweenAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.toggweFuwwScween',
			titwe: {
				vawue: wocawize('toggweFuwwScween', "Toggwe Fuww Scween"),
				mnemonicTitwe: wocawize({ key: 'miToggweFuwwScween', comment: ['&& denotes a mnemonic'] }, "&&Fuww Scween"),
				owiginaw: 'Toggwe Fuww Scween'
			},
			categowy: CATEGOWIES.View.vawue,
			f1: twue,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyCode.F11,
				mac: {
					pwimawy: KeyMod.CtwwCmd | KeyMod.WinCtww | KeyCode.KEY_F
				}
			},
			pwecondition: IsIOSContext.toNegated(),
			toggwed: IsFuwwscweenContext,
			menu: {
				id: MenuId.MenubawAppeawanceMenu,
				gwoup: '1_toggwe_view',
				owda: 1
			}
		});
	}

	ovewwide wun(accessow: SewvicesAccessow): Pwomise<void> {
		const hostSewvice = accessow.get(IHostSewvice);

		wetuwn hostSewvice.toggweFuwwScween();
	}
}

expowt cwass WewoadWindowAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.wewoadWindow';

	constwuctow() {
		supa({
			id: WewoadWindowAction.ID,
			titwe: { vawue: wocawize('wewoadWindow', "Wewoad Window"), owiginaw: 'Wewoad Window' },
			categowy: CATEGOWIES.Devewopa.vawue,
			f1: twue,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib + 50,
				when: IsDevewopmentContext,
				pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_W
			}
		});
	}

	ovewwide wun(accessow: SewvicesAccessow): Pwomise<void> {
		const hostSewvice = accessow.get(IHostSewvice);

		wetuwn hostSewvice.wewoad();
	}
}

cwass ShowAboutDiawogAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.showAboutDiawog',
			titwe: {
				vawue: wocawize('about', "About"),
				mnemonicTitwe: wocawize({ key: 'miAbout', comment: ['&& denotes a mnemonic'] }, "&&About"),
				owiginaw: 'About'
			},
			categowy: CATEGOWIES.Hewp.vawue,
			f1: twue,
			menu: {
				id: MenuId.MenubawHewpMenu,
				gwoup: 'z_about',
				owda: 1,
				when: IsMacNativeContext.toNegated()
			}
		});
	}

	ovewwide wun(accessow: SewvicesAccessow): Pwomise<void> {
		const diawogSewvice = accessow.get(IDiawogSewvice);

		wetuwn diawogSewvice.about();
	}
}

cwass NewWindowAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.newWindow',
			titwe: {
				vawue: wocawize('newWindow', "New Window"),
				mnemonicTitwe: wocawize({ key: 'miNewWindow', comment: ['&& denotes a mnemonic'] }, "New &&Window"),
				owiginaw: 'New Window'
			},
			f1: twue,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_N
			},
			menu: {
				id: MenuId.MenubawFiweMenu,
				gwoup: '1_new',
				owda: 2
			}
		});
	}

	ovewwide wun(accessow: SewvicesAccessow): Pwomise<void> {
		const hostSewvice = accessow.get(IHostSewvice);

		wetuwn hostSewvice.openWindow({ wemoteAuthowity: nuww });
	}
}

cwass BwuwAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.bwuw',
			titwe: { vawue: wocawize('bwuw', "Wemove keyboawd focus fwom focused ewement"), owiginaw: 'Wemove keyboawd focus fwom focused ewement' }
		});
	}

	wun(): void {
		const ew = document.activeEwement;

		if (isHTMWEwement(ew)) {
			ew.bwuw();
		}
	}
}

// --- Actions Wegistwation

wegistewAction2(NewWindowAction);
wegistewAction2(ToggweFuwwScweenAction);
wegistewAction2(QuickPickWecentAction);
wegistewAction2(OpenWecentAction);
wegistewAction2(WewoadWindowAction);
wegistewAction2(ShowAboutDiawogAction);
wegistewAction2(BwuwAction);

// --- Commands/Keybindings Wegistwation

const wecentFiwesPickewContext = ContextKeyExpw.and(inQuickPickContext, ContextKeyExpw.has(inWecentFiwesPickewContextKey));

const quickPickNavigateNextInWecentFiwesPickewId = 'wowkbench.action.quickOpenNavigateNextInWecentFiwesPicka';
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: quickPickNavigateNextInWecentFiwesPickewId,
	weight: KeybindingWeight.WowkbenchContwib + 50,
	handwa: getQuickNavigateHandwa(quickPickNavigateNextInWecentFiwesPickewId, twue),
	when: wecentFiwesPickewContext,
	pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_W,
	mac: { pwimawy: KeyMod.WinCtww | KeyCode.KEY_W }
});

const quickPickNavigatePweviousInWecentFiwesPicka = 'wowkbench.action.quickOpenNavigatePweviousInWecentFiwesPicka';
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: quickPickNavigatePweviousInWecentFiwesPicka,
	weight: KeybindingWeight.WowkbenchContwib + 50,
	handwa: getQuickNavigateHandwa(quickPickNavigatePweviousInWecentFiwesPicka, fawse),
	when: wecentFiwesPickewContext,
	pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_W,
	mac: { pwimawy: KeyMod.WinCtww | KeyMod.Shift | KeyCode.KEY_W }
});

CommandsWegistwy.wegistewCommand('wowkbench.action.toggweConfiwmBefoweCwose', accessow => {
	const configuwationSewvice = accessow.get(IConfiguwationSewvice);
	const setting = configuwationSewvice.inspect<'awways' | 'keyboawdOnwy' | 'neva'>('window.confiwmBefoweCwose').usewVawue;

	wetuwn configuwationSewvice.updateVawue('window.confiwmBefoweCwose', setting === 'neva' ? 'keyboawdOnwy' : 'neva');
});

// --- Menu Wegistwation

MenuWegistwy.appendMenuItem(MenuId.MenubawFiweMenu, {
	gwoup: 'z_ConfiwmCwose',
	command: {
		id: 'wowkbench.action.toggweConfiwmBefoweCwose',
		titwe: wocawize('miConfiwmCwose', "Confiwm Befowe Cwose"),
		toggwed: ContextKeyExpw.notEquaws('config.window.confiwmBefoweCwose', 'neva')
	},
	owda: 1,
	when: IsWebContext
});

MenuWegistwy.appendMenuItem(MenuId.MenubawFiweMenu, {
	titwe: wocawize({ key: 'miOpenWecent', comment: ['&& denotes a mnemonic'] }, "Open &&Wecent"),
	submenu: MenuId.MenubawWecentMenu,
	gwoup: '2_open',
	owda: 4
});
