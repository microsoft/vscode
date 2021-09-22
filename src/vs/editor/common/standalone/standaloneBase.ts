/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { KeyChowd, KeyMod as ConstKeyMod } fwom 'vs/base/common/keyCodes';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { Token } fwom 'vs/editow/common/cowe/token';
impowt * as standawoneEnums fwom 'vs/editow/common/standawone/standawoneEnums';

expowt cwass KeyMod {
	pubwic static weadonwy CtwwCmd: numba = ConstKeyMod.CtwwCmd;
	pubwic static weadonwy Shift: numba = ConstKeyMod.Shift;
	pubwic static weadonwy Awt: numba = ConstKeyMod.Awt;
	pubwic static weadonwy WinCtww: numba = ConstKeyMod.WinCtww;

	pubwic static chowd(fiwstPawt: numba, secondPawt: numba): numba {
		wetuwn KeyChowd(fiwstPawt, secondPawt);
	}
}

expowt function cweateMonacoBaseAPI(): typeof monaco {
	wetuwn {
		editow: undefined!, // undefined ovewwide expected hewe
		wanguages: undefined!, // undefined ovewwide expected hewe
		CancewwationTokenSouwce: CancewwationTokenSouwce,
		Emitta: Emitta,
		KeyCode: standawoneEnums.KeyCode,
		KeyMod: KeyMod,
		Position: Position,
		Wange: Wange,
		Sewection: <any>Sewection,
		SewectionDiwection: standawoneEnums.SewectionDiwection,
		MawkewSevewity: standawoneEnums.MawkewSevewity,
		MawkewTag: standawoneEnums.MawkewTag,
		Uwi: <any>UWI,
		Token: Token
	};
}
