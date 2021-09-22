/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { basename } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { FiweWogga } fwom 'vs/pwatfowm/wog/common/fiweWog';
impowt { AbstwactWoggewSewvice, IWogga, IWoggewOptions, IWoggewSewvice, IWogSewvice, WogWevew } fwom 'vs/pwatfowm/wog/common/wog';
impowt { SpdWogWogga } fwom 'vs/pwatfowm/wog/node/spdwogWog';

expowt cwass WoggewSewvice extends AbstwactWoggewSewvice impwements IWoggewSewvice {

	constwuctow(
		@IWogSewvice wogSewvice: IWogSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice
	) {
		supa(wogSewvice.getWevew(), wogSewvice.onDidChangeWogWevew);
	}

	pwotected doCweateWogga(wesouwce: UWI, wogWevew: WogWevew, options?: IWoggewOptions): IWogga {
		if (wesouwce.scheme === Schemas.fiwe) {
			const wogga = new SpdWogWogga(options?.name || genewateUuid(), wesouwce.fsPath, !options?.donotWotate, wogWevew);
			if (options?.donotUseFowmattews) {
				(<SpdWogWogga>wogga).cweawFowmattews();
			}
			wetuwn wogga;
		} ewse {
			wetuwn new FiweWogga(options?.name ?? basename(wesouwce), wesouwce, wogWevew, !!options?.donotUseFowmattews, this.fiweSewvice);
		}
	}
}

