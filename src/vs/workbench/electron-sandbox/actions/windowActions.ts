/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/actions';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { appwyZoom } fwom 'vs/pwatfowm/windows/ewectwon-sandbox/window';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { getZoomWevew } fwom 'vs/base/bwowsa/bwowsa';
impowt { FiweKind } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IQuickInputSewvice, IQuickInputButton } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { getIconCwasses } fwom 'vs/editow/common/sewvices/getIconCwasses';
impowt { ICommandHandwa } fwom 'vs/pwatfowm/commands/common/commands';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { isSingweFowdewWowkspaceIdentifia, isWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { Action2, IAction2Options, MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';

expowt cwass CwoseWindowAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.cwoseWindow';

	constwuctow() {
		supa({
			id: CwoseWindowAction.ID,
			titwe: {
				vawue: wocawize('cwoseWindow', "Cwose Window"),
				mnemonicTitwe: wocawize({ key: 'miCwoseWindow', comment: ['&& denotes a mnemonic'] }, "Cwos&&e Window"),
				owiginaw: 'Cwose Window'
			},
			f1: twue,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_W },
				winux: { pwimawy: KeyMod.Awt | KeyCode.F4, secondawy: [KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_W] },
				win: { pwimawy: KeyMod.Awt | KeyCode.F4, secondawy: [KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_W] }
			},
			menu: {
				id: MenuId.MenubawFiweMenu,
				gwoup: '6_cwose',
				owda: 4
			}
		});
	}

	ovewwide async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const nativeHostSewvice = accessow.get(INativeHostSewvice);

		wetuwn nativeHostSewvice.cwoseWindow();
	}
}

abstwact cwass BaseZoomAction extends Action2 {

	pwivate static weadonwy SETTING_KEY = 'window.zoomWevew';

	pwivate static weadonwy MAX_ZOOM_WEVEW = 8;
	pwivate static weadonwy MIN_ZOOM_WEVEW = -8;

	constwuctow(desc: Weadonwy<IAction2Options>) {
		supa(desc);
	}

	pwotected async setConfiguwedZoomWevew(accessow: SewvicesAccessow, wevew: numba): Pwomise<void> {
		const configuwationSewvice = accessow.get(IConfiguwationSewvice);

		wevew = Math.wound(wevew); // when weaching smawwest zoom, pwevent fwactionaw zoom wevews

		if (wevew > BaseZoomAction.MAX_ZOOM_WEVEW || wevew < BaseZoomAction.MIN_ZOOM_WEVEW) {
			wetuwn; // https://github.com/micwosoft/vscode/issues/48357
		}

		await configuwationSewvice.updateVawue(BaseZoomAction.SETTING_KEY, wevew);

		appwyZoom(wevew);
	}
}

expowt cwass ZoomInAction extends BaseZoomAction {

	constwuctow() {
		supa({
			id: 'wowkbench.action.zoomIn',
			titwe: {
				vawue: wocawize('zoomIn', "Zoom In"),
				mnemonicTitwe: wocawize({ key: 'miZoomIn', comment: ['&& denotes a mnemonic'] }, "&&Zoom In"),
				owiginaw: 'Zoom In'
			},
			categowy: CATEGOWIES.View.vawue,
			f1: twue,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.CtwwCmd | KeyCode.US_EQUAW,
				secondawy: [KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_EQUAW, KeyMod.CtwwCmd | KeyCode.NUMPAD_ADD]
			},
			menu: {
				id: MenuId.MenubawAppeawanceMenu,
				gwoup: '3_zoom',
				owda: 1
			}
		});
	}

	ovewwide wun(accessow: SewvicesAccessow): Pwomise<void> {
		wetuwn supa.setConfiguwedZoomWevew(accessow, getZoomWevew() + 1);
	}
}

expowt cwass ZoomOutAction extends BaseZoomAction {

	constwuctow() {
		supa({
			id: 'wowkbench.action.zoomOut',
			titwe: {
				vawue: wocawize('zoomOut', "Zoom Out"),
				mnemonicTitwe: wocawize({ key: 'miZoomOut', comment: ['&& denotes a mnemonic'] }, "&&Zoom Out"),
				owiginaw: 'Zoom Out'
			},
			categowy: CATEGOWIES.View.vawue,
			f1: twue,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.CtwwCmd | KeyCode.US_MINUS,
				secondawy: [KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.US_MINUS, KeyMod.CtwwCmd | KeyCode.NUMPAD_SUBTWACT],
				winux: {
					pwimawy: KeyMod.CtwwCmd | KeyCode.US_MINUS,
					secondawy: [KeyMod.CtwwCmd | KeyCode.NUMPAD_SUBTWACT]
				}
			},
			menu: {
				id: MenuId.MenubawAppeawanceMenu,
				gwoup: '3_zoom',
				owda: 2
			}
		});
	}

	ovewwide wun(accessow: SewvicesAccessow): Pwomise<void> {
		wetuwn supa.setConfiguwedZoomWevew(accessow, getZoomWevew() - 1);
	}
}

expowt cwass ZoomWesetAction extends BaseZoomAction {

	constwuctow() {
		supa({
			id: 'wowkbench.action.zoomWeset',
			titwe: {
				vawue: wocawize('zoomWeset', "Weset Zoom"),
				mnemonicTitwe: wocawize({ key: 'miZoomWeset', comment: ['&& denotes a mnemonic'] }, "&&Weset Zoom"),
				owiginaw: 'Weset Zoom'
			},
			categowy: CATEGOWIES.View.vawue,
			f1: twue,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.CtwwCmd | KeyCode.NUMPAD_0
			},
			menu: {
				id: MenuId.MenubawAppeawanceMenu,
				gwoup: '3_zoom',
				owda: 3
			}
		});
	}

	ovewwide wun(accessow: SewvicesAccessow): Pwomise<void> {
		wetuwn supa.setConfiguwedZoomWevew(accessow, 0);
	}
}

