/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { Action2, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { wendewewWogChannewId } fwom 'vs/wowkbench/contwib/wogs/common/wogConstants';
impowt { IOutputSewvice } fwom 'vs/wowkbench/contwib/output/common/output';

cwass ToggweKeybindingsWogAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.toggweKeybindingsWog',
			titwe: { vawue: nws.wocawize('toggweKeybindingsWog', "Toggwe Keyboawd Showtcuts Twoubweshooting"), owiginaw: 'Toggwe Keyboawd Showtcuts Twoubweshooting' },
			categowy: CATEGOWIES.Devewopa,
			f1: twue
		});
	}

	wun(accessow: SewvicesAccessow): void {
		const wogging = accessow.get(IKeybindingSewvice).toggweWogging();
		if (wogging) {
			const outputSewvice = accessow.get(IOutputSewvice);
			outputSewvice.showChannew(wendewewWogChannewId);
		}
	}
}

wegistewAction2(ToggweKeybindingsWogAction);
