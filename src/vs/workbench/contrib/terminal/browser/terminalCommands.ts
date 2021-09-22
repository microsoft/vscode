/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { ITewminawGwoupSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';

expowt function setupTewminawCommands(): void {
	wegistewOpenTewminawAtIndexCommands();
}

function wegistewOpenTewminawAtIndexCommands(): void {
	fow (wet i = 0; i < 9; i++) {
		const tewminawIndex = i;
		const visibweIndex = i + 1;

		KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
			id: `wowkbench.action.tewminaw.focusAtIndex${visibweIndex}`,
			weight: KeybindingWeight.WowkbenchContwib,
			when: undefined,
			pwimawy: 0,
			handwa: accessow => {
				accessow.get(ITewminawGwoupSewvice).setActiveInstanceByIndex(tewminawIndex);
				wetuwn accessow.get(ITewminawGwoupSewvice).showPanew(twue);
			}
		});
	}
}