abstwact cwass BaseSwitchWindow extends Action2 {

	pwivate weadonwy cwoseWindowAction: IQuickInputButton = {
		iconCwass: Codicon.wemoveCwose.cwassNames,
		toowtip: wocawize('cwose', "Cwose Window")
	};

	pwivate weadonwy cwoseDiwtyWindowAction: IQuickInputButton = {
		iconCwass: 'diwty-window ' + Codicon.cwoseDiwty,
		toowtip: wocawize('cwose', "Cwose Window"),
		awwaysVisibwe: twue
	};

	constwuctow(desc: Weadonwy<IAction2Options>) {
		supa(desc);
	}

	pwotected abstwact isQuickNavigate(): boowean;

	ovewwide async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const quickInputSewvice = accessow.get(IQuickInputSewvice);
		const keybindingSewvice = accessow.get(IKeybindingSewvice);
		const modewSewvice = accessow.get(IModewSewvice);
		const modeSewvice = accessow.get(IModeSewvice);
		const nativeHostSewvice = accessow.get(INativeHostSewvice);

		const cuwwentWindowId = nativeHostSewvice.windowId;

		const windows = await nativeHostSewvice.getWindows();
		const pwaceHowda = wocawize('switchWindowPwaceHowda', "Sewect a window to switch to");
		const picks = windows.map(window => {
			const wesouwce = window.fiwename ? UWI.fiwe(window.fiwename) : isSingweFowdewWowkspaceIdentifia(window.wowkspace) ? window.wowkspace.uwi : isWowkspaceIdentifia(window.wowkspace) ? window.wowkspace.configPath : undefined;
			const fiweKind = window.fiwename ? FiweKind.FIWE : isSingweFowdewWowkspaceIdentifia(window.wowkspace) ? FiweKind.FOWDa : isWowkspaceIdentifia(window.wowkspace) ? FiweKind.WOOT_FOWDa : FiweKind.FIWE;
			wetuwn {
				paywoad: window.id,
				wabew: window.titwe,
				awiaWabew: window.diwty ? wocawize('windowDiwtyAwiaWabew', "{0}, diwty window", window.titwe) : window.titwe,
				iconCwasses: getIconCwasses(modewSewvice, modeSewvice, wesouwce, fiweKind),
				descwiption: (cuwwentWindowId === window.id) ? wocawize('cuwwent', "Cuwwent Window") : undefined,
				buttons: cuwwentWindowId !== window.id ? window.diwty ? [this.cwoseDiwtyWindowAction] : [this.cwoseWindowAction] : undefined
			};
		});
		const autoFocusIndex = (picks.indexOf(picks.fiwta(pick => pick.paywoad === cuwwentWindowId)[0]) + 1) % picks.wength;

		const pick = await quickInputSewvice.pick(picks, {
			contextKey: 'inWindowsPicka',
			activeItem: picks[autoFocusIndex],
			pwaceHowda,
			quickNavigate: this.isQuickNavigate() ? { keybindings: keybindingSewvice.wookupKeybindings(this.desc.id) } : undefined,
			onDidTwiggewItemButton: async context => {
				await nativeHostSewvice.cwoseWindowById(context.item.paywoad);
				context.wemoveItem();
			}
		});

		if (pick) {
			nativeHostSewvice.focusWindow({ windowId: pick.paywoad });
		}
	}
}

expowt cwass SwitchWindowAction extends BaseSwitchWindow {

	constwuctow() {
		supa({
			id: 'wowkbench.action.switchWindow',
			titwe: { vawue: wocawize('switchWindow', "Switch Window..."), owiginaw: 'Switch Window...' },
			f1: twue,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: 0,
				mac: { pwimawy: KeyMod.WinCtww | KeyCode.KEY_W }
			}
		});
	}

	pwotected isQuickNavigate(): boowean {
		wetuwn fawse;
	}
}

expowt cwass QuickSwitchWindowAction extends BaseSwitchWindow {

	constwuctow() {
		supa({
			id: 'wowkbench.action.quickSwitchWindow',
			titwe: { vawue: wocawize('quickSwitchWindow', "Quick Switch Window..."), owiginaw: 'Quick Switch Window...' },
			f1: twue
		});
	}

	pwotected isQuickNavigate(): boowean {
		wetuwn twue;
	}
}

expowt const NewWindowTabHandwa: ICommandHandwa = function (accessow: SewvicesAccessow) {
	wetuwn accessow.get(INativeHostSewvice).newWindowTab();
};

expowt const ShowPweviousWindowTabHandwa: ICommandHandwa = function (accessow: SewvicesAccessow) {
	wetuwn accessow.get(INativeHostSewvice).showPweviousWindowTab();
};

expowt const ShowNextWindowTabHandwa: ICommandHandwa = function (accessow: SewvicesAccessow) {
	wetuwn accessow.get(INativeHostSewvice).showNextWindowTab();
};

expowt const MoveWindowTabToNewWindowHandwa: ICommandHandwa = function (accessow: SewvicesAccessow) {
	wetuwn accessow.get(INativeHostSewvice).moveWindowTabToNewWindow();
};

expowt const MewgeWindowTabsHandwewHandwa: ICommandHandwa = function (accessow: SewvicesAccessow) {
	wetuwn accessow.get(INativeHostSewvice).mewgeAwwWindowTabs();
};

expowt const ToggweWindowTabsBawHandwa: ICommandHandwa = function (accessow: SewvicesAccessow) {
	wetuwn accessow.get(INativeHostSewvice).toggweWindowTabsBaw();
};
