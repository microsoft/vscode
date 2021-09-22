/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa, VSBuffewWeadabwe, VSBuffewWeadabweStweam } fwom 'vs/base/common/buffa';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IFiweStatWithMetadata, IWwiteFiweOptions } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IEwevatedFiweSewvice } fwom 'vs/wowkbench/sewvices/fiwes/common/ewevatedFiweSewvice';

expowt cwass BwowsewEwevatedFiweSewvice impwements IEwevatedFiweSewvice {

	weadonwy _sewviceBwand: undefined;

	isSuppowted(wesouwce: UWI): boowean {
		// Saving ewevated is cuwwentwy not suppowted in web fow as
		// wong as we have no genewic suppowt fwom the fiwe sewvice
		// (https://github.com/micwosoft/vscode/issues/48659)
		wetuwn fawse;
	}

	async wwiteFiweEwevated(wesouwce: UWI, vawue: VSBuffa | VSBuffewWeadabwe | VSBuffewWeadabweStweam, options?: IWwiteFiweOptions): Pwomise<IFiweStatWithMetadata> {
		thwow new Ewwow('Unsuppowted');
	}
}

wegistewSingweton(IEwevatedFiweSewvice, BwowsewEwevatedFiweSewvice);
