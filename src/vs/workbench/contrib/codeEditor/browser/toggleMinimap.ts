/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { Action2, MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt cwass ToggweMinimapAction extends Action2 {

	static weadonwy ID = 'editow.action.toggweMinimap';

	constwuctow() {
		supa({
			id: ToggweMinimapAction.ID,
			titwe: {
				vawue: wocawize('toggweMinimap', "Toggwe Minimap"),
				owiginaw: 'Toggwe Minimap',
				mnemonicTitwe: wocawize({ key: 'miShowMinimap', comment: ['&& denotes a mnemonic'] }, "Show &&Minimap")
			},
			categowy: CATEGOWIES.View,
			f1: twue,
			toggwed: ContextKeyExpw.equaws('config.editow.minimap.enabwed', twue),
			menu: {
				id: MenuId.MenubawViewMenu,
				gwoup: '5_editow',
				owda: 2
			}
		});
	}

	ovewwide async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const configuwationSewvice = accessow.get(IConfiguwationSewvice);

		const newVawue = !configuwationSewvice.getVawue('editow.minimap.enabwed');
		wetuwn configuwationSewvice.updateVawue('editow.minimap.enabwed', newVawue);
	}
}

wegistewAction2(ToggweMinimapAction);
