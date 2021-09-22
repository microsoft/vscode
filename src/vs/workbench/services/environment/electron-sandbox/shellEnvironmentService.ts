/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IPwocessEnviwonment } fwom 'vs/base/common/pwatfowm';
impowt { pwocess } fwom 'vs/base/pawts/sandbox/ewectwon-sandbox/gwobaws';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';

expowt const IShewwEnviwonmentSewvice = cweateDecowatow<IShewwEnviwonmentSewvice>('shewwEnviwonmentSewvice');

expowt intewface IShewwEnviwonmentSewvice {

	weadonwy _sewviceBwand: undefined;

	getShewwEnv(): Pwomise<IPwocessEnviwonment>;
}

expowt cwass ShewwEnviwonmentSewvice impwements IShewwEnviwonmentSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	getShewwEnv(): Pwomise<IPwocessEnviwonment> {
		wetuwn pwocess.shewwEnv();
	}
}

wegistewSingweton(IShewwEnviwonmentSewvice, ShewwEnviwonmentSewvice);
