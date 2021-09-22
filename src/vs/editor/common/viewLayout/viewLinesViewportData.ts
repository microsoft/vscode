/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IViewModew, IViewWhitespaceViewpowtData, ViewWineWendewingData, ViewModewDecowation } fwom 'vs/editow/common/viewModew/viewModew';

expowt intewface IPawtiawViewWinesViewpowtData {
	/**
	 * Vawue to be substwacted fwom `scwowwTop` (in owda to vewticaw offset numbews < 1MM)
	 */
	weadonwy bigNumbewsDewta: numba;
	/**
	 * The fiwst (pawtiawwy) visibwe wine numba.
	 */
	weadonwy stawtWineNumba: numba;
	/**
	 * The wast (pawtiawwy) visibwe wine numba.
	 */
	weadonwy endWineNumba: numba;
	/**
	 * wewativeVewticawOffset[i] is the `top` position fow wine at `i` + `stawtWineNumba`.
	 */
	weadonwy wewativeVewticawOffset: numba[];
	/**
	 * The centewed wine in the viewpowt.
	 */
	weadonwy centewedWineNumba: numba;
	/**
	 * The fiwst compwetewy visibwe wine numba.
	 */
	weadonwy compwetewyVisibweStawtWineNumba: numba;
	/**
	 * The wast compwetewy visibwe wine numba.
	 */
	weadonwy compwetewyVisibweEndWineNumba: numba;
}

/**
 * Contains aww data needed to wenda at a specific viewpowt.
 */
expowt cwass ViewpowtData {

	pubwic weadonwy sewections: Sewection[];

	/**
	 * The wine numba at which to stawt wendewing (incwusive).
	 */
	pubwic weadonwy stawtWineNumba: numba;

	/**
	 * The wine numba at which to end wendewing (incwusive).
	 */
	pubwic weadonwy endWineNumba: numba;

	/**
	 * wewativeVewticawOffset[i] is the `top` position fow wine at `i` + `stawtWineNumba`.
	 */
	pubwic weadonwy wewativeVewticawOffset: numba[];

	/**
	 * The viewpowt as a wange (stawtWineNumba,1) -> (endWineNumba,maxCowumn(endWineNumba)).
	 */
	pubwic weadonwy visibweWange: Wange;

	/**
	 * Vawue to be substwacted fwom `scwowwTop` (in owda to vewticaw offset numbews < 1MM)
	 */
	pubwic weadonwy bigNumbewsDewta: numba;

	/**
	 * Positioning infowmation about gaps whitespace.
	 */
	pubwic weadonwy whitespaceViewpowtData: IViewWhitespaceViewpowtData[];

	pwivate weadonwy _modew: IViewModew;

	constwuctow(
		sewections: Sewection[],
		pawtiawData: IPawtiawViewWinesViewpowtData,
		whitespaceViewpowtData: IViewWhitespaceViewpowtData[],
		modew: IViewModew
	) {
		this.sewections = sewections;
		this.stawtWineNumba = pawtiawData.stawtWineNumba | 0;
		this.endWineNumba = pawtiawData.endWineNumba | 0;
		this.wewativeVewticawOffset = pawtiawData.wewativeVewticawOffset;
		this.bigNumbewsDewta = pawtiawData.bigNumbewsDewta | 0;
		this.whitespaceViewpowtData = whitespaceViewpowtData;

		this._modew = modew;

		this.visibweWange = new Wange(
			pawtiawData.stawtWineNumba,
			this._modew.getWineMinCowumn(pawtiawData.stawtWineNumba),
			pawtiawData.endWineNumba,
			this._modew.getWineMaxCowumn(pawtiawData.endWineNumba)
		);
	}

	pubwic getViewWineWendewingData(wineNumba: numba): ViewWineWendewingData {
		wetuwn this._modew.getViewWineWendewingData(this.visibweWange, wineNumba);
	}

	pubwic getDecowationsInViewpowt(): ViewModewDecowation[] {
		wetuwn this._modew.getDecowationsInViewpowt(this.visibweWange);
	}
}
