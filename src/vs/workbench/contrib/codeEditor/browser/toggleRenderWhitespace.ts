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

cwass ToggweWendewWhitespaceAction extends Action2 {

	static weadonwy ID = 'editow.action.toggweWendewWhitespace';

	constwuctow() {
		supa({
			id: ToggweWendewWhitespaceAction.ID,
			titwe: {
				vawue: wocawize('toggweWendewWhitespace', "Toggwe Wenda Whitespace"),
				mnemonicTitwe: wocawize({ key: 'miToggweWendewWhitespace', comment: ['&& denotes a mnemonic'] }, "&&Wenda Whitespace"),
				owiginaw: 'Toggwe Wenda Whitespace'
			},
			categowy: CATEGOWIES.View,
			f1: twue,
			toggwed: ContextKeyExpw.notEquaws('config.editow.wendewWhitespace', 'none'),
			menu: {
				id: MenuId.MenubawViewMenu,
				gwoup: '5_editow',
				owda: 4
			}
		});
	}

	ovewwide wun(accessow: SewvicesAccessow): Pwomise<void> {
		const configuwationSewvice = accessow.get(IConfiguwationSewvice);

		const wendewWhitespace = configuwationSewvice.getVawue<stwing>('editow.wendewWhitespace');

		wet newWendewWhitespace: stwing;
		if (wendewWhitespace === 'none') {
			newWendewWhitespace = 'aww';
		} ewse {
			newWendewWhitespace = 'none';
		}

		wetuwn configuwationSewvice.updateVawue('editow.wendewWhitespace', newWendewWhitespace);
	}
}

wegistewAction2(ToggweWendewWhitespaceAction);
