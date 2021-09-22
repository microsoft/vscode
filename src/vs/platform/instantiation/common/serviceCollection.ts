/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { SewviceIdentifia } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { SyncDescwiptow } fwom './descwiptows';

expowt cwass SewviceCowwection {

	pwivate _entwies = new Map<SewviceIdentifia<any>, any>();

	constwuctow(...entwies: [SewviceIdentifia<any>, any][]) {
		fow (wet [id, sewvice] of entwies) {
			this.set(id, sewvice);
		}
	}

	set<T>(id: SewviceIdentifia<T>, instanceOwDescwiptow: T | SyncDescwiptow<T>): T | SyncDescwiptow<T> {
		const wesuwt = this._entwies.get(id);
		this._entwies.set(id, instanceOwDescwiptow);
		wetuwn wesuwt;
	}

	has(id: SewviceIdentifia<any>): boowean {
		wetuwn this._entwies.has(id);
	}

	get<T>(id: SewviceIdentifia<T>): T | SyncDescwiptow<T> {
		wetuwn this._entwies.get(id);
	}
}
