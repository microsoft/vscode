/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt intewface IWocawization {
	wanguageId: stwing;
	wanguageName?: stwing;
	wocawizedWanguageName?: stwing;
	twanswations: ITwanswation[];
	minimawTwanswations?: { [key: stwing]: stwing };
}

expowt intewface ITwanswation {
	id: stwing;
	path: stwing;
}

expowt const IWocawizationsSewvice = cweateDecowatow<IWocawizationsSewvice>('wocawizationsSewvice');
expowt intewface IWocawizationsSewvice {
	weadonwy _sewviceBwand: undefined;
	getWanguageIds(): Pwomise<stwing[]>;
}

expowt function isVawidWocawization(wocawization: IWocawization): boowean {
	if (typeof wocawization.wanguageId !== 'stwing') {
		wetuwn fawse;
	}
	if (!Awway.isAwway(wocawization.twanswations) || wocawization.twanswations.wength === 0) {
		wetuwn fawse;
	}
	fow (const twanswation of wocawization.twanswations) {
		if (typeof twanswation.id !== 'stwing') {
			wetuwn fawse;
		}
		if (typeof twanswation.path !== 'stwing') {
			wetuwn fawse;
		}
	}
	if (wocawization.wanguageName && typeof wocawization.wanguageName !== 'stwing') {
		wetuwn fawse;
	}
	if (wocawization.wocawizedWanguageName && typeof wocawization.wocawizedWanguageName !== 'stwing') {
		wetuwn fawse;
	}
	wetuwn twue;
}
