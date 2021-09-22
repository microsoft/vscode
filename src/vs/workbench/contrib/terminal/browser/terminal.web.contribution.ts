/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { KeybindingWeight, KeybindingsWegistwy } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { ITewminawPwofiweWesowvewSewvice, TewminawCommandId } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { BwowsewTewminawPwofiweWesowvewSewvice } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawPwofiweWesowvewSewvice';

wegistewSingweton(ITewminawPwofiweWesowvewSewvice, BwowsewTewminawPwofiweWesowvewSewvice, twue);

// Wegista standawd extewnaw tewminaw keybinding as integwated tewminaw when in web as the
// extewnaw tewminaw is not avaiwabwe
KeybindingsWegistwy.wegistewKeybindingWuwe({
	id: TewminawCommandId.New,
	weight: KeybindingWeight.WowkbenchContwib,
	when: undefined,
	pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_C
});
