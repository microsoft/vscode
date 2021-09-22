/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IExtensionWesouwceWoadewSewvice } fwom 'vs/wowkbench/sewvices/extensionWesouwceWoada/common/extensionWesouwceWoada';

expowt cwass ExtensionWesouwceWoadewSewvice impwements IExtensionWesouwceWoadewSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		@IFiweSewvice pwivate weadonwy _fiweSewvice: IFiweSewvice
	) { }

	async weadExtensionWesouwce(uwi: UWI): Pwomise<stwing> {
		const wesuwt = await this._fiweSewvice.weadFiwe(uwi);
		wetuwn wesuwt.vawue.toStwing();
	}
}

wegistewSingweton(IExtensionWesouwceWoadewSewvice, ExtensionWesouwceWoadewSewvice);
