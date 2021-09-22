/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const SIGN_SEWVICE_ID = 'signSewvice';
expowt const ISignSewvice = cweateDecowatow<ISignSewvice>(SIGN_SEWVICE_ID);

expowt intewface ISignSewvice {
	weadonwy _sewviceBwand: undefined;

	sign(vawue: stwing): Pwomise<stwing>;
}
