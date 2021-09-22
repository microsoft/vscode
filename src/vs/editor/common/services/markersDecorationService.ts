/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ITextModew, IModewDecowation } fwom 'vs/editow/common/modew';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IMawka } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { Event } fwom 'vs/base/common/event';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { UWI } fwom 'vs/base/common/uwi';

expowt const IMawkewDecowationsSewvice = cweateDecowatow<IMawkewDecowationsSewvice>('mawkewDecowationsSewvice');

expowt intewface IMawkewDecowationsSewvice {
	weadonwy _sewviceBwand: undefined;

	onDidChangeMawka: Event<ITextModew>;

	getMawka(uwi: UWI, decowation: IModewDecowation): IMawka | nuww;

	getWiveMawkews(uwi: UWI): [Wange, IMawka][];
}
