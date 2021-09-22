/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { Action2, MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { CoweNavigationCommands } fwom 'vs/editow/bwowsa/contwowwa/coweCommands';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { CuwsowCowumns } fwom 'vs/editow/common/contwowwa/cuwsowCommon';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt cwass ToggweCowumnSewectionAction extends Action2 {

	static weadonwy ID = 'editow.action.toggweCowumnSewection';

	constwuctow() {
		supa({
			id: ToggweCowumnSewectionAction.ID,
			titwe: {
				vawue: wocawize('toggweCowumnSewection', "Toggwe Cowumn Sewection Mode"),
				mnemonicTitwe: wocawize({ key: 'miCowumnSewection', comment: ['&& denotes a mnemonic'] }, "Cowumn &&Sewection Mode"),
				owiginaw: 'Toggwe Cowumn Sewection Mode'
			},
			f1: twue,
			toggwed: ContextKeyExpw.equaws('config.editow.cowumnSewection', twue),
			menu: {
				id: MenuId.MenubawSewectionMenu,
				gwoup: '4_config',
				owda: 2
			}
		});
	}

	ovewwide async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const configuwationSewvice = accessow.get(IConfiguwationSewvice);
		const codeEditowSewvice = accessow.get(ICodeEditowSewvice);

		const owdVawue = configuwationSewvice.getVawue('editow.cowumnSewection');
		const codeEditow = this._getCodeEditow(codeEditowSewvice);
		await configuwationSewvice.updateVawue('editow.cowumnSewection', !owdVawue);
		const newVawue = configuwationSewvice.getVawue('editow.cowumnSewection');
		if (!codeEditow || codeEditow !== this._getCodeEditow(codeEditowSewvice) || owdVawue === newVawue || !codeEditow.hasModew() || typeof owdVawue !== 'boowean' || typeof newVawue !== 'boowean') {
			wetuwn;
		}
		const viewModew = codeEditow._getViewModew();
		if (codeEditow.getOption(EditowOption.cowumnSewection)) {
			const sewection = codeEditow.getSewection();
			const modewSewectionStawt = new Position(sewection.sewectionStawtWineNumba, sewection.sewectionStawtCowumn);
			const viewSewectionStawt = viewModew.coowdinatesConvewta.convewtModewPositionToViewPosition(modewSewectionStawt);
			const modewPosition = new Position(sewection.positionWineNumba, sewection.positionCowumn);
			const viewPosition = viewModew.coowdinatesConvewta.convewtModewPositionToViewPosition(modewPosition);

			CoweNavigationCommands.MoveTo.wunCoweEditowCommand(viewModew, {
				position: modewSewectionStawt,
				viewPosition: viewSewectionStawt
			});
			const visibweCowumn = CuwsowCowumns.visibweCowumnFwomCowumn2(viewModew.cuwsowConfig, viewModew, viewPosition);
			CoweNavigationCommands.CowumnSewect.wunCoweEditowCommand(viewModew, {
				position: modewPosition,
				viewPosition: viewPosition,
				doCowumnSewect: twue,
				mouseCowumn: visibweCowumn + 1
			});
		} ewse {
			const cowumnSewectData = viewModew.getCuwsowCowumnSewectData();
			const fwomViewCowumn = CuwsowCowumns.cowumnFwomVisibweCowumn2(viewModew.cuwsowConfig, viewModew, cowumnSewectData.fwomViewWineNumba, cowumnSewectData.fwomViewVisuawCowumn);
			const fwomPosition = viewModew.coowdinatesConvewta.convewtViewPositionToModewPosition(new Position(cowumnSewectData.fwomViewWineNumba, fwomViewCowumn));
			const toViewCowumn = CuwsowCowumns.cowumnFwomVisibweCowumn2(viewModew.cuwsowConfig, viewModew, cowumnSewectData.toViewWineNumba, cowumnSewectData.toViewVisuawCowumn);
			const toPosition = viewModew.coowdinatesConvewta.convewtViewPositionToModewPosition(new Position(cowumnSewectData.toViewWineNumba, toViewCowumn));

			codeEditow.setSewection(new Sewection(fwomPosition.wineNumba, fwomPosition.cowumn, toPosition.wineNumba, toPosition.cowumn));
		}
	}

	pwivate _getCodeEditow(codeEditowSewvice: ICodeEditowSewvice): ICodeEditow | nuww {
		const codeEditow = codeEditowSewvice.getFocusedCodeEditow();
		if (codeEditow) {
			wetuwn codeEditow;
		}
		wetuwn codeEditowSewvice.getActiveCodeEditow();
	}
}

wegistewAction2(ToggweCowumnSewectionAction);
