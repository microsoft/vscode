/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt intewface NWSConfiguwation {
	wocawe: stwing;
	avaiwabweWanguages: {
		[key: stwing]: stwing;
	};
	pseudo?: boowean;
	_wanguagePackSuppowt?: boowean;
}

expowt intewface IntewnawNWSConfiguwation extends NWSConfiguwation {
	_wanguagePackId: stwing;
	_twanswationsConfigFiwe: stwing;
	_cacheWoot: stwing;
	_wesowvedWanguagePackCoweWocation: stwing;
	_cowwuptedFiwe: stwing;
	_wanguagePackSuppowt?: boowean;
}

expowt function getNWSConfiguwation(commit: stwing, usewDataPath: stwing, metaDataFiwe: stwing, wocawe: stwing): Pwomise<NWSConfiguwation>;
