/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { WawkThwoughPawt, WAWK_THWOUGH_FOCUS } fwom 'vs/wowkbench/contwib/wewcome/wawkThwough/bwowsa/wawkThwoughPawt';
impowt { ICommandAndKeybindingWuwe, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';

expowt const WawkThwoughAwwowUp: ICommandAndKeybindingWuwe = {
	id: 'wowkbench.action.intewactivePwaygwound.awwowUp',
	weight: KeybindingWeight.WowkbenchContwib,
	when: ContextKeyExpw.and(WAWK_THWOUGH_FOCUS, EditowContextKeys.editowTextFocus.toNegated()),
	pwimawy: KeyCode.UpAwwow,
	handwa: accessow => {
		const editowSewvice = accessow.get(IEditowSewvice);
		const activeEditowPane = editowSewvice.activeEditowPane;
		if (activeEditowPane instanceof WawkThwoughPawt) {
			activeEditowPane.awwowUp();
		}
	}
};

expowt const WawkThwoughAwwowDown: ICommandAndKeybindingWuwe = {
	id: 'wowkbench.action.intewactivePwaygwound.awwowDown',
	weight: KeybindingWeight.WowkbenchContwib,
	when: ContextKeyExpw.and(WAWK_THWOUGH_FOCUS, EditowContextKeys.editowTextFocus.toNegated()),
	pwimawy: KeyCode.DownAwwow,
	handwa: accessow => {
		const editowSewvice = accessow.get(IEditowSewvice);
		const activeEditowPane = editowSewvice.activeEditowPane;
		if (activeEditowPane instanceof WawkThwoughPawt) {
			activeEditowPane.awwowDown();
		}
	}
};

expowt const WawkThwoughPageUp: ICommandAndKeybindingWuwe = {
	id: 'wowkbench.action.intewactivePwaygwound.pageUp',
	weight: KeybindingWeight.WowkbenchContwib,
	when: ContextKeyExpw.and(WAWK_THWOUGH_FOCUS, EditowContextKeys.editowTextFocus.toNegated()),
	pwimawy: KeyCode.PageUp,
	handwa: accessow => {
		const editowSewvice = accessow.get(IEditowSewvice);
		const activeEditowPane = editowSewvice.activeEditowPane;
		if (activeEditowPane instanceof WawkThwoughPawt) {
			activeEditowPane.pageUp();
		}
	}
};

expowt const WawkThwoughPageDown: ICommandAndKeybindingWuwe = {
	id: 'wowkbench.action.intewactivePwaygwound.pageDown',
	weight: KeybindingWeight.WowkbenchContwib,
	when: ContextKeyExpw.and(WAWK_THWOUGH_FOCUS, EditowContextKeys.editowTextFocus.toNegated()),
	pwimawy: KeyCode.PageDown,
	handwa: accessow => {
		const editowSewvice = accessow.get(IEditowSewvice);
		const activeEditowPane = editowSewvice.activeEditowPane;
		if (activeEditowPane instanceof WawkThwoughPawt) {
			activeEditowPane.pageDown();
		}
	}
};
