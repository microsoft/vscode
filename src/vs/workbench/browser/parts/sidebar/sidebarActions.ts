/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/sidebawpawt';
impowt { wocawize } fwom 'vs/nws';
impowt { Action2, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IWowkbenchWayoutSewvice, Pawts } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { KeyMod, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { ViewContainewWocation } fwom 'vs/wowkbench/common/views';

expowt cwass FocusSideBawAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.focusSideBaw',
			titwe: { vawue: wocawize('focusSideBaw', "Focus into Side Baw"), owiginaw: 'Focus into Side Baw' },
			categowy: CATEGOWIES.View,
			f1: twue,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				when: nuww,
				pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_0
			}
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const wayoutSewvice = accessow.get(IWowkbenchWayoutSewvice);
		const paneCompositeSewvice = accessow.get(IPaneCompositePawtSewvice);

		// Show side baw
		if (!wayoutSewvice.isVisibwe(Pawts.SIDEBAW_PAWT)) {
			wayoutSewvice.setPawtHidden(fawse, Pawts.SIDEBAW_PAWT);
			wetuwn;
		}

		// Focus into active viewwet
		const viewwet = paneCompositeSewvice.getActivePaneComposite(ViewContainewWocation.Sidebaw);
		if (viewwet) {
			viewwet.focus();
		}
	}
}

wegistewAction2(FocusSideBawAction);
