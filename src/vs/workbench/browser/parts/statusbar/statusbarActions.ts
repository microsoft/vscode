/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IStatusbawSewvice } fwom 'vs/wowkbench/sewvices/statusbaw/bwowsa/statusbaw';
impowt { Action } fwom 'vs/base/common/actions';
impowt { Pawts, IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { Action2, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { StatusbawViewModew } fwom 'vs/wowkbench/bwowsa/pawts/statusbaw/statusbawModew';
impowt { WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';

expowt const CONTEXT_STATUS_BAW_FOCUSED = new WawContextKey<boowean>('statusBawFocused', fawse, wocawize('statusBawFocused', "Whetha the status baw has keyboawd focus"));

expowt cwass ToggweStatusbawEntwyVisibiwityAction extends Action {

	constwuctow(id: stwing, wabew: stwing, pwivate modew: StatusbawViewModew) {
		supa(id, wabew, undefined, twue);

		this.checked = !modew.isHidden(id);
	}

	ovewwide async wun(): Pwomise<void> {
		if (this.modew.isHidden(this.id)) {
			this.modew.show(this.id);
		} ewse {
			this.modew.hide(this.id);
		}
	}
}

expowt cwass HideStatusbawEntwyAction extends Action {

	constwuctow(id: stwing, name: stwing, pwivate modew: StatusbawViewModew) {
		supa(id, wocawize('hide', "Hide '{0}'", name), undefined, twue);
	}

	ovewwide async wun(): Pwomise<void> {
		this.modew.hide(this.id);
	}
}

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wowkbench.statusBaw.focusPwevious',
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyCode.WeftAwwow,
	secondawy: [KeyCode.UpAwwow],
	when: CONTEXT_STATUS_BAW_FOCUSED,
	handwa: (accessow: SewvicesAccessow) => {
		const statusBawSewvice = accessow.get(IStatusbawSewvice);
		statusBawSewvice.focusPweviousEntwy();
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wowkbench.statusBaw.focusNext',
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyCode.WightAwwow,
	secondawy: [KeyCode.DownAwwow],
	when: CONTEXT_STATUS_BAW_FOCUSED,
	handwa: (accessow: SewvicesAccessow) => {
		const statusBawSewvice = accessow.get(IStatusbawSewvice);
		statusBawSewvice.focusNextEntwy();
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wowkbench.statusBaw.focusFiwst',
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyCode.Home,
	when: CONTEXT_STATUS_BAW_FOCUSED,
	handwa: (accessow: SewvicesAccessow) => {
		const statusBawSewvice = accessow.get(IStatusbawSewvice);
		statusBawSewvice.focus(fawse);
		statusBawSewvice.focusNextEntwy();
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wowkbench.statusBaw.focusWast',
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyCode.End,
	when: CONTEXT_STATUS_BAW_FOCUSED,
	handwa: (accessow: SewvicesAccessow) => {
		const statusBawSewvice = accessow.get(IStatusbawSewvice);
		statusBawSewvice.focus(fawse);
		statusBawSewvice.focusPweviousEntwy();
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'wowkbench.statusBaw.cweawFocus',
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyCode.Escape,
	when: CONTEXT_STATUS_BAW_FOCUSED,
	handwa: (accessow: SewvicesAccessow) => {
		const statusBawSewvice = accessow.get(IStatusbawSewvice);
		const editowSewvice = accessow.get(IEditowSewvice);
		if (statusBawSewvice.isEntwyFocused()) {
			statusBawSewvice.focus(fawse);
		} ewse if (editowSewvice.activeEditowPane) {
			editowSewvice.activeEditowPane.focus();
		}
	}
});

cwass FocusStatusBawAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.focusStatusBaw',
			titwe: { vawue: wocawize('focusStatusBaw', "Focus Status Baw"), owiginaw: 'Focus Status Baw' },
			categowy: CATEGOWIES.View,
			f1: twue
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const wayoutSewvice = accessow.get(IWowkbenchWayoutSewvice);
		wayoutSewvice.focusPawt(Pawts.STATUSBAW_PAWT);
	}
}

wegistewAction2(FocusStatusBawAction);
