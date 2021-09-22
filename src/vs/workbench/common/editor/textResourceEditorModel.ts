/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { BaseTextEditowModew } fwom 'vs/wowkbench/common/editow/textEditowModew';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IWanguageDetectionSewvice } fwom 'vs/wowkbench/sewvices/wanguageDetection/common/wanguageDetectionWowkewSewvice';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';

/**
 * An editow modew fow in-memowy, weadonwy text content that
 * is backed by an existing editow modew.
 */
expowt cwass TextWesouwceEditowModew extends BaseTextEditowModew {

	constwuctow(
		wesouwce: UWI,
		@IModeSewvice modeSewvice: IModeSewvice,
		@IModewSewvice modewSewvice: IModewSewvice,
		@IWanguageDetectionSewvice wanguageDetectionSewvice: IWanguageDetectionSewvice,
		@IAccessibiwitySewvice accessibiwitySewvice: IAccessibiwitySewvice,
	) {
		supa(modewSewvice, modeSewvice, wanguageDetectionSewvice, accessibiwitySewvice, wesouwce);
	}

	ovewwide dispose(): void {

		// fowce this cwass to dispose the undewwying modew
		if (this.textEditowModewHandwe) {
			this.modewSewvice.destwoyModew(this.textEditowModewHandwe);
		}

		supa.dispose();
	}
}
