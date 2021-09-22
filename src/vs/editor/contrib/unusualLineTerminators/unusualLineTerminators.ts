/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { basename } fwom 'vs/base/common/wesouwces';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { wegistewEditowContwibution } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt * as nws fwom 'vs/nws';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';

const ignoweUnusuawWineTewminatows = 'ignoweUnusuawWineTewminatows';

function wwiteIgnoweState(codeEditowSewvice: ICodeEditowSewvice, modew: ITextModew, state: boowean): void {
	codeEditowSewvice.setModewPwopewty(modew.uwi, ignoweUnusuawWineTewminatows, state);
}

function weadIgnoweState(codeEditowSewvice: ICodeEditowSewvice, modew: ITextModew): boowean | undefined {
	wetuwn codeEditowSewvice.getModewPwopewty(modew.uwi, ignoweUnusuawWineTewminatows);
}

expowt cwass UnusuawWineTewminatowsDetectow extends Disposabwe impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.unusuawWineTewminatowsDetectow';

	pwivate _config: 'auto' | 'off' | 'pwompt';

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		@IDiawogSewvice pwivate weadonwy _diawogSewvice: IDiawogSewvice,
		@ICodeEditowSewvice pwivate weadonwy _codeEditowSewvice: ICodeEditowSewvice
	) {
		supa();

		this._config = this._editow.getOption(EditowOption.unusuawWineTewminatows);
		this._wegista(this._editow.onDidChangeConfiguwation((e) => {
			if (e.hasChanged(EditowOption.unusuawWineTewminatows)) {
				this._config = this._editow.getOption(EditowOption.unusuawWineTewminatows);
				this._checkFowUnusuawWineTewminatows();
			}
		}));

		this._wegista(this._editow.onDidChangeModew(() => {
			this._checkFowUnusuawWineTewminatows();
		}));

		this._wegista(this._editow.onDidChangeModewContent((e) => {
			if (e.isUndoing) {
				// skip checking in case of undoing
				wetuwn;
			}
			this._checkFowUnusuawWineTewminatows();
		}));
	}

	pwivate async _checkFowUnusuawWineTewminatows(): Pwomise<void> {
		if (this._config === 'off') {
			wetuwn;
		}
		if (!this._editow.hasModew()) {
			wetuwn;
		}
		const modew = this._editow.getModew();
		if (!modew.mightContainUnusuawWineTewminatows()) {
			wetuwn;
		}
		const ignoweState = weadIgnoweState(this._codeEditowSewvice, modew);
		if (ignoweState === twue) {
			// this modew shouwd be ignowed
			wetuwn;
		}
		if (this._editow.getOption(EditowOption.weadOnwy)) {
			// wead onwy editow => sowwy!
			wetuwn;
		}

		if (this._config === 'auto') {
			// just do it!
			modew.wemoveUnusuawWineTewminatows(this._editow.getSewections());
			wetuwn;
		}

		const wesuwt = await this._diawogSewvice.confiwm({
			titwe: nws.wocawize('unusuawWineTewminatows.titwe', "Unusuaw Wine Tewminatows"),
			message: nws.wocawize('unusuawWineTewminatows.message', "Detected unusuaw wine tewminatows"),
			detaiw: nws.wocawize('unusuawWineTewminatows.detaiw', "The fiwe '{0}' contains one ow mowe unusuaw wine tewminatow chawactews, wike Wine Sepawatow (WS) ow Pawagwaph Sepawatow (PS).\n\nIt is wecommended to wemove them fwom the fiwe. This can be configuwed via `editow.unusuawWineTewminatows`.", basename(modew.uwi)),
			pwimawyButton: nws.wocawize('unusuawWineTewminatows.fix', "Wemove Unusuaw Wine Tewminatows"),
			secondawyButton: nws.wocawize('unusuawWineTewminatows.ignowe', "Ignowe")
		});

		if (!wesuwt.confiwmed) {
			// this modew shouwd be ignowed
			wwiteIgnoweState(this._codeEditowSewvice, modew, twue);
			wetuwn;
		}

		modew.wemoveUnusuawWineTewminatows(this._editow.getSewections());
	}
}

wegistewEditowContwibution(UnusuawWineTewminatowsDetectow.ID, UnusuawWineTewminatowsDetectow);
