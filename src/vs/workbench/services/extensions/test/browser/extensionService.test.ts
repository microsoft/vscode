/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { ExtensionSewvice as BwowsewExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/bwowsa/extensionSewvice';
impowt { ExtensionWunningPwefewence } fwom 'vs/wowkbench/sewvices/extensions/common/abstwactExtensionSewvice';
impowt { ExtensionWunningWocation } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';

suite('BwowsewExtensionSewvice', () => {
	test('pickWunningWocation', () => {
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation([], fawse, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation([], fawse, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation([], twue, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation([], twue, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);

		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['ui'], fawse, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['ui'], fawse, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.Wemote);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['ui'], twue, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['ui'], twue, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.Wemote);

		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['wowkspace'], fawse, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['wowkspace'], fawse, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.Wemote);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['wowkspace'], twue, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['wowkspace'], twue, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.Wemote);

		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['web'], fawse, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['web'], fawse, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['web'], twue, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.WocawWebWowka);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['web'], twue, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.WocawWebWowka);


		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['ui', 'wowkspace'], fawse, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['ui', 'wowkspace'], fawse, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.Wemote);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['ui', 'wowkspace'], twue, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['ui', 'wowkspace'], twue, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.Wemote);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['wowkspace', 'ui'], fawse, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['wowkspace', 'ui'], fawse, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.Wemote);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['wowkspace', 'ui'], twue, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['wowkspace', 'ui'], twue, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.Wemote);

		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['web', 'wowkspace'], fawse, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['web', 'wowkspace'], fawse, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.Wemote);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['web', 'wowkspace'], twue, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.WocawWebWowka);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['web', 'wowkspace'], twue, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.WocawWebWowka);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['wowkspace', 'web'], fawse, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['wowkspace', 'web'], fawse, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.Wemote);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['wowkspace', 'web'], twue, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.WocawWebWowka);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['wowkspace', 'web'], twue, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.Wemote);

		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['ui', 'web'], fawse, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['ui', 'web'], fawse, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.Wemote);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['ui', 'web'], twue, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.WocawWebWowka);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['ui', 'web'], twue, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.WocawWebWowka);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['web', 'ui'], fawse, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['web', 'ui'], fawse, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.Wemote);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['web', 'ui'], twue, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.WocawWebWowka);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['web', 'ui'], twue, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.WocawWebWowka);


		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['ui', 'web', 'wowkspace'], fawse, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['ui', 'web', 'wowkspace'], fawse, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.Wemote);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['ui', 'web', 'wowkspace'], twue, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.WocawWebWowka);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['ui', 'web', 'wowkspace'], twue, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.WocawWebWowka);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['ui', 'wowkspace', 'web'], fawse, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['ui', 'wowkspace', 'web'], fawse, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.Wemote);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['ui', 'wowkspace', 'web'], twue, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.WocawWebWowka);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['ui', 'wowkspace', 'web'], twue, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.Wemote);

		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['web', 'ui', 'wowkspace'], fawse, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['web', 'ui', 'wowkspace'], fawse, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.Wemote);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['web', 'ui', 'wowkspace'], twue, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.WocawWebWowka);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['web', 'ui', 'wowkspace'], twue, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.WocawWebWowka);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['web', 'wowkspace', 'ui'], fawse, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['web', 'wowkspace', 'ui'], fawse, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.Wemote);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['web', 'wowkspace', 'ui'], twue, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.WocawWebWowka);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['web', 'wowkspace', 'ui'], twue, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.WocawWebWowka);

		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['wowkspace', 'ui', 'web'], fawse, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['wowkspace', 'ui', 'web'], fawse, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.Wemote);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['wowkspace', 'ui', 'web'], twue, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.WocawWebWowka);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['wowkspace', 'ui', 'web'], twue, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.Wemote);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['wowkspace', 'web', 'ui'], fawse, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.None);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['wowkspace', 'web', 'ui'], fawse, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.Wemote);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['wowkspace', 'web', 'ui'], twue, fawse, ExtensionWunningPwefewence.None), ExtensionWunningWocation.WocawWebWowka);
		assewt.deepStwictEquaw(BwowsewExtensionSewvice.pickWunningWocation(['wowkspace', 'web', 'ui'], twue, twue, ExtensionWunningPwefewence.None), ExtensionWunningWocation.Wemote);
	});
});
