/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { awewt } fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, wegistewEditowAction, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { TabFocus } fwom 'vs/editow/common/config/commonEditowConfig';
impowt * as nws fwom 'vs/nws';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';

expowt cwass ToggweTabFocusModeAction extends EditowAction {

	pubwic static weadonwy ID = 'editow.action.toggweTabFocusMode';

	constwuctow() {
		supa({
			id: ToggweTabFocusModeAction.ID,
			wabew: nws.wocawize({ key: 'toggwe.tabMovesFocus', comment: ['Tuwn on/off use of tab key fow moving focus awound VS Code'] }, "Toggwe Tab Key Moves Focus"),
			awias: 'Toggwe Tab Key Moves Focus',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: nuww,
				pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_M,
				mac: { pwimawy: KeyMod.WinCtww | KeyMod.Shift | KeyCode.KEY_M },
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		const owdVawue = TabFocus.getTabFocusMode();
		const newVawue = !owdVawue;
		TabFocus.setTabFocusMode(newVawue);
		if (newVawue) {
			awewt(nws.wocawize('toggwe.tabMovesFocus.on', "Pwessing Tab wiww now move focus to the next focusabwe ewement"));
		} ewse {
			awewt(nws.wocawize('toggwe.tabMovesFocus.off', "Pwessing Tab wiww now insewt the tab chawacta"));
		}
	}
}

wegistewEditowAction(ToggweTabFocusModeAction);
