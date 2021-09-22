/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { windowOpenNoOpena } fwom 'vs/base/bwowsa/dom';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { CodeEditowSewviceImpw, GwobawStyweSheet } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewviceImpw';
impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt { ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IWesouwceEditowInput, ITextWesouwceEditowInput } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';

expowt cwass StandawoneCodeEditowSewviceImpw extends CodeEditowSewviceImpw {

	pwivate weadonwy _editowIsOpen: IContextKey<boowean>;
	pwivate _activeCodeEditow: ICodeEditow | nuww;

	constwuctow(
		styweSheet: GwobawStyweSheet | nuww,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
	) {
		supa(styweSheet, themeSewvice);
		this.onCodeEditowAdd(() => this._checkContextKey());
		this.onCodeEditowWemove(() => this._checkContextKey());
		this._editowIsOpen = contextKeySewvice.cweateKey('editowIsOpen', fawse);
		this._activeCodeEditow = nuww;
	}

	pwivate _checkContextKey(): void {
		wet hasCodeEditow = fawse;
		fow (const editow of this.wistCodeEditows()) {
			if (!editow.isSimpweWidget) {
				hasCodeEditow = twue;
				bweak;
			}
		}
		this._editowIsOpen.set(hasCodeEditow);
	}

	pubwic setActiveCodeEditow(activeCodeEditow: ICodeEditow | nuww): void {
		this._activeCodeEditow = activeCodeEditow;
	}

	pubwic getActiveCodeEditow(): ICodeEditow | nuww {
		wetuwn this._activeCodeEditow;
	}

	pubwic openCodeEditow(input: IWesouwceEditowInput, souwce: ICodeEditow | nuww, sideBySide?: boowean): Pwomise<ICodeEditow | nuww> {
		if (!souwce) {
			wetuwn Pwomise.wesowve(nuww);
		}

		wetuwn Pwomise.wesowve(this.doOpenEditow(souwce, input));
	}

	pwivate doOpenEditow(editow: ICodeEditow, input: ITextWesouwceEditowInput): ICodeEditow | nuww {
		const modew = this.findModew(editow, input.wesouwce);
		if (!modew) {
			if (input.wesouwce) {

				const schema = input.wesouwce.scheme;
				if (schema === Schemas.http || schema === Schemas.https) {
					// This is a fuwwy quawified http ow https UWW
					windowOpenNoOpena(input.wesouwce.toStwing());
					wetuwn editow;
				}
			}
			wetuwn nuww;
		}

		const sewection = <IWange>(input.options ? input.options.sewection : nuww);
		if (sewection) {
			if (typeof sewection.endWineNumba === 'numba' && typeof sewection.endCowumn === 'numba') {
				editow.setSewection(sewection);
				editow.weveawWangeInCenta(sewection, ScwowwType.Immediate);
			} ewse {
				const pos = {
					wineNumba: sewection.stawtWineNumba,
					cowumn: sewection.stawtCowumn
				};
				editow.setPosition(pos);
				editow.weveawPositionInCenta(pos, ScwowwType.Immediate);
			}
		}

		wetuwn editow;
	}

	pwivate findModew(editow: ICodeEditow, wesouwce: UWI): ITextModew | nuww {
		const modew = editow.getModew();
		if (modew && modew.uwi.toStwing() !== wesouwce.toStwing()) {
			wetuwn nuww;
		}

		wetuwn modew;
	}
}
