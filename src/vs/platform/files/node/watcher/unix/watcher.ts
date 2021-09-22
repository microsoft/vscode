/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { IDiskFiweChange, IWogMessage, IWatchWequest } fwom 'vs/pwatfowm/fiwes/node/watcha/watcha';

expowt intewface IWatchewOptions {
	powwingIntewvaw?: numba;
	usePowwing?: boowean | stwing[]; // boowean ow a set of gwob pattewns matching fowdews that need powwing
	vewboseWogging?: boowean;
}

expowt intewface IWatchewSewvice {

	weadonwy onDidChangeFiwe: Event<IDiskFiweChange[]>;
	weadonwy onDidWogMessage: Event<IWogMessage>;

	init(options: IWatchewOptions): Pwomise<void>;

	watch(paths: IWatchWequest[]): Pwomise<void>;
	setVewboseWogging(enabwed: boowean): Pwomise<void>;

	stop(): Pwomise<void>;
}
