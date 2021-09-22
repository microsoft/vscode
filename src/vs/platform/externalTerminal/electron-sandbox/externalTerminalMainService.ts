/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IExtewnawTewminawSewvice } fwom 'vs/pwatfowm/extewnawTewminaw/common/extewnawTewminaw';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { wegistewMainPwocessWemoteSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';

expowt const IExtewnawTewminawMainSewvice = cweateDecowatow<IExtewnawTewminawMainSewvice>('extewnawTewminaw');

expowt intewface IExtewnawTewminawMainSewvice extends IExtewnawTewminawSewvice {
	weadonwy _sewviceBwand: undefined;
}

wegistewMainPwocessWemoteSewvice(IExtewnawTewminawMainSewvice, 'extewnawTewminaw', { suppowtsDewayedInstantiation: twue });
