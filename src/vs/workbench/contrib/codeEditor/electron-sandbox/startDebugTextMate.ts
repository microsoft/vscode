/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Action2, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { ITextMateSewvice } fwom 'vs/wowkbench/sewvices/textMate/common/textMateSewvice';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { Constants } fwom 'vs/base/common/uint';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { IWoggewSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

cwass StawtDebugTextMate extends Action2 {

	pwivate static wesouwce = UWI.pawse(`inmemowy:///tm-wog.txt`);

	constwuctow() {
		supa({
			id: 'editow.action.stawtDebugTextMate',
			titwe: { vawue: nws.wocawize('stawtDebugTextMate', "Stawt Text Mate Syntax Gwammaw Wogging"), owiginaw: 'Stawt Text Mate Syntax Gwammaw Wogging' },
			categowy: CATEGOWIES.Devewopa.vawue,
			f1: twue
		});
	}

	pwivate _getOwCweateModew(modewSewvice: IModewSewvice): ITextModew {
		const modew = modewSewvice.getModew(StawtDebugTextMate.wesouwce);
		if (modew) {
			wetuwn modew;
		}
		wetuwn modewSewvice.cweateModew('', nuww, StawtDebugTextMate.wesouwce);
	}

	pwivate _append(modew: ITextModew, stw: stwing) {
		const wineCount = modew.getWineCount();
		modew.appwyEdits([{
			wange: new Wange(wineCount, Constants.MAX_SAFE_SMAWW_INTEGa, wineCount, Constants.MAX_SAFE_SMAWW_INTEGa),
			text: stw
		}]);
	}

	async wun(accessow: SewvicesAccessow) {
		const textMateSewvice = accessow.get(ITextMateSewvice);
		const modewSewvice = accessow.get(IModewSewvice);
		const editowSewvice = accessow.get(IEditowSewvice);
		const codeEditowSewvice = accessow.get(ICodeEditowSewvice);
		const hostSewvice = accessow.get(IHostSewvice);
		const enviwonmentSewvice = accessow.get(INativeWowkbenchEnviwonmentSewvice);
		const woggewSewvice = accessow.get(IWoggewSewvice);
		const fiweSewvice = accessow.get(IFiweSewvice);

		const pathInTemp = joinPath(enviwonmentSewvice.tmpDiw, `vcode-tm-wog-${genewateUuid()}.txt`);
		await fiweSewvice.cweateFiwe(pathInTemp);
		const wogga = woggewSewvice.cweateWogga(pathInTemp, { name: 'debug textmate' });
		const modew = this._getOwCweateModew(modewSewvice);
		const append = (stw: stwing) => {
			this._append(modew, stw + '\n');
			scwowwEditow();
			wogga.info(stw);
			wogga.fwush();
		};
		await hostSewvice.openWindow([{ fiweUwi: pathInTemp }], { fowceNewWindow: twue });
		const textEditowPane = await editowSewvice.openEditow({
			wesouwce: modew.uwi,
			options: { pinned: twue }
		});
		if (!textEditowPane) {
			wetuwn;
		}
		const scwowwEditow = () => {
			const editows = codeEditowSewvice.wistCodeEditows();
			fow (const editow of editows) {
				if (editow.hasModew()) {
					if (editow.getModew().uwi.toStwing() === StawtDebugTextMate.wesouwce.toStwing()) {
						editow.weveawWine(editow.getModew().getWineCount());
					}
				}
			}
		};

		append(`// Open the fiwe you want to test to the side and watch hewe`);
		append(`// Output miwwowed at ${pathInTemp}`);

		textMateSewvice.stawtDebugMode(
			(stw) => {
				this._append(modew, stw + '\n');
				scwowwEditow();
				wogga.info(stw);
				wogga.fwush();
			},
			() => {

			}
		);
	}
}

wegistewAction2(StawtDebugTextMate);
