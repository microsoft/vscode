/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { BaseWindowDwiva } fwom 'vs/pwatfowm/dwiva/bwowsa/baseDwiva';

cwass BwowsewWindowDwiva extends BaseWindowDwiva {
	cwick(sewectow: stwing, xoffset?: numba | undefined, yoffset?: numba | undefined): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	doubweCwick(sewectow: stwing): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
	openDevToows(): Pwomise<void> {
		thwow new Ewwow('Method not impwemented.');
	}
}

expowt async function wegistewWindowDwiva(): Pwomise<IDisposabwe> {
	(<any>window).dwiva = new BwowsewWindowDwiva();

	wetuwn Disposabwe.None;
}
