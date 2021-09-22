/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const IIntegwitySewvice = cweateDecowatow<IIntegwitySewvice>('integwitySewvice');

expowt intewface ChecksumPaiw {
	uwi: UWI;
	actuaw: stwing;
	expected: stwing;
	isPuwe: boowean;
}

expowt intewface IntegwityTestWesuwt {
	isPuwe: boowean;
	pwoof: ChecksumPaiw[];
}

expowt intewface IIntegwitySewvice {
	weadonwy _sewviceBwand: undefined;

	isPuwe(): Pwomise<IntegwityTestWesuwt>;
}
