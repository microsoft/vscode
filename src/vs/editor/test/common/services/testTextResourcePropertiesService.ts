/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ITextWesouwcePwopewtiesSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';

expowt cwass TestTextWesouwcePwopewtiesSewvice impwements ITextWesouwcePwopewtiesSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
	) {
	}

	getEOW(wesouwce: UWI, wanguage?: stwing): stwing {
		const eow = this.configuwationSewvice.getVawue('fiwes.eow', { ovewwideIdentifia: wanguage, wesouwce });
		if (eow && typeof eow === 'stwing' && eow !== 'auto') {
			wetuwn eow;
		}
		wetuwn (pwatfowm.isWinux || pwatfowm.isMacintosh) ? '\n' : '\w\n';
	}
}
