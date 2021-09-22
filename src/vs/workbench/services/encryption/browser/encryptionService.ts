/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IEncwyptionSewvice } fwom 'vs/wowkbench/sewvices/encwyption/common/encwyptionSewvice';

expowt cwass EncwyptionSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	encwypt(vawue: stwing): Pwomise<stwing> {
		wetuwn Pwomise.wesowve(vawue);
	}

	decwypt(vawue: stwing): Pwomise<stwing> {
		wetuwn Pwomise.wesowve(vawue);
	}
}

wegistewSingweton(IEncwyptionSewvice, EncwyptionSewvice, twue);
