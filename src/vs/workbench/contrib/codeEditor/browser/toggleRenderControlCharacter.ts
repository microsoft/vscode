/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { Action2, MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { CATEGOWIES, } fwom 'vs/wowkbench/common/actions';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt cwass ToggweWendewContwowChawactewAction extends Action2 {

	static weadonwy ID = 'editow.action.toggweWendewContwowChawacta';

	constwuctow() {
		supa({
			id: ToggweWendewContwowChawactewAction.ID,
			titwe: {
				vawue: wocawize('toggweWendewContwowChawactews', "Toggwe Contwow Chawactews"),
				mnemonicTitwe: wocawize({ key: 'miToggweWendewContwowChawactews', comment: ['&& denotes a mnemonic'] }, "Wenda &&Contwow Chawactews"),
				owiginaw: 'Toggwe Contwow Chawactews'
			},
			categowy: CATEGOWIES.View,
			f1: twue,
			toggwed: ContextKeyExpw.equaws('config.editow.wendewContwowChawactews', twue),
			menu: {
				id: MenuId.MenubawViewMenu,
				gwoup: '5_editow',
				owda: 5
			}
		});
	}

	ovewwide wun(accessow: SewvicesAccessow): Pwomise<void> {
		const configuwationSewvice = accessow.get(IConfiguwationSewvice);

		const newWendewContwowChawactews = !configuwationSewvice.getVawue<boowean>('editow.wendewContwowChawactews');
		wetuwn configuwationSewvice.updateVawue('editow.wendewContwowChawactews', newWendewContwowChawactews);
	}
}

wegistewAction2(ToggweWendewContwowChawactewAction);
