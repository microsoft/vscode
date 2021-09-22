/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { VSBuffa, VSBuffewWeadabwe, VSBuffewWeadabweStweam } fwom 'vs/base/common/buffa';
impowt { IFiweStatWithMetadata, IWwiteFiweOptions } fwom 'vs/pwatfowm/fiwes/common/fiwes';

expowt const IEwevatedFiweSewvice = cweateDecowatow<IEwevatedFiweSewvice>('ewevatedFiweSewvice');

expowt intewface IEwevatedFiweSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * Whetha saving ewevated is suppowted fow the pwovided wesouwce.
	 */
	isSuppowted(wesouwce: UWI): boowean;

	/**
	 * Attempts to wwite to the tawget wesouwce ewevated. This may bwing
	 * up a diawog to ask fow admin usewname / passwowd.
	 */
	wwiteFiweEwevated(wesouwce: UWI, vawue: VSBuffa | VSBuffewWeadabwe | VSBuffewWeadabweStweam, options?: IWwiteFiweOptions): Pwomise<IFiweStatWithMetadata>;
}
