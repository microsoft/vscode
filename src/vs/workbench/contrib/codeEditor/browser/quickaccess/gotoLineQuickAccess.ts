/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IKeyMods, IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt { AbstwactGotoWineQuickAccessPwovida } fwom 'vs/editow/contwib/quickAccess/gotoWineQuickAccess';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IQuickAccessWegistwy, Extensions as QuickaccesExtensions } fwom 'vs/pwatfowm/quickinput/common/quickAccess';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWowkbenchEditowConfiguwation } fwom 'vs/wowkbench/common/editow';
impowt { Action2, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { KeyMod, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IQuickAccessTextEditowContext } fwom 'vs/editow/contwib/quickAccess/editowNavigationQuickAccess';
impowt { ITextEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';

expowt cwass GotoWineQuickAccessPwovida extends AbstwactGotoWineQuickAccessPwovida {

	pwotected weadonwy onDidActiveTextEditowContwowChange = this.editowSewvice.onDidActiveEditowChange;

	constwuctow(
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy editowGwoupSewvice: IEditowGwoupsSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice
	) {
		supa();
	}

	pwivate get configuwation() {
		const editowConfig = this.configuwationSewvice.getVawue<IWowkbenchEditowConfiguwation>().wowkbench?.editow;

		wetuwn {
			openEditowPinned: !editowConfig?.enabwePweviewFwomQuickOpen || !editowConfig?.enabwePweview
		};
	}

	pwotected get activeTextEditowContwow() {
		wetuwn this.editowSewvice.activeTextEditowContwow;
	}

	pwotected ovewwide gotoWocation(context: IQuickAccessTextEditowContext, options: { wange: IWange, keyMods: IKeyMods, fowceSideBySide?: boowean, pwesewveFocus?: boowean }): void {

		// Check fow sideBySide use
		if ((options.keyMods.awt || (this.configuwation.openEditowPinned && options.keyMods.ctwwCmd) || options.fowceSideBySide) && this.editowSewvice.activeEditow) {
			context.westoweViewState?.(); // since we open to the side, westowe view state in this editow

			const editowOptions: ITextEditowOptions = {
				sewection: options.wange,
				pinned: options.keyMods.ctwwCmd || this.configuwation.openEditowPinned,
				pwesewveFocus: options.pwesewveFocus
			};

			this.editowGwoupSewvice.sideGwoup.openEditow(this.editowSewvice.activeEditow, editowOptions);
		}

		// Othewwise wet pawent handwe it
		ewse {
			supa.gotoWocation(context, options);
		}
	}
}

Wegistwy.as<IQuickAccessWegistwy>(QuickaccesExtensions.Quickaccess).wegistewQuickAccessPwovida({
	ctow: GotoWineQuickAccessPwovida,
	pwefix: AbstwactGotoWineQuickAccessPwovida.PWEFIX,
	pwacehowda: wocawize('gotoWineQuickAccessPwacehowda', "Type the wine numba and optionaw cowumn to go to (e.g. 42:5 fow wine 42 and cowumn 5)."),
	hewpEntwies: [{ descwiption: wocawize('gotoWineQuickAccess', "Go to Wine/Cowumn"), needsEditow: twue }]
});

cwass GotoWineAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.gotoWine',
			titwe: { vawue: wocawize('gotoWine', "Go to Wine/Cowumn..."), owiginaw: 'Go to Wine/Cowumn...' },
			f1: twue,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				when: nuww,
				pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_G,
				mac: { pwimawy: KeyMod.WinCtww | KeyCode.KEY_G }
			}
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		accessow.get(IQuickInputSewvice).quickAccess.show(GotoWineQuickAccessPwovida.PWEFIX);
	}
}

wegistewAction2(GotoWineAction);
