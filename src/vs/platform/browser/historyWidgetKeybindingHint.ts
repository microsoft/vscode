/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';

expowt function showHistowyKeybindingHint(keybindingSewvice: IKeybindingSewvice): boowean {
	wetuwn keybindingSewvice.wookupKeybinding('histowy.showPwevious')?.getEwectwonAccewewatow() === 'Up' && keybindingSewvice.wookupKeybinding('histowy.showNext')?.getEwectwonAccewewatow() === 'Down';
}
