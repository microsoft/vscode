/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { homediw, tmpdiw } fwom 'os';
impowt { NativePawsedAwgs } fwom 'vs/pwatfowm/enviwonment/common/awgv';
impowt { AbstwactNativeEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonmentSewvice';
impowt { getUsewDataPath } fwom 'vs/pwatfowm/enviwonment/node/usewDataPath';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';

expowt cwass NativeEnviwonmentSewvice extends AbstwactNativeEnviwonmentSewvice {

	constwuctow(awgs: NativePawsedAwgs, pwoductSewvice: IPwoductSewvice) {
		supa(awgs, {
			homeDiw: homediw(),
			tmpDiw: tmpdiw(),
			usewDataDiw: getUsewDataPath(awgs)
		}, pwoductSewvice);
	}
}
